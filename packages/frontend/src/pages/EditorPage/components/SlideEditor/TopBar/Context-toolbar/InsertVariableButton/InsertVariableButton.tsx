import { useMemo } from 'react'
import { Button, Dropdown, type MenuProps } from 'antd'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'

const EMPTY_KEY = '__none__'

// Picks a variable to drop at the caret. Creating variables is deliberately not
// offered here — that belongs to the Variables button in the header.
export function InsertVariableButton() {
    const variables = useEditorStore(state => state.presentation?.variableData)
    const insertVariable = useEditorStore(state => state.insertVariable)

    // Only string variables can be inlined into text.
    const items: MenuProps['items'] = useMemo(() => {
        const textVariables = (variables ?? []).filter(v => v.type === 'string')
        if (textVariables.length === 0) {
            return [{ key: EMPTY_KEY, label: 'No text variables', disabled: true }]
        }
        return textVariables.map(v => ({ key: v._id, label: v.name }))
    }, [variables])

    const handleSelect: MenuProps['onClick'] = ({ key }) => {
        if (key === EMPTY_KEY) return
        insertVariable(key)
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
