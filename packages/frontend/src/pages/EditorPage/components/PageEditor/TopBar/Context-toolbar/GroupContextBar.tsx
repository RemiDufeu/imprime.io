import { Select, InputNumber, Divider, Checkbox, Tooltip, type MenuProps } from 'antd'
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  BlockOutlined,
  DragOutlined,
  InfoCircleOutlined,
  BorderInnerOutlined,
  RetweetOutlined,
} from '@ant-design/icons'
import type { GroupJustify, GroupLayoutDirection, GroupShape, Shape, Sides } from '@imprime/sdk'
import { getBorderWidths, getGrow, getImposedAxes, getPadding } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../store/editor/selectors'
import { findShapeById } from '../../../../../../utils/shapeTree'
import {
  decodeItemFieldValue,
  encodeItemFieldValue,
  itemFieldsInScope,
  variableReferenceLabel,
} from '../../../../../../utils/variableScope'
import { PaletteColorPicker } from './PaletteColorPicker'
import { AlignGrid, type GridPosition } from './AlignGrid/AlignGrid'
import { SidesInput } from './SidesInput/SidesInput'
import { StrokeControls, type StrokeValue } from './StrokeControls'
import { CornerRadiusInput } from './CornerRadiusInput'
import { ConditionControl } from './ConditionControl'
import { FlexControl } from './FlexControl'
import { BindingButton } from './BindingButton/BindingButton'
import { IconMenuButton, type IconMenuOption } from './IconMenuButton/IconMenuButton'

const LAYOUT_OPTIONS: IconMenuOption<GroupLayoutDirection>[] = [
  { value: 'none', icon: <DragOutlined />, title: 'Free: children stay where they are put' },
  { value: 'horizontal', icon: <ArrowRightOutlined />, title: 'Row' },
  { value: 'vertical', icon: <ArrowDownOutlined />, title: 'Column' },
  { value: 'stack', icon: <BlockOutlined />, title: 'Stack: children over each other' },
]

type Distribution = 'packed' | 'space-between' | 'space-around'

