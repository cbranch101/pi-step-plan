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

Agents in Pi tend to jump into implementation during planning conversations, requiring constant correction. This extension adds a structured plan-then-execute workflow to Pi via three commands: `/plan-start` (constrained discussion mode), `/plan-finish` (generates plan doc from conversation), and `/next-step` (executes one step at a time with approval gates and auto-commit). The done condition is a globally installable Pi package that enforces this loop across any project.

---

## Goals & Success Criteria

- `/plan-start` prevents the agent from writing any files or running bash during a planning conversation
- `/plan-finish` generates a populated plan doc from conversation history and commits it
- `/next-step` finds the next unchecked step, implements it, presents an approval gate, and on approval commits the work and marks the step complete
- The package is installable globally via local path and iterable with `/reload`
- No filename arguments required at execution time — plan file path is configured once

---

## Relevant Files

- `package.json` (add) — Pi package manifest
- `extensions/index.ts` (add) — main extension implementing all three commands
- `dev-plan.md` (add) — this file

---

## Constraints

- Extension must work as a globally installed Pi package via local path
- Plan file path is a single configured location, not passed as an argument to `/next-step`
- `/plan-start` must hard-block `bash`, `write`, and `edit` tool calls — not just instruct the agent
- Commits must be clean and atomic: one commit for the plan file, one per step
- Must support `/reload` for iteration without reinstall

---

## Architecture & Design

- Single extension file exporting a default factory function
- In-memory state tracks: `planMode: boolean`, `activePlanFile: string`, `activeStep: { number, title } | null`
- Plan file path configured via a hardcoded default (`dev-plan.md` relative to cwd) overridable in `.pi/settings.json`
- `tool_call` event handler blocks `bash`/`write`/`edit` when `planMode` is true
- `agent_end` event handler triggers approval dialog when a step is in progress
- On approval, a follow-up command (`/auto-advance`) is queued via `pi.sendUserMessage()` to handle session transition — `ctx.newSession()` is only available in command handlers, not event handlers
- New session is pre-seeded with the plan file content so `/next-step` has full context immediately

---

## Interfaces & Contracts

**Commands registered:**
```
/plan-start               — enters plan mode, augments system prompt, blocks destructive tools
/plan-finish [file]       — exits plan mode, generates plan doc, commits it
/next-step                — finds next ☐ step, sends to agent, arms approval gate on agent_end
/auto-advance             — internal; queued after approval to handle session reset and next step
```

**Plan file step format (read/write):**
```markdown
## Steps
#### Step 1 — Some Title
...

## Step Checklist (implicit — tracked via ☐/☑ in step headings or a checklist block)
```

**Settings shape:**
```json
{ "planFile": "dev-plan.md" }
```

---

## Dependencies

- `@earendil-works/pi-coding-agent` — peer dependency, extension types
- `typebox` — peer dependency, tool parameter schemas

**Outcome:** No runtime deps beyond Pi builtins; `peerDependencies` only.

---

## Risks / Unknowns

- **Approval dialog timing** — `agent_end` fires after all tool calls; need to confirm `ctx.ui.confirm()` is available and doesn't race with Pi returning to idle → validate in Step 3
- **Session handoff** — `ctx.newSession()` can only be called from command handlers; approval gate queues `/auto-advance` as a follow-up, which means a brief window where the old session is still active → verify no state leaks between steps
- **Plan generation quality** — the `/plan-finish` prompt needs to reliably produce well-structured output from varied conversations → may need prompt tuning after first use
- **Step parsing** — extracting step title and body from the markdown requires reliable regex against the template format → test against malformed docs

---

## Decision Log

- **2026-06-01** — Hard-block tools in plan mode rather than relying on system prompt instruction. Rationale: agents ignore instructions under pressure; hard blocking is the only reliable enforcement.
- **2026-06-01** — Single configured plan file path rather than per-command argument. Rationale: eliminates repetitive typing and the risk of pointing at the wrong file mid-session.
- **2026-06-01** — Local path install for iteration, git remote for distribution. Rationale: Pi resolves local paths without copying, so `/reload` is sufficient for the inner loop.

---

## Steps

#### Step 1 — Scaffold package structure

**Recipe**
1) Create `package.json` with Pi package manifest, `pi-package` keyword, and peer dependencies.
2) Create `extensions/index.ts` with empty default export and the three command stubs (`/plan-start`, `/plan-finish`, `/next-step`).
3) Install locally via `pi install ~/code/pi-step-plan` and verify Pi loads the extension on startup.

**Verify**
- [ ] Pi startup shows the extension loaded with no errors
- [ ] `/plan-start`, `/plan-finish`, `/next-step` appear as available commands
- [ ] `/reload` after a no-op edit to `index.ts` reloads cleanly

---

#### Step 2 — Implement `/plan-start` and `/plan-finish`

**Recipe**
1) In `tool_call` handler, block `bash`, `write`, and `edit` when `planMode` is true; notify user of the block.
2) In `before_agent_start`, inject a system prompt addition when `planMode` is true: agent is in planning mode, discussion only.
3) `/plan-start` sets `planMode = true` and notifies user.
4) `/plan-finish` sets `planMode = false`, sends the agent a message instructing it to generate the plan doc from conversation history using the embedded template, writes to the configured path, and commits.

**Verify**
- [ ] In plan mode, any agent attempt to call `bash`/`write`/`edit` is blocked with a user notification
- [ ] `/plan-finish` produces a populated markdown file at the configured path
- [ ] A clean git commit is created containing only the plan file

---

#### Step 3 — Implement `/next-step` with approval gate

**Recipe**
1) `/next-step` reads the configured plan file, finds the first `☐` step, extracts its title and Recipe/Verify/Notes body, and sends it to the agent as a user message.
2) Extension sets `activeStep` in memory when a step is dispatched.
3) `agent_end` handler: if `activeStep` is set, show `ctx.ui.confirm()` approval dialog.
4) On approve: run `git add -A && git commit`, update the plan file to flip `☐ → ☑` for the completed step, clear `activeStep`, then queue `/auto-advance` as a follow-up user message.
5) `/auto-advance` command calls `ctx.newSession()` with setup that injects the plan file content as initial context, then sends `/next-step` into the new session.
6) On reject: clear `activeStep`, notify user to provide feedback and re-run `/next-step` when ready.

**Verify**
- [ ] `/next-step` correctly identifies and dispatches the first unchecked step
- [ ] Approval dialog appears after agent finishes work
- [ ] On approval, plan file is updated and a clean commit is created
- [ ] New session starts automatically, pre-seeded with plan file, with `/next-step` already queued
- [ ] On rejection, state is cleared cleanly and user can re-run

---

## Phase 2 (Future)

- Auto-advance option: after approval, automatically dispatch the next step without manual `/next-step`
- Rejection flow enhancement: prompt "what should change?" and re-send step with feedback appended
- Publish to npm/git for one-command install across machines
