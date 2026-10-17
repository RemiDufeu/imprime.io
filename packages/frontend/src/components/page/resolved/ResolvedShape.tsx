import type { Shape } from '@imprime/sdk'
import { getCenter, getRotation } from '@imprime/sdk'
import { SVGBox } from '../svg/SVGBox'
import { SVGEllipse } from '../svg/SVGEllipse'
import { ResolvedText } from './ResolvedText'
import { ResolvedImage } from './ResolvedImage'

interface ResolvedShapeProps {
    shape: Shape
}

// One leaf of a resolved page, in page space, turned about the centre of its
// box by its own rotation — its groups' turns already composed into it.
export function ResolvedShape({ shape }: ResolvedShapeProps) {
    const rotation = getRotation(shape)
    const center = getCenter(shape)
    const turn = rotation !== 0 ? `rotate(${rotation} ${center.x} ${center.y})` : undefined

    let drawn: React.ReactNode
    switch (shape.type) {
        case 'rectangle':
            drawn = <SVGBox box={shape} />
            break
        case 'ellipse':
            drawn = <SVGEllipse shape={shape} />
            break
        case 'text':
            drawn = <ResolvedText key={JSON.stringify(shape.paragraphes)} shape={shape} />
            break
        case 'image':
            drawn = <ResolvedImage shape={shape} />
            break
        case 'group':
            // Never: a resolved page holds leaves only, each group already
            // turned into its box and its children.
            drawn = null
            break
    }

    return <g transform={turn}>{drawn}</g>
}
