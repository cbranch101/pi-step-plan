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
## PLAN EXECUTION MODEL
- This plan is a binding work order, not a brainstorming seed or starting point.
- The full plan provides context, constraints, contracts, and sequencing.
- The active Step defines the complete authorized change set.
- Later Steps explain where the system is going but do not authorize early implementation.
- Do not add behavior, files, routes, APIs, abstractions, dependencies, UI, tests, or docs beyond what the active Step requires.
- Do not round out, future-proof, scaffold ahead, beautify, or fill perceived gaps.
- If the active Step seems underspecified or requires a decision not already made in the plan, stop and ask rather than inventing missing product or design choices.

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
1) List the complete authorized changes for this Step, not how to click or run commands.
2) Reference affected file(s) or function(s) when that narrows the authorized scope.
3) Summarize commands or processes generically when needed for validation.
4) Keep ≤4 bullets total; changes not required by these bullets are out of scope for this Step.

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
review_issue_outline    — agent submits title+summary list; user iterates on shape before full bodies are written
  input: { issues: Array<{ title: string; summary: string }> }
  output: approved issues list (agent uses it to draft full bodies before calling create_github_issues)

create_github_issues    — agent submits fully drafted issues for per-issue approval then gh creation
  input: { issues: Array<{ title: string; body: string }> }
  must only be called after review_issue_outline has been approved

create_pull_request     — agent submits drafted PR title/body and line-anchored review comments for one approval gate, then gh creation + review posting
  input: {
    title: string;
    body: string;
    issueNumbers: number[];
    comments: Array<{ body: string; path: string; lines: string }>
  }
  lines format: "42" (single line) or "42-58" (inclusive range); tool parses into GitHub start_line/line
  extension injects: "closes #N" for each issue number before showing to user
  on approve: create PR, then post one pull-request review with the inline comments via gh api
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

- Issue body should describe _the problem being solved_, not reproduce the plan. The agent prompt should make this framing explicit.

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
4. On approve, set `activeStepNumber = null` after writing state. On reject, do NOT clear `activeStepNumber` — the step is still active; the agent stops and waits, but must be able to call `finish_step` again once the user gives new direction.

**Verify**

- [ ] Calling `finish_step` in a session where no `/next-step` was run returns an error and does not commit or update state
- [ ] After a reject, the agent can call `finish_step` again directly (no `/next-step` or `/resume-step` required) because `activeStepNumber` is preserved
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

#### Step 7 — Add `review_issue_outline` tool and wire it before `create_github_issues`

**Recipe**

1. Register a `review_issue_outline` tool in `extensions/index.ts` with input schema `{ issues: Array<{ title: string; summary: string }> }`. The handler renders all titles and one-line summaries together in a single display block, then collects free-form feedback via `ctx.ui` (approve / request changes). If the user requests changes, send the feedback back to the agent as a tool result asking it to redraft the outline and call the tool again; repeat until the user approves. Return the final approved list as the tool result so the agent can use it as input for `create_github_issues`.
2. Update the `/plan-finish` agent prompt added in Step 2 to call `review_issue_outline` first with titles and one-line summaries, wait for approval, then expand each approved item into a full issue body and call `create_github_issues`. Add an explicit instruction: do not call `create_github_issues` until `review_issue_outline` returns an approved result.
3. Apply the same two-step sequence to the `/plan-adopt` agent prompt added in Step 6.

**Verify**

- [ ] After `/plan-finish`, the agent calls `review_issue_outline` before `create_github_issues` — the outline is displayed and iterated before any full body is drafted
- [ ] Requesting changes in the outline UI causes the agent to redraft and re-present the outline without creating any issues
- [ ] Once the outline is approved, the agent expands it and calls `create_github_issues` with full bodies for only the approved tickets

**Notes**

- The outline step is purely a granularity gate — no GitHub API calls happen until `create_github_issues` runs.
- Step 2 remains the authoritative implementation of `create_github_issues`; this step only adds the upstream gate and updates the agent prompt ordering.

---

#### Step 8 — Add feature branch creation to `/plan-finish`/`/plan-adopt` agent flow and fix `create_pull_request` issue number passing

**Recipe**

1. Update the `/plan-finish` agent prompt to add a step immediately after slug selection: run `git checkout -b feature/<slug> main` before writing the plan doc. All subsequent writes and commits happen on that branch.
2. Update the `/plan-adopt` agent prompt to add the same branch creation step — after reading the plan file and determining the slug from its filename, run `git checkout -b feature/<slug> main` before making any commits.
3. Add `issueNumbers: Type.Array(Type.Number())` to the `create_pull_request` input schema. Remove the `state.activePlan` lookup from its handler and use `params.issueNumbers` directly to build the `closes #N` lines. Update the `/plan-close` agent prompt to instruct the agent to pass the issue numbers it received from `create_github_issues` when calling `create_pull_request`.

**Verify**

- [ ] After `/plan-finish`, the working branch is `feature/<slug>` and the plan doc commit appears on it
- [ ] After `/plan-adopt`, the working branch is `feature/<slug>` and the adopted plan doc commit appears on it
- [ ] After `/plan-close`, the PR draft includes `closes #N` for each issue number the agent passed to `create_pull_request`

---

