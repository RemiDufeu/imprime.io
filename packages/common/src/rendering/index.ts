/**
 * Common rendering utilities for shapes
 * Ensures consistent rendering between frontend and backend
 */

export { SLIDE_WIDTH, SLIDE_HEIGHT } from './constants.js'
export { getDashArray } from './strokeUtils.js'
export { getEllipseGeometry, getRectangleCornerRadius } from './svgRenderers.js'
export type { EllipseGeometry } from './svgRenderers.js'
export { layoutGroupChildren } from './groupLayout.js'
export { renderTextSVG } from './textRenderer.js'
export { resolveShapes } from './shapeResolver.js'
export { generateSlideHTML, generateMultiPageHTML, generateSVGWrapper } from './htmlGenerator.js'
export { getSlideContentWrapperStyles, convertStylesToString, getSlideContentInternalCSS } from './slideContentStyles.js'
