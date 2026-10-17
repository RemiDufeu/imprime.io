import { z } from 'zod/v3'
import type {
  BaseShape,
  BoxStyle,
  CornerRadii,
  CustomText,
  EllipseShape,
  GroupAlign,
  GroupJustify,
  GroupLayoutDirection,
  GroupShape,
  ImageAlign,
  ImageCrop,
  ImageFit,
  ImageShape,
  ListType,
  PageFormatId,
  PageNumberElement,
  PageNumberKind,
  PageNumbering,
  PageRepeat,
  PageSize,
  Paragraph,
  RectangleShape,
  RepeatBinding,
  Shape,
  Sides,
  TextAlign,
  TextBoxShape,
  TextFormatting,
  TextVerticalAlign,
  TemplateFileDTO,
  VariableData,
  VariableElement,
  VariableItem,
  VariableItemField,
  VariableItemValue,
  VariableType,
  VariableValueType,
  VisibilityCondition,
} from '@imprime/common'
import {
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_IMAGE_ALIGN,
  DEFAULT_IMAGE_FIT,
  DEFAULT_LINE_HEIGHT,
  MAX_LIST_LEVEL,
  MAX_PAGE_DIMENSION,
  MIN_PAGE_DIMENSION,
  TEMPLATE_CODE_MAX_LENGTH,
  TEMPLATE_FILE_FORMAT,
  TEMPLATE_FILE_VERSION,
  isValidTemplateCode,
} from '@imprime/common'
import { isObjectIdString } from '../models/mappers.js'

/**
 * Zod mirror of the domain in `@imprime/common`, which has no zod to generate
 * it from. It is both what an agent reads — each `.describe()` ends up in the
 * tool's JSON Schema — and the only check a shape gets: pages store `shapes`
 * as Mixed.
 *
 * Every object is written `z.object({...} satisfies SchemaShape<T>)`, so the
 * compiler sends a domain change here: a field added to T is a missing key, a
 * field removed an excess one, a type changed an assignment error. Enums go
 * through `enumOf`, which asks for every member, and a new member of the Shape
 * union is a missing key of `shapeSchemas`. A bare `z.ZodType<T>` annotation
 * catches none of these: a schema producing less than T still assigns to it —
 * which is also SchemaShape's blind spot for a union nested in a field, so
 * each of those is held to its domain union by `Covers`, at the end.
 */

// One schema per key of T. The input side is `unknown` so that a default can
// fill a key the caller left out (`id`, `fit`): only the output is held to T.
type SchemaShape<T> = { [K in keyof Required<T>]: z.ZodType<T[K], z.ZodTypeDef, unknown> }

// True when every member of the domain union T is something S produces;
// never — so that assigning `true` fails — when T has a member S lacks.
type Covers<T, S extends z.ZodTypeAny> = [T] extends [z.output<S>] ? true : never

// z.enum of exactly the members of T: one left out names itself in the error.
function enumOf<T extends string>() {
  return <const V extends readonly [T, ...T[]]>(
    values: V & ([Exclude<T, V[number]>] extends [never] ? unknown : { missing: Exclude<T, V[number]> }),
  ) => z.enum(values)
}

export const objectIdSchema = z.string().refine(isObjectIdString, 'Not an Imprime id: 24 hexadecimal characters')

export const templateCodeSchema = z.string().refine(
  isValidTemplateCode,
  `A template code is 1 to ${TEMPLATE_CODE_MAX_LENGTH} letters, digits, "-" or "_"`,
)

// What both renderers draw alike: the forms the export's `parseColor` reads.
const colorSchema = z.string().regex(
  /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|none|transparent)$/i,
  'A colour is #rgb, #rrggbb, #rrggbbaa, rgb(r, g, b), rgba(r, g, b, a), "none" or "transparent"',
)

const lengthSchema = z.number().finite().nonnegative()

const itemPathSchema = z.string().min(1)

// ============================================
// Variables
// ============================================

const variableTypeSchema = enumOf<VariableType>()(['string', 'boolean', 'image', 'object-list'])

