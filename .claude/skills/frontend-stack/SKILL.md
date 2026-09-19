---
name: frontend-stack
description: The libraries the Imprime editor is built on and how each is configured — React 19 with the React Compiler, Vite, Ant Design 5, react-router 7, Slate, Zustand, better-auth — plus the TypeScript and ESLint strictness that applies, and the rules for reaching for a new dependency. Use when writing or reviewing any frontend code, picking a UI component, or adding a package.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Frontend Stack

`packages/frontend` — React 19 + Vite 7 + Ant Design 5. The editor canvas is
hand-written SVG; everything around it is antd.

## React 19 and the React Compiler

**`babel-plugin-react-compiler` is enabled** in `vite.config.ts`:

```ts
react({ babel: { plugins: [['babel-plugin-react-compiler']] } })
```

This is the single most consequential fact about writing components here. The
compiler memoizes automatically, so:

- **Do not add `useMemo` / `useCallback` / `React.memo` by reflex.** The compiler
  already does it, and hand-memoization mostly adds noise and a stale-deps risk.
- The exceptions that remain are the ones the compiler cannot infer: a value
  whose *identity* must be stable for a non-React reason — `useMemo` holding a
  Slate editor instance (`SVGText.tsx`), a ref, a subscription key.
- The compiler bails out of any component it cannot prove safe. Mutating props
  or state in place silently opts a component out of optimisation *and* breaks
  Zustand's reference equality. Write pure render functions.
- `StrictMode` is on (`main.tsx`), so effects run twice in dev. An effect that
  misbehaves on the second run has a missing cleanup.

`eslint-plugin-react-hooks` is configured with `recommended-latest`, so the
rules of hooks and `exhaustive-deps` are enforced (one `exhaustive-deps` warning
is currently outstanding in `HomePage.tsx`).

## Ant Design 5

The default for every piece of UI that is not the canvas. Before hand-rolling a
control, check antd has none — `Dropdown`, `Tooltip`, `ColorPicker`, `Segmented`,
`InputNumber`, `Popconfirm` are all already in use.

Three configuration facts that are easy to break:

1. **`@ant-design/v5-patch-for-react-19` must stay the first import in
   `main.tsx`**, before anything else. antd 5 predates React 19; without the
   patch, `message`, `notification` and `Modal` statics silently no-op.
2. **`<App>` wraps the tree** inside `ConfigProvider` (`AntdProvider.tsx`). It is
   what makes the `message`/`modal`/`notification` hooks work under React 19.
   Slices import the static `message` from `antd` (`VariableSlice`,
   `ShapeCreationSlice`) — that works because of the patch, but inside a
   component prefer `App.useApp()`.
3. **`cssVar: true`** is set on the theme, which is what publishes every design
   token as a `--ant-*` CSS custom property for the stylesheets to consume.
   Removing it breaks most of the CSS at once. → skill `frontend-styling`

The theme itself lives in `src/config/antd-theme.ts`: brand colour `#4f46e5`,
`borderRadius: 8`, a shared `boxShadow`, and per-component overrides for
`Button`, `Input`, `Card`, `Typography`, `Layout`. Change a visual constant
there, not in a component.

Icons come from `@ant-design/icons` (v6). Locale is pinned to `en_US`.

## Routing — react-router 7

`App.tsx`, `BrowserRouter`, with a two-level guard structure:

```
/login, /oauth/consent, /verify-email, /forgot-password, /reset-password   public
<RequireAuth>            layout route: session check, spinner, redirect
  <Layout>               antd shell: header (hidden on the editor) + <Outlet/>
    index                HomePage
    editor/:id           EditorPage
    settings/api-keys    ApiKeysPage
```

`RequireAuth` is a **layout route** rendering `<Outlet/>`, not a wrapper
component — a new protected page is added as a child route, and inherits the
guard for free. It redirects with `state={{ from: location.pathname }}`; keep
that if you touch it.

## Auth — better-auth

`src/auth/authClient.ts` creates the client with the `apiKeyClient()` plugin and
re-exports `signIn`, `signUp`, `signOut`, `useSession`. Components read session
state through `useSession()`; nothing calls `/api/auth` directly.

Base URLs come from `src/config.ts`: relative in production (the backend serves
the built frontend on the same origin), `VITE_API_URL` in development.
better-auth needs an absolute URL, hence the `window.location.origin` fallback.

## Slate

Rich text inside a text box only. `TextBoxEditor.tsx`, `withVariables.ts`,
`VariableBlock.tsx`, and the `RichTextEditorSlice`. Each `SVGText` owns its own
editor instance via `useMemo`; the *active* one is held in the store so toolbars
can act on it. Slate document shape is the domain type `Paragraph[]`, not a
Slate-specific format — that is what lets the PDF renderer walk the same data.
→ skill `variable-system`

## State — Zustand 5

One store, eleven slices. → skill `editor-store`

## TypeScript and lint

`tsconfig.app.json` is strict beyond the defaults, and the settings do real work:

| Option | Consequence |
|---|---|
| `strict` | the baseline |
| `noUnusedLocals` / `noUnusedParameters` | an unused `catch (err)` binding is an error — prefix with `_` or use bare `catch {}` |
| `verbatimModuleSyntax` | type-only imports **must** be `import type { X }` |
| `erasableSyntaxOnly` | no enums, no parameter properties, no namespaces |
| `noFallthroughCasesInSwitch` | every `case` breaks or returns |
| `moduleResolution: bundler` | no `.js` extensions on relative imports (unlike backend/common) |

ESLint is a flat config: `js.recommended`, `tseslint.recommended`,
`reactHooks.recommended-latest`, `reactRefresh.vite`. `no-explicit-any` and
`no-unused-vars` are errors. Lint is not in CI and currently reports 11 errors;
the rule is **no new findings**, not zero.

## Dependency quirk

`zustand`, `slate`, `slate-dom` and `slate-react` are declared in the **root**
`package.json`, not in `packages/frontend/package.json`, and resolve through
workspace hoisting. The frontend would not install standalone. If you add a
frontend-only dependency, put it in `packages/frontend/package.json` rather than
extending that pattern.

## Adding a dependency

In order of preference: use antd; use something already installed; write it.
A new package needs a reason that survives "antd has no equivalent and this is
more than fifty lines". There is no bundle-size budget enforced anywhere, which
is a reason for restraint, not permission.

## Related

- Skills: `frontend-structure`, `frontend-styling`, `editor-store`, `render-parity`
- Commands: `/verify`, `/review`