#### Step 9 — Commit `plan-state.json` with the step (reorder `finish_step` approve path)

**Recipe**

1. In the `finish_step` approve branch in `extensions/index.ts`, move the state update so it runs **before** `git add` / `git commit`: re-read state (`readState`), append `currentStep` to `completedSteps` if needed, bump `currentStep`, `writeState`, then `git add -A` and `git commit -m <approved message>`.
2. Remove the post-commit state write. Keep the existing inconsistent-state error if `activePlan` is null or missing from `plans` — that check now runs before commit. Clear `activeStepNumber` only after a successful commit, same as today.
3. Do not add commit-failure rollback logic. If commit fails, return the error as today and leave the updated state file on disk for the user to resolve.

**Verify**

- [x] Approving a step leaves a clean working tree — `.pi/plan-state.json` is included in the step commit, not left dirty afterward
- [x] The step commit contains both the step's code changes and the advanced `currentStep` / `completedSteps` in `.pi/plan-state.json`
- [x] Reject and tweak paths are unchanged (no state write, no commit)

**Notes**

- This depends on pi-lens formatting being settled before `finish_step` runs. Use deferred-safe setup: in `~/.pi-lens/config.json`, set `"format": { "mode": "immediate" }` so format does not run at `agent_end` after the commit. That config is user-owned; this package does not write or enforce it.
- Step 4's "re-read before write" requirement still applies — only the relative order vs git commit changes (write state, then commit).

---

#### Step 10 — Enable pi-lens immediate format in global lens config

**Recipe**

1. Open `~/.pi-lens/config.json` (create it if missing).
2. Set format mode to immediate so files are formatted after each write/edit instead of at `agent_end` after `finish_step` commits:

```json
{
  "format": {
    "mode": "immediate"
  }
}
```

3. Merge with any existing keys in that file; do not wipe unrelated lens settings.

**Verify**

- [x] `~/.pi-lens/config.json` contains `"format": { "mode": "immediate" }`
- [ ] After a write/edit in a Pi session with pi-lens loaded, formatting lands before the next tool call (not deferred until after `finish_step`)

**Notes**

- This is user-global lens config, not project settings and not `~/.pi/agent/settings.json`.
- Complements Step 9: immediate format prevents post-commit style churn; Step 9 prevents `plan-state.json` from hanging dirty after approve.

---

#### Step 11 — Structured PR body + line-anchored review comments

**Recipe**

1. Update the `/plan-close` agent prompt so PR drafting follows a fixed body template — detail is welcome in Goal and Concepts & decisions; keep Systems and Test plan tighter:
   - **Goal** — overview of what this PR delivers and why it matters; enough context that a reviewer who has not read the plan can orient (not limited to 1–2 sentences).
   - **Concepts & decisions** — substantive design story drawn from the plan Decision Log / Architecture deltas; each decision may be multi-paragraph (rationale, tradeoff, alternatives when relevant). Do not dump the full plan or step recipes.
   - **Systems** — major modules/commands/tools involved and their role (not a file list).
   - **Test plan** — 2–4 behavioral checks worth running.
     Exclude: commit-by-commit narrative, file walkthroughs. Pushback-prone points that belong on a specific hunk go in `comments`, not the body.
2. Extend `create_pull_request` with `comments: Array<{ body: string; path: string; lines: string }>` (empty array allowed). `lines` is `"42"` or `"42-58"` (inclusive); the tool parses that into GitHub `line` / `start_line` and rejects invalid forms. Before any `gh` call, show one confirmation with title, full body (with injected `closes #N`), and each planned comment as `path:lines` + body. On decline with feedback, return it so the agent can revise title/body/comments and call again.
3. On approval: run `gh pr create`, resolve PR number + head commit SHA, then post **one** pull-request review (`event: COMMENT`, `side: RIGHT`) via `gh api` with all inline comments. Comments must target lines present in the PR diff. If PR creation succeeds but the review fails, return the PR URL and the error; instruct the agent to retry only the review/comments (do not recreate the PR). Heuristic for comments: close alternatives, intentional quirks, contract/state-shape changes, things that look like bugs but aren’t — skip routine mechanics and anything that cannot be anchored to a diff hunk.

**Verify**

- [x] After `/plan-close`, the PR draft shown for approval uses the Goal / Concepts & decisions / Systems / Test plan structure
- [x] The approval UI shows each line-anchored comment (`path` + `lines` + body) alongside title and body; approving creates the PR and attaches those comments on the diff
- [x] Approving with an empty comments list still creates the PR successfully
- [x] If review posting fails after PR creation, the tool reports the PR URL and error and the agent can retry comments without opening a second PR

**Notes**

- Body = detailed orientation map; comments = line-anchored pushback flags only. Untethered/top-level PR comments are out of scope.
- One approval covers the whole package before any GitHub side effects.
- Step 3/8 remain the base `create_pull_request` implementation; this step replaces the vague “concise body” prompt and adds structured body guidance plus anchored `comments`.

---

## Phase 2 (Future)

- Surface a `--show-archived` flag on `/activate-plan` to list plans in `docs/plans/reference/` and optionally restore one
- Add a `gh pr merge` flow or webhook listener so the extension can confirm issue closure after merge
- Allow the user to associate an existing GitHub issue (by number) with a plan rather than always creating new ones