// Recursive, hence annotated: TypeScript cannot infer a type from its own
// initializer.
export const variableItemSchema: z.ZodType<VariableItem> = z.lazy(() => z.record(variableItemValueSchema))

const variableItemValueSchema = z.union([z.string(), z.boolean(), z.array(variableItemSchema)])

export const variableValueSchema: z.ZodType<VariableValueType> = variableItemValueSchema

export const variableValuesSchema: z.ZodType<Record<string, VariableValueType>> = z.record(variableValueSchema)

export const variableItemFieldSchema: z.ZodType<VariableItemField, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    name: z.string().min(1).describe('Property name, unique within the item'),
    type: variableTypeSchema.describe('Type of the property, as a variable\'s'),
    required: z.boolean().optional().describe('Every item must give this property a value'),
    maxLength: z.number().int().positive().optional().describe('For a string property: most characters a value may have'),
    maxItems: z.number().int().positive().optional().describe('For an object-list property: most items its list may have'),
    itemFields: z.array(variableItemFieldSchema).optional()
      .describe('For an object-list property: the properties of its own items'),
  } satisfies SchemaShape<VariableItemField>).strict()
)

export const variableTypeField = variableTypeSchema.describe(
  'string: text. boolean: drives conditions (visibleWhen). image: a PNG or JPEG data URL, drawn by an image box. ' +
  'object-list: a list of objects whose properties are declared by itemFields, drawn by a repeated group or page.'
)

// ============================================
// Pages
// ============================================

export const pageFormatSchema = enumOf<PageFormatId>()(['a4-portrait', 'a4-landscape', '16:9'])

export const pageSizeSchema = z.object({
  width: z.number().int().min(MIN_PAGE_DIMENSION).max(MAX_PAGE_DIMENSION),
  height: z.number().int().min(MIN_PAGE_DIMENSION).max(MAX_PAGE_DIMENSION),
} satisfies SchemaShape<PageSize>).strict()

export const visibilityConditionSchema = z.object({
  variableId: objectIdSchema.optional()
    .describe('_id of a boolean variable — or, with itemPath, of the list variable an enclosing repeat iterates'),
  itemPath: itemPathSchema.optional()
    .describe('Inside a repeat: dotted path to a boolean property of the current item (see the server instructions)'),
  negate: z.boolean().optional().describe('Show when the value is false instead of true'),
} satisfies SchemaShape<VisibilityCondition>).strict()

export const pageRepeatSchema = z.object({
  variableId: objectIdSchema.optional().describe('_id of an object-list variable'),
} satisfies SchemaShape<PageRepeat>).strict()

// ============================================
// Shapes
// ============================================

const sidesSchema = z.object({
  top: lengthSchema,
  right: lengthSchema,
  bottom: lengthSchema,
  left: lengthSchema,
} satisfies SchemaShape<Sides>).strict()

const cornerRadiiSchema = z.object({
  topLeft: lengthSchema,
  topRight: lengthSchema,
  bottomRight: lengthSchema,
  bottomLeft: lengthSchema,
} satisfies SchemaShape<CornerRadii>).strict()

const repeatBindingSchema = z.object({
  variableId: objectIdSchema.optional()
    .describe('_id of the object-list variable — the outermost repeat\'s, for a repeat nested in another'),
  itemPath: itemPathSchema.optional()
    .describe('Nested in another repeat: dotted path to an object-list property of its item, e.g. "lines"'),
} satisfies SchemaShape<RepeatBinding>).strict()

