import type { Shape } from '@imprime/sdk'
import {
    BorderOutlined,
    Loading3QuartersOutlined,
    FontSizeOutlined,
    PictureOutlined,
    FolderOutlined,
    RetweetOutlined,
} from '@ant-design/icons'
import { shapeKind } from '../../../../../../../utils/shapeTree'

export function shapeIcon(shape: Shape) {
    switch (shapeKind(shape)) {
        case 'rectangle': return <BorderOutlined />
        case 'ellipse': return <Loading3QuartersOutlined />
        case 'text': return <FontSizeOutlined />
        case 'image': return <PictureOutlined />
        case 'group': return <FolderOutlined />
        case 'repeat': return <RetweetOutlined />
    }
}
