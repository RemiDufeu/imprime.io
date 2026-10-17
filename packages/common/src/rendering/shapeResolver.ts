import type {
  Page,
  Shape,
  GroupShape,
  RectangleShape,
  TextBoxShape,
  ImageShape,
  VariableElement,
  CustomText,
} from '../types.js'
import { isContainerShape } from '../types.js'
import { layoutTree } from './groupLayout.js'
import { getBorderOverhang } from './boxGeometry.js'
import { getContentFrame, shapeToPage, PAGE_FRAME, type Frame } from './rotation.js'
import {
  isConditionMet,
  resolveVariable,
  stringifyVariableValue,
  type ResolveContext,
  type VariableScope,
  type VariableScopeFrame,
} from './variables.js'

export type { ResolveContext }

function reidShape(shape: Shape, suffix: string): Shape {
  const id = `${shape.id}::${suffix}`
  return isContainerShape(shape)
    ? { ...shape, id, children: shape.children.map(child => reidShape(child, suffix)) } as Shape
    : { ...shape, id } as Shape
}

// A copy of a repeated group, and the scope its variables resolve in: the
// frame of its own item on top of its parent's.
interface Copy {
  shape: GroupShape
  scope: VariableScope
}

// The copies of a repeated group, one per item, each with its item's frame.
// A group whose list is unset, unknown, not a list or empty has none.
function repeatGroup(group: GroupShape, ctx: ResolveContext | undefined, scope: VariableScope): Copy[] {
  const variableId = group.repeat?.variableId
  if (!variableId) return []

  const items = resolveVariable(variableId, ctx, group.repeat?.itemPath, scope)
  if (!Array.isArray(items)) return []

  return items.map((item, i) => {
    // The frame is what the copy addresses: same variable, and the path of the
    // list being iterated ('' at the top level, 'moves' for a nested repeat).
    const frame: VariableScopeFrame = { variableId, path: group.repeat?.itemPath ?? '', value: item }
    // Each copy reforges its ids so the renderer never sees duplicate keys —
    // the authored ids are only unique within the source tree.
    const suffix = `rep-${group.id}-${i}`
    const copy: GroupShape = {
      ...group,
      id: `${group.id}::${suffix}`,
      children: group.children.map(child => reidShape(child, suffix)),
    }
    return { shape: copy, scope: [...scope, frame] }
  })
}

// In a parent without a layout, a repeated group's copies are stacked
// downwards from where it stands: as a hugging column of them, so that a copy
// which grows pushes the next one down. The column paints nothing.
function stackCopies(group: GroupShape, copies: Shape[]): GroupShape {
  return {
    type: 'group',
    id: `${group.id}::copies`,
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height,
    layout: 'vertical',
    hug: true,
    children: copies.map(copy => ({ ...copy, x: 0, y: 0 }) as Shape),
  }
}

/**
 * What a list of siblings becomes once the data is applied: hidden shapes and
 * those whose condition fails are gone — they take no room in a layout — a
 * repeated group is replaced by its copies, in place, and every value read
 * from an item is baked in, while the item is still known. A copy's
 * condition is checked against its own item.
 *
 * `freeForm` is the parent having no layout to place copies with.
 */
function instantiate(
  shapes: Shape[],
  ctx: ResolveContext | undefined,
  scope: VariableScope,
  freeForm: boolean,
): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue

    if (shape.type === 'group' && shape.repeat) {
      const copies = repeatGroup(shape, ctx, scope)
        .filter(copy => isConditionMet(copy.shape.visibleWhen, ctx, copy.scope))
        .map(copy => applyData(copy.shape, ctx, copy.scope))
      if (freeForm) {
        if (copies.length > 0) out.push(stackCopies(shape, copies))
      } else {
        out.push(...copies)
      }
      continue
    }

    if (isConditionMet(shape.visibleWhen, ctx, scope)) out.push(applyData(shape, ctx, scope))
  }
  return out
}

function applyData(shape: Shape, ctx: ResolveContext | undefined, scope: VariableScope): Shape {
  switch (shape.type) {
    case 'group':
      return { ...shape, children: instantiate(shape.children, ctx, scope, !shape.layout || shape.layout === 'none') }
    case 'text':
      return bakeTextBox(shape, ctx, scope)
    case 'image':
      return bakeImage(shape, ctx, scope)
    default:
      return shape
  }
}

export interface GroupBox {
  // Painted under the children.
  background: RectangleShape | null
  // Stroked over them, as a frame's border is in Figma: centred on the
  // group's edge, it would otherwise be half hidden by a child that fills the
  // group up to that edge — a table's header row under the table's border.
  border: RectangleShape | null
}

