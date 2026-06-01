<!--
AI_DOC_META_GUIDANCE (PERSISTENT) — v4.0

PURPOSE
This document defines a **self-contained implementation plan** executable by humans or AI tools (e.g. Cursor) without prior chat or memory context.
It describes *only* what is required to complete this specific phase of work — no historical or operational padding.

───────────────────────────────
## CORE PRINCIPLES
1. Capture **only what changes**, not what exists already.
2. Focus on **decisions, boundaries, and actions**, not mechanics.
3. Write for **execution** — every statement should inform a concrete task or validation.
4. Avoid redundancy: information appears exactly once.
5. Document **phase scope** clearly; defer unrelated work to a "Future Phase" section.

───────────────────────────────
## STRUCTURAL RULES
- This meta block must remain in all versions of the doc.
- Append new Steps to the end; do not renumber completed ones.
- Each Step must map to one checklist item.
- Remove placeholder comments after first population.
- For interfaces, dependencies, or workflows that are unchanged, simply mark `"Unchanged"` — do not restate.
- Use concise bulleting and line limits per section to maintain readability.

───────────────────────────────
## SECTION RULES

### Project Summary
**Goal:** Define the current phase scope and desired end state.
**Include:**
- 2–4 sentences describing the *problem*, *system impact*, and *done condition* for this phase only.
**Exclude:**
- Long-term context, previous architecture, or future-phase plans.

---

### Goals & Success Criteria
**Goal:** Define measurable outcomes and new capabilities introduced by this phase.
**Include:**
- 3–5 bullets describing success in behavioral or capability terms (e.g. "cross-job imports enabled").
**Exclude:**
- Runtime validation items (those belong in Step "Verify").
- UI or operational descriptions.

---

### Relevant Files
**Goal:** Scope the file-level changes.
**Include:**
- Only files or directories to be created, modified, or deleted.
- Annotate each with action: `(add)`, `(modify)`, `(remove)`.
**Exclude:**
- Unchanged files or configs.

---

### Constraints
**Goal:** Define hard boundaries or external rules that cannot change.
**Include:**
- 3–6 one-line runtime, infrastructure, or policy constraints.
**Exclude:**
- Goals, risks, or success criteria (move elsewhere).
**Merge:** If multiple bullets describe the same limitation, merge into one.

---

### Architecture & Design
**Goal:** Summarize structural deltas introduced by this change.
**Include:**
- ≤5 concise deltas (directory, dependency, build, import, or testability).
- Optional short "Before → After" block or diff.
**Exclude:**
- Full pre-existing system descriptions or unchanged flows.

---

### Interfaces & Contracts
**Goal:** Capture new or modified integration boundaries.
**Include:**
- Only interfaces that change (APIs, data schemas, build workflows, import paths).
- ≤3 code or YAML snippets illustrating format or usage.
**Exclude:**
- Unchanged contracts; instead write "Unchanged."

---

### Dependencies
**Goal:** Describe dependency-level changes and expected lock outcomes.
**Include:**
- Grouped overview (Shared / Job-Specific / Build-Time / Secrets).
- Mention new additions, removals, or expected conflicts.
- End with **Outcome:** 1 line summarizing what successful resolution looks like.
**Exclude:**
- Full version pins or lists.

---

### Risks / Unknowns
**Goal:** Identify and mitigate meaningful technical risks.
**Include:**
- ≤5 risks, each ≤2 lines: "Risk → Mitigation / Validation."
**Exclude:**
- Performance metrics, success criteria, or test details.

---

### Decision Log
**Goal:** Record why key choices were made.
**Include:**
- Each decision ≤3 lines: date, rationale, tradeoff, and alternatives if relevant.
**Exclude:**
- Implementation detail or command syntax.

---

### Steps
Each Step = one atomic unit of work that produces a testable outcome.

#### Step N — <Action-Oriented Title>

**Recipe**
1) Describe *what changes*, not *how to click or run commands*.
2) Reference affected file(s) or function(s).
3) Summarize commands or processes generically.
4) Keep ≤4 bullets total.

**Verify**
- [ ] Behavioral outcome.
- [ ] Integration validation.
- [ ] At most 3 checks total.

**Notes (optional)**
- 1–2 lines: rationale, risk link, or implementation nuance.

---

### Phase N (Future Work)
**Goal:** Record planned follow-up work without diluting current scope.
**Include:**
- ≤3 concise bullets describing deferred actions or future phase intent.
**Exclude:**
- Current-phase work or speculative details.

END AI_DOC_META_GUIDANCE
-->

