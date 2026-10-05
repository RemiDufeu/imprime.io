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
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle'
  fill: string
  cornerRadius?: number
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse'
  fill: string
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
  // being iterated by an enclosing for-group: 'name', or 'moves.name' when the
  // run sits inside a for-group nested on the `moves` field. Unset means the
  // variable resolves at template scope, which is the only behaviour a run
  // outside any for-group can have.
  itemPath?: string;
  children: [{ text: '' }]; // Required by Slate for inline elements
};

export interface Paragraph {
  type: 'paragraph';
  // Stored documents may still carry a free-form `style` object from an
  // earlier API; no renderer reads it any more. The typed fields below replace
  // it, so both renderers agree on every paragraph property.
  //
  // Block-level formatting. Unset means 'left' and DEFAULT_LINE_HEIGHT, which
  // is how every paragraph rendered before these fields existed. Read them
  // through `getParagraphStyle`, which also sanitises values written via the API.
  align?: TextAlign;
  lineHeight?: number; // unitless multiplier of each run's font size
  // List membership. Lists are flat: an item is a paragraph carrying `list`,
  // and nesting is its `indent` level (0 to MAX_LIST_LEVEL), ignored outside a
  // list. Unset `list` is a plain paragraph, which every paragraph was before
  // lists existed. Numbering is derived from the surrounding paragraphs by
  // `getListMarkers`, never stored. Read through `getListStyle`.
  list?: ListType;
  indent?: number;
  children: (CustomText | VariableElement)[];
}

export interface TextBoxShape extends BaseShape {
  type: 'text'
  paragraphes: Paragraph[]
  // Position of the paragraph stack inside the box. Unset means 'top', the
  // only behaviour text boxes had before this field existed.
  verticalAlign?: TextVerticalAlign
}

export interface ImageShape extends BaseShape {
  type: 'image'
  imageId: string // Reference to Image document ID
  alt?: string
}

export type GroupLayoutDirection = 'none' | 'horizontal' | 'vertical'
export type GroupJustify = 'start' | 'center' | 'end' | 'space-between' | 'space-around'
export type GroupAlign = 'start' | 'center' | 'end' | 'stretch'

export interface GroupShape extends BaseShape {
  type: 'group'
  children: Shape[]
  // Flexbox-like auto-layout for children. Defaults to 'none' (free-form
  // positioning, children keep their own x/y) when unset, so groups saved
  // before auto-layout existed keep rendering exactly as they did.
  layout?: GroupLayoutDirection
  justify?: GroupJustify
  align?: GroupAlign
  gap?: number
}

// Conditional container: children only appear in the exported output when
// the referenced variable holds the boolean `true`. Only a `boolean` variable
// is accepted — a string or a list is never coerced, so `"true"` or a non-empty
// list renders nothing. The editor's picker filters to boolean variables for
// the same reason.
export interface IfGroupShape extends BaseShape {
  type: 'if-group'
  children: Shape[]
  conditionVariable?: string
  // Dotted path to a boolean field of the item iterated by an enclosing
  // for-group bound to `conditionVariable` — same addressing as
  // `VariableElement.itemPath`. Unset evaluates the variable itself.
  itemPath?: string
}

// Repeat container: children are duplicated once per item in the referenced
// list variable. Layout params control how iterations are arranged inside the
// group's own box (same semantics as GroupShape).
export interface ForGroupShape extends BaseShape {
  type: 'for-group'
  children: Shape[]
  itemsVariable?: string
  // Dotted path to an `object-list` field of the item iterated by an enclosing
  // for-group bound to the same `itemsVariable`, which is what this group then
  // iterates. Unset iterates the variable's own value.
  itemPath?: string
  layout?: GroupLayoutDirection
  justify?: GroupJustify
  align?: GroupAlign
  gap?: number
}

export type ContainerShape = GroupShape | IfGroupShape | ForGroupShape

// Single definition of "is this shape a container?" — the alternative is the
// three-way `type ===` test rewritten at every recursion site.
export function isContainerShape(shape: Shape): shape is ContainerShape {
  return shape.type === 'group' || shape.type === 'if-group' || shape.type === 'for-group'
}

export type Shape =
  | RectangleShape
  | EllipseShape
  | TextBoxShape
  | ImageShape
  | GroupShape
  | IfGroupShape
  | ForGroupShape

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

export type VariableType = "string" | "boolean" | "object-list"

// One declared property of an `object-list` item. Recursive: a property that is
// itself an `object-list` declares its own fields, which is what lets a
// for-group nest on it.
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
}

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