const DISTRIBUTION_OPTIONS: { value: Distribution; label: string }[] = [
  { value: 'packed', label: 'Packed' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
]

const PADDING_SIDES: { key: keyof Sides; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
]

const DEFAULT_GAP = 8

function isSpread(justify: GroupJustify): justify is 'space-between' | 'space-around' {
  return justify === 'space-between' || justify === 'space-around'
}

// The selected group: what it repeats, how it lays its children out, the box
// it paints, and when it shows.
export function GroupContextBar() {
  const group = useEditorStore(selectSelectedShape)

  if (group?.type !== 'group') return null

  return (
    <div className="toolbar-container context-toolbar">
      <RepeatControl group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <LayoutControls group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <BoxControls group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <FlexControl shape={group} />
      <ConditionControl shape={group} />
    </div>
  )
}

// Menu keys besides the lists'. An encoded variable always holds '::', so
// neither can be one.
const NO_REPEAT = '__no-repeat__'
const NO_LISTS = '__no-lists__'

// The list the group is repeated for: a list variable, or a list field of the
// item a repeat around it iterates — what makes nesting possible.
function RepeatControl({ group }: { group: GroupShape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.template?.variableData) ?? []
  const currentPage = useCurrentPage()
  const shapes = currentPage?.shapes ?? []

  const lists = variables
    .filter(v => v.type === 'object-list')
    .map(v => ({ key: encodeItemFieldValue(v._id, ''), label: v.name }))
  const itemLists = itemFieldsInScope(shapes, group.id, variables, 'object-list')
    .map(option => ({ key: encodeItemFieldValue(option.variableId, option.itemPath), label: option.label }))

  const items: MenuProps['items'] = [
    { key: NO_REPEAT, label: 'No repeat' },
    { type: 'divider' },
    ...(lists.length === 0 && itemLists.length === 0
      ? [{ key: NO_LISTS, label: 'No list variables', disabled: true }]
      : []),
    ...(lists.length > 0 ? [{ type: 'group' as const, label: 'Lists', children: lists }] : []),
    ...(itemLists.length > 0 ? [{ type: 'group' as const, label: 'Item lists', children: itemLists }] : []),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  let selectedKeys = [NO_REPEAT]
  if (group.repeat) {
    selectedKeys = group.repeat.variableId
      ? [encodeItemFieldValue(group.repeat.variableId, group.repeat.itemPath ?? '')]
      : []
  }

  // 'No repeat' makes the group a plain group again.
  const handleSelect = (key: string) => {
    if (key === NO_LISTS) return
    const decoded = key === NO_REPEAT ? undefined : decodeItemFieldValue(key)
    updateShape(group.id, {
      repeat: decoded && {
        variableId: decoded.variableId,
        itemPath: decoded.itemPath === '' ? undefined : decoded.itemPath,
      },
    })
  }

  // A repeat a paste could not rebind has no list: it draws no copy until one
  // is picked.
  let binding: string | undefined
  if (group.repeat) {
    binding = group.repeat.variableId
      ? variableReferenceLabel(variables, group.repeat.variableId, group.repeat.itemPath) ?? 'unknown list'
      : 'pick a list'
  }

  const parentId = findShapeById(shapes, group.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  const freeFormParent = parent?.type !== 'group' || (parent.layout ?? 'none') === 'none'

  return (
    <div className="toolbar-item">
      <BindingButton
        icon={<RetweetOutlined />}
        label="Repeat"
        binding={binding}
        title={binding === undefined ? 'Not repeated — choose a list' : `Repeated for each item of ${binding}`}
        items={items}
        selectedKeys={selectedKeys}
        onSelect={handleSelect}
      />
      {group.repeat && freeFormParent && (
        <Tooltip title="Its parent has no layout: the copies are stacked downwards, touching. Put the group in a column to space them, or give it a padding.">
          <InfoCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />
        </Tooltip>
      )}
    </div>
  )
}

// How the group places its children. The data keeps `justify` along the main
// axis and `align` across it; the grid shows them as the places they are on
// the page, so it reads the same whichever way the group runs.
function LayoutControls({ group }: { group: GroupShape }) {
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
    if (layout === 'none') {
      updateShape(group.id, { layout: value, justify, align, gap: group.gap ?? DEFAULT_GAP })
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
      <span className="toolbar-label">Layout</span>
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
            <Select
              value={isSpread(justify) ? justify : 'packed'}
              onChange={(value: Distribution) => updateShape(group.id, {
                justify: value === 'packed' ? 'start' : value,
              })}
              size="small"
              style={{ width: 124 }}
              options={DISTRIBUTION_OPTIONS}
            />
          )}
          <Tooltip title={isStack ? 'Stretch children to the full height' : 'Stretch children across the group'}>
            <Checkbox
              checked={align === 'stretch'}
              onChange={(e) => updateShape(group.id, { align: e.target.checked ? 'stretch' : 'start' })}
            >
              Stretch
            </Checkbox>
          </Tooltip>
          {!isStack && (
            <>
              <span className="toolbar-label">Gap</span>
              <InputNumber
                min={0}
                value={group.gap ?? 0}
                onChange={(value) => updateShape(group.id, { gap: value ?? 0 })}
                size="small"
                style={{ width: 60 }}
              />
            </>
          )}
          <span className="toolbar-label">Padding</span>
          <SidesInput
            value={getPadding(group.padding)}
            fields={PADDING_SIDES}
            onChange={(padding) => updateShape(group.id, { padding })}
            icon={<BorderInnerOutlined />}
            title="Each side"
          />
          {!isStack && <HugControl group={group} shapes={currentPage?.shapes ?? []} />}
        </>
      )}
    </div>
  )
}

// Whether a row's width — a column's height — follows its children. A size
// the parent imposes wins: under `stretch` there is nothing to choose, and
// hugging and flex on one axis exclude each other, the last one set winning.
function HugControl({ group, shapes }: { group: GroupShape; shapes: Shape[] }) {
  const updateShape = useEditorStore(state => state.updateShape)

  const axis = group.layout === 'horizontal' ? 'width' : 'height'
  const what = group.layout === 'horizontal' ? "row's width" : "column's height"
  const parentId = findShapeById(shapes, group.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  const parentMain = parent?.type === 'group' && parent.layout === 'horizontal' ? 'width'
    : parent?.type === 'group' && parent.layout === 'vertical' ? 'height'
    : null
  const growsAlong = parentMain === axis && getGrow(group) > 0
  const stretched = parent?.type === 'group' && getImposedAxes(parent, group)[axis] && !growsAlong

  let title = `The ${what} follows its children: it grows with its copies and closes up over hidden ones.`
  if (stretched) title = `Its parent stretches it: its ${axis} is the parent's.`
  else if (growsAlong) title += ' Replaces its Flex.'

  return (
    <Tooltip title={title}>
      <Checkbox
        checked={group.hug === true && !stretched}
        disabled={stretched}
        onChange={(e) => updateShape(group.id, e.target.checked
          ? { hug: true, ...(growsAlong ? { grow: undefined } : {}) }
          : { hug: false })}
      >
        Hug
      </Checkbox>
    </Tooltip>
  )
}

// The group's own box: a background, a border, rounded corners. None of them by
// default — a group is invisible in the export until it is given one.
function BoxControls({ group }: { group: GroupShape }) {
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
