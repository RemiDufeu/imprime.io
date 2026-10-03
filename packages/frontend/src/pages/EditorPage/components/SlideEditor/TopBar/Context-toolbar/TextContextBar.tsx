import type { ReactNode } from 'react'
import { Select, Button } from 'antd'
import type { SelectProps } from 'antd'
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  MenuOutlined,
  LineHeightOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignBottomOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import type { FontCatalog, FontCatalogEntry, FontCategory, ListType, TextAlign, TextVerticalAlign } from '@imprime/sdk'
import { DEFAULT_FONT, resolveFontVariant } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../store/editor/selectors'
import { DebouncedColorPicker } from '../../../../../../components/common'
import { InsertVariableButton } from './InsertVariableButton/InsertVariableButton'
import { IconMenuButton, type IconMenuOption } from './IconMenuButton/IconMenuButton'

// Each family's name is shown in the family itself.
function fontOption(entry: FontCatalogEntry) {
  return {
    value: entry.family,
    label: <span style={{ fontFamily: entry.registeredFamily }}>{entry.family}</span>,
  }
}

const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  monospace: 'Monospace',
  display: 'Display',
  handwriting: 'Handwriting',
}

// Built-in families by category, then the imported ones; alphabetical within
// each group.
function fontOptions(catalog: FontCatalog): SelectProps['options'] {
  const entries = [...catalog.values()].sort((a, b) => a.family.localeCompare(b.family))
  const groups = [
    ...Object.entries(FONT_CATEGORY_LABELS).map(([category, label]) => ({
      label,
      options: entries.filter(entry => entry.category === category).map(fontOption),
    })),
    { label: 'Imported', options: entries.filter(entry => entry.imported).map(fontOption) },
  ]
  return groups.filter(group => group.options.length > 0)
}

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]

const LINE_HEIGHTS = [1, 1.15, 1.5, 2, 2.5, 3]

// antd has no "justify" icon; MenuOutlined's four equal lines read as one.
const TEXT_ALIGNS: IconMenuOption<TextAlign>[] = [
  { value: 'left', icon: <AlignLeftOutlined />, title: 'Align left' },
  { value: 'center', icon: <AlignCenterOutlined />, title: 'Align center' },
  { value: 'right', icon: <AlignRightOutlined />, title: 'Align right' },
  { value: 'justify', icon: <MenuOutlined />, title: 'Justify' },
]

const LIST_TYPES: { value: ListType; icon: ReactNode; title: string }[] = [
  { value: 'bullet', icon: <UnorderedListOutlined />, title: 'Bulleted list' },
  { value: 'number', icon: <OrderedListOutlined />, title: 'Numbered list' },
]

// antd's menu fold/unfold glyphs are the usual outdent/indent icons.
const LIST_INDENTS: { delta: number; icon: ReactNode; title: string }[] = [
  { delta: -1, icon: <MenuFoldOutlined />, title: 'Decrease indent (Shift+Tab)' },
  { delta: 1, icon: <MenuUnfoldOutlined />, title: 'Increase indent (Tab)' },
]

const VERTICAL_ALIGNS: IconMenuOption<TextVerticalAlign>[] = [
  { value: 'top', icon: <VerticalAlignTopOutlined />, title: 'Align top' },
  { value: 'middle', icon: <VerticalAlignMiddleOutlined />, title: 'Align middle' },
  { value: 'bottom', icon: <VerticalAlignBottomOutlined />, title: 'Align bottom' },
]

