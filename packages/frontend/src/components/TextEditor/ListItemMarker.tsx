import type { ListLayout, ListMarker, TextFormatting } from '@imprime/sdk'
import { getBulletBox, resolveFontFace } from '@imprime/sdk'
import { useEditorStore } from '../../store/editor/EditorStore'

interface ListItemMarkerProps {
  marker: ListMarker
  layout: ListLayout
  formatting: TextFormatting
}

// The marker of a list item, absolutely positioned in the item's left padding
// as `getListLayout` describes — the PDF export draws it the same way. It is
// decoration, not content: Slate must neither select nor edit it.
export function ListItemMarker({ marker, layout, formatting }: ListItemMarkerProps) {
  const fontCatalog = useEditorStore(state => state.fontCatalog)
  const color = formatting.color ?? '#000000'

  if (marker.kind === 'bullet') {
    const bullet = getBulletBox(marker.shape, layout)
    return (
      <span
        contentEditable={false}
        className="text-box-list-marker"
        style={{
          left: bullet.left,
          top: bullet.top,
          width: bullet.size,
          height: bullet.size,
          borderRadius: bullet.borderRadius,
          border: bullet.borderWidth ? `${bullet.borderWidth}px solid ${color}` : undefined,
          backgroundColor: bullet.filled ? color : undefined,
        }}
      />
    )
  }

  return (
    <span
      contentEditable={false}
      className="text-box-list-marker text-box-list-marker--number"
      style={{
        left: layout.markerLeft,
        fontSize: layout.fontSize,
        lineHeight: layout.lineHeight,
        // Resolved like the PDF does, so an unset or unknown family falls
        // back to the same font on both sides.
        ...resolveFontFace(formatting, fontCatalog),
        color,
      }}
    >
      {marker.text}
    </span>
  )
}
