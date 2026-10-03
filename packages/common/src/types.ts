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
  // variable resolves at presentation scope, which is the only behaviour a run
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
// Slide & Presentation Types
// ============================================

export interface Slide {
  _id: string
  shapes: Shape[]
  order: number
  createdAt?: Date
  updatedAt?: Date
}

export interface Presentation {
  _id: string
  title: string
  slides: Slide[]
  variableData: VariableData[]
  createdAt?: Date
  updatedAt?: Date
}

export interface PresentationSummary {
  _id: string
  title: string
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

export namespace PresentationDTO {
  export interface Create {
    title?: string
  }

  export interface Update {
    title?: string
    slides?: Slide[]
  }

  export interface Response extends Presentation {}

  export interface List {
    presentations: Presentation[]
    total: number
  }
}

export namespace SlideDTO {
  export interface Update {
    shapes: Shape[]
  }

  export interface Create {
    // Position among the presentation's slides, 0-based; the end when absent.
    // The slides from there on move down one.
    order?: number
    shapes?: Shape[]
    // Restores a deleted slide under its former id, so references to it stay
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
