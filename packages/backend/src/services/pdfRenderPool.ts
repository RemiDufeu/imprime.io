import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importedFontFamilyName, type FontDTO } from '@imprime/common'
import { AppError } from './errors.js'
import type { RenderJob, WorkerMessage } from './pdfDocument.js'
import type { PageImage } from './pdfRaster.js'

/**
 * PDF renders, each on a worker thread. react-pdf draws on the thread that
 * runs it, for as long as the document takes, and has no way to be stopped:
 * on the server's own thread, a long render would hold every request up, and
 * one that never ends would hold the server. On a worker, a render leaves the
 * server's thread free, runs on a core of its own, and is stopped for good when
 * it outlasts its timeout: the worker is terminated, its memory freed with it.
 *
 * The pool is also what bounds them. A busy worker is lent to one user for one
 * job: how many workers are busy is how many renders run, overall and per
 * user — there is no other count to keep in step. Past either bound, a job
 * waits for a worker, first come first served, up to `queueWaitSeconds`; it is
 * refused at once when the queue is full, or when its user already has as
 * many jobs waiting as they may run. Refused, or tired of waiting, it fails
 * with 429 EXPORT_BUSY.
 *
 * A worker is started when a job finds none idle, and kept for the next:
 * starting one and loading react-pdf takes about half a second, and its first
 * render is slower. Each costs some 150 to 200 MB while it lives, so one left
 * without work for IDLE_MS is closed.
 */

export interface PdfRenderLimits {
  // Workers busy at once — renders running — overall, and for one user.
  maxWorkers: number
  maxPerOwner: number
  // How long a job may run once its worker has it, page images included.
  timeoutSeconds: number
  // Jobs that may wait for a worker (0: none, refused at once), and how long
  // each waits before it is refused.
  queueSize: number
  queueWaitSeconds: number
}

export interface RenderOutput {
  pdf: Buffer
  // The pages the job's `raster` asked for; none without it.
  images: PageImage[]
}

// Makes the job once a worker is lent, told which imported fonts it holds.
type BuildJob = (isRegistered: (font: FontDTO.Response) => boolean) => Promise<RenderJob>

interface PooledWorker {
  worker: Worker
  // Settled once the worker has loaded react-pdf and takes jobs — rejected if
  // it ended first.
  ready: Promise<void>
  // Whose job it runs; unset while idle.
  owner?: string
  // Registered family names of the imported fonts the worker holds: their
  // files need not be sent to it again.
  registeredFonts: Set<string>
  idleTimer?: ReturnType<typeof setTimeout>
}

interface WaitingJob {
  owner: string
  lend: (pooled: PooledWorker) => void
  fail: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const IDLE_MS = 60_000

const exportBusy = () => new AppError('Too many PDF exports in progress: try again in a moment', 429, 'EXPORT_BUSY')

// Cloned across threads, a Buffer arrives as a plain Uint8Array.
const toBuffer = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

let entry: URL | undefined

// The worker's entry: next to this file in dev (tsx runs src/services/), and
// under services/ next to the bundle once built (dist/server.js), where
// esbuild writes it as an entry point of its own.
function workerEntry(): URL {
  if (entry) return entry
  const candidates = [
    new URL('./pdfWorker.ts', import.meta.url),
    new URL('./services/pdfWorker.js', import.meta.url),
  ]
  entry = candidates.find(url => existsSync(fileURLToPath(url)))
  if (!entry) throw new Error(`PDF worker not found at ${candidates.map(url => fileURLToPath(url)).join(' or ')}`)
  return entry
}

// tsx's loader does not reach a worker thread, which could not read the
// TypeScript entry and its `.js` imports: in dev, the worker registers tsx
// before importing it. Built, the entry is JavaScript, started as it is.
function startWorker(): Worker {
  const url = workerEntry()
  if (!url.pathname.endsWith('.ts')) return new Worker(url)
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href
  return new Worker(
    `import(${JSON.stringify(tsx)}).then(({ register }) => { register(); return import(${JSON.stringify(url.href)}) })`,
    { eval: true }
  )
}

export class PdfRenderPool {
  private workers: PooledWorker[] = []
  private waiting: WaitingJob[] = []

  constructor(private readonly limits: PdfRenderLimits) { }

  /**
   * The PDF of the job `build` makes for `owner` — and its pages as PNG
   * images, when the job's `raster` asks — drawn on a worker within
   * `timeoutSeconds` of the job reaching it: past them, the worker is
   * terminated, the render with it, and the call fails with 408. A worker
   * just started loads react-pdf while `build` runs, which is not counted.
   *
   * Waits for a worker while the bounds are reached, and fails with 429 when
   * it may not (see the class). Settles only once the worker is done with the
   * job — finished, or terminated — so that a worker is counted busy exactly
   * as long as the render runs.
   */
  async render(owner: string, build: BuildJob): Promise<RenderOutput> {
    const pooled = await this.lend(owner)
    const [started, built] = await Promise.allSettled([
      pooled.ready,
      build(font => pooled.registeredFonts.has(importedFontFamilyName(font))),
    ])
    // A worker that did not start is gone.
    if (started.status === 'rejected') {
      this.giveBack(pooled, false)
      throw started.reason
    }
    if (built.status === 'rejected') {
      this.giveBack(pooled, true)
      throw built.reason
    }
    return this.run(pooled, built.value)
  }

