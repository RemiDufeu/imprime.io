# Writing harness files

How to add a skill, a command or an agent to `.claude/` so that it matches what
is already here. The conventions below are descriptive: they were read off the
fifteen skills, twelve commands and six agents in this directory, not invented
for this document.

## Which one are you writing?

| You want to | Write a | Lives in |
|---|---|---|
| record how part of this codebase works, so it loads when relevant | **skill** | `skills/<name>/SKILL.md` |
| give yourself an entry point you type — a procedure with steps and an output shape | **command** | `commands/<name>.md` |
| hand a bounded job to a separate context with its own tools | **agent** | `agents/<name>.md` |

The three compose: a command sequences steps and dispatches agents, an agent
reads skills, a skill is the knowledge both rely on. When unsure, it is usually
a skill — knowledge outlives the procedure built on it.

The test for a skill: it is **true regardless of the task**. "How the `Shape`
union is projected across packages" is a skill; "add a shape type" is the
command that walks it.

## Skills

### Frontmatter

```yaml
---
name: variable-system            # kebab-case, identical to the directory name
description: <see the formula below>
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---
```

`metadata` is local bookkeeping — no tooling reads it. Existing skills were
adapted from ECC and say so; a skill you write from scratch should say something
truthful or drop the block.

### The description is the whole triggering mechanism

Until a skill fires, its description is the *only* part of it in context. It
decides whether the skill is ever loaded, so it carries two halves:

```
<what it covers — the actual subjects, em-dash introduced, comma-listed>.
Use when <concrete trigger: real directory paths and the verbs of a request>.
```

The first half answers "does this file hold my answer?", the second "is now the
moment?". Compare:

- ✗ `Knowledge about the frontend styling conventions.`
- ✓ `CSS conventions of the Imprime editor — the antd design-token variables
  that replace hardcoded colours, the local --space-* scale, co-located plain-CSS
  stylesheets with kebab-case classes, state via modifier classes, when inline
  styles are legitimate, and how to override antd. Use when writing or reviewing
  any styling, adding a .css file, or theming.`

Name real paths (`packages/backend/src/routes`, `models/`, `shapeTree.ts`). Path
names are what a request actually mentions.

### Body shape

1. **H1**, two to four words, title case.
2. **Opening paragraph**, two to five lines: the single load-bearing fact and the
   file that owns it. Never "This skill covers…".
3. **A map table** where there is a set of sites — `| Module | Owns |`,
   `| Editor | Export |`, `| Package | Role |`.
4. **The rules**, one section each, with real symbol and file names.
5. **A negative section.** A house habit, and the most useful part of these
   files: `## What stays renderer-local`, `## There is no repository layer`,
   `## What a service does not own`. The reader's wrong assumption lives there.
6. **A bolded heuristic** wherever there is a judgement call, phrased as a
   question the reader can apply: `**Test for "does this belong in common?"** —
   if you are about to write a number … the other renderer would need the same
   one to match.`
7. **Known risks / known gaps**, when the topic has traps that typecheck cannot
   see.
8. **`## Related`** last, as bare lists — `Skills:`, `Commands:`, `Agents:` —
   naming only files that exist.

Inline cross-references use the arrow form: `→ skill backend-structure`,
`→ command /export-debug`.

110 to 220 lines. Under ~80 and it is probably a section of an existing skill;
over ~250 and it is two skills.

### Write what the code does today

This repository has no tests, so a skill that states an aspiration reads as a
guarantee and there is nothing to contradict it. The existing ones are blunt
about gaps — "the honest state of request validation", "lint is advisory and
currently red", "the export path has no static safety at all". Keep that. A
skill that lies is worse than no skill.

### Do not overlap

Read the table in `README.md` first. If two skills name the same file as the
owner of a rule, one of them is wrong — every rule has exactly one home. Extend
the existing skill rather than adding a neighbour to it.

## Commands

### Frontmatter

```yaml
---
description: <one sentence, imperative, with an em-dash clause listing the steps>
argument-hint: "[diff|full|<shape type>] (default: diff)"
---
```

`description` appears in the `/` menu; `argument-hint` appears after the name.
Quote the hint, list the modes, name the default.

### Body shape

