import { DEFAULT_FONT, DEFAULT_FONT_SIZE, PAGE_FORMATS } from '@imprime/common'

const formats = PAGE_FORMATS.map(format => `${format.label} is ${format.size.width} × ${format.size.height}`).join(', ')

/**
 * What an MCP client is told once, when it connects: the document model the
 * tools' schemas spell out field by field, put together. Kept to what an agent
 * cannot read off a schema — how the pieces combine.
 */
export const MCP_INSTRUCTIONS = `\
Imprime turns a template — pages of shapes, some bound to variables — into a PDF, given values for those variables.

# Workflow
1. create_template (or list_templates / get_template to work on an existing one).
2. create_variable for every value that changes from one PDF to the next. Note each _id: shapes refer to variables by _id, while values are given by name, to preview_template or to the print API.
3. Draw each page with set_page_shapes, built from groups with a layout (see Layout); touch it up with add_shapes, update_shape, delete_shapes.
4. Number the pages, when they are to be, with set_page_numbering (see Page numbers).
5. preview_template, with sample values: it returns images of the PDF's pages. Look at them — shapes overlapping, text cut off or running out of its box, an empty box, a misaligned column — fix what is wrong, and preview again. Then hand its link to the user: they see the document and print it from there. Its warnings say what did not fit on a page.

# Working on what exists
- duplicate_template copies a whole template, to start a variant without touching it; duplicate_page copies a page right after it, to reuse its layout.
- get_page reads one page — lighter than get_template on a long document.
- move_shapes puts shapes into a group, takes them out, or restacks them, each kept where it is on the page: rather than rewriting a group's children.
- copy_shapes copies shapes to another page, or another template, under new ids; their variables become the target's of the same name and type.
- get_image gives an uploaded image's natural size: give its box the same proportions, or fit "contain".

# Geometry
- Every page of a template has the template's page size, in its own units: ${formats}. The PDF page is the same numbers in points.
- A shape's x and y place the top-left corner of its box, relative to its parent group's box, or to the page at the root. Later shapes are drawn over earlier ones.
- In a group with a layout (horizontal, vertical, stack), the children's x and y — and their size along a grow or a stretch — are computed: give them 0. The tools answer with the computed boxes.
- Nothing flows from one page to the next: a shape starting past a page's bottom or right edge, in a group or not — the end of a list grown too long — is left out of the PDF.

# Layout
Lay content out with groups rather than with x and y: a layout still holds when a value or a list comes out longer than the sample.
- A group is a subset of CSS flexbox. layout "vertical" is a column, "horizontal" a row, "stack" lays its children over each other, "none" (unset) leaves them at their x and y.
- In a row or a column, the children follow each other along the axis, gap apart, inside the padding. justify spreads them along it (start, center, end, space-between, space-around). align places them across (start, center, end) — or "stretch" sizes them to the group across: the usual choice in a column, whose children then take its width.
- Along the axis, a child keeps its own size, unless it has grow: the children with grow share the room left, in proportion, as CSS flex: 1. A spacer is an empty group with grow: 1.
- A group is as large as its own width and height. hug: true sizes it, along its axis only, to its children, gaps and padding: a column grows taller with what it holds (give it any height, say 0). Across, a group never fits its content: a row keeps its height whatever its children — give it the height of its tallest child, and align "stretch" to make every child that tall.
- In a group that hugs, grow does nothing — no room is left to share: its children have their own sizes, or hug themselves.
- Text is not measured, in a layout either: a text box is as tall as its height. Size it for its longest value.
- In a stack, justify places each child horizontally and align vertically; "stretch" there sets the height only.
- A group paints its own background and border (fill, stroke, strokeWidth, cornerRadius): no rectangle behind it is needed — a card is a group with a fill and padding.
- A shape left out by its condition takes no room: what follows it moves up. rotation is drawn only: a layout places the unturned box.
- Patterns:
  - A page in a flow: one vertical group at the root, at the margins, the page's size less the margins, align "stretch", a gap between blocks. Header, then a body with grow: 1, then the footer: the footer stays at the bottom however little the body holds.
  - A label and its value: a horizontal group of fixed height, align "center", a gap; the label at its own width, the value with grow: 1.
  - A table: a vertical group, hug: true, align "stretch"; a header row, then a row group with repeat on the list. Every row is a horizontal group of fixed height with align "stretch", its cells — a group with padding around a text, or a text alone — at the same widths, or the same grow, in every row: the columns line up.
  - A list of cards: the card (a vertical group, hug: true) with repeat, inside a vertical group with hug: true and a gap.

# Text
- A text shape holds paragraphes, each a list of runs: { "text": "…" } for literal text, { "type": "variable", "variableId": "<_id>" } for a variable's value. Both take formatting: bold, italic, underline, strikethrough, uppercase, color, fontFamily, fontSize.
- fontSize is a CSS length string: "24px". Unset is ${DEFAULT_FONT_SIZE}px; unset fontFamily is ${DEFAULT_FONT}. list_fonts names the families.
- Text wraps to the box's width and is not measured: make the box tall enough for its longest value, and use a variable's maxLength to bound it.
- A line break is a new paragraph, never "\\n" in a run.
- A run { "type": "page-number", "kind": "current" } writes the number of the page it is on, "kind": "total" how many pages there are, both counted in the PDF (see Page numbers). It takes formatting as text does.

# Page numbers
- To number the pages — pagination, a number in the footer, "page X of Y" — call set_page_numbering with { "pageNumbering": {} }: the number shows at the bottom right of every page. Never type the numbers, nor draw a box on each page: how many pages a PDF has depends on its data — a repeated page makes one per item, a page whose condition fails is left out — and a typed number is wrong as soon as it does.
- The numbering is one text box, the template's, drawn over every page at the same place. Change it with set_page_numbering too, the fields you leave out kept: { "box": { "paragraphes": […] } } rewords it, { "box": { "x": …, "y": … } } moves it, fontSize and color go on its runs. "Page 2 of 5" is [{ "text": "Page " }, { "type": "page-number", "kind": "current" }, { "text": " of " }, { "type": "page-number", "kind": "total" }].
- skipFirstPage: true leaves it off the first page — a cover — which still counts: the next one shows 2. update_page with hidePageNumber: true leaves it off any other page, and off every copy of a repeated one.
- A page-number run works in any text too — "Page 3" in a heading — counted the same way.

# Variables
- string: text. boolean: conditions. image: a PNG or JPEG data URL, drawn by an image shape's imageVariable. object-list: a list of objects, whose properties itemFields declares.
- visibleWhen (any shape, or a page) shows it only when a boolean is exactly true (false with negate). A missing value hides it both ways: give an optional boolean a default.
- A group with repeat is drawn once per item of an object-list, each copy a sibling placed by the parent's layout. Put it in a vertical group with hug: true: the copies stack, and the group grows with them — and, inside a vertical layout of its own, pushes down what follows. A page can repeat too (add_page, update_page), once per item.
- Inside a repeat, a run, an image, a condition or a nested repeat reads the current item through itemPath, keeping the list variable's _id as variableId: a run { "type": "variable", "variableId": "<lines _id>", "itemPath": "label" }. In a repeat nested on the item's "tasks" property ({ "variableId": "<lines _id>", "itemPath": "tasks" }), paths go through it: "tasks.title".

# Colours and images
- Colours: #rrggbb, #rrggbbaa or rgba(…) for translucency, "none" or "transparent". Unset fill is transparent; unset stroke draws no border.
- upload_image stores a fixed image for imageId; an image that changes per PDF is an image variable.

# The editor
The user may have the template open in Imprime's editor, which does not reload on its own: tell them to reload it to see your changes, and that editing it before reloading overwrites them.
`
