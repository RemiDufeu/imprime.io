import type { ComponentType, SVGProps } from 'react'
import Icon from '@ant-design/icons'

export type Distribution = 'packed' | 'space-between' | 'space-around'

// Three children, drawn as bars between the group's two edges, faded. Spread
// out, the first and last touch the edges; around, each keeps a margin.
function distributionSvg(xs: number[]): ComponentType<SVGProps<SVGSVGElement>> {
  return function DistributionSvg(props) {
    return (
      <svg {...props} viewBox="0 0 16 16">
        <rect x={0} y={1} width={1} height={14} opacity={0.45} />
        <rect x={15} y={1} width={1} height={14} opacity={0.45} />
        {xs.map(x => <rect key={x} x={x} y={4} width={2} height={8} rx={0.5} />)}
      </svg>
    )
  }
}

const SVGS: Record<Distribution, ComponentType<SVGProps<SVGSVGElement>>> = {
  packed: distributionSvg([4, 7, 10]),
  'space-between': distributionSvg([1, 7, 13]),
  'space-around': distributionSvg([2.33, 7, 11.67]),
}

// How a row spreads its children; a column's, turned a quarter.
export function DistributionIcon({ distribution, vertical }: { distribution: Distribution; vertical: boolean }) {
  return <Icon component={SVGS[distribution]} rotate={vertical ? 90 : undefined} />
}
