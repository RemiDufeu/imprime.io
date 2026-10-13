import type { PasswordPolicy, SsoProvider } from './auth.js'

export interface BaseShape {
  // Client-generated UUID (not a MongoDB _id). The front assigns it on creation
  // so it can apply optimistic updates and track selection without waiting for
  // a server round-trip.
  id: string
  x: number
  y: number
  width: number
  height: number
  stroke?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted'
  // Editor-only visibility toggle. When true, the shape is skipped by the
  // renderer (SVG in the editor, image export in the backend) but stays in
  // the data so the user can re-enable it.
  hidden?: boolean
  name?: string
  // Shown in the export only when this condition holds. Unset is always shown.
  visibleWhen?: VisibilityCondition
  // CSS's flex-grow, for a child of a 'horizontal' or 'vertical' group: the
  // share of the free space along that axis this shape takes, its own size on
  // that axis then ignored (`flex: 1` is `grow: 1`). Unset or 0 keeps its size.
  // Ignored by any other parent. Read through `getGrow`.
  grow?: number
}

// A data-driven condition on a shape: a boolean variable — or a boolean field of
// the item an enclosing repeat iterates — must hold exactly `true` (`false`
// with `negate`). Nothing is coerced, so `"true"`, a non-empty list, a missing
// value or an unset variable all hide the shape. Read through `isConditionMet`.
export interface VisibilityCondition {
  // Reference to a boolean variable (VariableData._id). Unset only once a paste
  // has dropped a reference it could not rebind: the shape then never shows.
  variableId?: string
  // Dotted path to a boolean field of the item iterated by an enclosing repeat
  // bound to `variableId` — same addressing as `VariableElement.itemPath`.
  // Unset evaluates the variable itself.
  itemPath?: string
  negate?: boolean
}

// Four lengths, one per side of a box: a group's padding, a box's border widths.
export interface Sides {
  top: number
  right: number
  bottom: number
  left: number
}

