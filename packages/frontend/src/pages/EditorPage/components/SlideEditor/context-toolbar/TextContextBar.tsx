import { Select, Button, Dropdown } from 'antd'
import {
  BoldOutlined,
  ItalicOutlined,
  ThunderboltFilled,
  UnderlineOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useEditorStore } from '../../../../../store/editor/EditorStore'
import { DebouncedColorPicker } from '../../../../../components/common'
import { DropdownVariablesContent } from './DropdownVariablesContent/DropdownVariablesContent'

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

export function TextContextBar() {

  const attributes = useEditorStore(state => state.attributes)
  const setFontFamily = useEditorStore(state => state.setFontFamily)
  const setFontSize = useEditorStore(state => state.setFontSize)
  const setTextColor = useEditorStore(state => state.setTextColor)
  const setBold = useEditorStore(state => state.setBold)
  const setItalic = useEditorStore(state => state.setItalic)
  const setUnderline = useEditorStore(state => state.setUnderline)

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

  const [isVariableButtonEnabled, setIsVariableButtonEnabled] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => ({
        isFocused: state.isFocused,
        editor: state.editor,
        lastSelection: state.lastSelection,
      }),
      ({ isFocused, editor, lastSelection }) => {
        const hasCollapsedSelection = lastSelection !== null &&
          lastSelection.anchor.offset === lastSelection.focus.offset;

        const isEnabled = isFocused && editor !== null && hasCollapsedSelection;
        setIsVariableButtonEnabled(isEnabled);
      }
    )
  }, [])

  return (
    <>
      <div className="toolbar-container toolbar-section">
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
        </div>
      </div>
      <Dropdown
        menu={{ items: [] }}
        popupRender={() => <DropdownVariablesContent onClose={() => setIsDropdownOpen(false)} />}
        trigger={["click"]}
        placement="bottomLeft"
        open={isDropdownOpen}
        onOpenChange={setIsDropdownOpen}>
        <Button
          disabled={!isVariableButtonEnabled}
          type='primary'
          icon={<ThunderboltFilled />}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault()
          }}
        >Variables</Button>
      </Dropdown>

    </>
  )
}