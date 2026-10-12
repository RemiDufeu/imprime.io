import { splitDataUrl, toImageDataUrl } from '@imprime/common'

/**
 * JPEGs as @react-pdf/renderer can embed them.
 *
 * react-pdf reads a JPEG's markers with jay-peg — in @react-pdf/image, then
 * again in its pdfkit — before embedding it, and jay-peg reads a JFIF segment
 * (APP0) as exactly 16 bytes, whatever length it declares. A longer one — an
 * iPhone's, which appends "AMPF", or one carrying a thumbnail — throws the
 * parse out of step ("Unknown version 16717"), and react-pdf then leaves the
 * image out of the PDF without failing the export. Browsers draw such files,
 * so the editor shows what the PDF lacks.
 *
 * The JFIF segment holds nothing the PDF needs (pixel density, a thumbnail),
 * so it is dropped. So is whatever follows the image's end: the extra images
 * a multi-picture file carries (an iPhone's HDR gain map), which jay-peg would
 * walk too, and the PDF would embed for nothing. The EXIF segment stays: it
 * holds the orientation react-pdf turns the image by.
 *
 * Recheck when jay-peg is upgraded past 1.1.1: its JFIF marker
 * (src/markers/jfif.js) has no field for the bytes past the sixteenth.
 */

const EOI = Buffer.from([0xff, 0xd9])

// `bytes` without its JFIF segments and without anything after its end of
// image — the same Buffer when it has neither, or when it is not a JPEG whose
// segments can be walked up to its scan: react-pdf then takes or refuses it as
// it would have.
export function stripJpegForReactPdf(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes

  const kept: Buffer[] = [bytes.subarray(0, 2)]
  let droppedSegment = false
  let offset = 2
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]
    if (marker === 0xda) break // start of scan: the image data follows
    if (marker === 0xff) { offset++; continue } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { // no length
      kept.push(bytes.subarray(offset, offset + 2))
      offset += 2
      continue
    }
    const end = offset + 2 + bytes.readUInt16BE(offset + 2)
    if (end > bytes.length) return bytes
    if (marker === 0xe0) droppedSegment = true
    else kept.push(bytes.subarray(offset, end))
    offset = end
  }
  if (bytes[offset] !== 0xff || bytes[offset + 1] !== 0xda) return bytes

  // Inside the scans, a 0xFF data byte is written FF 00 and the only markers
  // are restarts (FF D0–D7), plus the next scan's own segments in a
  // progressive JPEG: the first FF D9 from here ends the image.
  const eoi = bytes.indexOf(EOI, offset)
  const end = eoi === -1 ? bytes.length : eoi + EOI.length
  if (!droppedSegment && end === bytes.length) return bytes

  kept.push(bytes.subarray(offset, end))
  return Buffer.concat(kept)
}

// `dataUrl` as react-pdf can embed it: a JPEG stripped as above, anything
// else as it is. Whether it is a JPEG is read from its bytes, not its type.
export function dataUrlForReactPdf(dataUrl: string): string {
  const parts = splitDataUrl(dataUrl)
  // '/9j/' is FF D8 FF — a JPEG's first bytes — in base64.
  if (!parts || !parts.base64.startsWith('/9j/')) return dataUrl
  const bytes = Buffer.from(parts.base64, 'base64')
  const stripped = stripJpegForReactPdf(bytes)
  return stripped === bytes ? dataUrl : toImageDataUrl(stripped.toString('base64'), 'image/jpeg')
}
