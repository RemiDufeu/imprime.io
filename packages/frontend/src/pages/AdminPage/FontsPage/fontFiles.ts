import { MAX_FONT_FILE_SIZE } from '@imprime/sdk'
import type { FontDTO, FontVariant } from '@imprime/sdk'

export const FONT_FILE_ACCEPT = '.ttf,.otf'

export const FONT_VARIANT_LABELS: Record<FontVariant, string> = {
  regular: 'Regular',
  bold: 'Bold',
  italic: 'Italic',
  boldItalic: 'Bold italic',
}

// Checked before reading the file, so an oversized one fails without an upload.
export function isFontFileTooLarge(file: File): boolean {
  return file.size > MAX_FONT_FILE_SIZE
}

// A face as the API takes it: the file base64-encoded, without the data URL
// prefix.
export function readFontFile(file: File): Promise<FontDTO.FaceUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve({ data: result.slice(result.indexOf(',') + 1), originalName: file.name })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 'CrimsonText-BoldItalic.ttf' → 'Crimson Text'. Only a suggestion: the user
// can edit the name before importing.
export function guessFontFamily(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  const family = base.split(/[-_]/)[0] || base
  return family.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
