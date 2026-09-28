/**
 * Slide Content Styles
 *
 * Wrapper styles for the text content of a slide. Lives in `common` so the
 * editor's foreignObject and any future non-React renderer describe the same
 * box: same reset, same typography, same flow direction.
 */

import type { CSSProperties } from 'react'

/**
 * Inline styles for the slide content wrapper div.
 * Mainly a reset — Ant Design's global styles otherwise leak into the canvas.
 */
export function getSlideContentWrapperStyles(): CSSProperties {
  return {
    // Reset and typography
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
    lineHeight: 1.5,
    letterSpacing: 'normal',
    color: '#000000',

    // Layout
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'visible',

    // Preserve whitespace and line breaks
    whiteSpace: 'pre-wrap',

    // Box model
    boxSizing: 'content-box',
    margin: 0,
    padding: 0,
  }
}
