import type { InputProps } from 'antd'
import { countCharacters } from '@imprime/sdk'

// The counter of an input bounded by a string variable's max length. It
// counts as the export does — in characters, so an emoji is one, where antd's
// `maxLength` counts UTF-16 units — and cuts what is typed or pasted past the
// limit. No limit shows no counter.
export function maxLengthCount(maxLength: number | undefined): InputProps['count'] {
  if (maxLength === undefined) return undefined
  return {
    show: true,
    max: maxLength,
    strategy: countCharacters,
    exceedFormatter: (value, { max }) => Array.from(value).slice(0, max).join(''),
  }
}