  // A worker for a job of `owner`'s: at once if the bounds allow, once one is
  // free otherwise — or refused.
  private lend(owner: string): Promise<PooledWorker> {
    const pooled = this.tryLend(owner)
    if (pooled) return Promise.resolve(pooled)

    const { queueSize, maxPerOwner, queueWaitSeconds } = this.limits
    const ownWaiting = this.waiting.filter(job => job.owner === owner).length
    if (this.waiting.length >= queueSize || ownWaiting >= maxPerOwner) return Promise.reject(exportBusy())

    return new Promise<PooledWorker>((resolve, reject) => {
      const job: WaitingJob = {
        owner,
        lend: resolve,
        fail: reject,
        timer: setTimeout(() => {
          this.waiting = this.waiting.filter(other => other !== job)
          reject(exportBusy())
        }, queueWaitSeconds * 1000),
      }
      this.waiting.push(job)
    })
  }

  // A worker made busy for `owner` — an idle one, or a new one — if the
  // bounds allow one more, overall and for them.
  private tryLend(owner: string): PooledWorker | undefined {
    const busy = this.workers.filter(pooled => pooled.owner !== undefined)
    if (busy.length >= this.limits.maxWorkers) return undefined
    if (busy.filter(pooled => pooled.owner === owner).length >= this.limits.maxPerOwner) return undefined

    const idle = this.workers.find(pooled => pooled.owner === undefined)
    if (idle) {
      clearTimeout(idle.idleTimer)
      idle.worker.ref()
    }
    const pooled = idle ?? this.start()
    pooled.owner = owner
    return pooled
  }

  // The waiting jobs, in their order, each lent a worker if its bounds now
  // allow: after a job, a free worker goes to the first that may have it.
  private dispatch(): void {
    for (const job of [...this.waiting]) {
      let pooled: PooledWorker | undefined
      try {
        pooled = this.tryLend(job.owner)
      } catch (error) {
        // No worker could be started: nor will one for the others.
        this.leaveQueue(job)
        job.fail(error)
        continue
      }
      if (!pooled) continue
      this.leaveQueue(job)
      job.lend(pooled)
    }
  }

  private leaveQueue(job: WaitingJob): void {
    clearTimeout(job.timer)
    this.waiting = this.waiting.filter(other => other !== job)
  }

  private start(): PooledWorker {
    const worker = startWorker()
    const ready = new Promise<void>((resolve, reject) => {
      const onMessage = (message: WorkerMessage) => {
        if (message !== 'ready') return
        stop()
        resolve()
      }
      const onError = (error: Error) => {
        stop()
        reject(new Error(`PDF worker failed to start: ${error.message}`))
      }
      const onExit = (code: number) => {
        stop()
        reject(new Error(`PDF worker exited with code ${code} while starting`))
      }
      const stop = () => {
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
      }
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
    })

    const pooled: PooledWorker = { worker, ready, registeredFonts: new Set() }
    // Always listened to: an 'error' nobody hears would bring the process
    // down. A job hears of its worker's end through `run`'s listeners.
    worker.on('error', error => {
      if (pooled.owner === undefined) console.error('An idle PDF worker failed:', error)
    })
    worker.on('exit', () => this.remove(pooled))
    this.workers.push(pooled)
    return pooled
  }

  // The job is done with `pooled`: kept idle for the next, or gone. Either
  // way a worker is free, for the first waiting job that may have it.
  private giveBack(pooled: PooledWorker, keep: boolean): void {
    pooled.owner = undefined
    if (keep) {
      // Idle, it must not keep the process alive.
      pooled.worker.unref()
      pooled.idleTimer = setTimeout(() => {
        this.remove(pooled)
        void pooled.worker.terminate()
      }, IDLE_MS)
      pooled.idleTimer.unref()
    } else {
      this.remove(pooled)
    }
    this.dispatch()
  }

  private remove(pooled: PooledWorker): void {
    clearTimeout(pooled.idleTimer)
    this.workers = this.workers.filter(other => other !== pooled)
  }

  private run(pooled: PooledWorker, job: RenderJob): Promise<RenderOutput> {
    const { worker } = pooled
    const { timeoutSeconds } = this.limits

    return new Promise<RenderOutput>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined

      // Once only. Kept, the worker goes back to the pool; otherwise it is
      // terminated first, and the call settles once it is gone.
      const settle = (keep: boolean, outcome: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        if (keep) {
          this.giveBack(pooled, true)
          outcome()
        } else {
          const gone = () => {
            this.giveBack(pooled, false)
            outcome()
          }
          worker.terminate().then(gone, gone)
        }
      }

      // What the worker posts is a `WorkerMessage`: pdfWorker.ts sends nothing
      // else, and 'ready' only before its first job.
      const onMessage = (reply: WorkerMessage) => {
        if (reply === 'ready') return
        if (!reply.ok) {
          settle(true, () => reject(new Error(`PDF generation failed: ${reply.error}`)))
          return
        }
        const { pdf, images, registeredFonts } = reply.result
        pooled.registeredFonts = new Set(registeredFonts)
        settle(true, () => resolve({
          pdf: toBuffer(pdf),
          images: images.map(({ page, png }) => ({ page, png: toBuffer(png) })),
        }))
      }
      // Out of memory, or anything else that ends the thread.
      const onError = (error: Error) => settle(false, () => reject(new Error(`PDF worker failed: ${error.message}`)))
      const onExit = (code: number) => settle(false, () => reject(new Error(`PDF worker exited with code ${code}`)))

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      timer = setTimeout(() => settle(false, () => reject(
        new AppError(`PDF generation timed out after ${timeoutSeconds}s`, 408)
      )), timeoutSeconds * 1000)

      try {
        worker.postMessage(job)
      } catch (error) {
        // A job that cannot be cloned never reached the worker, which is fine.
        settle(true, () => reject(error))
      }
    })
  }
}
