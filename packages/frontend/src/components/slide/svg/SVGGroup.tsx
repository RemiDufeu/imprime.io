import type { ContainerShape } from '@imprime/sdk'
import { SVGShape } from './SVGShape'
import { SVGSelectionWrapper } from './SVGSelectionWrapper'
import { ContainerFrame } from './ContainerFrame'

interface SVGGroupProps {
    shape: ContainerShape
    readonly?: boolean
}

export function SVGGroup({ shape, readonly = false }: SVGGroupProps) {
    return (
        <g transform={`translate(${shape.x} ${shape.y})`}>
            <ContainerFrame
                type={shape.type}
                width={shape.width}
                height={shape.height}
                pointerEvents="all"
            />
            {shape.children.map(child => (
                <SVGSelectionWrapper key={child.id} shape={child} readonly={readonly}>
                    <SVGShape shape={child} readonly={readonly} />
                </SVGSelectionWrapper>
            ))}
        </g>
    )
}
