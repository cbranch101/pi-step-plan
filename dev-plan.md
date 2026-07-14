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

# AI Planning Doc: GitHub Integration & Plan Lifecycle Cleanup

---

## Project Summary

Three gaps exist in the current pi-step-plan workflow: completed plans accumulate in `/activate-plan`'s picker with no way to clear them out; there is no GitHub integration — plans produce local commits but no issues or pull requests; and the `finish_step` tool has two state-management bugs that can cause step desync after a reject. This phase adds a plan archival mechanism, GitHub issue/PR tooling gated behind user approval, and fixes to the `finish_step` approve path. The done condition is: completing a plan automatically archives it from the picker, creates reviewed GitHub issues, opens a reviewed PR that closes those issues on merge, and step state is always consistent after approve/reject/tweak cycles.

---

## Goals & Success Criteria

- `/activate-plan` no longer shows plans that have been closed; they are moved to `docs/plans/reference/` on `/plan-close`
- After `/plan-finish` commits the plan doc, the agent drafts one or more GitHub issues framed as problem statements, presents them for user review and iteration, then creates them via `gh` only after approval
- Issue numbers created during `/plan-finish` are stored in state and automatically injected as `closes #N` in the PR body at `/plan-close` time
- The agent drafts the PR title and body at `/plan-close`, presents it for user review and iteration, then opens it via `gh` only after approval
- All `gh` failures (not installed, not authenticated, no remote) are caught and surface a clear error to the user rather than silently failing
- `finish_step` approve path always re-reads state immediately before writing, so stale state can never be written back and a missing plan entry can never silently skip the `currentStep` increment
- `finish_step` validates that it was called for the step currently tracked in state, preventing the agent from calling it spontaneously after a reject and corrupting step progress

---

## Relevant Files

- `extensions/index.ts` (modify) — archive logic in `/plan-close`, two new tools, extended agent prompts in `/plan-finish` and `/plan-close`

---

## Constraints

- `gh` CLI is the sole mechanism for issue and PR creation; the extension does not call the GitHub API directly
- Issue drafting and PR drafting must go through a user-approval gate before any `gh` command runs — no silent creation
- `closes #N` injection is always performed by the extension from stored state, never left to the agent to remember
- The plan file move on `/plan-close` must succeed before state is updated; if rename fails, the command aborts with an error
- Issue creation only happens after the plan doc commit; PR creation only happens after the `/plan-close` cleanup commit

---

## Architecture & Design

- Two new tools registered: `create_github_issues` and `create_pull_request` — follow the `finish_step` pattern (agent calls tool → extension owns the approval gate and side effect)
- `/plan-close` gains two new responsibilities: (1) `fs.rename` the plan file into `docs/plans/reference/`, (2) prompt the agent to call `create_pull_request` after its cleanup commit
- `/plan-finish` gains one new responsibility: prompt the agent to call `create_github_issues` after its plan doc commit
- State shape gains one new field per plan: `githubIssues: number[]` — populated when issues are created, read when the PR is opened
- `docs/plans/reference/` is created at install time (or lazily on first `/plan-close`) with a `.gitkeep`

---

## Interfaces & Contracts

**New tools:**

```
create_github_issues    — agent submits drafted issues for user approval then gh creation
  input: { issues: Array<{ title: string; body: string }> }

create_pull_request     — agent submits drafted PR title/body for user approval then gh creation
  input: { title: string; body: string }
  extension injects: "closes #N" for each stored issue number before showing to user
```

**Updated state shape (`.pi/plan-state.json`):**

```json
{
  "activePlan": "docs/plans/auth-refactor.md",
  "plans": {
    "docs/plans/auth-refactor.md": {
      "currentStep": 3,
      "completedSteps": [1, 2],
      "githubIssues": [42, 43]
    }
  }
}
```

**`/activate-plan` scan scope:** `docs/plans/*.md` only — `docs/plans/reference/` is never scanned. Unchanged.

---

## Dependencies

- `gh` CLI — runtime peer dependency; must be installed and authenticated in the target project environment; no npm package added
- All other dependencies: Unchanged.

