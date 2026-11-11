/**
 * Template codes
 *
 * A template's code is a name an integration prints it by, instead of its
 * `_id`: `POST /api/export/code/INVOICE_FR/pdf`. It goes in a URL as is, so it
 * is letters, digits, `-` and `_` only, and unique among its owner's
 * templates — not across the instance, where a refusal would tell one user
 * that another has a template by that code.
 */

export const TEMPLATE_CODE_MAX_LENGTH = 64

const TEMPLATE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/

// The only definition of an acceptable code: the API refuses anything else,
// and the editor checks the same before saving. Compared as written: `invoice`
// and `INVOICE` are two codes.
export function isValidTemplateCode(code: unknown): code is string {
  return typeof code === 'string'
    && code.length <= TEMPLATE_CODE_MAX_LENGTH
    && TEMPLATE_CODE_PATTERN.test(code)
}
