import { createRequire } from 'node:module'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { AppError } from './errors.js'

/**
 * Pages of an exported PDF as PNG images — so that an agent can look at what
 * it made: the PDF itself, as react-pdf wrote it, drawn by pdf.js (Mozilla's
 * PDF renderer) on a Node canvas (@napi-rs/canvas, prebuilt, no system
 * library). react-pdf writes PDF only; this is the step from it to pixels.
 */

// pdf.js reads the data it may need — the 14 standard fonts, character maps,
// colour profiles, the decoders compiled to WebAssembly — from its package,
// under Node with `fs.readFile(directory + name)`. It asks for a "/" at the
// end whatever the system's separator, and Windows reads a path ending in one.
const pdfjsRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const dataDirectory = (name: string) => `${path.join(pdfjsRoot, name)}/`

// Bounds on what one image costs, whatever the page: a page may be up to 144
// times taller than wide (MIN_PAGE_DIMENSION by MAX_PAGE_DIMENSION), and
// 1600 pixels across would make it a canvas of over a gigabyte. Neither side
// exceeds MAX_IMAGE_SIDE — about 64 MB of canvas at most — and a page whose
// drawing outlasts PAGE_RENDER_TIMEOUT_MS is cancelled, freeing its slot.
const MAX_IMAGE_SIDE = 4096
const PAGE_RENDER_TIMEOUT_MS = 10_000

export interface RasterOptions {
  // 1-based numbers of the pages to draw; those past the last page are skipped.
  pages: number[]
  // Width of each image in pixels; the height keeps the page's proportions.
  // Smaller when either side would exceed MAX_IMAGE_SIDE.
  width: number
}

export interface PageImage {
  page: number
  png: Buffer
}

/** The pages asked for, drawn at `width` pixels, in the order asked. */
export async function rasterizePdf(pdf: Buffer, { pages, width }: RasterOptions): Promise<PageImage[]> {
  const loading = getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl: dataDirectory('standard_fonts'),
    cMapUrl: dataDirectory('cmaps'),
    cMapPacked: true,
    iccUrl: dataDirectory('iccs'),
    wasmUrl: dataDirectory('wasm'),
    verbosity: 0,
  })
  const document = await loading.promise

  try {
    const images: PageImage[] = []
    for (const number of pages) {
      if (number < 1 || number > document.numPages) continue
      const page = await document.getPage(number)
      try {
        const natural = page.getViewport({ scale: 1 })
        const scale = Math.min(width, MAX_IMAGE_SIDE) / natural.width
        const viewport = page.getViewport({ scale: Math.min(scale, MAX_IMAGE_SIDE / natural.height) })
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
        const context = canvas.getContext('2d')
        // The PDF's pages are white, which a transparent PNG would not say.
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        // pdf.js types the context as the DOM's CanvasRenderingContext2D,
        // a type this project does not load (lib: ES2022): under Node it
        // takes @napi-rs/canvas's, which its own Node canvas factory makes.
        // `canvas: null` is how it is told to draw through the context alone.
        const task = page.render({ canvas: null, canvasContext: context, viewport })
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          task.cancel()
        }, PAGE_RENDER_TIMEOUT_MS)
        try {
          await task.promise
        } catch (err) {
          if (!timedOut) throw err
          throw new AppError(
            `Drawing page ${number} took longer than ${PAGE_RENDER_TIMEOUT_MS / 1000}s`,
            408,
            'PAGE_IMAGE_TIMEOUT'
          )
        } finally {
          clearTimeout(timer)
        }
        images.push({ page: number, png: await canvas.encode('png') })
      } finally {
        page.cleanup()
      }
    }
    return images
  } finally {
    // The loading task owns the document and its worker.
    await loading.destroy()
  }
}
