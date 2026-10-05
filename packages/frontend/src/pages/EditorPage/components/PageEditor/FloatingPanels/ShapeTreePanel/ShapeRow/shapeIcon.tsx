import type { Shape } from '@imprime/sdk'
import {
    BorderOutlined,
    Loading3QuartersOutlined,
    FontSizeOutlined,
    PictureOutlined,
    FolderOutlined,
    BranchesOutlined,
    RetweetOutlined,
} from '@ant-design/icons'

export function shapeIcon(shape: Shape) {
    switch (shape.type) {
        case 'rectangle': return <BorderOutlined />
        case 'ellipse': return <Loading3QuartersOutlined />
        case 'text': return <FontSizeOutlined />
        case 'image': return <PictureOutlined />
        case 'group': return <FolderOutlined />
        case 'if-group': return <BranchesOutlined />
        case 'for-group': return <RetweetOutlined />
    }
}
