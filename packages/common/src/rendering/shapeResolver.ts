import type {
  Shape,
  GroupShape,
  IfGroupShape,
  ForGroupShape,
  TextBoxShape,
  VariableElement,
  CustomText,
} from '../types.js'
import { isContainerShape } from '../types.js'
import { layoutGroupChildren, distributeMainAxis, crossAxisOffset } from './groupLayout.js'
import {
  resolveVariable,
  stringifyVariableValue,
  type ResolveContext,
  type VariableScope,
  type VariableScopeFrame,
} from './variables.js'

export type { ResolveContext }

// Move a set of children from their parent's local space into the parent's own
// space. Every container expansion needs this, hence the one helper.
function translate(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map(shape => ({ ...shape, x: shape.x + dx, y: shape.y + dy }) as Shape)
}

function reidShape(shape: Shape, suffix: string): Shape {
  const id = `${shape.id}::${suffix}`
  return isContainerShape(shape)
    ? { ...shape, id, children: shape.children.map(child => reidShape(child, suffix)) } as Shape
    : { ...shape, id } as Shape
}

export interface ChildrenBBox {
  minX: number
  minY: number
  width: number
  height: number
}

// Tight bounding box of the given children. Returns actual extent (max - min)
// so it excludes any empty space between the parent's origin and the topmost/
// leftmost child.
export function childrenBBox(children: Shape[]): ChildrenBBox {
  if (children.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of children) {
    if (c.x < minX) minX = c.x
    if (c.y < minY) minY = c.y
    if (c.x + c.width > maxX) maxX = c.x + c.width
    if (c.y + c.height > maxY) maxY = c.y + c.height
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

// When the group has an active layout, children positions are recomputed from
// the layout rules instead of trusting their persisted x/y — the only way this
// stays correct once children come from dynamic data.
function expandGroup(group: GroupShape, ctx: ResolveContext | undefined, scope: VariableScope): Shape[] {
  // Binds nothing itself, but must carry the scope through: a text run nested
  // `for-group > group > text` otherwise loses its binding.
  return resolveShapes(translate(layoutGroupChildren(group), group.x, group.y), ctx, scope)
}

function expandIfGroup(group: IfGroupShape, ctx: ResolveContext | undefined, scope: VariableScope): Shape[] {
  // Strictly the boolean `true`: a string or a list is never coerced.
  if (resolveVariable(group.conditionVariable, ctx, group.itemPath, scope) !== true) return []
  return resolveShapes(translate(group.children, group.x, group.y), ctx, scope)
}

// Per-iteration (x, y) offset relative to the for-group's own origin. Each
// iteration occupies the children's tight bbox, so they are laid out as
// `count` identically-sized items — the same distribution a group applies to
// its children.
function forGroupIterationOffsets(group: ForGroupShape, count: number): { xOff: number; yOff: number }[] {
  if (count <= 0) return []

  const isRow = (group.layout ?? 'vertical') === 'horizontal'
  const bbox = childrenBBox(group.children)
  const iterMain = isRow ? bbox.width : bbox.height
  const iterCross = isRow ? bbox.height : bbox.width

  const mainOffsets = distributeMainAxis(
    Array.from({ length: count }, () => iterMain),
    isRow ? group.width : group.height,
    group.gap ?? 0,
    group.justify ?? 'start',
  )
  const crossPos = crossAxisOffset(group.align ?? 'start', isRow ? group.height : group.width, iterCross)

  return mainOffsets.map(mainPos => ({
    xOff: isRow ? mainPos : crossPos,
    yOff: isRow ? crossPos : mainPos,
  }))
}

function expandForGroup(group: ForGroupShape, ctx: ResolveContext | undefined, scope: VariableScope): Shape[] {
  const itemsVariable = group.itemsVariable
  if (!itemsVariable) return []

  const items = resolveVariable(itemsVariable, ctx, group.itemPath, scope)
  if (!Array.isArray(items) || items.length === 0) return []

  // Children are shifted by the tight bbox origin so each iteration lands at
  // (group.x + xOff, group.y + yOff) — otherwise the authored minX/minY get
  // added on top of the layout offset and push iterations off-slide.
  const bbox = childrenBBox(group.children)
  const offsets = forGroupIterationOffsets(group, items.length)

  const out: Shape[] = []
  for (let i = 0; i < items.length; i++) {
    const { xOff, yOff } = offsets[i]
    // Each iteration reforges ids so the renderer never sees duplicate keys —
    // the authored child.id is only unique within the source tree.
    const iteration = group.children.map(child => reidShape(child, `for-${group.id}-${i}`))
    // The frame is what children address: same variable, and the path of the
    // list being iterated ('' at the top level, 'moves' for a nested group).
    const frame: VariableScopeFrame = {
      variableId: itemsVariable,
      path: group.itemPath ?? '',
      value: items[i],
    }
    out.push(...resolveShapes(
      translate(iteration, group.x + xOff - bbox.minX, group.y + yOff - bbox.minY),
      ctx,
      [...scope, frame],
    ))
  }
  return out
}

// An item-scoped run commits to its text here, while the scope stack is still
// live. `ExportService.renderTextBox` runs after `resolveShapes` has flattened
// the tree and cannot know which iteration a run came from; runs with no
// `itemPath` are left untouched and resolved there, exactly as before.
function bakeVariableRun(
  run: VariableElement,
  ctx: ResolveContext | undefined,
  scope: VariableScope,
): CustomText {
  const { type, variableId, itemPath, children, ...formatting } = run
  return {
    ...formatting,
    text: stringifyVariableValue(resolveVariable(variableId, ctx, itemPath, scope)),
  }
}

function hasItemScopedRun(shape: TextBoxShape): boolean {
  return shape.paragraphes.some(paragraph =>
    paragraph.children.some(
      child => 'type' in child && child.type === 'variable' && child.itemPath !== undefined
    )
  )
}

function bakeTextBox(
  shape: TextBoxShape,
  ctx: ResolveContext | undefined,
  scope: VariableScope,
): TextBoxShape {
  // A box with no item-scoped run is handed back untouched — the common case,
  // and what makes the scan worth it. Note the test is not `scope.length === 0`:
  // a run carrying an `itemPath` outside any for-group must still be baked, to
  // the empty string it resolves to. Left alone it would reach the renderer,
  // which resolves by `variableId` only and would print the variable's whole
  // value instead.
  if (!hasItemScopedRun(shape)) return shape

  return {
    ...shape,
    paragraphes: shape.paragraphes.map(paragraph => ({
      ...paragraph,
      children: paragraph.children.map(child =>
        'type' in child && child.type === 'variable' && child.itemPath !== undefined
          ? bakeVariableRun(child, ctx, scope)
          : child
      ),
    })),
  }
}

/**
 * Flatten a shape tree into absolute-positioned leaves: containers are expanded
 * (conditions evaluated, iterations materialised), hidden shapes are dropped.
 */
export function resolveShapes(
  shapes: Shape[],
  ctx?: ResolveContext,
  scope: VariableScope = [],
): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue
    switch (shape.type) {
      case 'group':
        out.push(...expandGroup(shape, ctx, scope))
        break
      case 'if-group':
        out.push(...expandIfGroup(shape, ctx, scope))
        break
      case 'for-group':
        out.push(...expandForGroup(shape, ctx, scope))
        break
      case 'text':
        out.push(bakeTextBox(shape, ctx, scope))
        break
      default:
        out.push(shape)
    }
  }
  return out
}
