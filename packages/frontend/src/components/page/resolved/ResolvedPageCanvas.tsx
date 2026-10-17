import type { Page, PageSize } from '@imprime/sdk'
import { ResolvedShape } from './ResolvedShape'
import './ResolvedPageCanvas.css'

interface ResolvedPageCanvasProps {
    page: Page
    pageSize: PageSize
}

// A page as the export resolved it — what its PDF page shows — scaled to the
// width it is given, read-only.
export function ResolvedPageCanvas({ page, pageSize }: ResolvedPageCanvasProps) {
    const { width, height } = pageSize

    return (
        <div className="resolved-page" style={{ aspectRatio: `${width} / ${height}` }}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="resolved-page-svg"
            >
                {/* The PDF page's own white, not a theme colour. */}
                <rect width={width} height={height} fill="#ffffff" />
                {page.shapes.map(shape => (
                    <ResolvedShape key={shape.id} shape={shape} />
                ))}
            </svg>
        </div>
    )
}
