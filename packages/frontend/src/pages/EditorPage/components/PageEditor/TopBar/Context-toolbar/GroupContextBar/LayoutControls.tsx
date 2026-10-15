import { Button, InputNumber, Tooltip } from 'antd'
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  BlockOutlined,
  BorderInnerOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DragOutlined,
  PauseOutlined,
} from '@ant-design/icons'
import type { GroupJustify, GroupLayoutDirection, GroupShape, Sides } from '@imprime/sdk'
import { getPadding } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { AlignGrid, type GridPosition } from '../AlignGrid/AlignGrid'
import { SidesInput } from '../SidesInput/SidesInput'
import { IconMenuButton, type IconMenuOption } from '../IconMenuButton/IconMenuButton'
import { DistributionIcon, type Distribution } from '../DistributionIcon'
import { HugControl } from './HugControl'

const LAYOUT_OPTIONS: IconMenuOption<GroupLayoutDirection>[] = [
  { value: 'none', icon: <DragOutlined />, title: 'Free: children stay where they are put' },
  { value: 'horizontal', icon: <ArrowRightOutlined />, title: 'Row' },
  { value: 'vertical', icon: <ArrowDownOutlined />, title: 'Column' },
  { value: 'stack', icon: <BlockOutlined />, title: 'Stack: children over each other' },
]

// Drawn along the group's own axis.
function distributionOptions(vertical: boolean): IconMenuOption<Distribution>[] {
  return [
    { value: 'packed', icon: <DistributionIcon distribution="packed" vertical={vertical} />, title: 'Packed' },
    {
      value: 'space-between',
      icon: <DistributionIcon distribution="space-between" vertical={vertical} />,
      title: 'Space between',
    },
    {
      value: 'space-around',
      icon: <DistributionIcon distribution="space-around" vertical={vertical} />,
      title: 'Space around',
    },
  ]
}

const PADDING_SIDES: { key: keyof Sides; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
]

function isSpread(justify: GroupJustify): justify is 'space-between' | 'space-around' {
  return justify === 'space-between' || justify === 'space-around'
}

// How the group places its children. The data keeps `justify` along the main
// axis and `align` across it; the grid shows them as the places they are on
// the page, so it reads the same whichever way the group runs. Icons rather
// than labels keep the bar short; each one's tooltip names it.
export function LayoutControls({ group }: { group: GroupShape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const currentPage = useCurrentPage()

  const layout = group.layout ?? 'none'
  const justify = group.justify ?? 'start'
  const align = group.align ?? 'start'
  const isColumn = layout === 'vertical'
  const isStack = layout === 'stack'

  const handleLayoutChange = (value: GroupLayoutDirection) => {
    if (value === 'none') {
      updateShape(group.id, { layout: value })
      return
    }
    // No gap is written: unset is 0, and one the group had before is kept.
    if (layout === 'none') {
      updateShape(group.id, { layout: value, justify, align })
      return
    }
    // Turning between a row and a column keeps the children where they sit
    // on the page: the two axes trade places.
    const swaps = (value === 'vertical') !== isColumn && !isSpread(justify) && align !== 'stretch'
    updateShape(group.id, swaps ? { layout: value, justify: align, align: justify } : { layout: value })
  }

  // A stack spreads nothing: the spacing values align to the start there.
  const mainPosition: GridPosition | undefined = isSpread(justify) ? (isStack ? 'start' : undefined) : justify
  const crossPosition: GridPosition | undefined = align === 'stretch' ? undefined : align

  const handleGridChange = (horizontal: GridPosition, vertical: GridPosition) => {
    const main = isColumn ? vertical : horizontal
    const cross = isColumn ? horizontal : vertical
    updateShape(group.id, {
      justify: isSpread(justify) && !isStack ? justify : main,
      align: align === 'stretch' ? align : cross,
    })
  }

  return (
    <div className="toolbar-item">
      <IconMenuButton
        options={LAYOUT_OPTIONS}
        value={layout}
        title="Children layout"
        onChange={handleLayoutChange}
      />

      {layout !== 'none' && (
        <>
          <AlignGrid
            horizontal={isColumn ? crossPosition : mainPosition}
            vertical={isColumn ? mainPosition : crossPosition}
            label="Children alignment"
            onChange={handleGridChange}
          />
          {!isStack && (
            <IconMenuButton
              options={distributionOptions(isColumn)}
              value={isSpread(justify) ? justify : 'packed'}
              title="Children distribution"
              onChange={(value: Distribution) => updateShape(group.id, {
                justify: value === 'packed' ? 'start' : value,
              })}
            />
          )}
          {/* Across the group's axis: a row's children stretch to its height. */}
          <Tooltip title={isStack ? 'Stretch children to the full height' : 'Stretch children across the group'}>
            <Button
              aria-label={isStack ? 'Stretch children to the full height' : 'Stretch children across the group'}
              size="small"
              type={align === 'stretch' ? 'primary' : 'text'}
              icon={isColumn ? <ColumnWidthOutlined /> : <ColumnHeightOutlined />}
              onClick={() => updateShape(group.id, { align: align === 'stretch' ? 'start' : 'stretch' })}
            />
          </Tooltip>
          {!isStack && (
            <Tooltip title="Gap between children">
              <InputNumber
                min={0}
                value={group.gap ?? 0}
                onChange={(value) => updateShape(group.id, { gap: value ?? 0 })}
                prefix={<PauseOutlined rotate={isColumn ? 90 : undefined} />}
                aria-label="Gap between children"
                size="small"
                style={{ width: 64 }}
              />
            </Tooltip>
          )}
          <SidesInput
            value={getPadding(group.padding)}
            fields={PADDING_SIDES}
            onChange={(padding) => updateShape(group.id, { padding })}
            icon={<BorderInnerOutlined />}
            title="Padding"
          />
          {!isStack && <HugControl group={group} shapes={currentPage?.shapes ?? []} />}
        </>
      )}
    </div>
  )
}
