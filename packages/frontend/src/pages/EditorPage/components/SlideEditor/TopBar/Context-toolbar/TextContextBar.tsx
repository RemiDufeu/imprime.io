import type { ReactNode } from 'react'
import { Select, Button } from 'antd'
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
} from '@ant-design/icons'
import type { TextAlign, TextVerticalAlign } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { DebouncedColorPicker } from '../../../../../../components/common'
import { InsertVariableButton } from './InsertVariableButton/InsertVariableButton'

const FONT_FAMILIES = [
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Comic Neue', label: 'Comic Neue' },
  { value: 'Courier Prime', label: 'Courier Prime' },
  { value: 'Anton', label: 'Anton' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Crimson Text', label: 'Crimson Text' },
  { value: 'Merriweather', label: 'Merriweather' },
]

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]

const LINE_HEIGHTS = [1, 1.15, 1.5, 2, 2.5, 3]

// antd has no "justify" icon; MenuOutlined's four equal lines read as one.
const TEXT_ALIGNS: { value: TextAlign; icon: ReactNode; title: string }[] = [
  { value: 'left', icon: <AlignLeftOutlined />, title: 'Align left' },
  { value: 'center', icon: <AlignCenterOutlined />, title: 'Align center' },
  { value: 'right', icon: <AlignRightOutlined />, title: 'Align right' },
  { value: 'justify', icon: <MenuOutlined />, title: 'Justify' },
]

const VERTICAL_ALIGNS: { value: TextVerticalAlign; icon: ReactNode; title: string }[] = [
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
  const selectedShape = useEditorStore(state => state.selectedShape)
  const updateShape = useEditorStore(state => state.updateShape)

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
          <span className="toolbar-label">Font</span>
          <div onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={attributes.fontFamily}
              onChange={handleFontFamilyChange}
              size="small"
              style={{ width: '150px' }}
              options={FONT_FAMILIES}
            />
          </div>
        </div>

        <div className="toolbar-item">
          <span className="toolbar-label">Size</span>
          <div onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={attributes.fontSize}
              onChange={handleFontSizeChange}
              size="small"
              style={{ width: '80px' }}
              options={FONT_SIZES.map(size => ({ value: size, label: size.toString() }))}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <span className="toolbar-label">Text Color</span>
          <div onMouseDown={(e) => e.preventDefault()}>
            <DebouncedColorPicker
              value={attributes.textColor}
              onChange={handleTextColorChange}
              size="small"
              showText
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          <Button
            type={attributes.bold ? 'primary' : 'text'}
            size="small"
            icon={<BoldOutlined />}
            title="Bold"
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
            title="Italic"
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
          {TEXT_ALIGNS.map(({ value, icon, title }) => (
            <Button
              key={value}
              type={attributes.textAlign === value ? 'primary' : 'text'}
              size="small"
              icon={icon}
              title={title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                setTextAlign(value)
              }}
            />
          ))}
        </div>

        <div className="toolbar-item">
          <span className="toolbar-label" title="Line height"><LineHeightOutlined /></span>
          <div onMouseDown={(e) => e.preventDefault()}>
            <Select
              value={attributes.lineHeight}
              onChange={setLineHeight}
              size="small"
              style={{ width: '70px' }}
              options={LINE_HEIGHTS.map(lineHeight => ({ value: lineHeight, label: lineHeight.toString() }))}
            />
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-item">
          {VERTICAL_ALIGNS.map(({ value, icon, title }) => (
            <Button
              key={value}
              type={attributes.verticalAlign === value ? 'primary' : 'text'}
              size="small"
              icon={icon}
              title={title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                handleVerticalAlignChange(value)
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