const baseFields = {
  id: z.string().default('')
    .describe('Unique within the page. Leave out on a new shape: one is generated, and the result lists it'),
  x: z.number().finite().default(0)
    .describe('Left edge of the unrotated box, from the left of the parent group\'s box, or of the page at the root. ' +
      'Computed in a group with a layout'),
  y: z.number().finite().default(0)
    .describe('Top edge of the unrotated box, from the top of the parent group\'s box, or of the page at the root. ' +
      'Computed in a group with a layout'),
  width: lengthSchema,
  height: lengthSchema,
  stroke: colorSchema.optional().describe('Border colour. Unset draws no border'),
  strokeWidth: lengthSchema.optional().describe('Border width'),
  strokeStyle: enumOf<NonNullable<BaseShape['strokeStyle']>>()(['solid', 'dashed', 'dotted']).optional(),
  hidden: z.boolean().optional().describe('Kept in the template, but drawn neither in the editor nor in the PDF'),
  name: z.string().optional().describe('Name in the editor\'s layers panel'),
  visibleWhen: visibilityConditionSchema.optional()
    .describe('Drawn in the PDF only when this boolean holds. A shape left out takes no room in a layout'),
  grow: lengthSchema.optional()
    .describe('In a horizontal or vertical group: share of the free space along that axis (CSS flex-grow)'),
  rotation: z.number().finite().optional()
    .describe('Degrees, clockwise, about the centre of the box. Drawn only: layouts place the unrotated box'),
} satisfies SchemaShape<BaseShape>

const cornerRadiusSchema = z.union([lengthSchema, cornerRadiiSchema])

const boxStyleFields = {
  strokeWidths: sidesSchema.optional().describe('One border width per side, instead of strokeWidth'),
  cornerRadius: cornerRadiusSchema.optional()
    .describe('One radius for every corner, or one per corner. Unset is square'),
} satisfies SchemaShape<BoxStyle>

const textFormattingFields = {
  bold: z.boolean().optional(),
  underline: z.boolean().optional(),
  italic: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  uppercase: z.boolean().optional().describe('Drawn in capitals; the text keeps its case'),
  fontFamily: z.string().min(1).optional().describe(`A family from list_fonts. Unset is ${DEFAULT_FONT}`),
  fontSize: z.string().regex(/^\d+(\.\d+)?px$/, 'A font size is a CSS length in px, such as "24px"').optional()
    .describe(`In page units, written as a CSS length: "24px". Unset is ${DEFAULT_FONT_SIZE}px`),
  color: colorSchema.optional().describe('Unset is black'),
} satisfies SchemaShape<TextFormatting>

const customTextSchema = z.object({
  ...textFormattingFields,
  text: z.string().describe('Literal text, on one line: a new line is a new paragraph'),
} satisfies SchemaShape<CustomText>).strict()

const variableElementSchema = z.object({
  ...textFormattingFields,
  type: z.literal('variable'),
  variableId: objectIdSchema
    .describe('_id of the variable whose value is written here — inside a repeat, of the list variable it iterates'),
  itemPath: itemPathSchema.optional()
    .describe('Inside a repeat: dotted path to the property of the current item to write, e.g. "name" or "lines.label"'),
  children: z.tuple([z.object({ text: z.literal('') }).strict()]).default((): [{ text: '' }] => [{ text: '' }])
    .describe('Always [{ "text": "" }]; may be left out'),
} satisfies SchemaShape<VariableElement>).strict()

const pageNumberElementSchema = z.object({
  ...textFormattingFields,
  type: z.literal('page-number'),
  kind: enumOf<PageNumberKind>()(['current', 'total'])
    .describe('current: the number of the page the text is on. total: how many pages the PDF has'),
  children: z.tuple([z.object({ text: z.literal('') }).strict()]).default((): [{ text: '' }] => [{ text: '' }])
    .describe('Always [{ "text": "" }]; may be left out'),
} satisfies SchemaShape<PageNumberElement>).strict()

const runSchema = z.union([variableElementSchema, pageNumberElementSchema, customTextSchema])

const paragraphSchema = z.object({
  type: z.literal('paragraph'),
  align: enumOf<TextAlign>()(['left', 'center', 'right', 'justify']).optional().describe('Unset is left'),
  lineHeight: z.number().finite().positive().optional()
    .describe(`Multiple of each run's font size. Unset is ${DEFAULT_LINE_HEIGHT}`),
  list: enumOf<ListType>()(['bullet', 'number']).optional()
    .describe('Makes the paragraph a list item. Numbers are counted over consecutive items'),
  indent: z.number().int().min(0).max(MAX_LIST_LEVEL).optional().describe('Nesting level of a list item'),
  children: z.array(runSchema).min(1)
    .describe('Runs of text, literal, a variable\'s value or a page number, each with its own formatting'),
} satisfies SchemaShape<Paragraph>).strict()