# AI Planning Doc: pi-step-plan Extension

---

## Project Summary

Agents in Pi tend to jump into implementation during planning conversations, requiring constant correction. This extension adds a structured plan-then-execute workflow to Pi via six commands: `/plan-start` (constrained discussion mode), `/plan-finish` (generates and commits plan doc to `docs/plans/`), `/activate-plan` (select a plan to work on, initializes state), `/next-step` (executes one step at a time with a custom approval/tweak/reject gate and auto-commit), `/auto-advance` (internal session handoff), and `/plan-close` (finalizes execution by updating relevant repo files and committing). The done condition is a globally installable Pi package that enforces this loop across any project.

---

## Goals & Success Criteria

- `/plan-start` prevents the agent from writing any files or running bash during a planning conversation
- `/plan-finish` generates a populated plan doc from conversation history, writes it to `docs/plans/<name>.md`, and commits it
- `/activate-plan` presents a select of available plans and initializes a state file tracking active plan and current step
- `/next-step` reads state to find the current step, sends the full plan + step to the agent, and presents an approve/tweak/reject gate on completion
- `/plan-close` reviews the completed plan and conversation, updates relevant repo files with captured decisions, and commits
- The package is installable globally via local path and iterable with `/reload`

---

## Relevant Files

- `package.json` (add) — Pi package manifest
- `extensions/index.ts` (add) — main extension implementing all commands
- `extensions/approval-component.ts` (add) — custom TUI component for approve/tweak/reject gate
- `docs/plans/` (add) — directory where generated plan markdown files live
- `.pi/plan-state.json` (add) — runtime state file tracking active plan and per-plan progress
- `dev-plan.md` (add) — this file

---

## Constraints

- Extension must work as a globally installed Pi package via local path
- No plan file path arguments at runtime — active plan is always read from state
- `/plan-start` must hard-block `bash`, `write`, and `edit` tool calls — not just instruct the agent
- Commits must be clean and atomic: one commit for the plan file, one per step, one for plan-close updates
- Must support `/reload` for iteration without reinstall
- Step completion is tracked in state only — no `☑`/`☐` markers written to plan markdown

---

## Architecture & Design

- Two extension files: `index.ts` (commands + event handlers) and `approval-component.ts` (pure TUI component)
- In-memory state tracks: `planMode: boolean`, `activeStep: { number, title } | null`
- Persistent state in `.pi/plan-state.json`: active plan path + per-plan `{ currentStep, completedSteps[] }` keyed by plan file path
- Plan files live in `docs/plans/<name>.md`; no check markers — state file is sole source of truth for progress
- `tool_call` event handler blocks `bash`/`write`/`edit` when `planMode` is true
- `agent_end` event handler shows `ApprovalComponent` when `activeStep` is set; tweak leaves `activeStep` set so the gate re-arms automatically on the next `agent_end`
- On approval, `/auto-advance` is queued via `pi.sendUserMessage()` — `ctx.newSession()` is only available in command handlers, not event handlers
- New session is pre-seeded with plan file content so `/next-step` has full context immediately

---

## Interfaces & Contracts

**Commands registered:**

```
/plan-start        — enters plan mode, augments system prompt, blocks destructive tools
/plan-finish       — exits plan mode, agent generates plan doc, writes to docs/plans/<name>.md, commits
/activate-plan     — select from docs/plans/*.md, write/update state file, set currentStep to 1
/next-step         — read state for current step, send full plan + step to agent, arm approval gate
/auto-advance      — internal; update state to next step, new session pre-seeded with plan, queue /next-step
/plan-close        — review plan + thread, update relevant repo files, commit
```

**Plan file step format (read-only at runtime):**

```markdown
## Steps

#### Step 1 — Some Title

**Recipe**
...

**Verify**
...
```

**State file shape (`.pi/plan-state.json`):**

```json
{
  "activePlan": "docs/plans/auth-refactor.md",
  "plans": {
    "docs/plans/auth-refactor.md": {
      "currentStep": 3,
      "completedSteps": [1, 2]
    },
    "docs/plans/api-redesign.md": {
      "currentStep": 1,
      "completedSteps": []
    }
  }
}
```

---

## Dependencies

- `@earendil-works/pi-coding-agent` — peer dependency, extension types
- `typebox` — peer dependency, tool parameter schemas

**Outcome:** No runtime deps beyond Pi builtins; `peerDependencies` only.

---

## Risks / Unknowns

