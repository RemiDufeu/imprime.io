import type { GroupShape } from '@imprime/sdk'
import { getGroupBox } from '@imprime/sdk'
import { SVGShape } from './SVGShape'
import { SVGSelectionWrapper } from './SVGSelectionWrapper'
import { ContainerFrame } from './ContainerFrame'
import { SVGBox } from './SVGBox'

interface SVGGroupProps {
    shape: GroupShape
    readonly?: boolean
}

// The authored group, in the export's order — its background, its children,
// its border over them — with its children once: a repeated group shows its
// first copy, the one being edited. SVGSelectionWrapper has turned it already.
export function SVGGroup({ shape, readonly = false }: SVGGroupProps) {
    // In the group's own coordinates, which its wrapper turns: not twice.
    const { background, border } = getGroupBox({ ...shape, x: 0, y: 0, rotation: 0 })

    return (
        <g transform={`translate(${shape.x} ${shape.y})`}>
            {background && <SVGBox box={background} />}
            <ContainerFrame
                width={shape.width}
                height={shape.height}
                repeat={shape.repeat !== undefined}
                tinted={background === null}
                outlined={border === null}
                pointerEvents="all"
            />
            {shape.children.map(child => (
                <SVGSelectionWrapper key={child.id} shape={child} readonly={readonly}>
                    <SVGShape shape={child} readonly={readonly} />
                </SVGSelectionWrapper>
            ))}
            {/* Over the children, and not a target: a click on it reaches the
                child under it, or the frame. */}
            {border && (
                <g pointerEvents="none">
                    <SVGBox box={border} />
                </g>
            )}
        </g>
    )
}
