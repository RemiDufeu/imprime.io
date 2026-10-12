import type { ImageAlign } from '@imprime/sdk'

const VERTICAL: ImageAlign['vertical'][] = ['top', 'middle', 'bottom']
const HORIZONTAL: ImageAlign['horizontal'][] = ['left', 'center', 'right']

interface ImageAlignGridProps {
  value: ImageAlign
  // 'fill' has nothing to align: the image is the box.
  disabled: boolean
  onChange: (align: ImageAlign) => void
}

// The nine places an image can sit in its box, laid out as they are.
export function ImageAlignGrid({ value, disabled, onChange }: ImageAlignGridProps) {
  return (
    <div className="image-align-grid" role="radiogroup" aria-label="Image alignment">
      {VERTICAL.map(vertical => HORIZONTAL.map(horizontal => {
        const active = value.vertical === vertical && value.horizontal === horizontal
        return (
          <button
            key={`${vertical}-${horizontal}`}
            type="button"
            role="radio"
            aria-checked={active}
            title={vertical === 'middle' && horizontal === 'center' ? 'Center' : `${vertical} ${horizontal}`}
            disabled={disabled}
            className={active ? 'image-align-cell active' : 'image-align-cell'}
            onClick={() => onChange({ horizontal, vertical })}
          />
        )
      }))}
    </div>
  )
}