1. **H1**, then two to four lines on **why the command exists** — in this repo
   that is almost always *what the gate cannot catch*.
2. **`## Modes`**, if it takes one, one bullet per mode with when to use it.
3. **`## Process`**, numbered steps. Steps name the agent to invoke, the file to
   read, or the shell command to run — not "analyse the change".
4. **`## Output`**, a fenced `markdown` block skeleton. Without it the result is
   unactionable prose.
5. **A verdict vocabulary**, all caps, three values: `PASS | DRIFT | BLOCK`,
   `VERIFIED | FAILED`.
6. **A guard line** naming the failure mode the command exists to prevent, in the
   imperative — `/parity` closes with: *Never report PASS on a visual change
   without having run, or handed over, the manual comparison. Reading two files
   that look consistent is not evidence.*
7. **`## Related`** last, same form as a skill.

60 to 90 lines.

### Arguments

Nothing here uses `$ARGUMENTS` or `$1`. The convention is prose: `argument-hint`
declares the shape, the body refers to "the chosen scope" and lets the model read
the argument. Claude Code does support literal substitution — use it only when an
argument must be interpolated into a shell command verbatim, and stay with prose
otherwise.

### A command that verifies must say what it did not verify

The gate here is build + typecheck + lint. Any command whose subject is visual,
behavioural or PDF-shaped ends by naming the manual check that remains, with the
exact command and what to look at. `/verify`, `/parity` and `/pr` all do this.

## Agents

```yaml
---
name: render-parity-auditor
description: <what it does — when to use it>. Reports findings only.
tools: Read, Grep, Glob, Bash
model: sonnet
---
```

The description ends with the capability disclaimer — `Reports findings only.`
or `Read-only.` — so the caller knows what comes back. `tools` is the minimum
that does the job; the read-only reviewers get `Read, Grep, Glob, Bash` and
nothing else. All six run on `sonnet`.

The body opens with the same shape every time: *You \<do X\>. You do not \<Y\>.*
Then what to look for, ordered by severity, then the output format with severity
levels. 80 to 170 lines.

## After you add one

1. **`README.md`** — add the row to the right table. That file is the human
   index; an unlisted skill is invisible to a reader even though Claude finds it.
2. **`../CLAUDE.md`** — only if the addition encodes an *invariant*. Add the
   numbered entry with its `→ skill <name>` pointer. A skill that merely
   describes libraries does not belong in that list.
3. **Start a new session** to pick up a new command in the `/` menu.
4. **Checked in or not** — everything in `.claude/` is committed except
   `local/` and `settings.local.json`, both gitignored. Checkpoints and session
   notes go under `local/`.

## Templates

Skill:

````markdown
---
name: <kebab-case>
description: <subjects, em-dash listed>. Use when <paths and verbs>.
---

# <Title Case>

<The load-bearing fact, and the file that owns it. Two to five lines.>

## <The map>

| <Site> | <Owns> |
|---|---|

## <The rules>

## What this is not / what stays elsewhere

<The reader's likely wrong assumption, corrected.>

## Checklist

1. …

## Known risks

- <trap the compiler cannot see>

## Related

- Skills: `…`
- Commands: `/…`
- Agents: `…`
````

Command:

````markdown
---
description: <imperative sentence — the steps>
argument-hint: "[mode|mode] (default: mode)"
---

# <Title>

<Why this command exists — what the gate cannot catch. Two to four lines.>

## Modes

- **`mode`** (default) — …

## Process

1. <invoke agent | read file | run command>
2. …

## Output

```markdown
# <Report title> — <scope>

## Findings

## Left unverified

## Verdict
PASS | DRIFT | BLOCK
```

<The guard line: the failure mode this command prevents.>

## Related

- Skills: `…`
- Agents: `…`
- Commands: `/…`
````

## Smell tests

- A skill description that names no path — it will not trigger.
- A skill body that repeats `CLAUDE.md` verbatim — point at it instead.
- A skill with no negative section — you have probably not captured what is
  surprising about the topic.
- Two skills claiming the same rule — the rule has one owner.
- A command with no `## Output` — its result will not be actionable.
- A command step saying "verify it works" without the command to run — it will
  be skipped.
- An agent description that does not say what it will *not* do — it will edit
  code you did not want edited.