- **Approval gate timing** — `agent_end` fires after all tool calls; `ctx.ui.custom()` must be available here and not race with Pi returning to idle → validate in Step 5
- **Session handoff** — `ctx.newSession()` can only be called from command handlers; approval gate queues `/auto-advance` as a follow-up → verify no state leaks between steps
- **Plan generation quality** — the `/plan-finish` prompt needs to reliably produce well-structured output from varied conversations → may need prompt tuning after first use
- **State file corruption** — if a session is killed mid-step, `currentStep` may point to a step that was partially implemented → acceptable risk for now, user can manually edit state

---

## Decision Log

- **2026-06-01** — Hard-block tools in plan mode rather than relying on system prompt instruction. Rationale: agents ignore instructions under pressure; hard blocking is the only reliable enforcement.
- **2026-06-01** — State file (not markdown markers) tracks step completion. Rationale: keeps plan docs as clean, readable documents; supports switching between multiple active plans without corrupting markdown.
- **2026-06-01** — Plans live in `docs/plans/` not root. Rationale: keeps repo root clean, makes plans discoverable by `/activate-plan` without configuration.
- **2026-06-01** — Local path install for iteration, git remote for distribution. Rationale: Pi resolves local paths without copying, so `/reload` is sufficient for the inner loop.

---

## Steps

#### Step 1 — Scaffold package structure

**Recipe**

1. Create `package.json` with Pi package manifest, `pi-package` keyword, and peer dependencies.
2. Create `extensions/index.ts` with empty default export and the three command stubs (`/plan-start`, `/plan-finish`, `/next-step`).
3. Install locally via `pi install ~/code/pi-step-plan` and verify Pi loads the extension on startup.

**Verify**

- [ ] Pi startup shows the extension loaded with no errors
- [ ] `/plan-start`, `/plan-finish`, `/next-step` appear as available commands
- [ ] `/reload` after a no-op edit to `index.ts` reloads cleanly

---

#### Step 2 — Implement `/plan-start` and `/plan-finish`

**Recipe**

1. In `tool_call` handler, block `bash`, `write`, and `edit` when `planMode` is true; notify user of the block.
2. In `before_agent_start`, inject a system prompt addition when `planMode` is true: agent is in planning mode, discussion only.
3. `/plan-start` sets `planMode = true` and notifies user.
4. `/plan-finish` sets `planMode = false`, sends the agent a message instructing it to generate the plan doc from conversation history using the embedded template, writes to the configured path, and commits.

**Verify**

- [ ] In plan mode, any agent attempt to call `bash`/`write`/`edit` is blocked with a user notification
- [ ] `/plan-finish` produces a populated markdown file at the configured path
- [ ] A clean git commit is created containing only the plan file

---

#### Step 3 — Implement `/next-step` with approval gate

**Recipe**

1. `/next-step` reads the configured plan file, finds the first `☐` step, extracts its title and Recipe/Verify/Notes body, and sends it to the agent as a user message.
2. Extension sets `activeStep` in memory when a step is dispatched.
3. `agent_end` handler: if `activeStep` is set, show `ctx.ui.confirm()` approval dialog.
4. On approve: run `git add -A && git commit`, update the plan file to flip `☐ → ☑` for the completed step, clear `activeStep`, then queue `/auto-advance` as a follow-up user message.
5. `/auto-advance` command calls `ctx.newSession()` with setup that injects the plan file content as initial context, then sends `/next-step` into the new session.
6. On reject: clear `activeStep`, notify user to provide feedback and re-run `/next-step` when ready.

**Verify**

- [ ] `/next-step` correctly identifies and dispatches the first unchecked step
- [ ] Approval dialog appears after agent finishes work
- [ ] On approval, plan file is updated and a clean commit is created
- [ ] New session starts automatically, pre-seeded with plan file, with `/next-step` already queued
- [ ] On rejection, state is cleared cleanly and user can re-run

---

#### Step 4 — Add state file, `/activate-plan`, and refactor `/next-step` and `/auto-advance` to be state-driven

**Recipe**

1. Add `readState(cwd)` and `writeState(cwd, state)` helpers that read/write `.pi/plan-state.json` with shape `{ activePlan, plans: { [path]: { currentStep, completedSteps[] } } }`. Create `docs/plans/` directory if absent.
2. Implement `/activate-plan`: scan `docs/plans/` for `*.md` files, present via `ctx.ui.select()`, write/update state setting `activePlan` to chosen path and initializing `{ currentStep: 1, completedSteps: [] }` if not already tracked.
3. Refactor `/next-step`: remove markdown `☐` scanning; instead read `activePlan` and `currentStep` from state, read that step's content from the plan markdown by step number, send full plan + "implement Step N" to agent, set `activeStep: { number, title }` in memory.
4. Refactor `/auto-advance`: after approval, increment `currentStep` in state and write state before starting the new session. Remove `markStepComplete` markdown mutation.
5. Update `/plan-finish` to instruct the agent to write the plan to `docs/plans/<name>.md` (agent picks a slug from the plan title) rather than `dev-plan.md`.

