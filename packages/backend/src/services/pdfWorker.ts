import { parentPort } from 'node:worker_threads'
import { renderPdf, type RenderJob, type WorkerMessage } from './pdfDocument.js'

/**
 * Entry point of a PDF worker thread, started by `PdfRenderPool`: it says when
 * it is ready, then draws the jobs the pool posts, one at a time, and answers
 * each with its PDF or with the error that stopped it. A job that outlasts its
 * timeout is not answered: the pool terminates the thread.
 */

const port = parentPort
if (!port) throw new Error('pdfWorker.ts runs on a worker thread, started by PdfRenderPool')

// The message is whatever the pool posted: a `RenderJob`, by construction of
// `PdfRenderPool.run`, the only sender.
port.on('message', (job: RenderJob) => {
  renderPdf(job).then(
    result => port.postMessage({ ok: true, result } satisfies WorkerMessage),
    (error: unknown) => port.postMessage({
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    } satisfies WorkerMessage)
  )
})

// pdfDocument.ts, imported above, has loaded react-pdf and registered the
// built-in fonts: the render timeout can start counting from a job's arrival.
port.postMessage('ready' satisfies WorkerMessage)
