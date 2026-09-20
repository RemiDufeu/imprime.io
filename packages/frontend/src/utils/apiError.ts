// The SDK reports a failed request as a plain `Error` whose message is
// `HTTP <status>: <body>`, and the body is the API error contract
// (`{ code, error, details? }`). Nothing carries that structure back to the
// caller, so it is re-parsed here rather than at every call site.
export interface ApiError {
  status?: number
  code?: string
  message?: string
}

export function parseApiError(err: unknown): ApiError {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return {}

  const statusMatch = raw.match(/^HTTP (\d+):/)
  const status = statusMatch ? Number(statusMatch[1]) : undefined

  const bodyMatch = raw.match(/\{[\s\S]*\}/)
  if (!bodyMatch) return { status, message: raw }

  try {
    const body: unknown = JSON.parse(bodyMatch[0])
    if (typeof body !== 'object' || body === null) return { status, message: raw }
    const { code, error } = body as { code?: unknown; error?: unknown }
    return {
      status,
      code: typeof code === 'string' ? code : undefined,
      message: typeof error === 'string' ? error : raw,
    }
  } catch {
    return { status, message: raw }
  }
}
