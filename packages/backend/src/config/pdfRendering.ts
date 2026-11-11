import type { PdfRenderLimits } from '../services/pdfRenderPool.js'

/**
 * How PDFs are drawn, from the environment — the defaults when a variable is
 * unset or empty. A value out of its range stops the server at startup rather
 * than run with another. See `.env.example`.
 */
export function readPdfRenderLimits(): PdfRenderLimits {
  return {
    maxWorkers: wholeNumberFromEnv('MAX_PDF_RENDERS', 4),
    maxPerOwner: wholeNumberFromEnv('MAX_PDF_RENDERS_PER_USER', 2),
    // A client waits that long on an open HTTP request, and few wait longer
    // than five minutes: Node's fetch gives up on response headers after 300 s.
    timeoutSeconds: wholeNumberFromEnv('PDF_RENDER_TIMEOUT_SECONDS', 30, { max: 300 }),
    queueSize: wholeNumberFromEnv('PDF_QUEUE_SIZE', 10, { min: 0 }),
    queueWaitSeconds: wholeNumberFromEnv('PDF_QUEUE_WAIT_SECONDS', 10, { max: 300 }),
  }
}

/** A whole number from `min` to `max`, from the environment, or `fallback` when unset. */
function wholeNumberFromEnv(name: string, fallback: number, { min = 1, max = Infinity } = {}): number {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  const number = Number(value)
  if (!/^\d+$/.test(value) || number < min || number > max) {
    const range = Number.isFinite(max) ? `from ${min} to ${max}` : `of ${min} or more`
    throw new Error(`${name}="${value}" must be a whole number ${range}.`)
  }
  return number
}
