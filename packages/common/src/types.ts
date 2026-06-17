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

export type CustomText = {
  text: string;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
};

export type VariableElement = {
  type: 'variable';
  variableId: string; // Reference to VariableData._id
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  children: [{ text: '' }]; // Required by Slate for inline elements
};

export interface Paragraph {
  type: 'paragraph';
  style?: Record<string, string | number>; // CSS styles
  children: (CustomText | VariableElement)[];
}

export interface TextBoxShape extends BaseShape {
  type: 'text'
  paragraphes: Paragraph[]
}

export interface ImageShape extends BaseShape {
  type: 'image'
  imageId: string // Reference to Image document ID
  alt?: string
}

export type Shape = RectangleShape | EllipseShape | TextBoxShape | ImageShape

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
  type : VariableType
  name : string
  value? : VariableValueType
  default? : VariableValueType
  required? : boolean
}

export type VariableType = "string"
export type VariableValueType = string

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
    order?: number
  }
}

export namespace VariableDTO {
  export interface Create {
    type: VariableType
    name: string
    value?: VariableValueType
    default?: VariableValueType
    required?: boolean
  }

  export interface Update {
    type?: VariableType
    name?: string
    value?: VariableValueType
    default?: VariableValueType
    required?: boolean
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

export namespace ExportDTO {
  export interface PdfRequest {
    variableValues?: Record<string, string>
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
