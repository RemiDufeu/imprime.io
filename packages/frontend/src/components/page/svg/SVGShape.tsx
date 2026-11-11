import type { Shape } from '@imprime/sdk'
import { SVGRectangle } from './SVGRectangle'
import { SVGEllipse } from './SVGEllipse'
import { SVGText } from './SVGText'
import { SVGImage } from './SVGImage'
import { SVGGroup } from './SVGGroup'

interface SVGShapeProps {
    shape: Shape
    readonly?: boolean
}

export function SVGShape({ shape, readonly }: SVGShapeProps) {
    switch (shape.type) {
        case 'rectangle':
            return <SVGRectangle shape={shape} />
        case 'ellipse':
            return <SVGEllipse shape={shape} />
        case 'text':
            return <SVGText shape={shape} readonly={readonly} />
        case 'image':
            return <SVGImage shape={shape} />
        case 'group':
            return <SVGGroup shape={shape} readonly={readonly} />
        default:
            return null
    }
}
