import { useState, useRef, useEffect } from 'react'

export function RenameInput({
    initial,
    onCommit,
    onCancel,
}: {
    initial: string
    onCommit: (v: string) => void
    onCancel: () => void
}) {
    const [value, setValue] = useState(initial)
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => {
        ref.current?.focus()
        ref.current?.select()
    }, [])

    return (
        <input
            ref={ref}
            className="shape-tree-row-label-input"
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onCommit(value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    onCommit(value)
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onCancel()
                }
            }}
        />
    )
}
