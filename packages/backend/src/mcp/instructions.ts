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
2. create_variable for every value that changes from one PDF to the next. Note each _id: shapes refer to variables by _id, while values are given by name at export.
3. Draw each page with set_page_shapes; touch it up with add_shapes, update_shape, delete_shapes.
4. preview_template, with sample values, to check the result, and hand its link to the user: they see the document and print it from there. Its warnings say what did not fit on a page.

# Geometry
- Every page of a template has the template's page size, in its own units: ${formats}. The PDF page is the same numbers in points.
- A shape's x and y place the top-left corner of its box, relative to its parent group's box, or to the page at the root. Later shapes are drawn over earlier ones.
- In a group with a layout (horizontal, vertical, stack), the children's x and y — and their size along a grow or a stretch — are computed: give them 0. The tools answer with the computed boxes.
- Nothing flows from one page to the next: a shape starting past a page's bottom or right edge, in a group or not — the end of a list grown too long — is left out of the PDF.

# Text
- A text shape holds paragraphes, each a list of runs: { "text": "…" } for literal text, { "type": "variable", "variableId": "<_id>" } for a variable's value. Both take formatting: bold, italic, underline, strikethrough, uppercase, color, fontFamily, fontSize.
- fontSize is a CSS length string: "24px". Unset is ${DEFAULT_FONT_SIZE}px; unset fontFamily is ${DEFAULT_FONT}. list_fonts names the families.
- Text wraps to the box's width and is not measured: make the box tall enough for its longest value, and use a variable's maxLength to bound it.
- A line break is a new paragraph, never "\\n" in a run.
- A run { "type": "page-number", "kind": "current" } writes the number of the page it is on, "kind": "total" how many pages there are — both counted in the PDF, after repeated pages are copied and pages whose condition fails are left out: [{ "text": "Page " }, { "type": "page-number", "kind": "current" }, { "text": " of " }, { "type": "page-number", "kind": "total" }]. It takes formatting as text does.
- To number every page, as a slide number, use set_page_numbering rather than a box on each page: one text box, drawn over every page at the same place. skipFirstPage leaves it off the first page; update_page's hidePageNumber off any other.

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
