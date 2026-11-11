import type { RectangleShape } from '@imprime/sdk'
import { SVGBox } from './SVGBox'

interface SVGRectangleProps {
    shape: RectangleShape
}

export function SVGRectangle({ shape }: SVGRectangleProps) {
    return <SVGBox box={shape} />
}
