import type { Shape, GroupShape, IfGroupShape, ForGroupShape, Presentation, VariableValueType } from '../types.js'
import { layoutGroupChildren } from './groupLayout.js'

// Values are looked up by variable name (that's the surface the export
// endpoint / UI expose today). The presentation carries the variables so we
// can fall back to `default` when no runtime value was supplied.
export interface ResolveContext {
  variableValues: Record<string, VariableValueType>
  presentation?: Presentation
}

function readVariable(name: string | undefined, ctx?: ResolveContext): string | undefined {
  if (!name || !ctx) return undefined
  // conditionVariable / itemsVariable store the variable _id; look up by _id
  // then read the runtime value by name (or default from the variable).
  const variable = ctx.presentation?.variableData?.find(v => v._id === name)
  if (!variable) return undefined
  const runtime = ctx.variableValues[variable.name]
  if (runtime !== undefined && runtime !== null) return String(runtime)
  return variable.default !== undefined ? String(variable.default) : undefined
}

function isTruthy(raw: string | undefined): boolean {
  if (raw === undefined) return false
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function expandGroup(group: GroupShape, ctx?: ResolveContext): Shape[] {
  // When the group has an active layout, recompute children positions from
  // the layout rules instead of trusting their persisted x/y — the only way
  // this stays correct once children come from dynamic data.
  const laidOut = layoutGroupChildren(group)
  const translated = laidOut.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated, ctx)
}

function expandIfGroup(group: IfGroupShape, ctx?: ResolveContext): Shape[] {
  const raw = readVariable(group.conditionVariable, ctx)
  if (!isTruthy(raw)) return []
  const translated = group.children.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated, ctx)
}

function expandForGroup(group: ForGroupShape, ctx?: ResolveContext): Shape[] {
  const raw = readVariable(group.itemsVariable, ctx)
  if (raw === undefined) return []
  const items = raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
  if (items.length === 0) return []
  // Stack each iteration vertically by group.height. Children have positions
  // relative to the group, so we translate them by (group.x, group.y + i * group.height).
  const out: Shape[] = []
  for (let i = 0; i < items.length; i++) {
    const yOffset = group.y + i * group.height
    const translated = group.children.map(child =>
      ({ ...child, x: child.x + group.x, y: child.y + yOffset }) as Shape
    )
    out.push(...resolveShapes(translated, ctx))
  }
  return out
}

export function resolveShapes(shapes: Shape[], ctx?: ResolveContext): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue
    if (shape.type === 'group') {
      out.push(...expandGroup(shape, ctx))
    } else if (shape.type === 'if-group') {
      out.push(...expandIfGroup(shape, ctx))
    } else if (shape.type === 'for-group') {
      out.push(...expandForGroup(shape, ctx))
    } else {
      out.push(shape)
    }
  }
  return out
}
