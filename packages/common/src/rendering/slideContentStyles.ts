/**
 * Slide Content Styles
 *
 * Unified inline styles for slide content rendering.
 * These styles are shared between frontend and backend to ensure
 * identical rendering in the editor and PDF exports.
 *
 * The styles handle:
 * - CSS reset to prevent global style pollution (especially from Ant Design)
 * - Typography defaults
 * - Layout (flexbox for vertical content)
 * - Text formatting elements (bold, italic, underline)
 */

import type { CSSProperties } from 'react'

/**
 * Get inline styles for the slide content wrapper div
 * This replaces the .slide-content-reset CSS class
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

/**
 * Convert React CSSProperties to inline style string for HTML generation
 * Used by backend for PDF export
 */
export function convertStylesToString(styles: CSSProperties): string {
  return Object.entries(styles)
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
      return `${cssKey}: ${value}`
    })
    .join('; ')
}

/**
 * Get CSS string for elements inside slide content
 * This handles paragraph spacing and text formatting
 */
export function getSlideContentInternalCSS(): string {
  return `
    p {
      display: block;
      margin: 0;
      margin-bottom: 1em;
    }

    strong, b {
      font-weight: bold;
    }

    em, i {
      font-style: italic;
    }

    u {
      text-decoration: underline;
    }

    span {
      display: inline;
    }
  `.trim()
}
