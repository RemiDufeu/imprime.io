import type { BaseShape } from '../types.js'

/**
 * Convert stroke style to SVG dash array pattern
 * @param strokeStyle - The stroke style ('solid', 'dashed', 'dotted')
 * @returns SVG dasharray string or undefined for solid
 */
export function getDashArray(strokeStyle?: BaseShape['strokeStyle']): string | undefined {
  switch (strokeStyle) {
    case 'dashed':
      return '10,5'
    case 'dotted':
      return '2,2'
    default:
      return undefined
  }
}
