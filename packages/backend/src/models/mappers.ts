import mongoose, { Types } from 'mongoose'
import type {
  EmailSettingsDTO,
  ExportDTO,
  SsoSettingsDTO,
  AccessSettingsDTO,
  FontDTO,
  FontVariant,
  Template,
  TemplateDTO,
  TemplateSummary,
  Page,
  PageDTO,
  PageNumbering,
  PageRepeat,
  PreviewDTO,
  VariableData,
  VariableDTO,
  VariableValueType,
  VisibilityCondition,
} from '@imprime/common'
import { DEFAULT_PAGE_SIZE, PAGE_NUMBER_SHAPE_ID } from '@imprime/common'
import type { FontDocument, IFont, IFontFace } from './Font.js'
import type { IFontFile } from './FontFile.js'
import type { IInstanceSettings, ISmtpSettings, ISsoProviderSettings } from './InstanceSettings.js'
import type { ITemplate, TemplateDocument } from './Template.js'
import type { IPage, PageDocument } from './Page.js'
import type { IVariableData, VariableDataDocument } from './VariableData.js'
import type { IPreview, PreviewDocument } from './Preview.js'

// A page's condition and repeat, field by field, whichever way they go: a
// subdocument going out, a request body coming in. Neither is copied whole.
function conditionFields(condition: VisibilityCondition): VisibilityCondition {
  const fields: VisibilityCondition = {}
  if (condition.variableId !== undefined) fields.variableId = condition.variableId
  if (condition.itemPath !== undefined) fields.itemPath = condition.itemPath
  if (condition.negate !== undefined) fields.negate = condition.negate
  return fields
}

function repeatFields(repeat: PageRepeat): PageRepeat {
  return repeat.variableId !== undefined ? { variableId: repeat.variableId } : {}
}

export function pageToDTO(doc: PageDocument): Page {
  return {
    _id: doc._id.toString(),
    order: doc.order,
    shapes: doc.shapes,
    ...(doc.visibleWhen ? { visibleWhen: conditionFields(doc.visibleWhen) } : {}),
    ...(doc.repeat ? { repeat: repeatFields(doc.repeat) } : {}),
    ...(doc.hidePageNumber !== undefined ? { hidePageNumber: doc.hidePageNumber } : {}),
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
    maxLength: doc.maxLength,
    maxItems: doc.maxItems,
    itemFields: doc.itemFields,
  }
}

