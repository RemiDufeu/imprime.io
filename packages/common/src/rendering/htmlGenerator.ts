import type { Slide, Presentation } from '../types.js'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from './constants.js'

/**
 * Generate complete HTML document for a single slide
 * Used for PDF export and preview
 */
export function generateSlideHTML(
  slideContent: string,
  includePageBreak: boolean = false
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: ${SLIDE_WIDTH}px;
            height: ${SLIDE_HEIGHT}px;
            overflow: hidden;
            background: white;
          }
          svg {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}">
          ${slideContent}
        </svg>
      </body>
    </html>
  `
}

/**
 * Generate complete HTML document for multiple slides (multi-page PDF)
 * Used for PDF export with page breaks
 */
export function generateMultiPageHTML(slideContents: string[]): string {
  const slidesHTML = slideContents
    .map(
      (content) => `
      <div class="slide-page">
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}">
          ${content}
        </svg>
      </div>
    `
    )
    .join('\n')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            background: white;
          }
          .slide-page {
            width: ${SLIDE_WIDTH}px;
            height: ${SLIDE_HEIGHT}px;
            position: relative;
            page-break-after: always;
            overflow: hidden;
          }
          .slide-page:last-child {
            page-break-after: auto;
          }
          svg {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        ${slidesHTML}
      </body>
    </html>
  `
}

/**
 * Generate SVG wrapper for slide content (for frontend preview)
 * This matches the structure used in the frontend editor
 */
export function generateSVGWrapper(shapesSVG: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}">
  ${shapesSVG}
</svg>`
}
