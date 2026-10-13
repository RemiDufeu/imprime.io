import './AlignGrid.css'

export type GridPosition = 'start' | 'center' | 'end'

const POSITIONS: GridPosition[] = ['start', 'center', 'end']
const VERTICAL_NAMES: Record<GridPosition, string> = { start: 'top', center: 'middle', end: 'bottom' }
const HORIZONTAL_NAMES: Record<GridPosition, string> = { start: 'left', center: 'center', end: 'right' }

interface AlignGridProps {
  // The cell chosen. A coordinate left unset lights its whole line instead:
  // that axis is not a position — spread out, or stretched.
  horizontal: GridPosition | undefined
  vertical: GridPosition | undefined
  disabled?: boolean
  label: string
  onChange: (horizontal: GridPosition, vertical: GridPosition) => void
}

// The nine places something can sit in a box, laid out as they are.
export function AlignGrid({ horizontal, vertical, disabled = false, label, onChange }: AlignGridProps) {
  return (
    <div className="align-grid" role="radiogroup" aria-label={label}>
      {POSITIONS.map(row => POSITIONS.map(column => {
        const active = (horizontal === undefined || horizontal === column)
          && (vertical === undefined || vertical === row)
        const name = row === 'center' && column === 'center'
          ? 'Center'
          : `${VERTICAL_NAMES[row]} ${HORIZONTAL_NAMES[column]}`
        return (
          <button
            key={`${row}-${column}`}
            type="button"
            role="radio"
            aria-checked={active}
            title={name}
            disabled={disabled}
            className={active ? 'align-grid-cell active' : 'align-grid-cell'}
            onClick={() => onChange(column, row)}
          />
        )
      }))}
    </div>
  )
}
