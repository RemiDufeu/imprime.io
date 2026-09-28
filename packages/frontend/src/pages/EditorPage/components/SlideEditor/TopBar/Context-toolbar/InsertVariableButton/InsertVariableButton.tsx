import { Button, Dropdown, type MenuProps } from 'antd'
import { useCurrentSlide, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import {
    decodeItemFieldValue,
    encodeItemFieldValue,
    itemFieldsInScope,
} from '../../../../../../../utils/variableScope'

const EMPTY_KEY = '__none__'

// Picks a variable to drop at the caret. Creating variables is deliberately not
// offered here — that belongs to the Variables button in the header.
export function InsertVariableButton() {
    const variables = useEditorStore(state => state.presentation?.variableData)
    const selectedShapeId = useEditorStore(state => state.selectedShape?.id)
    const insertVariable = useEditorStore(state => state.insertVariable)
    const currentSlide = useCurrentSlide()

    // Only strings can be inlined into text: a presentation-wide string
    // variable, or a string field of an item an enclosing for-group iterates.
    const textVariables = (variables ?? [])
        .filter(v => v.type === 'string')
        .map(v => ({ key: encodeItemFieldValue(v._id, ''), label: v.name }))

    const scopedFields = selectedShapeId
        ? itemFieldsInScope(currentSlide?.shapes ?? [], selectedShapeId, variables ?? [], 'string').map(
            option => ({ key: encodeItemFieldValue(option.variableId, option.itemPath), label: option.label })
        )
        : []

    const entries = [...textVariables, ...scopedFields]
    const items: MenuProps['items'] = entries.length === 0
        ? [{ key: EMPTY_KEY, label: 'No text variables', disabled: true }]
        : entries

    const handleSelect: MenuProps['onClick'] = ({ key }) => {
        if (key === EMPTY_KEY) return
        const decoded = decodeItemFieldValue(key)
        if (!decoded) return
        insertVariable(decoded.variableId, decoded.itemPath === '' ? undefined : decoded.itemPath)
    }

    return (
        <Dropdown
            trigger={['click']}
            placement="bottomLeft"
            menu={{
                items,
                onClick: handleSelect,
                style: { maxHeight: 320, overflowY: 'auto' },
            }}
        >
            {/* Keep the caret in the Slate editor: insertion restores the stored
                selection, but not stealing focus avoids a visible caret flicker. */}
            <Button
                size="small"
                onMouseDown={(e) => e.preventDefault()}
            >
                Insert variable
            </Button>
        </Dropdown>
    )
}
