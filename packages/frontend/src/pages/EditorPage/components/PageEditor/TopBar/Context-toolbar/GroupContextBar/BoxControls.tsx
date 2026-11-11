import type { GroupShape } from '@imprime/sdk'
import { getBorderWidths } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { PaletteColorPicker } from '../PaletteColorPicker'
import { StrokeControls, type StrokeValue } from '../StrokeControls'
import { CornerRadiusInput } from '../CornerRadiusInput'

// The group's own box: a background, a border, rounded corners. None of them by
// default — a group is invisible in the export until it is given one.
export function BoxControls({ group }: { group: GroupShape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const drawStyle = useEditorStore(state => state.drawStyle)

  const stroke: StrokeValue = {
    stroke: group.stroke,
    strokeWidth: group.strokeWidth ?? 0,
    strokeStyle: group.strokeStyle ?? 'solid',
    strokeWidths: getBorderWidths(group),
  }

  return (
    <>
      <div className="toolbar-item">
        <span className="toolbar-label">Fill</span>
        <PaletteColorPicker
          value={group.fill}
          onChange={(fill: string) => updateShape(group.id, { fill })}
          onClear={() => updateShape(group.id, { fill: undefined })}
        />
      </div>

      {/* A width alone draws nothing: any border edit but clearing the colour
          gives a group without one the drawing colour — as the image bar does. */}
      <StrokeControls
        value={stroke}
        onChange={(patch) => updateShape(group.id, { stroke: group.stroke ?? drawStyle.stroke, ...patch })}
      />

      <CornerRadiusInput
        value={group.cornerRadius}
        onChange={(cornerRadius) => updateShape(group.id, { cornerRadius })}
      />
    </>
  )
}
