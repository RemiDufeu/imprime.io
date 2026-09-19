# Imprime harness

Project-scoped agents, skills and commands for Claude Code. Adapted from the
idea behind [ECC](https://github.com/affaan-m/ECC) — specialised agents, skills
as loadable domain knowledge, commands as operator entry points — but written
against *this* codebase rather than a generic stack.

Everything here is checked in and shared. `.claude/local/` (checkpoints, session
notes) is gitignored.

## Skills

Domain knowledge, loaded when relevant. Read `render-parity` before touching
anything visual.

| Skill | Covers |
|---|---|
| `imprime-architecture` | package graph, where things live, backend layering, the verification gate |
| `render-parity` | the dual-renderer contract; what belongs in `common/rendering`; the authored/resolved asymmetry |
| `shape-model` | the `Shape` union, containers, coordinate spaces, ids, `resolveShapes` |
| `variable-system` | variable types, id↔name indirection, resolution and defaults, if/for semantics |
| `editor-store` | slice decomposition, cross-slice typing, selectors, the single write path, immutable shape-tree helpers |
| `frontend-stack` | React 19 + React Compiler, antd 5, Vite, react-router, Slate, better-auth, TS/ESLint strictness |
| `frontend-structure` | `pages/` vs `components/`, folder-per-component, co-located CSS, hooks, utils, naming |
| `frontend-styling` | antd `--ant-*` tokens, the `--space-*` scale, class naming and state modifiers, inline styles, overriding antd |
| `api-surfaces` | REST · SDK · MCP · editor wrapper; auth, ownership, the error contract |
| `backend-stack` | Express 5, Mongoose 8, better-auth, MCP SDK, ESM/Node16 rules, env loading |
| `backend-structure` | route → service → model layering, why there is no repository layer, singleton wiring |
| `backend-routes` | how to write a handler: mounting, guards, status codes, and the state of request validation |
| `backend-services` | class shape, constructor injection, thrown error classes, the recurring service patterns |
| `backend-persistence` | schema anatomy, the mapper direction rules, why update mappers whitelist, cascades |
| `pdf-export` | `@react-pdf/renderer` traps, fonts, the 30s timeout, the download store |

## Agents

| Agent | Use for |
|---|---|
| `imprime-explorer` | tracing how an existing feature works, end to end |
| `imprime-architect` | designing a change across packages and surfaces, before writing it |
| `imprime-reviewer` | TypeScript, React, Zustand and backend-layering review |
| `render-parity-auditor` | editor vs PDF divergence |
| `api-surface-reviewer` | auth, ownership, error contract, surface drift |
| `export-debugger` | a PDF that is wrong, empty, misplaced or unlike the editor |

## Commands

**Daily**

| Command | Does |
|---|---|
| `/verify` | the quality gate, in dependency order |
| `/review` | dispatches the right reviewer agents at the diff, consolidates |
| `/parity` | editor-vs-PDF audit, plus the manual comparison steps |
| `/export-debug` | diagnose a bad PDF, stage by stage |

**Building**

| Command | Does |
|---|---|
| `/feature` | explore → design → approve → implement → verify → review |
| `/new-shape` | add a shape or container type across every site the union forces |
| `/new-endpoint` | add a capability across all four API surfaces |

**Workflow** (adapted from ECC)

| Command | Does |
|---|---|
| `/checkpoint` | create, verify or list gate-verified work markers |
| `/save-session` | write resumable session state |
| `/resume-session` | load it and re-orient against the current repo |
| `/update-docs` | sync README and `.env.example` from the code |
| `/pr` | verify, review, and write a description that says what to check by hand |

## Adding to the harness

`AUTHORING.md` holds the conventions these files follow — the skill description
formula, the body shape of each kind of file, the argument and verdict
conventions, templates and smell tests. Read it before adding a skill, a command
or an agent, and add the new file to the right table above.

## Why this shape

Three properties of this repository drove the selection:

1. **Every document is drawn twice** — once as SVG in the editor, once through
   `@react-pdf/renderer` on export. Nothing in the build compares them, so the
   parity skill, the auditor agent and `/parity` exist to cover what the type
   system structurally cannot.
2. **There are no tests.** The gate is build + typecheck + lint, so the harness
   leans on type rigour and always names what is left unverified instead of
   implying a green build means working code.
3. **One domain, four surfaces.** REST, SDK, MCP and the editor store all
   project `common/src/types.ts`. Commands walk all four rather than leaving the
   fourth to be noticed in production.

## Notes on the adaptation

- ECC's per-agent "Prompt Defense Baseline" preamble is not carried over — it
  targets agents handling untrusted third-party content, which these do not. Add
  it back if any agent starts consuming external input.
- ECC ships hooks, rules and scripts as well. None are here: this project's
  conventions fit in skills, and there is no formatter to enforce.