const imageAlignSchema = z.object({
  horizontal: enumOf<ImageAlign['horizontal']>()(['left', 'center', 'right']),
  vertical: enumOf<ImageAlign['vertical']>()(['top', 'middle', 'bottom']),
} satisfies SchemaShape<ImageAlign>).strict()

const imageCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
} satisfies SchemaShape<ImageCrop>).strict()

const shapeSchemas = {
  rectangle: z.object({
    ...baseFields,
    ...boxStyleFields,
    type: z.literal('rectangle'),
    fill: colorSchema.optional().describe('Unset is transparent'),
  } satisfies SchemaShape<RectangleShape>).strict(),

  ellipse: z.object({
    ...baseFields,
    type: z.literal('ellipse'),
    fill: colorSchema.optional().describe('Unset is transparent'),
  } satisfies SchemaShape<EllipseShape>).strict(),

  text: z.object({
    ...baseFields,
    type: z.literal('text'),
    paragraphes: z.array(paragraphSchema).min(1).describe('The paragraphs, top to bottom. Text wraps to the box\'s width'),
    verticalAlign: enumOf<TextVerticalAlign>()(['top', 'middle', 'bottom']).optional()
      .describe('Where the paragraphs sit in the box. Unset is top'),
  } satisfies SchemaShape<TextBoxShape>).strict(),

  // `resolvedImage` is written by the export, never authored: left out, so
  // that a caller sending it is told.
  image: z.object({
    ...baseFields,
    type: z.literal('image'),
    imageId: objectIdSchema.optional().describe('_id of an image from upload_image'),
    imageVariable: objectIdSchema.optional()
      .describe('_id of an image variable — inside a repeat, of the list variable it iterates. Wins over imageId'),
    itemPath: itemPathSchema.optional()
      .describe('Inside a repeat: dotted path to an image property of the current item'),
    fit: enumOf<ImageFit>()(['fill', 'contain', 'cover']).default(DEFAULT_IMAGE_FIT)
      .describe(`fill stretches the image to the box, contain shows it whole, cover fills the box and crops. Unset is ${DEFAULT_IMAGE_FIT}`),
    align: imageAlignSchema.default(() => ({ ...DEFAULT_IMAGE_ALIGN }))
      .describe('Where the image sits when its proportions differ from the box\'s. Unset is centred'),
    crop: imageCropSchema.optional().describe('Part of the image shown, in fractions of its size. Unset is all of it'),
    opacity: z.number().min(0).max(1).optional().describe('Unset is opaque'),
    cornerRadius: lengthSchema.optional(),
  } satisfies SchemaShape<Omit<ImageShape, 'resolvedImage'>>).strict(),

  group: z.object({
    ...baseFields,
    ...boxStyleFields,
    type: z.literal('group'),
    children: z.lazy(() => z.array(shapeSchema)).default(() => [])
      .describe('Shapes inside the group, back to front, positioned relative to the group\'s box'),
    layout: enumOf<GroupLayoutDirection>()(['none', 'horizontal', 'vertical', 'stack']).optional()
      .describe('none (unset): children keep their x/y. horizontal/vertical: lined up as a CSS flex row/column, ' +
        'their x/y computed. stack: laid over each other, each aligned by justify (across) and align (down)'),
    justify: enumOf<GroupJustify>()(['start', 'center', 'end', 'space-between', 'space-around']).optional()
      .describe('Along the layout axis. Unset is start'),
    align: enumOf<GroupAlign>()(['start', 'center', 'end', 'stretch']).optional()
      .describe('Across the layout axis. Unset is start'),
    gap: lengthSchema.optional().describe('Space between laid-out children'),
    padding: sidesSchema.optional().describe('Space between the group\'s edge and its laid-out children'),
    hug: z.boolean().optional()
      .describe('horizontal/vertical only: the group\'s size along its axis is its children\'s, gaps and padding — ' +
        'it grows with the copies of a repeat'),
    fill: colorSchema.optional().describe('Background under the children. Unset is transparent'),
    repeat: repeatBindingSchema.optional()
      .describe('Draws the group once per item of a list, each copy a sibling placed by the parent\'s layout ' +
        '(stacked downwards in a free-form parent). The editor shows one copy'),
  } satisfies SchemaShape<GroupShape>).strict(),
} satisfies { [K in Shape['type']]: z.ZodType<Extract<Shape, { type: K }>, z.ZodTypeDef, unknown> }

