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

  const attributes = useEditorStore(state => state.attributes)
  const setFontFamily = useEditorStore(state => state.setFontFamily)
  const setFontSize = useEditorStore(state => state.setFontSize)
  const setTextColor = useEditorStore(state => state.setTextColor)
  const setBold = useEditorStore(state => state.setBold)
  const setItalic = useEditorStore(state => state.setItalic)
  const setUnderline = useEditorStore(state => state.setUnderline)
  const setStrikethrough = useEditorStore(state => state.setStrikethrough)
  const setUppercase = useEditorStore(state => state.setUppercase)
  const setTextAlign = useEditorStore(state => state.setTextAlign)
  const setLineHeight = useEditorStore(state => state.setLineHeight)
  const setVerticalAlign = useEditorStore(state => state.setVerticalAlign)
  const setListType = useEditorStore(state => state.setListType)
  const changeListIndent = useEditorStore(state => state.changeListIndent)
  const selectedShape = useEditorStore(state => state.selectedShape)
  const updateShape = useEditorStore(state => state.updateShape)
  const fontCatalog = useEditorStore(state => state.fontCatalog)
  const loadAllFonts = useEditorStore(state => state.loadAllFonts)

  // Bold or italic only changes the face if the family has one for it; both
  // renderers draw the closest face otherwise. A mark already set can still
  // be cleared.
  const fontVariants = (fontCatalog.get(attributes.fontFamily) ?? fontCatalog.get(DEFAULT_FONT))?.variants ?? []
  const boldAvailable = resolveFontVariant(fontVariants, true, attributes.italic)
    !== resolveFontVariant(fontVariants, false, attributes.italic)
  const italicAvailable = resolveFontVariant(fontVariants, attributes.bold, true)
    !== resolveFontVariant(fontVariants, attributes.bold, false)

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value)
  }

  const handleFontSizeChange = (value: number) => {
    setFontSize(value)
  }

  const handleTextColorChange = (hex: string) => {
    setTextColor(hex)
  }

  const handleBoldToggle = () => {
    setBold(!attributes.bold)
  }

  const handleItalicToggle = () => {
    setItalic(!attributes.italic)
  }

  const handleUnderlineToggle = () => {
    setUnderline(!attributes.underline)
  }

  const handleStrikethroughToggle = () => {
    setStrikethrough(!attributes.strikethrough)
  }

  const handleUppercaseToggle = () => {
    setUppercase(!attributes.uppercase)
  }

  // Box-level, so written to the shape directly rather than through the
  // editor sync that carries run and paragraph formatting.
  const handleVerticalAlignChange = (value: TextVerticalAlign) => {
    setVerticalAlign(value)
    if (selectedShape?.type === 'text') {
      updateShape(selectedShape.id, { verticalAlign: value })
    }
  }

  return (
    <>
      <div className="toolbar-container context-toolbar">
        <div className="toolbar-item">
          <div title="Font" onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={attributes.fontFamily}
              onChange={handleFontFamilyChange}
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
              value={attributes.fontSize}
              onChange={handleFontSizeChange}
              size="small"
              style={{ width: '64px' }}
              options={FONT_SIZES.map(size => ({ value: size, label: size.toString() }))}
            />
          </div>
          <div title="Text color" onMouseDown={(e) => e.preventDefault()}>
            <DebouncedColorPicker
              value={attributes.textColor}
              onChange={handleTextColorChange}
              size="small"
              showText={false}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <Button
            type={attributes.bold ? 'primary' : 'text'}
            size="small"
            icon={<BoldOutlined />}
            title={boldAvailable || attributes.bold ? 'Bold' : 'Bold (not available in this font)'}
            disabled={!boldAvailable && !attributes.bold}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              handleBoldToggle()
            }}
          />
          <Button
            type={attributes.italic ? 'primary' : 'text'}
            size="small"
            icon={<ItalicOutlined />}
            title={italicAvailable || attributes.italic ? 'Italic' : 'Italic (not available in this font)'}
            disabled={!italicAvailable && !attributes.italic}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              handleItalicToggle()
            }}
          />
          <Button
            type={attributes.underline ? 'primary' : 'text'}
            size="small"
            icon={<UnderlineOutlined />}
            title="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              handleUnderlineToggle()
            }}
          />
          <Button
            type={attributes.strikethrough ? 'primary' : 'text'}
            size="small"
            icon={<StrikethroughOutlined />}
            title="Strikethrough"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              handleStrikethroughToggle()
            }}
          />
          <Button
            type={attributes.uppercase ? 'primary' : 'text'}
            size="small"
            title="Uppercase"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              handleUppercaseToggle()
            }}
          >
            AA
          </Button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <IconMenuButton
            options={TEXT_ALIGNS}
            value={attributes.textAlign}
            title="Text alignment"
            onChange={setTextAlign}
          />
          <IconMenuButton
            options={VERTICAL_ALIGNS}
            value={attributes.verticalAlign}
            title="Vertical alignment"
            onChange={handleVerticalAlignChange}
          />
          <div title="Line height" onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={attributes.lineHeight}
              onChange={setLineHeight}
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
              type={attributes.listType === value ? 'primary' : 'text'}
              size="small"
              icon={icon}
              title={title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                setListType(attributes.listType === value ? 'none' : value)
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
              disabled={attributes.listType === 'none'}
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