export function TextContextBar() {
  const format = useEditorStore(state => state.textFormat)
  const applyTextFormat = useEditorStore(state => state.applyTextFormat)
  const changeListIndent = useEditorStore(state => state.changeListIndent)
  const selected = useEditorStore(selectSelectedShape)
  const updateShape = useEditorStore(state => state.updateShape)
  const fontCatalog = useEditorStore(state => state.fontCatalog)
  const loadAllFonts = useEditorStore(state => state.loadAllFonts)

  // Bold or italic only changes the face if the family has one for it; both
  // renderers draw the closest face otherwise. A mark already set can still
  // be cleared.
  const fontVariants = (fontCatalog.get(format.fontFamily) ?? fontCatalog.get(DEFAULT_FONT))?.variants ?? []
  const boldAvailable = resolveFontVariant(fontVariants, true, format.italic)
    !== resolveFontVariant(fontVariants, false, format.italic)
  const italicAvailable = resolveFontVariant(fontVariants, format.bold, true)
    !== resolveFontVariant(fontVariants, format.bold, false)

  // Box-level: a property of the shape, not of the text being edited.
  const textBox = selected?.type === 'text' ? selected : null
  const verticalAlign = textBox?.verticalAlign ?? 'top'
  const handleVerticalAlignChange = (value: TextVerticalAlign) => {
    if (textBox) updateShape(textBox.id, { verticalAlign: value })
  }

  return (
    <>
      <div className="toolbar-container context-toolbar">
        <div className="toolbar-item">
          <div title="Font" onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={format.fontFamily}
              onChange={(fontFamily: string) => applyTextFormat({ fontFamily })}
              size="small"
              style={{ width: '140px' }}
              popupMatchSelectWidth={false}
              listHeight={320}
              options={fontOptions(fontCatalog)}
              // The editor loads only the fonts its text uses; the picker
              // previews every one, including those imported since.
              onOpenChange={(open) => { if (open) void loadAllFonts() }}
            />
          </div>
          <div title="Font size" onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={format.fontSize}
              onChange={(fontSize: number) => applyTextFormat({ fontSize })}
              size="small"
              style={{ width: '64px' }}
              options={FONT_SIZES.map(size => ({ value: size, label: size.toString() }))}
            />
          </div>
          <div title="Text color" onMouseDown={(e) => e.preventDefault()}>
            <DebouncedColorPicker
              value={format.color}
              onChange={(color: string) => applyTextFormat({ color })}
              size="small"
              showText={false}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <Button
            type={format.bold ? 'primary' : 'text'}
            size="small"
            icon={<BoldOutlined />}
            title={boldAvailable || format.bold ? 'Bold' : 'Bold (not available in this font)'}
            disabled={!boldAvailable && !format.bold}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              applyTextFormat({ bold: !format.bold })
            }}
          />
          <Button
            type={format.italic ? 'primary' : 'text'}
            size="small"
            icon={<ItalicOutlined />}
            title={italicAvailable || format.italic ? 'Italic' : 'Italic (not available in this font)'}
            disabled={!italicAvailable && !format.italic}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              applyTextFormat({ italic: !format.italic })
            }}
          />
          <Button
            type={format.underline ? 'primary' : 'text'}
            size="small"
            icon={<UnderlineOutlined />}
            title="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              applyTextFormat({ underline: !format.underline })
            }}
          />
          <Button
            type={format.strikethrough ? 'primary' : 'text'}
            size="small"
            icon={<StrikethroughOutlined />}
            title="Strikethrough"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              applyTextFormat({ strikethrough: !format.strikethrough })
            }}
          />
          <Button
            type={format.uppercase ? 'primary' : 'text'}
            size="small"
            title="Uppercase"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              applyTextFormat({ uppercase: !format.uppercase })
            }}
          >
            AA
          </Button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <IconMenuButton
            options={TEXT_ALIGNS}
            value={format.textAlign}
            title="Text alignment"
            onChange={(textAlign: TextAlign) => applyTextFormat({ textAlign })}
          />
          <IconMenuButton
            options={VERTICAL_ALIGNS}
            value={verticalAlign}
            title="Vertical alignment"
            onChange={handleVerticalAlignChange}
          />
          <div title="Line height" onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={format.lineHeight}
              onChange={(lineHeight: number) => applyTextFormat({ lineHeight })}
              size="small"
              style={{ width: '80px' }}
              prefix={<LineHeightOutlined />}
              options={LINE_HEIGHTS.map(lineHeight => ({ value: lineHeight, label: lineHeight.toString() }))}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          {LIST_TYPES.map(({ value, icon, title }) => (
            <Button
              key={value}
              type={format.listType === value ? 'primary' : 'text'}
              size="small"
              icon={icon}
              title={title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                applyTextFormat({ listType: format.listType === value ? 'none' : value })
              }}
            />
          ))}
          {LIST_INDENTS.map(({ delta, icon, title }) => (
            <Button
              key={delta}
              type="text"
              size="small"
              icon={icon}
              title={title}
              disabled={format.listType === 'none'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                changeListIndent(delta)
              }}
            />
          ))}
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <div onMouseDown={(e) => e.preventDefault()}>
            <InsertVariableButton />
          </div>
        </div>
      </div>
    </>
  )
}