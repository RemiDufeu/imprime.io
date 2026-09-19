---
name: frontend-styling
description: CSS conventions of the Imprime editor — the antd design-token variables that replace hardcoded colours, the local --space-* scale, co-located plain-CSS stylesheets with kebab-case classes, state via modifier classes, when inline styles are legitimate, and how to override antd. Use when writing or reviewing any styling, adding a .css file, or theming.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Frontend Styling

Plain CSS files, co-located with their component. No CSS-in-JS, no CSS modules,
no preprocessor, no Tailwind, no BEM. The discipline comes entirely from **two
token systems** rather than from tooling.

## Token system 1 — antd design tokens

`AntdProvider` sets `cssVar: true` on `ConfigProvider`, which publishes every
Ant Design token as a `--ant-*` CSS custom property. The stylesheets consume
them directly:

```css
.floating-panel {
    background: var(--ant-color-bg-container);
    box-shadow: var(--ant-box-shadow-secondary);
    border-radius: var(--ant-border-radius);
    border: var(--ant-line-width) var(--ant-line-type) var(--ant-color-border);
}
```

**There are no hardcoded colours in the stylesheets** — the only three
exceptions are deliberate translucent overlays in `SlideList.css`
(`rgba(0,0,0,0.6)` for a hover scrim and two `rgba(...)` action-button
backgrounds), where a token would be opaque.

The vocabulary actually in use, so you match it rather than inventing:

| Purpose | Token |
|---|---|
| Brand / active / focus | `--ant-color-primary`, `--ant-color-primary-bg` |
| Surfaces | `--ant-color-bg-container` |
| Hover and subtle fills | `--ant-color-fill`, `--ant-color-fill-secondary`, `--ant-color-fill-tertiary`, `--ant-color-fill-quaternary` |
| Text | `--ant-color-text`, `--ant-color-text-secondary`, `--ant-color-text-tertiary` |
| Borders | `--ant-color-border`, `--ant-line-width`, `--ant-line-type` |
| Radius | `--ant-border-radius`, `--ant-border-radius-sm`, `--ant-border-radius-xs` |
| Elevation | `--ant-box-shadow`, `--ant-box-shadow-secondary` |
| Motion | `--ant-motion-duration-mid` |

Writing `#4f46e5`, `#fff` or `1px solid #d9d9d9` in a stylesheet is the mistake
this system exists to prevent: those values stop tracking the theme in
`src/config/antd-theme.ts` the moment it changes.

To change a brand value, edit `antd-theme.ts` — not a stylesheet.

## Token system 2 — the local spacing scale

`src/index.css` defines the project's own scale and display font:

```css
:root {
    --space-xs: 4px;   --space-s: 8px;    --space-m: 16px;
    --space-l: 24px;   --space-xl: 48px;  --space-xxl: 96px;  --space-xxxl: 128px;
    --font-display: "Courier Prime", "Courier New", monospace;
}
```

Use these for `padding`, `margin` and `gap`. Raw pixels survive only for values
below the scale's floor — icon-sized `gap: 4px`, `padding: 2px` inside a dense
row — and for genuinely one-off layout numbers (`padding: 120px 350px 20px` on
the canvas gutter). If a value is 8, 16 or 24, it should be a token.

Note the naming: **`--space-l`, not `--space-lg`**. `FullScreen.css:7` currently
writes `var(--space-lg)`, which is undefined — the declaration is dropped and
that padding silently does nothing. Worth fixing, and worth not copying.

`--font-display` is applied in `index.css` to every heading level, including
antd's `.ant-typography` heading variants. Headings do not need styling in
component CSS.

## Class naming and state

Kebab-case, prefixed with the component's own name, no nesting convention:

```css
.shape-tree-panel { }
.shape-tree-panel-header { }
.shape-tree-row { }
.shape-tree-row-label { }
```

State is a **modifier class toggled from the component**, combined with the base
class — never a separate stylesheet or an inline branch:

```css
.shape-tree-row:hover        { background-color: var(--ant-color-fill-secondary); }
.shape-tree-row.selected     { background-color: var(--ant-color-primary-bg); }
.shape-tree-row.hidden       { opacity: 0.5; }
.shape-tree-row.drop-into    { outline: 2px solid var(--ant-color-primary); }
```

Reveal-on-hover is done by pairing the two (`opacity: 0` → `1`, or
`display: none` → `inline-flex` under `.parent:hover .child`), which is how the
drag handle and the row actions work.

Per-instance values that CSS cannot know are passed as a **custom property on
the element**, not as an inline rule — `.shape-tree-row` reads
`--depth-offset` for its drop indicator.

## Inline styles

Legitimate, and used, for three things only:

1. **Computed geometry** — SVG coordinates, a canvas sized from `zoom`, a
   container whose height is measured. `SlideCanvas` styles its wrapper inline
   because `width`/`height` are props.
2. **One-off layout on an antd component** where a class would exist solely to
   hold two declarations — `<Content style={{ flex: 1, overflow: 'auto' }}>`.
3. **Values read from the antd token object in JS** via `theme.useToken()`, when
   the element is rendered by a library that does not take a className —
   `VariableBlock.tsx` builds its chip style from `token.colorPrimary` and
   `token.colorBgContainer`.

Anything static, reusable or stateful belongs in the stylesheet. A growing
`style={{ }}` object is a stylesheet that has not been written yet.

`theme.useToken()` is the JS-side counterpart of the `--ant-*` variables; reach
for it rather than importing a colour constant.

## Overriding antd

Scope the override to your own class, and keep `!important` rare — currently six
occurrences in the whole codebase, all fighting antd's button specificity:

```css
.toolbar-container .btn:hover {
    color: var(--ant-color-primary) !important;
    background-color: transparent !important;
}

.shape-tree-row-actions .ant-btn {   /* no !important needed here */
    width: 22px; height: 22px; padding: 0;
}
```

Targeting a bare `.ant-*` selector at file scope leaks to every antd component
on the page. Always prefix with a class you own.

If an override recurs across components, it belongs in `antd-theme.ts` as a
component token (`Button.controlHeight`, `Card.borderRadiusLG`, …) instead.

## Stylesheet mechanics

- One `.css` per component folder, same base name, imported at the top of the
  `.tsx`. `Toolbars.css` is the one shared sheet, at the common ancestor of the
  toolbar, zoom bar and context bar.
- Global order in `main.tsx` matters: `antd/dist/reset.css`, then `index.css`,
  then `fonts.css`.
- `fonts.css` declares `@font-face` against
  `packages/common/src/assets/fonts/` — the same files the PDF renderer
  registers. A font added for the editor must be added there too, or the PDF
  falls back silently. → skill `pdf-export`
- Indentation is inconsistent across files (2 and 4 spaces). Match the file you
  are editing; do not reformat.
- There is no dark mode. `index.css` has an empty
  `@media (prefers-color-scheme: light)` block — a placeholder, not a feature.
  Do not add colours assuming a theme switch exists.

## Checklist for new styling

1. Is there an antd component that already does this? Use it.
2. Colours, borders, radii, shadows → `var(--ant-*)`.
3. Spacing → `var(--space-*)`; raw px only below 8px or for one-off layout.
4. Static or stateful → stylesheet, class prefixed with the component name.
5. Computed or geometric → inline style, or a custom property on the element.
6. Overriding antd → prefix with your own class; prefer a theme token if it
   recurs.

## Related

- Skills: `frontend-stack`, `frontend-structure`
- Commands: `/review`