**Outcome:** No changes to `package.json`; `gh` is a runtime prerequisite documented in README.

---

## Risks / Unknowns

- **`gh` not available** — `pi.exec("gh", [...])` will throw; tool handlers must catch and surface a clear error rather than leaving the session in a broken state
- **Partial issue approval** — user may approve 2 of 3 drafted issues; only approved+created issue numbers go into state; the PR body must reflect only what was actually created
- **File rename across mounts** — `fs.rename` fails if source and destination are on different filesystems; mitigate by using a copy-then-delete fallback or catching the error and instructing the user
- **Agent forgets to call tools** — the agent might attempt to run `gh` directly rather than calling the tool; mitigate via explicit instruction in the prompt ("do not run gh commands directly; call the tool")

---

## Decision Log

- **2026-07-14** — Archive via file move to `docs/plans/reference/` rather than a `status` field in state. Rationale: simpler state, plans remain human-readable in a discoverable location, no migration needed for existing state files.
- **2026-07-14** — Issue drafting triggered at end of `/plan-finish` (not a separate command). Rationale: the plan doc is fresh in context and the agent can draft issues immediately; a separate command adds friction with no benefit.
- **2026-07-14** — `create_github_issues` and `create_pull_request` as registered tools (not agent-direct CLI). Rationale: the tool pattern gives the extension control over the approval gate and `closes #N` injection, preventing silent or incorrect `gh` invocations.
- **2026-07-14** — Extension injects `closes #N` rather than instructing the agent to do it. Rationale: the agent may forget or get the numbers wrong; the extension reads from state and injects reliably.

---

## Steps

#### Step 1 — Archive closed plans on `/plan-close`

**Recipe**

1. In the `/plan-close` handler in `extensions/index.ts`, after the cleanup commit instruction is sent, use `fs.rename` (with copy-delete fallback on EXDEV) to move the plan file from `docs/plans/<slug>.md` to `docs/plans/reference/<slug>.md`; create `docs/plans/reference/` lazily with `mkdir(..., { recursive: true })` if it does not exist.
2. Update the `writeState` call that clears `activePlan` to happen only after a successful rename.

**Verify**

- [ ] After `/plan-close`, the plan file no longer appears in `docs/plans/` and is present in `docs/plans/reference/`
- [ ] `/activate-plan` picker no longer lists the closed plan
- [ ] If rename fails, the command surfaces an error and does not clear `activePlan` from state

---

#### Step 2 — Add `create_github_issues` tool and extend `/plan-finish`

**Recipe**

1. Register a `create_github_issues` tool in `extensions/index.ts` with input schema `{ issues: Array<{ title: string; body: string }> }`. For each draft issue: display title and body to the user, collect approve/edit/skip via `ctx.ui` interactions, iterate on feedback, then run `gh issue create --title <t> --body <b>` for approved ones. Parse the created issue URL to extract the number and append to `state.plans[planPath].githubIssues`.
2. At the end of the `/plan-finish` agent prompt (after the git commit instruction), add instructions to: read the committed plan, draft one or more GitHub issues framed as problem statements (not plan summaries), and call `create_github_issues` — explicitly prohibiting direct `gh` CLI usage.

**Verify**

- [ ] After `/plan-finish`, the agent calls `create_github_issues` with at least one draft issue
- [ ] Approving an issue runs `gh issue create` and the issue number appears in state
- [ ] Skipping all issues leaves `githubIssues` as an empty array without error

**Notes**

- Issue body should describe *the problem being solved*, not reproduce the plan. The agent prompt should make this framing explicit.

---

#### Step 3 — Add `create_pull_request` tool and extend `/plan-close`

**Recipe**

1. Register a `create_pull_request` tool with input schema `{ title: string; body: string }`. The handler reads `githubIssues` from state for the active plan, appends `\n\ncloses #N` for each to the agent-supplied body, displays the full draft title and body to the user for approval/editing, then runs `gh pr create --title <t> --body <b>` on approval.
2. At the end of the `/plan-close` agent prompt (after the cleanup commit instruction), add instructions to draft a PR title and body and call `create_pull_request` — explicitly prohibiting direct `gh` CLI usage. If no `githubIssues` are stored, the agent should still call the tool; the extension will simply omit the `closes` lines.

