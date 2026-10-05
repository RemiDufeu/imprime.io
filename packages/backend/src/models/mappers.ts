import mongoose, { Types } from 'mongoose'
import type {
  EmailSettingsDTO,
  SsoSettingsDTO,
  AccessSettingsDTO,
  FontDTO,
  FontVariant,
  Template,
  TemplateDTO,
  TemplateSummary,
  Shape,
  Page,
  PageDTO,
  VariableData,
  VariableDTO,
} from '@imprime/common'
import { DEFAULT_PAGE_SIZE } from '@imprime/common'
import type { FontDocument, IFont, IFontFace } from './Font.js'
import type { IFontFile } from './FontFile.js'
import type { IInstanceSettings, ISmtpSettings, ISsoProviderSettings } from './InstanceSettings.js'
import type { ITemplate, TemplateDocument } from './Template.js'
import type { IPage, PageDocument } from './Page.js'
import type { IVariableData, VariableDataDocument } from './VariableData.js'

export function pageToDTO(doc: PageDocument): Page {
  return {
    _id: doc._id.toString(),
    order: doc.order,
    shapes: doc.shapes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function variableToDTO(doc: VariableDataDocument): VariableData {
  return {
    _id: doc._id.toString(),
    type: doc.type,
    name: doc.name,
    default: doc.default,
    required: doc.required,
    itemFields: doc.itemFields,
  }
}

export function templateToSummaryDTO(doc: TemplateDocument): TemplateSummary {
  return {
    _id: doc._id.toString(),
    title: doc.title,
    pageSize: { width: doc.pageSize.width, height: doc.pageSize.height },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function templateToDTO(doc: TemplateDocument): Omit<Template, 'pages' | 'variableData'> {
  return templateToSummaryDTO(doc)
}

// `pageSize` must have passed `isValidPageSize`: the service checks it.
export function templateCreateToModel(
  dto: TemplateDTO.Create
): Pick<ITemplate, 'title' | 'pageSize'> {
  const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE
  return {
    title: dto.title || 'Untitled Template',
    pageSize: { width: pageSize.width, height: pageSize.height },
  }
}

export function templateUpdateToModel(
  dto: TemplateDTO.Update
): Partial<Pick<ITemplate, 'title'>> {
  const update: Partial<Pick<ITemplate, 'title'>> = {}
  if (dto.title !== undefined) update.title = dto.title
  return update
}

export function pageCreateToModel(
  templateId: Types.ObjectId,
  order: number,
  shapes: Shape[] = []
): Pick<IPage, 'templateId' | 'order' | 'shapes'> {
  return {
    templateId,
    order,
    shapes,
  }
}

export function pageUpdateToModel(
  dto: PageDTO.Update
): Partial<Pick<IPage, 'shapes'>> {
  return { shapes: dto.shapes }
}

export function pagesReorderToOrderUpdates(
  pages: Page[]
): Array<{ _id: string; order: number }> {
  return pages.map((page, idx) => ({ _id: page._id, order: idx }))
}

export function variableCreateToModel(
  templateId: Types.ObjectId,
  dto: VariableDTO.Create
): Pick<IVariableData, 'templateId' | 'type' | 'name' | 'default' | 'required' | 'itemFields'> {
  return {
    templateId,
    type: dto.type,
    name: dto.name,
    default: dto.default,
    required: dto.required ?? false,
    itemFields: dto.itemFields,
  }
}

export function variableUpdateToModel(
  dto: VariableDTO.Update
): Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'itemFields'>> {
  const update: Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'itemFields'>> = {}
  if (dto.type !== undefined) update.type = dto.type
  if (dto.name !== undefined) update.name = dto.name
  if (dto.default !== undefined) update.default = dto.default ?? undefined
  if (dto.required !== undefined) update.required = dto.required
  if (dto.itemFields !== undefined) update.itemFields = dto.itemFields
  return update
}

export function fontToDTO(doc: FontDocument): FontDTO.Response {
  const faces: FontDTO.Response['faces'] = { regular: fontFaceToDTO(doc.faces.regular) }
  if (doc.faces.bold) faces.bold = fontFaceToDTO(doc.faces.bold)
  if (doc.faces.italic) faces.italic = fontFaceToDTO(doc.faces.italic)
  if (doc.faces.boldItalic) faces.boldItalic = fontFaceToDTO(doc.faces.boldItalic)

  return {
    _id: doc._id.toString(),
    family: doc.family,
    version: doc.version,
    faces,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function fontFaceToDTO(face: IFontFace): FontDTO.FaceInfo {
  return { size: face.size, originalName: face.originalName }
}

// `family` is the validated, trimmed name.
export function fontCreateToModel(
  family: string,
  regular: IFontFace
): Pick<IFont, 'family' | 'familyKey' | 'version' | 'faces'> {
  return {
    family,
    familyKey: family.toLowerCase(),
    version: 1,
    faces: { regular },
  }
}

// The font comes from the document just created or the verified route param,
// never from the request body.
export function fontFileCreateToModel(fontId: Types.ObjectId, variant: FontVariant, data: Buffer): IFontFile {
  return { fontId, variant, data }
}

// `email` is absent until the settings are first saved. The SMTP password
// never leaves: the response only says whether one is stored.
export function emailSettingsToDTO(email: IInstanceSettings['email'] | undefined): EmailSettingsDTO.Response {
  const smtp = email?.smtp
  return {
    smtp: smtp
      ? {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          user: smtp.user,
          hasPassword: Boolean(smtp.password),
          from: smtp.from,
        }
      : null,
    requireEmailVerification: email?.requireEmailVerification ?? false,
  }
}

// `smtp` is the validated update, and `password` the one to store, already
// encrypted.
export function smtpSettingsToModel(smtp: EmailSettingsDTO.SmtpUpdate, password: string | undefined): ISmtpSettings {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    user: smtp.user,
    password,
    from: smtp.from,
  }
}

// `access` is absent until settings are first saved: anyone may then use a
// password, from any domain.
export function accessSettingsToDTO(access: IInstanceSettings['access'] | undefined): AccessSettingsDTO.Response {
  return {
    passwordPolicy: access?.passwordPolicy ?? 'open',
    allowedDomains: [...(access?.allowedDomains ?? [])],
  }
}

// The client secret never leaves.
export function ssoProviderToDTO(stored: ISsoProviderSettings | undefined): SsoSettingsDTO.Provider | null {
  return stored ? { clientId: stored.clientId, tenantId: stored.tenantId } : null
}

// `provider` is the validated update, and `clientSecret` the one to store,
// already encrypted.
export function ssoProviderToModel(provider: SsoSettingsDTO.ProviderUpdate, clientSecret: string): ISsoProviderSettings {
  return {
    clientId: provider.clientId,
    clientSecret,
    tenantId: provider.tenantId,
  }
}

// The 24-hex form a client may send as an id to restore. `ObjectId.isValid`
// alone also accepts any 12-character string.
export function isObjectIdString(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)
}

export function toObjectId(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
