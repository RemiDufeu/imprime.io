import { Button, Dropdown, Tooltip, type MenuProps } from 'antd'
import { ThunderboltFilled } from '@ant-design/icons'
import { useCurrentPage, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import {
    decodeItemFieldValue,
    encodeItemFieldValue,
    itemFieldsInScope,
} from '../../../../../../../utils/variableScope'
import { PAGE_NUMBER_LABELS } from '../../../../../../../components/TextEditor/pageNumberLabels'

const EMPTY_KEY = '__none__'
const PAGE_NUMBER_KEY_PREFIX = '__page-number__:'
const PAGE_NUMBER_KINDS = ['current', 'total'] as const

// Picks a variable, or a page number, to drop at the caret. Creating variables
// is deliberately not offered here — that belongs to the Variables button in
// the header.
export function InsertVariableButton() {
    const variables = useEditorStore(state => state.template?.variableData)
    const selectedShapeId = useEditorStore(state => state.selectedShapeId)
    const insertVariable = useEditorStore(state => state.insertVariable)
    const insertPageNumber = useEditorStore(state => state.insertPageNumber)
    const currentPage = useCurrentPage()

    // Only strings can be inlined into text: a template-wide string
    // variable, or a string field of an item an enclosing repeat iterates.
    const textVariables = (variables ?? [])
        .filter(v => v.type === 'string')
        .map(v => ({ key: encodeItemFieldValue(v._id, ''), label: v.name }))

    const scopedFields = selectedShapeId
        ? itemFieldsInScope(currentPage, selectedShapeId, variables ?? [], 'string').map(
            option => ({ key: encodeItemFieldValue(option.variableId, option.itemPath), label: option.label })
        )
        : []

    const entries = [...textVariables, ...scopedFields]
    const items: MenuProps['items'] = [
        {
            type: 'group',
            label: 'Variables',
            children: entries.length === 0
                ? [{ key: EMPTY_KEY, label: 'No text variables', disabled: true }]
                : entries,
        },
        {
            type: 'group',
            label: 'Page',
            children: PAGE_NUMBER_KINDS.map(kind => ({
                key: `${PAGE_NUMBER_KEY_PREFIX}${kind}`,
                label: PAGE_NUMBER_LABELS[kind],
            })),
        },
    ]

    const handleSelect: MenuProps['onClick'] = ({ key }) => {
        if (key === EMPTY_KEY) return
        const pageNumberKind = PAGE_NUMBER_KINDS.find(kind => key === `${PAGE_NUMBER_KEY_PREFIX}${kind}`)
        if (pageNumberKind) {
            insertPageNumber(pageNumberKind)
            return
        }
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
            <Tooltip title="Insert a variable or a page number at the caret">
                <Button
                    color="primary"
                    variant="filled"
                    size="small"
                    icon={<ThunderboltFilled />}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    Variable
                </Button>
            </Tooltip>
        </Dropdown>
    )
}