**Verify**

- [ ] After `/plan-close`, the agent calls `create_pull_request` with a title and body
- [ ] The displayed PR draft includes `closes #N` for each stored issue number, injected by the extension
- [ ] Approving runs `gh pr create` and a link to the PR is shown to the user
- [ ] If no GitHub issues were stored for the plan, the PR draft is shown without `closes` lines and creation still succeeds

---

#### Step 4 — Fix stale and silent state update in `finish_step` approve path

**Recipe**

1. In the `finish_step` `execute` handler in `extensions/index.ts`, replace the state object used in the approve branch with a fresh `readState(ctx.cwd)` call made immediately after the git commit succeeds — do not reuse the `state` captured at the top of `execute`.
2. After re-reading state, add an explicit error branch: if `planPath` is null or `state.plans[planPath]` is missing, notify the user that state is inconsistent and return an error result rather than silently succeeding.

**Verify**

- [ ] Approving a step after a long tweak session writes the correct `currentStep` even if state was touched externally between the initial read and the approve
- [ ] If `activePlan` is null when the user clicks approve, an error is surfaced and `currentStep` is not modified

**Notes**

- This fixes both Bug 1 (silent skip when guard is false) and Bug 2 (stale state overwrite) with a single change.

---

#### Step 5 — Guard `finish_step` against out-of-context calls

**Recipe**

1. Add an in-memory variable `let activeStepNumber: number | null = null` alongside the existing `planMode` and `revisePlanPath` variables in `extensions/index.ts`.
2. In the `/next-step` and `/resume-step` handlers, set `activeStepNumber = stepNumber` immediately before sending the agent message.
3. At the top of `finish_step` execute, check `activeStepNumber`. If null, return an error result telling the agent it was called outside of an active step dispatch and to stop — do not commit or touch state.
4. On approve, set `activeStepNumber = null` after writing state. On reject, also set `activeStepNumber = null` so the guard resets cleanly.

**Verify**

- [ ] Calling `finish_step` in a session where no `/next-step` was run returns an error and does not commit or update state
- [ ] After a reject, running `/next-step` re-dispatches the same step and `finish_step` accepts it correctly
- [ ] After an approve, `finish_step` called again in the same session is blocked

**Notes**

- In-memory only — no state file changes. Consistent with the existing `planMode` / `revisePlanPath` pattern. If Pi restarts mid-session the guard resets to null, which is fine: the agent's session context is also gone so it cannot spontaneously re-call `finish_step`.

---

#### Step 6 — Add `/plan-adopt` command for pre-created plan docs

**Recipe**

1. Register a `plan-adopt` command in `extensions/index.ts`. In the handler, scan `docs/plans/*.md` for files whose path is not already a key in `state.plans`. If none are found, notify the user and return. If multiple are found, present them via `ctx.ui.select`; if exactly one is found, use it directly.
2. Read the selected file's content, then send the agent a prompt that skips doc generation entirely: review the existing plan with the user, incorporate any feedback by editing the file directly, commit it (`git add -A && git commit -m "Add plan doc: <slug>"`), then draft GitHub issues and call `create_github_issues`. Use the same issue-drafting instructions as in `/plan-finish`.

**Verify**

- [ ] Running `/plan-adopt` with a pre-created `.md` in `docs/plans/` presents it to the agent without any template generation step
- [ ] If no untracked plan files exist, a clear warning is shown and no agent message is sent
- [ ] After the agent commits and calls `create_github_issues`, issue numbers appear in state as they do after `/plan-finish`

**Notes**

- `planMode` does not need to be set — `/plan-adopt` is not a planning session, it's an adoption handoff. The write/edit block does not apply.
- Keep `/plan-finish` unchanged; this command is purely additive.

---

## Phase 2 (Future)

- Surface a `--show-archived` flag on `/activate-plan` to list plans in `docs/plans/reference/` and optionally restore one
- Add a `gh pr merge` flow or webhook listener so the extension can confirm issue closure after merge
- Allow the user to associate an existing GitHub issue (by number) with a plan rather than always creating new ones