// One radius per corner, for a box whose corners differ.
export interface CornerRadii {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

// The paint of a box — a rectangle, or a group's own background. The border
// takes the shape's `stroke` and `strokeStyle`, and is `strokeWidth` wide on
// every side, or `strokeWidths` side by side when set: a side of width 0 is not
// drawn. Drawn through `getBoxPaths`, which both renderers share.
export interface BoxStyle {
  strokeWidths?: Sides
  // One radius for every corner, or one per corner. Unset is square.
  cornerRadius?: number | CornerRadii
}

export interface RectangleShape extends BaseShape, BoxStyle {
  type: 'rectangle'
  // Unset is transparent.
  fill?: string
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse'
  // Unset is transparent.
  fill?: string
}

// Inline formatting carried by every leaf of a paragraph, literal or variable.
// Factored out so a renderer can style either kind through one code path.
export interface TextFormatting {
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  // Rendered upper-case by both renderers (CSS / react-pdf `textTransform`);
  // the stored text keeps its original case.
  uppercase?: boolean;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextVerticalAlign = 'top' | 'middle' | 'bottom'
export type ListType = 'bullet' | 'number'

export type CustomText = TextFormatting & {
  text: string;
};

export type VariableElement = TextFormatting & {
  type: 'variable';
  variableId: string; // Reference to VariableData._id
  // Dotted path, from the referenced variable's root, to a field of the item
  // being iterated by an enclosing repeat: 'name', or 'moves.name' when the
  // run sits inside a repeat nested on the `moves` field. Unset means the
  // variable resolves at template scope, which is the only behaviour a run
  // outside any repeat can have.
  itemPath?: string;
  children: [{ text: '' }]; // Required by Slate for inline elements
};

export interface Paragraph {
  type: 'paragraph';
  // Block-level formatting. Unset means 'left' and DEFAULT_LINE_HEIGHT. Read
  // them through `getParagraphStyle`, which also sanitises values written via
  // the API.
  align?: TextAlign;
  lineHeight?: number; // unitless multiplier of each run's font size
  // List membership. Lists are flat: an item is a paragraph carrying `list`,
  // and nesting is its `indent` level (0 to MAX_LIST_LEVEL), ignored outside a
  // list. Unset `list` is a plain paragraph. Numbering is derived from the
  // surrounding paragraphs by `getListMarkers`, never stored. Read through
  // `getListStyle`.
  list?: ListType;
  indent?: number;
  children: (CustomText | VariableElement)[];
}

export interface TextBoxShape extends BaseShape {
  type: 'text'
  paragraphes: Paragraph[]
  // Position of the paragraph stack inside the box. Unset means 'top'.
  verticalAlign?: TextVerticalAlign
}

// How an image fills its box: stretched to it ('fill'), whole and as large as
// it fits ('contain'), or covering it, the overflow cut off ('cover').
export type ImageFit = 'fill' | 'contain' | 'cover'

// Where the image sits in its box when it does not match the box's
// proportions: the gap 'contain' leaves, the overflow 'cover' cuts off.
export interface ImageAlign {
  horizontal: 'left' | 'center' | 'right'
  vertical: 'top' | 'middle' | 'bottom'
}

// The part of the image shown, in fractions (0 to 1) of its natural size.
// Read through `getImageCrop`, which sanitises values written via the API.
export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

// A box an image is drawn in. The image is drawn through `getImageLayout`
// and clipped to the box, whatever its proportions.
//
// It shows one image: an uploaded one (`imageId`), or the value of an image
// variable (`imageVariable`), which the editor's picker sets one at a time.
// Neither is an empty box, waiting for an image: a placeholder in the editor,
// nothing in the PDF but its border.
export interface ImageShape extends BaseShape {
  type: 'image'
  // Reference to an Image document. Ignored while `imageVariable` is set.
  imageId?: string
  // Reference to an image variable (VariableData._id), resolved at export.
  imageVariable?: string
  // Dotted path to an image field of the item iterated by an enclosing
  // repeat bound to `imageVariable` — same addressing as
  // `VariableElement.itemPath`. Unset evaluates the variable itself.
  itemPath?: string
  // What `imageVariable` resolved to: a data URL. Written by `resolveShapes`
  // for every image box, so never authored — whatever a page stores here is
  // overwritten before anything is drawn.
  resolvedImage?: string
  fit: ImageFit
  align: ImageAlign
  // Unset shows the whole image.
  crop?: ImageCrop
  // 0 to 1. Unset is opaque.
  opacity?: number
  // Rounds the clip and the border. Unset is square. Read through
  // `getImageCornerRadius`.
  cornerRadius?: number
}

// 'none' leaves children where they were put. 'horizontal' and 'vertical' line
// them up along that axis; 'stack' lays them over each other, each aligned in
// the group on its own — its main axis is horizontal, so `justify` places a
// child across and `align` down.
export type GroupLayoutDirection = 'none' | 'horizontal' | 'vertical' | 'stack'
export type GroupJustify = 'start' | 'center' | 'end' | 'space-between' | 'space-around'
export type GroupAlign = 'start' | 'center' | 'end' | 'stretch'

// What a repeated group iterates: a list variable, or a list field of the item
// an enclosing repeat iterates.
export interface RepeatBinding {
  // Reference to an `object-list` variable (VariableData._id). Unset while the
  // author has not picked a list yet: the group then renders no copy.
  variableId?: string
  // Dotted path to an `object-list` field of the item iterated by an enclosing
  // repeat bound to the same `variableId`, which is what this group then
  // iterates. Unset iterates the variable's own value.
  itemPath?: string
}

export interface GroupShape extends BaseShape, BoxStyle {
  type: 'group'
  children: Shape[]
  // Flexbox-like auto-layout for children. Defaults to 'none' (free-form
  // positioning, children keep their own x/y) when unset.
  layout?: GroupLayoutDirection
  justify?: GroupJustify
  align?: GroupAlign
  gap?: number
  // Space between the group's edge and its laid-out children. Ignored by
  // 'none', whose children keep their own x/y.
  padding?: Sides
  // Along its layout axis — a row's width, a column's height — the group is
  // as large as its children, gaps and padding, rather than its own size: it
  // grows with its copies and shrinks with its hidden children. Ignored by
  // 'none' and 'stack'. A size the parent imposes (`grow`, 'stretch') wins
  // over it, and its children's `grow` is ignored: it has no free space to
  // share. Read through `getHugAxis`.
  hug?: boolean
  // The group's own background, under its children. Unset is transparent.
  fill?: string
  // Set, the group is drawn once per item of the list, each copy a sibling
  // laid out by the parent's layout — or, in a parent without one, stacked
  // downwards from the group's own position. The editor shows one copy.
  repeat?: RepeatBinding
}

export type ContainerShape = GroupShape

// Single definition of "is this shape a container?", so a recursion site does
// not spell out the container types itself.
export function isContainerShape(shape: Shape): shape is ContainerShape {
  return shape.type === 'group'
}

export type Shape =
  | RectangleShape
  | EllipseShape
  | TextBoxShape
  | ImageShape
  | GroupShape

// ============================================
// Page & Template Types
// ============================================

export interface Page {
  _id: string
  shapes: Shape[]
  order: number
  createdAt?: Date
  updatedAt?: Date
}

// Size of every page of a template, in the units its shapes are drawn in; the
// PDF page is the same numbers in points. Chosen when the template is created:
// one of `PAGE_FORMATS`, or a custom size.
export interface PageSize {
  width: number
  height: number
}

export interface Template {
  _id: string
  title: string
  pageSize: PageSize
  pages: Page[]
  variableData: VariableData[]
  createdAt?: Date
  updatedAt?: Date
}

export interface TemplateSummary {
  _id: string
  title: string
  pageSize: PageSize
  createdAt?: Date
  updatedAt?: Date
}

export interface VariableData {
  _id: string
  type: VariableType
  name: string
  default?: VariableValueType
  required?: boolean
  // Item schema when `type === 'object-list'`. The editor needs it to offer
  // field names in a picker without any runtime data. Ignored for the other
  // types.
  itemFields?: VariableItemField[]
}

// An 'image' variable holds a PNG or JPEG data URL — a string, as values go.
export type VariableType = "string" | "boolean" | "image" | "object-list"

// One declared property of an `object-list` item. Recursive: a property that is
// itself an `object-list` declares its own fields, which is what lets a
// repeat nest on it.
export interface VariableItemField {
  name: string
  type: VariableType
  itemFields?: VariableItemField[]
}

// A list is always a list of objects — there is no list-of-scalars type, so a
// nested list nests the same way as the top-level one.
export interface VariableItem {
  [key: string]: VariableItemValue
}

export type VariableItemValue = string | boolean | VariableItem[]

export type VariableValueType = string | boolean | VariableItem[]

// ============================================
// API DTOs (Data Transfer Objects)
// ============================================

export namespace TemplateDTO {
  export interface Create {
    title?: string
    // DEFAULT_PAGE_SIZE when absent. Whole numbers from MIN_PAGE_DIMENSION to
    // MAX_PAGE_DIMENSION, or the request is refused (`INVALID_PAGE_SIZE`).
    pageSize?: PageSize
  }

