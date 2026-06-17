import type { TextBoxShape, Paragraph, CustomText, VariableElement } from '../types.js'
import { convertStylesToString, getSlideContentWrapperStyles, getSlideContentInternalCSS } from './slideContentStyles.js'

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render a text node with formatting
 * Follows frontend TextBoxEditor renderLeaf logic exactly
 */
function renderTextNode(node: CustomText): string {
  let text = escapeHTML(node.text)

  // Apply bold
  if (node.bold) {
    text = `<strong>${text}</strong>`
  }

  // Apply italic
  if (node.italic) {
    text = `<em>${text}</em>`
  }

  // Apply underline
  if (node.underline) {
    text = `<u>${text}</u>`
  }

  // Apply inline styles (color, fontSize, fontFamily)
  const styles: string[] = []
  if (node.color) styles.push(`color: ${node.color}`)
  if (node.fontSize) styles.push(`font-size: ${node.fontSize}`)
  if (node.fontFamily) styles.push(`font-family: ${node.fontFamily}`)

  if (styles.length > 0) {
    text = `<span style="${styles.join('; ')}">${text}</span>`
  }

  return text
}

/**
 * Render a variable element with its value
 * Similar to renderTextNode but for variables
 */
function renderVariable(
  element: VariableElement,
  getVariableValue: (variableId: string) => string
): string {
  const value = escapeHTML(getVariableValue(element.variableId))
  let text = value

  // Apply bold
  if (element.bold) {
    text = `<strong>${text}</strong>`
  }

  // Apply italic
  if (element.italic) {
    text = `<em>${text}</em>`
  }

  // Apply underline
  if (element.underline) {
    text = `<u>${text}</u>`
  }

  // Apply inline styles
  const styles: string[] = []
  if (element.color) styles.push(`color: ${element.color}`)
  if (element.fontSize) styles.push(`font-size: ${element.fontSize}`)
  if (element.fontFamily) styles.push(`font-family: ${element.fontFamily}`)

  if (styles.length > 0) {
    text = `<span style="${styles.join('; ')}">${text}</span>`
  }

  return text
}

/**
 * Render a Slate paragraph with text nodes and variable elements
 * Follows frontend TextBoxEditor renderElement logic exactly
 * Styles are applied via CSS class (injected in renderTextSVG)
 */
function renderParagraph(
  paragraph: Paragraph,
  getVariableValue: (variableId: string) => string
): string {
  const content = paragraph.children
    .map((child) => {
      if ('type' in child && child.type === 'variable') {
        return renderVariable(child as VariableElement, getVariableValue)
      } else {
        return renderTextNode(child as CustomText)
      }
    })
    .join('')

  // No inline styles - CSS class will handle all styling
  return `<p>${content}</p>`
}

/**
 * Render a text box shape to SVG foreignObject
 * Follows frontend SVGText.tsx logic exactly
 * Uses inline styles that match the frontend exactly
 */
export function renderTextSVG(
  shape: TextBoxShape,
  getVariableValue: (variableId: string) => string = () => ''
): string {
  const textContent = shape.paragraphes
    .map((paragraph) => renderParagraph(paragraph, getVariableValue))
    .join('')

  // Get inline styles for the wrapper
  const inlineStyles = convertStylesToString(getSlideContentWrapperStyles())

  // Include internal CSS for paragraph and text formatting elements
  const internalCSS = getSlideContentInternalCSS()

  return `<foreignObject x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}">
  <div xmlns="http://www.w3.org/1999/xhtml">
    <style>${internalCSS}</style>
    <div style="${inlineStyles}">
      ${textContent}
    </div>
  </div>
</foreignObject>`
}
