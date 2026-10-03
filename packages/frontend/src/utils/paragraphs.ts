import { Editor, Element, Path, Range, Transforms, type Descendant, type Node, type NodeEntry } from 'slate'
import type { ListType, Paragraph } from '@imprime/sdk'
import { getListStyle, MAX_LIST_LEVEL } from '@imprime/sdk'

/**
 * Queries and commands over the paragraphs of a text box's Slate editor.
 * Paragraphs are the editor's top-level blocks; their block formatting
 * (alignment, line height, list membership) lives on the paragraph node.
 */

export const isParagraph = (n: Node): n is Paragraph => Element.isElement(n) && n.type === 'paragraph'

/**
 * The editor value for a text box's stored content. Slate needs a block to
 * put the caret in, so an empty box starts with one empty paragraph.
 */
export function toEditorValue(content: Descendant[] | undefined): Descendant[] {
  return content?.length ? content : [{ type: 'paragraph', children: [{ text: '' }] }]
}

/**
 * Paragraph formatting is shown for, and diffed against, the first paragraph
 * of the selection. Diffing against the same paragraph that was read means an
 * unrelated change (a mark) on a selection spanning differently-formatted
 * paragraphs leaves them alone.
 */
export function firstSelectedParagraph(editor: Editor): Paragraph | undefined {
  const [entry] = Editor.nodes(editor, { match: isParagraph, mode: 'lowest' })
  return entry?.[0]
}

/** Make every paragraph in the selection a `list` item, or with null a plain paragraph. */
export function setParagraphList(editor: Editor, list: ListType | null): void {
  if (list) {
    Transforms.setNodes(editor, { list }, { match: isParagraph, mode: 'lowest' })
  } else {
    // The indent means nothing outside a list, so it goes with it.
    Transforms.unsetNodes(editor, ['list', 'indent'], { match: isParagraph, mode: 'lowest' })
  }
}

/** Move every list item in the selection `delta` levels deeper (or shallower), clamped. */
export function shiftListIndent(editor: Editor, delta: number): void {
  const items = Array.from(Editor.nodes(editor, { match: isParagraph, mode: 'lowest' }))

  for (const [paragraph, path] of items) {
    const style = getListStyle(paragraph)
    if (!style) continue
    const indent = Math.min(MAX_LIST_LEVEL, Math.max(0, style.level + delta))
    if (indent !== style.level) {
      Transforms.setNodes(editor, { indent }, { at: path })
    }
  }
}

export function selectionHasListItem(editor: Editor): boolean {
  const [entry] = Editor.nodes(editor, { match: n => isParagraph(n) && getListStyle(n) !== null, mode: 'lowest' })
  return entry !== undefined
}

/** The paragraph holding a collapsed selection, i.e. the caret. */
export function paragraphAtCaret(editor: Editor): NodeEntry<Paragraph> | undefined {
  const { selection } = editor
  if (!selection || !Range.isCollapsed(selection)) return undefined
  return Editor.above(editor, { match: isParagraph, mode: 'lowest' })
}

/**
 * Whether the caret is at the very start of its paragraph. A caret just after
 * a leading inline variable is not: it sits in a later text leaf.
 */
export function isCaretAtParagraphStart(editor: Editor, [, path]: NodeEntry<Paragraph>): boolean {
  return editor.selection !== null && Editor.isStart(editor, editor.selection.anchor, path)
}

/**
 * Text between the start of the caret's paragraph and the caret, provided
 * it lies within the first text leaf (so no inline variable is in between);
 * undefined otherwise.
 */
export function textBeforeCaret(editor: Editor, [, path]: NodeEntry<Paragraph>): string | undefined {
  const { selection } = editor
  if (!selection) return undefined
  const start = Editor.start(editor, path)
  if (!Path.equals(start.path, selection.anchor.path)) return undefined
  return Editor.string(editor, { anchor: start, focus: selection.anchor })
}