// A group's children refer back to it through z.lazy, read once parsing
// starts: by then it is defined.
export const shapeSchema: z.ZodType<Shape, z.ZodTypeDef, unknown> = z.discriminatedUnion('type', [
  shapeSchemas.rectangle,
  shapeSchemas.ellipse,
  shapeSchemas.text,
  shapeSchemas.image,
  shapeSchemas.group,
])

// ============================================
// Page numbering
// ============================================

export const pageNumberingSchema = z.object({
  box: shapeSchemas.text.describe(
    'The text box drawn on every page, over its shapes. Its id is replaced by "page-number". Number the page with ' +
    'page-number runs: { "type": "page-number", "kind": "current" } and { "type": "page-number", "kind": "total" }'
  ),
  skipFirstPage: z.boolean().optional()
    .describe('Leave the box off the first page of the PDF, which still counts: the next one shows 2'),
} satisfies SchemaShape<PageNumbering>).strict()

// ============================================
// Template files
// ============================================

// What an import reads, checked whole before anything is written: a file is
// anyone's to hand over. The rules no schema can say — a page size in bounds,
// a variable's default within its limits, an image the export can draw — are
// the services' to check, as for any other write.
const templateFileVariableSchema = z.object({
  _id: objectIdSchema,
  type: variableTypeSchema,
  name: z.string().min(1),
  default: variableValueSchema.optional(),
  required: z.boolean().optional(),
  maxLength: z.number().optional(),
  maxItems: z.number().optional(),
  itemFields: z.array(variableItemFieldSchema).optional(),
} satisfies SchemaShape<VariableData>)

const templateFilePageSchema = z.object({
  shapes: z.array(shapeSchema),
  visibleWhen: visibilityConditionSchema.optional(),
  repeat: pageRepeatSchema.optional(),
  hidePageNumber: z.boolean().optional(),
} satisfies SchemaShape<TemplateFileDTO.FilePage>)

const templateFileImageSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string(),
  originalName: z.string().optional(),
} satisfies SchemaShape<TemplateFileDTO.FileImage>)

export const templateFileSchema = z.object({
  format: z.literal(TEMPLATE_FILE_FORMAT),
  version: z.literal(TEMPLATE_FILE_VERSION),
  title: z.string(),
  code: z.string().optional(),
  pageSize: z.object({ width: z.number(), height: z.number() } satisfies SchemaShape<PageSize>),
  pageNumbering: pageNumberingSchema.optional(),
  variables: z.array(templateFileVariableSchema),
  pages: z.array(templateFilePageSchema).min(1),
  images: z.record(templateFileImageSchema),
} satisfies SchemaShape<TemplateFileDTO.File>)

// A field `update_shape` may remove with null: an optional one — a defaulted
// one (`children`, `x`) would silently come back as its default — or one the
// schema does not know, which can only be dropped.
export function isRemovableShapeField(type: Shape['type'], key: string): boolean {
  const fields: Record<string, z.ZodTypeAny> = shapeSchemas[type].shape
  return !Object.hasOwn(fields, key) || fields[key] instanceof z.ZodOptional
}

// The unions SchemaShape cannot hold to account (see the header): each line
// fails to compile once its domain union gains a member the schema lacks.
const coversRuns: Covers<Paragraph['children'][number], typeof runSchema> = true
const coversCornerRadius: Covers<NonNullable<BoxStyle['cornerRadius']>, typeof cornerRadiusSchema> = true
const coversItemValues: Covers<VariableItemValue, typeof variableItemValueSchema> = true
const coversValues: Covers<VariableValueType, typeof variableItemValueSchema> = true
void [coversRuns, coversCornerRadius, coversItemValues, coversValues]

// Zod's issues, one line each, as an agent can act on them.
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(issue =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
  )
}
