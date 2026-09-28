/**
 * Common rendering utilities for shapes
 * Ensures consistent rendering between frontend and backend
 */

export { SLIDE_WIDTH, SLIDE_HEIGHT } from './constants.js'
export { getDashArray } from './strokeUtils.js'
export { getEllipseGeometry, getRectangleCornerRadius } from './svgRenderers.js'
export type { EllipseGeometry } from './svgRenderers.js'
export { layoutGroupChildren, distributeMainAxis, crossAxisOffset } from './groupLayout.js'
export { resolveShapes, childrenBBox } from './shapeResolver.js'
export type { ChildrenBBox } from './shapeResolver.js'
export { resolveVariable, isEmptyVariableValue, stringifyVariableValue, joinItemPath, ITEM_PATH_SEPARATOR } from './variables.js'
export type { ResolveContext, VariableScope, VariableScopeFrame } from './variables.js'
export { getSlideContentWrapperStyles } from './slideContentStyles.js'