/**
 * A group's own background and border, as rectangles both renderers already
 * draw, at the group's position and turned with it. Each is null when there
 * is nothing to paint.
 */
export function getGroupBox(group: GroupShape): GroupBox {
  const hasFill = group.fill !== undefined && group.fill !== 'none' && group.fill !== 'transparent'
  const hasStroke = group.stroke !== undefined && getBorderOverhang(group) > 0
  const base = {
    type: 'rectangle' as const,
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height,
    rotation: group.rotation,
    cornerRadius: group.cornerRadius,
  }

  return {
    background: hasFill && group.fill !== undefined
      ? { ...base, id: `${group.id}::fill`, fill: group.fill }
      : null,
    border: hasStroke
      ? {
          ...base,
          id: `${group.id}::border`,
          fill: 'none',
          stroke: group.stroke,
          strokeWidth: group.strokeWidth,
          strokeWidths: group.strokeWidths,
          strokeStyle: group.strokeStyle,
        }
      : null,
  }
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
  // a run carrying an `itemPath` outside any repeat must still be baked, to
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

// A box bound to a variable commits to its image here, while the scope stack
// is still live, as an item-scoped text run does: the renderer cannot know
// which iteration a box came from. Every box goes through here, bound or not,
// so `resolvedImage` only ever holds what this wrote. A value that is not a
// string — or an empty one, with no default to fall back on — leaves the box
// empty. Whether a string is a drawable image is the renderer's to check.
function bakeImage(shape: ImageShape, ctx: ResolveContext | undefined, scope: VariableScope): ImageShape {
  const { resolvedImage: _authored, ...authored } = shape
  if (!shape.imageVariable) return authored

  const value = resolveVariable(shape.imageVariable, ctx, shape.itemPath, scope)
  return {
    ...authored,
    imageId: undefined,
    resolvedImage: typeof value === 'string' && value.trim() !== '' ? value : undefined,
  }
}

// Into page space, as leaves: each group's box around its children — its
// background under them, its border over them. `frame` is where the siblings'
// coordinates lie on the page: a turned group turns its children with it, so
// each leaf carries the sum of its ancestors' rotations and its own, about
// its own centre, placed where the turns take that centre.
function flatten(shapes: Shape[], frame: Frame): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    const placed = shapeToPage(shape, frame)
    if (placed.type !== 'group') {
      out.push(placed)
      continue
    }
    const { background, border } = getGroupBox(placed)
    if (background) out.push(background)
    out.push(...flatten(placed.children, getContentFrame(frame, shape)))
    if (border) out.push(border)
  }
  return out
}

/**
 * Flatten a shape tree into absolute-positioned leaves, in three passes: the
 * data (hidden shapes and failed conditions dropped, repeated groups copied,
 * item values baked), then the layout of what that left (`layoutTree`: hugging
 * groups sized, children placed), then page space, with each group's box
 * emitted as rectangles and its rotation composed into its leaves.
 */
export function resolveShapes(
  shapes: Shape[],
  ctx?: ResolveContext,
  scope: VariableScope = [],
): Shape[] {
  return flatten(layoutTree(instantiate(shapes, ctx, scope, true)), PAGE_FRAME)
}

// The copies of a page, each with the scope its shapes resolve in: a page
// that is not repeated is its own single copy, with an empty scope. A repeated
// page whose list is unset, unknown, not a list or empty has none.
function pageCopies(page: Page, ctx: ResolveContext | undefined): { page: Page; scope: VariableScope }[] {
  if (!page.repeat) return [{ page, scope: [] }]
  const variableId = page.repeat.variableId
  if (!variableId) return []

  const items = resolveVariable(variableId, ctx)
  if (!Array.isArray(items)) return []

  // A page iterates a variable's own value, so its frame's path is the root.
  // Each copy reforges its id so the renderer never sees a duplicate key.
  return items.map((item, i) => ({
    page: { ...page, _id: `${page._id}::rep-${i}` },
    scope: [{ variableId, path: '', value: item }],
  }))
}

/**
 * The pages a template exports, in order, once the data is applied: a
 * repeated page is replaced by its copies, in place; a copy whose condition
 * fails — checked against its own item, as a repeated group's — is gone; and
 * each copy's shapes are resolved (`resolveShapes`) in its item's scope.
 */
export function resolvePages(pages: Page[], ctx?: ResolveContext): Page[] {
  return pages.flatMap(page =>
    pageCopies(page, ctx)
      .filter(copy => isConditionMet(page.visibleWhen, ctx, copy.scope))
      .map(copy => ({ ...copy.page, shapes: resolveShapes(page.shapes, ctx, copy.scope) }))
  )
}