  export interface Update {
    title?: string
    pages?: Page[]
  }

  export interface Response extends Template {}

  export interface List {
    templates: Template[]
    total: number
  }
}

export namespace PageDTO {
  export interface Update {
    shapes: Shape[]
  }

  export interface Create {
    // Position among the template's pages, 0-based; the end when absent.
    // The pages from there on move down one.
    order?: number
    shapes?: Shape[]
    // Restores a deleted page under its former id, so references to it stay
    // valid (the editor's undo). Rejected with 409 when the id is in use.
    _id?: string
  }
}

export namespace VariableDTO {
  export interface Create {
    // Restores a deleted variable under its former id, which text runs and
    // containers point to (the editor's undo). Rejected with 409 when in use.
    _id?: string
    type: VariableType
    name: string
    default?: VariableValueType
    required?: boolean
    itemFields?: VariableItemField[]
  }

  export interface Update {
    type?: VariableType
    name?: string
    default?: VariableValueType | null
    required?: boolean
    itemFields?: VariableItemField[]
  }

  export interface Response extends VariableData {}

  export interface List {
    variables: VariableData[]
    total: number
  }
}

export namespace ImageDTO {
  export interface Create {
    data: string
    mimeType: string
    originalName?: string
  }

  export interface Response {
    _id: string
    mimeType: string
    originalName?: string
    size: number
    // Natural size in pixels, as displayed: a JPEG's EXIF orientation is
    // applied, as both the browser and the PDF renderer apply it.
    width: number
    height: number
    createdAt: Date
  }

  export interface ResponseWithData extends Response {
    data: string
  }
}

// The four faces a font family may provide. A run asks for one through its
// `bold` and `italic` marks; a family missing it is drawn with the closest face
// it has (see `resolveFontFace`).
export type FontVariant = 'regular' | 'bold' | 'italic' | 'boldItalic'

export namespace FontDTO {
  // A TrueType or OpenType file, base64-encoded.
  export interface FaceUpload {
    data: string
    originalName?: string
  }

