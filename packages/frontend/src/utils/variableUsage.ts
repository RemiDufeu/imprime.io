import type { Paragraph, Shape, Slide, VariableType } from '@imprime/sdk'
import { isContainerShape } from './shapeTree'

// How a shape consumes a variable. Each kind has its own tolerance for the type
// it lands on, which is what `referenceTargetType` below is compared against.
export type VariableReferenceKind = 'text' | 'condition' | 'items'

export interface VariableReference {
  kind: VariableReferenceKind
  // Dotted path from the variable's root, '' when the reference addresses the
  // variable itself rather than a field of an iterated item.
  itemPath: string
}

function collectFromParagraphs(paragraphs: Paragraph[] | undefined, variableId: string, out: VariableReference[]) {
  for (const paragraph of paragraphs ?? []) {
    for (const child of paragraph.children ?? []) {
      if ('type' in child && child.type === 'variable' && child.variableId === variableId) {
        out.push({ kind: 'text', itemPath: child.itemPath ?? '' })
      }
    }
  }
}

function collectFromShapes(shapes: Shape[], variableId: string, out: VariableReference[]) {
  for (const shape of shapes) {
    if (shape.type === 'text') {
      collectFromParagraphs(shape.paragraphes, variableId, out)
      continue
    }
    if (shape.type === 'if-group' && shape.conditionVariable === variableId) {
      out.push({ kind: 'condition', itemPath: shape.itemPath ?? '' })
    }
    if (shape.type === 'for-group' && shape.itemsVariable === variableId) {
      out.push({ kind: 'items', itemPath: shape.itemPath ?? '' })
    }
    if (isContainerShape(shape)) {
      collectFromShapes(shape.children, variableId, out)
    }
  }
}

/**
 * Every place in the presentation that points at a variable — text runs,
 * if-group conditions and for-group sources — including the ones nested inside
 * containers.
 *
 * This is the editor's own view, used to tell the author what an edit is about
 * to break. It is not the backend's deletion guard, which is narrower.
 */
export function findVariableReferences(slides: Slide[], variableId: string): VariableReference[] {
  const references: VariableReference[] = []
  for (const slide of slides) {
    collectFromShapes(slide.shapes ?? [], variableId, references)
  }
  return references
}

// What the renderer requires of the value a reference lands on. A text run is
// absent: `stringifyVariableValue` prints whatever it is given, so only a path
// that no longer resolves breaks it.
const REQUIRED_TYPE: Partial<Record<VariableReferenceKind, VariableType>> = {
  condition: 'boolean',
  items: 'object-list',
}

export function referenceRequiredType(kind: VariableReferenceKind): VariableType | undefined {
  return REQUIRED_TYPE[kind]
}

export function describeReference(reference: VariableReference, variableName: string): string {
  const target = reference.itemPath === '' ? variableName : `${variableName}.${reference.itemPath}`
  if (reference.kind === 'condition') return `if ${target}`
  if (reference.kind === 'items') return `for each ${target}`
  return `text ${target}`
}
