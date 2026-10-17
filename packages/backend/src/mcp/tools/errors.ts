import { AppError, ValidationError } from '../../services/errors.js'

export function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  }
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

// What the agent is told: the message, the code it can branch on, and each
// detail — the references that do not resolve, say — so it can fix its call.
// Anything but an AppError is logged and kept from it, as from an HTTP client.
export function errorMessage(err: unknown): string {
  if (!(err instanceof AppError)) {
    console.error('MCP tool error:', err)
    return 'Internal server error'
  }
  const code = err.code ? ` (${err.code})` : ''
  const details = err instanceof ValidationError && err.details?.length
    ? `\n${err.details.map(detail => `- ${detail}`).join('\n')}`
    : ''
  return `${err.message}${code}${details}`
}