  export interface Create {
    family: string
    regular: FaceUpload
  }

  export interface FaceInfo {
    size: number
    originalName?: string
  }

  // A font family imported into the instance, shared by every user. Runs
  // refer to it by `family`; `version` changes whenever one of its faces does.
  export interface Response {
    _id: string
    family: string
    version: number
    faces: { regular: FaceInfo } & Partial<Record<Exclude<FontVariant, 'regular'>, FaceInfo>>
    createdAt?: Date
    updatedAt?: Date
  }

  export interface FaceData {
    data: string
  }
}

// How the instance sends email, set by its admins. Sign-up verification and
// password reset both need the SMTP server.
export namespace EmailSettingsDTO {
  // The password is write-only: a response only says whether one is stored.
  export interface Smtp {
    host: string
    port: number
    // TLS from the first byte, as port 465 expects (always on for 465).
    // Otherwise the connection upgrades through STARTTLS when the server
    // offers it, and must when a user and password are set.
    secure: boolean
    user?: string
    hasPassword: boolean
    from: string
  }

  export interface Response {
    // null while the instance has no SMTP server.
    smtp: Smtp | null
    requireEmailVerification: boolean
  }

  export interface SmtpUpdate {
    host: string
    port: number
    secure: boolean
    user?: string
    // Omitted: the stored password is kept, as long as `host`, `port` and
    // `user` are unchanged. Empty: removed, as it is along with `user`.
    password?: string
    from: string
  }

  export interface Update {
    // null removes the SMTP server, which requires verification to be off.
    smtp: SmtpUpdate | null
    requireEmailVerification: boolean
  }

  // One email sent to `to` through `smtp`, or through the stored server when
  // omitted, so a configuration can be checked before it is saved.
  export interface TestRequest {
    to: string
    smtp?: SmtpUpdate
  }
}

// The instance's single sign-on providers, set by its admins: each one is an
// OAuth application registered with the provider.
export namespace SsoSettingsDTO {
  // The client secret is write-only, and never returned.
  export interface Provider {
    clientId: string
    // Microsoft only: whose accounts may sign in. 'common' (the default, any
    // account), 'organizations', 'consumers', or one tenant's id or domain.
    tenantId?: string
  }

  export interface ProviderStatus {
    // The redirect URI to register with the provider; null while the server
    // has no PUBLIC_APP_URL to build it from.
    callbackUrl: string | null
    // null while the provider is not configured.
    config: Provider | null
    // Offered on the sign-in page. False for a configured provider whose
    // stored secret no longer decrypts (BETTER_AUTH_SECRET changed).
    active: boolean
  }

  export type Response = Record<SsoProvider, ProviderStatus>

  export interface ProviderUpdate {
    clientId: string
    // Omitted: the stored secret is kept, as long as `clientId` is unchanged.
    clientSecret?: string
    tenantId?: string
  }
}

// Who may get into the instance, and how, set by its admins.
export namespace AccessSettingsDTO {
  export interface Response {
    passwordPolicy: PasswordPolicy
    // Domains whose addresses may have an account, lower-cased, exactly:
    // "example.com" does not admit "eu.example.com". Empty: any. An address
    // counts only once verified, by its provider or by email; administrators
    // are exempt.
    allowedDomains: string[]
  }

  export interface Update {
    passwordPolicy: PasswordPolicy
    allowedDomains: string[]
  }
}

export namespace ExportDTO {
  export interface PdfRequest {
    variableValues?: Record<string, VariableValueType>
  }

  // Something the caller should know about a PDF that was made: not all of
  // the content made it in as authored.
  export interface Warning {
    // Content starting beyond its page's bottom or right edge — a list grown
    // longer than the page — which is left out: pages do not overflow onto
    // new ones.
    code: 'CONTENT_OFF_PAGE'
    // 1-based, in page order.
    page: number
    // How many drawn shapes were left out.
    shapes: number
    message: string
  }
}

// The response header an exported PDF's warnings travel in, as a JSON
// `ExportDTO.Warning[]`. Absent when there are none.
export const EXPORT_WARNINGS_HEADER = 'X-Export-Warnings'

// ============================================
// API Response Types
// ============================================

export interface ApiError {
  error: string
  message?: string
  statusCode?: number
}

export interface ApiSuccess<T = any> {
  data: T
  message?: string
}
