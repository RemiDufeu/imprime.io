---
name: frontend-structure
description: How Imprime's frontend files are organised — the top-level directories and what each admits, the folder-per-component convention with co-located CSS, when a component is promoted out of a page, where hooks and utils live, barrels, and naming. Use when creating a file, deciding where something belongs, or reviewing a change that adds files.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Frontend Structure

```
src/
  main.tsx            mount + provider chain (antd patch import must stay first)
  App.tsx             routes only
  config.ts           API base URL resolution
  index.css           design tokens + global type styles
  fonts.css           @font-face, pointing at packages/common/src/assets/fonts

  api/                the SDK client, wrapped as *API objects
  auth/               better-auth client
  components/         reusable across pages
  config/             antd theme
  constants/          canvas dimensions
  pages/              one folder per route
  providers/          React context providers
  store/editor/       the Zustand store, one file per slice
  utils/              pure functions, no React
```

The distinction that carries the most weight is **`pages/` versus
`components/`**.

## `components/` — shared

Something goes in `components/` when **more than one page uses it**, or it is
plausibly generic. Current contents:

| Folder | Why it is shared |
|---|---|
| `slide/` | `SlideCanvas` and the SVG renderers — used by the editor *and* by slide thumbnails in the slide list |
| `TextEditor/` | Slate editor, used from inside `SVGText` |
| `Layout/` | `FullScreen`, `RegularPageContainer` — page shells |
| `common/` | genuinely generic widgets (`DebouncedColorPicker`) |
| `Feedback/` | `SpinnerFullScreen` |
| `RequireAuth.tsx` | the route guard |

A component used by exactly one page stays inside that page's folder. Promote it
when the second consumer appears — not in anticipation of one.

## `pages/` — per route

One folder per route, and the page owns its subtree:

```
pages/EditorPage/
  EditorPage.tsx
  EditorPage.css
  components/                      used only by EditorPage
    LayeringToolbar/
    SlideEditor/
      SlideEditor.tsx  SlideEditor.css  Toolbars.css
      useEditorShortcuts.ts
      CanvasArea/
      FloatingPanels/
        Panel/  ShapeTreePanel/  SlideList/  ZoomBar.tsx
      TopBar/
        TopBar.tsx  TopBar.css
        Toolbar/  DropdownTrigger/  Context-toolbar/
```

Nesting mirrors the UI, and depth is allowed to go deep — `ShapeTreePanel/ShapeRow/`
is fine because a `ShapeRow` means nothing outside a `ShapeTreePanel`. The rule
is *a folder contains what only it uses*, not a depth limit.

## Folder-per-component

A component gets its own folder when it has anything alongside it — a
stylesheet, subcomponents, types. Otherwise it is a bare file.

```
FloatingPanels/Panel/FloatingPanel.tsx + FloatingPanel.css     folder: has CSS
FloatingPanels/ZoomBar.tsx                                     bare: nothing else
ShapeTreePanel/{ShapeTreePanel.tsx, .css, types.ts,
                ShapeTreeUIContext.tsx, ShapeRow/, SiblingList/, RenameInput/}
```

**CSS is co-located with the component that owns it**, same folder, same base
name. `Toolbars.css` is the one deliberate exception: styles shared by the
toolbar, the zoom bar and the context bar, so it sits at their common ancestor.

## Barrels

Used sparingly, and only two shapes of them:

- `index.ts` re-exporting a directory's public surface: `components/common/`,
  `providers/`, `config/`.
- `index.tsx` **as** the component, when the folder name already says what it is:
  `pages/Layout/index.tsx`, `FloatingPanels/SlideList/index.tsx`,
  `TopBar/Context-toolbar/index.tsx` (which is the dispatcher over
  `contextBarType`).

Do not add a barrel per folder. Most components are imported by their real path.

## Hooks

There is no `hooks/` directory. A hook lives next to what uses it:
`useEditorShortcuts.ts` sits in `SlideEditor/` because that is its only consumer.
Create `hooks/` only when a hook is genuinely shared across pages.

Hooks that need store state **outside a React subscription** use
`useEditorStore.getState()` — `useEditorShortcuts` reads it inside a
`keydown` listener, where subscribing would re-register the listener on every
change. That is the sanctioned use; do not use `getState()` in render.

## `utils/` — pure, no React

| File | Contents |
|---|---|
| `shapeTree.ts` | immutable shape-tree traversal and manipulation |
| `groupLayout.ts` | `reflowGroups` over the authored tree |
| `transform.ts` | resize maths (`resizeRect`, `ResizeHandle`) |

Nothing here imports React or the store; they take data and return data, which
is what lets slices call them directly. Anything needing hooks is a hook, not a
util. Logic the **PDF renderer also needs** does not belong here at all — it
belongs in `packages/common/src/rendering/`. → skill `render-parity`

## Naming

- Components and their files: `PascalCase.tsx`, file name = exported component.
- Hooks: `useThing.ts`. Utils and config: `camelCase.ts`.
- Store slices: `ThingSlice.tsx`, exporting `ThingSlice` (the interface) and
  `createThingSlice`. They are `.tsx` by convention even without JSX — match it.
- CSS class names: kebab-case, matching the component (`.floating-panel`,
  `.shape-tree-panel`). No BEM, no CSS modules.
- SVG renderers: `SVG<ShapeType>.tsx`.
- Folders: `PascalCase` for component folders, lowercase for the top-level
  concerns (`api`, `auth`, `utils`, `store`). `Context-toolbar` is an
  inconsistency that predates the convention — do not copy it.

## Where a new file goes

| You are adding | It goes |
|---|---|
| a new route | `pages/<Name>Page/`, plus a `<Route>` in `App.tsx` under `RequireAuth` if protected |
| UI used by one page | that page's `components/` |
| UI used by two pages | `src/components/` |
| a shape renderer | `components/slide/svg/SVG<Type>.tsx` |
| editor state | a slice in `store/editor/` (→ `editor-store`) |
| a pure helper | `utils/`, or `packages/common/src/rendering/` if the PDF needs it too |
| a hook | next to its consumer |
| styles | a `.css` next to the component, using the existing tokens (→ `frontend-styling`) |

## Related

- Skills: `frontend-stack`, `frontend-styling`, `editor-store`
- Commands: `/new-shape`, `/feature`