**Verify**

- [ ] `/activate-plan` lists `docs/plans/` files and writes state correctly
- [ ] `/next-step` dispatches the step number from state, not from `☐` scanning
- [ ] Completing a step increments `currentStep` in state; re-running `/next-step` dispatches the next step
- [ ] Switching plans via `/activate-plan` preserves progress on the previously active plan
- [ ] `/plan-finish` writes the plan under `docs/plans/`

---

#### Step 5 — Build `ApprovalComponent` TUI class

**Recipe**

1. Create `extensions/approval-component.ts` exporting `ApprovalAction` (`"approve" | "tweak" | "reject"`) and `ApprovalComponent` implementing the `Component` interface from `@earendil-works/pi-tui`.
2. Constructor accepts `diffLines: string[]` (pre-truncated, ready to render) and `onDone: (action: ApprovalAction) => void`.
3. `render()` outputs the diff lines, then a blank line, then the three options with a `>` cursor on the selected one, styled with the theme.
4. `handleInput()`: up/down moves the cursor, Enter calls `onDone()` with the selected action.

**Verify**

- [ ] Component renders diff block and three options without errors
- [ ] Arrow keys move selection, Enter on each option calls `onDone` with the correct action

**Notes**

- Keep this file free of any `pi` or `ctx` references — it is pure TUI, testable in isolation
- No input handling needed inside the component; tweak feedback is collected separately via `ctx.ui.input()` after the component closes

---

#### Step 6 — Wire `ApprovalComponent` into `agent_end` and implement all three outcome flows

**Recipe**

1. In `agent_end`, replace the `ctx.ui.confirm()` call with: run `pi.exec("git", ["diff", "--stat"])`, parse the output into file-change lines, truncate to 10 lines (append `  ...and N more files` if truncated), pass to `ApprovalComponent`, and open via `ctx.ui.custom()`.
2. On **approve**: parse the full `git diff --stat` output to extract changed filenames; derive a commit message formatted as `Step N: update foo.ts, bar.ts[, and N more]`; run `git add -A && git commit -m <message>`; update state to add current step to `completedSteps`; clear `activeStep`; queue `/auto-advance` via `pi.sendUserMessage`.
3. On **tweak**: call `ctx.ui.input("What do you want to change?")` to collect feedback, then send it as a `followUp` user message via `pi.sendUserMessage`; do NOT clear `activeStep` — it remains set so `agent_end` fires again after the agent finishes, re-entering this same flow with a fresh diff.
4. On **reject**: clear `activeStep`; call `ctx.ui.notify` telling the user to give feedback and re-run `/next-step`.

**Verify**

- [ ] Approval UI shows truncated diff and three options in a single view after agent finishes a step
- [ ] Approve commits with a message derived from the diff filenames, not the step title
- [ ] Tweak sends feedback to the agent and the approval UI reappears after the next `agent_end` with a fresh diff
- [ ] Reject clears state cleanly and notifies the user

**Notes**

- Commit message derivation: split `git diff --stat` lines, filter to lines matching `filename |`, extract names, join first 3 with `, and N more` suffix if needed
- The tweak loop requires zero extra state — `activeStep` staying set is the entire mechanism

---

#### Step 7 — Implement `/plan-close`

**Recipe**

1. `/plan-close` reads the active plan file path from state and the plan markdown content.
2. Sends the agent a message with the full plan content + instruction to: review the plan, review the current conversation thread, identify any other files in the repo that should be updated with decisions or outcomes from this plan (READMEs, architecture docs, AGENTS.md, etc.), and make those updates.
3. After the agent finishes, commit all changes with message `plan-close: <plan name>`.
4. Update state to clear `activePlan` (or mark the plan as closed).

**Verify**

- [ ] `/plan-close` sends the agent the plan content and a clear instruction to update relevant repo files
- [ ] All file updates are committed in a single clean commit
- [ ] State is updated to reflect the plan is no longer active

---

## Phase 2 (Future)

- Auto-advance option: after approval, automatically dispatch the next step without manual `/next-step`
- Rejection flow enhancement: prompt "what should change?" and re-send step with feedback appended
- Publish to npm/git for one-command install across machines
