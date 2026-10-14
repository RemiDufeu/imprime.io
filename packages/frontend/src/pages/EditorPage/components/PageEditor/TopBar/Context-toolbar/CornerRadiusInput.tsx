import { RadiusUpleftOutlined } from '@ant-design/icons'
import type { CornerRadii } from '@imprime/sdk'
import { areCornersUniform, getCornerRadii } from '@imprime/sdk'
import { SidesInput } from './SidesInput/SidesInput'

const CORNERS: { key: keyof CornerRadii; label: string }[] = [
  { key: 'topLeft', label: 'Top left' },
  { key: 'topRight', label: 'Top right' },
  { key: 'bottomLeft', label: 'Bottom left' },
  { key: 'bottomRight', label: 'Bottom right' },
]

interface CornerRadiusInputProps {
  value: number | CornerRadii | undefined
  // A number while the corners agree, as the shape stores it then.
  onChange: (cornerRadius: number | CornerRadii) => void
}

// A box's corner radius: one for all four, or one each.
export function CornerRadiusInput({ value, onChange }: CornerRadiusInputProps) {
  return (
    <div className="toolbar-item">
      <SidesInput
        value={getCornerRadii(value)}
        fields={CORNERS}
        onChange={(radii) => onChange(areCornersUniform(radii) ? radii.topLeft : radii)}
        icon={<RadiusUpleftOutlined />}
        title="Corner radius"
      />
    </div>
  )
}
