export type DropTarget =
    | {
        kind: 'sibling'
        parentId: string | null
        arrayIndex: number
        overShapeId: string
        position: 'above' | 'below'
    }
    | { kind: 'into'; groupId: string }
