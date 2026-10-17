import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, App, Button, Result, Space, Typography } from 'antd'
import { DownloadOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import type { PreviewDTO } from '@imprime/sdk'
import { previewsAPI } from '../../api/api'
import { useEditorStore } from '../../store/editor/EditorStore'
import { parseApiError } from '../../utils/apiError'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import { ResolvedPageCanvas } from '../../components/page/resolved/ResolvedPageCanvas'
import './PreviewPage.css'

type LoadState =
    | { status: 'loading' }
    | { status: 'loaded'; preview: PreviewDTO.Response }
    | { status: 'error'; title: string; message?: string }

// What a failed load tells the owner: a preview gone, or values the template
// — edited since the preview was made — now refuses, which the API names.
function describeLoadError(error: unknown): { title: string; message?: string } {
    const apiError = parseApiError(error)
    if (apiError.status === 404) {
        return {
            title: 'Preview not found',
            message: 'It has expired, or it is not yours. Make a new one from the editor.',
        }
    }
    if (apiError.code) return { title: 'This preview cannot be drawn', message: apiError.message }
    return { title: 'Failed to load the preview' }
}

/**
 * A template drawn with a preview's values, page by page, as its PDF is —
 * from which its owner prints that PDF. The pages come resolved from the
 * API: nothing is resolved here.
 */
export default function PreviewPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { message } = App.useApp()
    const loadFontsForPages = useEditorStore(state => state.loadFontsForPages)
    const [state, setState] = useState<LoadState>({ status: 'loading' })
    // Bumped to load again: the template may have been edited since.
    const [loadCount, setLoadCount] = useState(0)
    const [isPrinting, setIsPrinting] = useState(false)

    useEffect(() => {
        if (!id) return
        let current = true
        previewsAPI.getById(id).then(
            // Shown once its fonts are in: drawn in the default font first,
            // the text would reflow under the reader's eyes.
            async preview => {
                await loadFontsForPages(preview.pages)
                if (current) setState({ status: 'loaded', preview })
            },
            error => {
                console.error('Failed to load the preview:', error)
                if (current) setState({ status: 'error', ...describeLoadError(error) })
            },
        )
        return () => { current = false }
    }, [id, loadCount, loadFontsForPages])

    const reload = () => {
        setState({ status: 'loading' })
        setLoadCount(count => count + 1)
    }

    if (state.status === 'loading') return <SpinnerFullScreen />

    if (state.status === 'error') {
        return (
            <Result
                status="warning"
                title={state.title}
                subTitle={state.message}
                extra={<Button type="primary" onClick={() => navigate('/')}>Back to home</Button>}
            />
        )
    }

    const { preview } = state
    const pageCount = preview.pages.length
    const expires = new Date(preview.expiresAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

    const handlePrint = async () => {
        setIsPrinting(true)
        try {
            const warnings = await previewsAPI.downloadPDF(preview._id, `${preview.title || 'template'}.pdf`)
            if (warnings.length > 0) {
                message.warning({
                    content: `PDF exported, but some content does not fit. ${warnings.map(warning => warning.message).join(' ')}`,
                    duration: 8,
                })
            } else {
                message.success('PDF exported successfully!')
            }
        } catch (error) {
            console.error('Export error:', error)
            // A coded error says what to fix — a value the template now
            // refuses, an expired preview; the rest is not the author's.
            const apiError = parseApiError(error)
            message.error(apiError.code ? apiError.message : 'Failed to export PDF. Please try again.')
        } finally {
            setIsPrinting(false)
        }
    }

    return (
        <div className="preview-page">
            <div className="preview-toolbar">
                <div>
                    <Typography.Title level={3} className="preview-title">
                        {preview.title}
                    </Typography.Title>
                    <Typography.Text type="secondary">
                        Preview · {pageCount} page{pageCount > 1 ? 's' : ''} · expires {expires}
                    </Typography.Text>
                </div>
                <Space wrap>
                    <Button icon={<EditOutlined />} onClick={() => navigate(`/editor/${preview.templateId}`)}>
                        Edit template
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={reload}>
                        Refresh
                    </Button>
                    <Button type="primary" icon={<DownloadOutlined />} loading={isPrinting} onClick={handlePrint}>
                        Imprime
                    </Button>
                </Space>
            </div>

            {preview.warnings.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    message="Some content does not fit, and is left out of the PDF"
                    description={
                        <ul className="preview-warnings">
                            {preview.warnings.map(warning => <li key={warning.page}>{warning.message}</li>)}
                        </ul>
                    }
                />
            )}

            <div className="preview-pages">
                {preview.pages.map((page, index) => (
                    <figure key={page._id} className="preview-page-frame">
                        <ResolvedPageCanvas page={page} pageSize={preview.pageSize} />
                        <figcaption className="preview-page-caption">
                            Page {index + 1} / {pageCount}
                        </figcaption>
                    </figure>
                ))}
            </div>
        </div>
    )
}
