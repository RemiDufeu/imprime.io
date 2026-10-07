/**
 * Common rendering utilities for shapes
 * Ensures consistent rendering between frontend and backend
 */

export {
  DEFAULT_PAGE_SIZE,
  PAGE_FORMATS,
  MIN_PAGE_DIMENSION,
  MAX_PAGE_DIMENSION,
  isValidPageSize,
  findPageFormat,
} from './pageSize.js'
export type { PageFormat, PageFormatId } from './pageSize.js'
export { getDashArray } from './strokeUtils.js'
export { getEllipseGeometry, getRectangleCornerRadius } from './svgRenderers.js'
export type { EllipseGeometry } from './svgRenderers.js'
export {
  getImageLayout,
  getImageCrop,
  getImageCornerRadius,
  getImageOpacity,
  DEFAULT_IMAGE_FIT,
  DEFAULT_IMAGE_ALIGN,
  FULL_IMAGE_CROP,
} from './imageLayout.js'
export type { ImageRect } from './imageLayout.js'
export { layoutGroupChildren, distributeMainAxis, crossAxisOffset } from './groupLayout.js'
export { resolveShapes, childrenBBox } from './shapeResolver.js'
export type { ChildrenBBox } from './shapeResolver.js'
export { resolveVariable, isEmptyVariableValue, stringifyVariableValue, joinItemPath, ITEM_PATH_SEPARATOR } from './variables.js'
export type { ResolveContext, VariableScope, VariableScopeFrame } from './variables.js'
export {
  getPageContentWrapperStyles,
  getParagraphStyle,
  getTextDecoration,
  getTextTransform,
  getVerticalJustify,
  parseFontSize,
  resolveFontVariant,
  resolveFontFace,
  getRunTextStyle,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  PARAGRAPH_SPACING,
} from './pageContentStyles.js'
export type { ParagraphStyle, RunFontFace, RunTextStyle } from './pageContentStyles.js'
export {
  getListStyle,
  getListMarkers,
  getListMarkerFormatting,
  getListLayout,
  getBulletBox,
  MAX_LIST_LEVEL,
} from './listStyles.js'
export type { ListStyle, ListMarker, BulletShape, ListLayout, BulletBox } from './listStyles.js'
