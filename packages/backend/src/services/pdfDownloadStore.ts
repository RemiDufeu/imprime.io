import { randomUUID } from 'node:crypto'

interface Entry {
  buffer: Buffer
  filename: string
  expiresAt: number
}

const TTL_MS = 10 * 60 * 1000
const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_ENTRIES = 100
const SWEEP_INTERVAL_MS = 60 * 1000

const store = new Map<string, Entry>()
let totalBytes = 0

function deleteEntry(token: string): void {
  const entry = store.get(token)
  if (!entry) return
  totalBytes -= entry.buffer.length
  store.delete(token)
}

function sweepExpired(): void {
  const now = Date.now()
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) deleteEntry(token)
  }
}

function evictUntilFits(incomingSize: number): void {
  while (totalBytes + incomingSize > MAX_TOTAL_BYTES || store.size >= MAX_ENTRIES) {
    const first = store.keys().next()
    if (first.done) break
    deleteEntry(first.value)
  }
}

export function putPdf(buffer: Buffer, filename: string): string {
  evictUntilFits(buffer.length)
  const token = randomUUID()
  store.set(token, { buffer, filename, expiresAt: Date.now() + TTL_MS })
  totalBytes += buffer.length
  return token
}

export function takePdf(token: string): { buffer: Buffer; filename: string } | null {
  const entry = store.get(token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    deleteEntry(token)
    return null
  }
  const result = { buffer: entry.buffer, filename: entry.filename }
  deleteEntry(token)
  return result
}

setInterval(sweepExpired, SWEEP_INTERVAL_MS).unref()
