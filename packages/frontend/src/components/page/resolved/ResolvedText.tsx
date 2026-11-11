import { useState } from 'react'
import { createEditor } from 'slate'
import { withReact } from 'slate-react'
import { withHistory } from 'slate-history'
import type { TextBoxShape } from '@imprime/sdk'
import { getPageContentWrapperStyles } from '@imprime/sdk'
import TextBoxEditor from '../../TextEditor/TextBoxEditor'
import { withVariables } from '../../TextEditor/withVariables'
import { withLists } from '../../TextEditor/withLists'

interface ResolvedTextProps {
    shape: TextBoxShape
}

// A resolved text box, its runs already literal text: laid out by the editor's
// own text component, read-only, with no editing session. Keyed by its text
// by the caller, since Slate reads its value on mount only.
export function ResolvedText({ shape }: ResolvedTextProps) {
    const [editor] = useState(() => withLists(withVariables(withHistory(withReact(createEditor())))))
    const isTopAligned = (shape.verticalAlign ?? 'top') === 'top'

    return (
        <foreignObject
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            style={{ overflow: 'visible' }}
        >
            <div style={getPageContentWrapperStyles(shape.verticalAlign)}>
                <TextBoxEditor
                    editor={editor}
                    readonly
                    fillHeight={isTopAligned}
                    initialContent={shape.paragraphes}
                    placeholder=""
                />
            </div>
        </foreignObject>
    )
}