export function templateToSummaryDTO(doc: TemplateDocument): TemplateSummary {
  return {
    _id: doc._id.toString(),
    title: doc.title,
    ...(doc.code !== undefined ? { code: doc.code } : {}),
    pageSize: { width: doc.pageSize.width, height: doc.pageSize.height },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

// A numbering, field by field, whichever way it goes. The box is the shape as
// stored or sent, under the reserved id whatever it said.
function pageNumberingFields(numbering: PageNumbering): PageNumbering {
  return {
    box: { ...numbering.box, id: PAGE_NUMBER_SHAPE_ID },
    ...(numbering.skipFirstPage !== undefined ? { skipFirstPage: numbering.skipFirstPage } : {}),
  }
}

export function templateToDTO(doc: TemplateDocument): Omit<Template, 'pages' | 'variableData'> {
  return {
    ...templateToSummaryDTO(doc),
    ...(doc.pageNumbering ? { pageNumbering: pageNumberingFields(doc.pageNumbering) } : {}),
  }
}

// `pageSize` must have passed `isValidPageSize`, and `code`
// `isValidTemplateCode`: the service checks both.
export function templateCreateToModel(
  dto: TemplateDTO.Create
): Pick<ITemplate, 'title' | 'pageSize' | 'code'> {
  const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE
  return {
    title: dto.title || 'Untitled Template',
    ...(dto.code !== undefined ? { code: dto.code } : {}),
    pageSize: { width: pageSize.width, height: pageSize.height },
  }
}

// A code or a numbering set to undefined is unset on save: what `null` asks
// for. The numbering must have passed the service's check.
export function templateUpdateToModel(
  dto: TemplateDTO.Update
): Partial<Pick<ITemplate, 'title' | 'code' | 'pageNumbering'>> {
  const update: Partial<Pick<ITemplate, 'title' | 'code' | 'pageNumbering'>> = {}
  if (dto.title !== undefined) update.title = dto.title
  if (dto.code !== undefined) update.code = dto.code ?? undefined
  if (dto.pageNumbering !== undefined) {
    update.pageNumbering = dto.pageNumbering === null ? undefined : pageNumberingFields(dto.pageNumbering)
  }
  return update
}

export function pageCreateToModel(
  templateId: Types.ObjectId,
  order: number,
  dto: Pick<PageDTO.Create, 'shapes' | 'visibleWhen' | 'repeat' | 'hidePageNumber'> = {}
): Pick<IPage, 'templateId' | 'order' | 'shapes' | 'visibleWhen' | 'repeat' | 'hidePageNumber'> {
  return {
    templateId,
    order,
    shapes: dto.shapes ?? [],
    ...(dto.visibleWhen ? { visibleWhen: conditionFields(dto.visibleWhen) } : {}),
    ...(dto.repeat ? { repeat: repeatFields(dto.repeat) } : {}),
    ...(dto.hidePageNumber ? { hidePageNumber: true } : {}),
  }
}

// A condition or a repeat set to undefined is unset on save: what `null`
// asks for.
export function pageUpdateToModel(
  dto: PageDTO.Update
): Partial<Pick<IPage, 'shapes' | 'visibleWhen' | 'repeat' | 'hidePageNumber'>> {
  const update: Partial<Pick<IPage, 'shapes' | 'visibleWhen' | 'repeat' | 'hidePageNumber'>> = {}
  if (dto.shapes !== undefined) update.shapes = dto.shapes
  if (dto.visibleWhen !== undefined) {
    update.visibleWhen = dto.visibleWhen === null ? undefined : conditionFields(dto.visibleWhen)
  }
  if (dto.repeat !== undefined) update.repeat = dto.repeat === null ? undefined : repeatFields(dto.repeat)
  // Unset rather than false: one way to say the page shows the box.
  if (dto.hidePageNumber !== undefined) update.hidePageNumber = dto.hidePageNumber ? true : undefined
  return update
}

export function pagesReorderToOrderUpdates(
  pages: Page[]
): Array<{ _id: string; order: number }> {
  return pages.map((page, idx) => ({ _id: page._id, order: idx }))
}

export function variableCreateToModel(
  templateId: Types.ObjectId,
  dto: VariableDTO.Create
): Pick<IVariableData, 'templateId' | 'type' | 'name' | 'default' | 'required' | 'maxLength' | 'maxItems' | 'itemFields'> {
  return {
    templateId,
    type: dto.type,
    name: dto.name,
    default: dto.default,
    required: dto.required ?? false,
    maxLength: dto.maxLength,
    maxItems: dto.maxItems,
    itemFields: dto.itemFields,
  }
}

export function variableUpdateToModel(
  dto: VariableDTO.Update
): Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'maxLength' | 'maxItems' | 'itemFields'>> {
  const update: Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'maxLength' | 'maxItems' | 'itemFields'>> = {}
  if (dto.type !== undefined) update.type = dto.type
  if (dto.name !== undefined) update.name = dto.name
  if (dto.default !== undefined) update.default = dto.default ?? undefined
  if (dto.required !== undefined) update.required = dto.required
  if (dto.maxLength !== undefined) update.maxLength = dto.maxLength ?? undefined
  if (dto.maxItems !== undefined) update.maxItems = dto.maxItems ?? undefined
  if (dto.itemFields !== undefined) update.itemFields = dto.itemFields
  return update
}

// The template comes from the verified route param, and the owner from the
// credentials, never from the request body.
export function previewCreateToModel(
  templateId: Types.ObjectId,
  ownerId: string,
  variableValues: Record<string, VariableValueType>,
  expiresAt: Date
): Pick<IPreview, 'templateId' | 'ownerId' | 'variableValues' | 'expiresAt'> {
  return { templateId, ownerId, variableValues: JSON.stringify(variableValues), expiresAt }
}

// `resolved` is what the export made of the template with the preview's values.
export function previewToCreatedDTO(
  doc: PreviewDocument,
  resolved: { pages: Page[]; warnings: ExportDTO.Warning[] }
): PreviewDTO.Created {
  return {
    _id: doc._id.toString(),
    expiresAt: doc.expiresAt,
    pageCount: resolved.pages.length,
    warnings: resolved.warnings,
  }
}

// Written by `previewCreateToModel` alone, from values the export accepted:
// read back as they were, unchecked.
export function previewValuesFromModel(doc: PreviewDocument): Record<string, VariableValueType> {
  const values: Record<string, VariableValueType> = JSON.parse(doc.variableValues)
  return values
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
