<!--
AI_DOC_META_GUIDANCE (PERSISTENT) — v4.0

PURPOSE
This document defines a self-contained implementation plan executable by humans or AI tools
without prior chat or memory context. It describes only what is required to complete this
specific phase of work.

CORE PRINCIPLES
1. Capture only what changes, not what exists already.
2. Focus on decisions, boundaries, and actions, not mechanics.
3. Write for execution — every statement should inform a concrete task or validation.
4. Avoid redundancy: information appears exactly once.
5. Document phase scope clearly; defer unrelated work to a "Future Phase" section.

PLAN EXECUTION MODEL
- This plan is a binding work order, not a brainstorming seed or starting point.
- The full plan provides context, constraints, contracts, and sequencing.
- The active Step defines the complete authorized change set.
- Later Steps explain where the system is going but do not authorize early implementation.
- Do not add behavior, files, routes, APIs, abstractions, dependencies, UI, tests, or docs beyond what the active Step requires.
- Do not round out, future-proof, scaffold ahead, beautify, or fill perceived gaps.
- If the active Step seems underspecified or requires a decision not already made in the plan, stop and ask rather than inventing missing product or design choices.

STRUCTURAL RULES
- This meta block must remain in all versions of the doc.
- Append new Steps to the end; do not renumber completed ones.
- Remove placeholder comments after first population.
- For interfaces, dependencies, or workflows that are unchanged, simply mark "Unchanged."

END AI_DOC_META_GUIDANCE
-->

# AI Planning Doc: Plan Submit Lifecycle

---

## Project Summary

The current `/plan-close` command submits the PR and immediately archives the plan, leaving no way to push follow-up commits (review feedback, CI fixes, overlooked changes) into the same PR. This phase introduces a two-stage lifecycle: `/plan-submit` replaces the PR-creation role of `/plan-close` and keeps the plan active, while a redesigned `/plan-close` becomes a merge-gated teardown that runs only after the PR has been merged. A new `get_active_pr` tool provides the branch-to-PR lookup both commands depend on.

---

## Goals & Success Criteria

- Running `/plan-submit` creates the PR and leaves the plan fully active so subsequent `/modify-plan` + `/next-step` cycles push commits into the same PR.
- Running `/plan-close` before the PR is merged is blocked with a clear message; after merge it archives the plan and clears state.
- Re-running `/plan-submit` on a branch that already has an open PR skips PR creation and notifies the user instead of re-triggering the cleanup ceremony.
- The agent can call `get_active_pr` at any point to retrieve current PR metadata (number, URL, state, merged status) from the active branch.

---

## Relevant Files

- `extensions/index.ts` (modify) — all command and tool registrations; sole file changed in this phase.

---

## Constraints

- Do not store the PR number in `plan-state.json`. PR lookup must use `gh pr view` against the current branch, which is already stored in plan state.
- The cleanup ceremony (update repo docs, write cleanup commit, call `create_pull_request`) stays entirely in `/plan-submit`. `/plan-close` performs no cleanup work — it is a gate check followed by archive + state clear only.
- Do not run any `gh` commands directly from command handlers except via the existing `execFile`/child-process pattern already used in the extension.
- No new npm dependencies.

---

## Architecture & Design

- **New tool `get_active_pr`**: registered via `pi.registerTool`, calls `gh pr view --json number,url,state,headRefName,merged` for the current branch, returns parsed JSON or an appropriate error message. Used by `/plan-close` and available to the agent for general PR orientation.
- **New command `/plan-submit`**: identical to the current `/plan-close` handler up to and including the `create_pull_request` tool call, but omits the archive-to-reference and `activePlan = null` steps entirely.
- **Modified `/plan-close`**: calls `get_active_pr` logic (or runs `gh pr view` inline) to check merge status. If not merged, emits a `ui.notify` warning and returns. If merged, proceeds with the existing archive + state-clear logic. Does not re-send the cleanup ceremony prompt.

---

## Interfaces & Contracts

### `get_active_pr` tool

Registered with `pi.registerTool`. No input parameters. Returns a tool result with a text block containing JSON:

```jsonc
{
  "number": 42,
  "url": "https://github.com/org/repo/pull/42",
  "state": "OPEN" | "CLOSED" | "MERGED",
  "headRefName": "feature/plan-submit-lifecycle",
  "merged": true | false
}
```

On failure (no PR found, `gh` not installed, not authenticated), returns a descriptive error string instead.

### `plan-state.json` schema

Unchanged. No new fields. PR lookup is derived from the `branch` field already stored per-plan entry.

### `/plan-submit` prompt sent to agent

Identical to the current `/plan-close` prompt (cleanup ceremony + `create_pull_request` instructions), with one change: the closing instruction no longer says "this closes the plan." The plan remains active after the tool call completes.

### `/plan-close` behavior

No user message / agent prompt is sent. The command handler itself checks PR merge status, then either blocks or runs the archive + state-clear synchronously.

---

## Dependencies

Unchanged. No new packages. Relies on `gh` CLI (already required by `create_pull_request`).

**Outcome:** No dependency changes needed.

---

## Risks / Unknowns

- **`gh pr view` fails on a branch with no PR** → `get_active_pr` must handle non-zero exit gracefully and return a clear "no PR found" message rather than throwing.
- **Re-running `/plan-submit` on a branch with an existing PR** → Handler runs `gh pr view` for the current branch before sending the agent prompt; if a PR exists, it notifies the user ("PR already exists: <url> — plan remains active") and returns early without re-triggering the ceremony.
- **`/plan-close` called with no PR ever submitted** → Same `gh pr view` check; if no PR is found, notify "No PR found for this branch. Run /plan-submit first." and return.

---

## Decision Log

- **2026-08-03** — Cleanup ceremony (repo doc updates, cleanup commit, PR creation) stays in `/plan-submit`, not duplicated in `/plan-close`. This keeps `/plan-close` as a pure gate + teardown with no agent prompt, which is simpler and avoids re-running expensive work after merge.
- **2026-08-03** — PR number is not stored in `plan-state.json`. Branch name (already stored) is sufficient to look up the PR via `gh pr view`. Avoids adding state fields and keeps the lookup always fresh.
- **2026-08-03** — Re-running `/plan-submit` on a branch with an existing PR: detect and skip (notify user) rather than allowing the ceremony to re-run. Prevents double-commit and confusing duplicate PR drafts.
- **2026-08-03** — Review-fix workflow (incremental commits to an open PR in response to review feedback, distinct from continuing plan steps) is deferred to a future phase.

---

## Steps

#### Step 1 — Add `get_active_pr` tool

**Recipe**

1. Register a new tool named `get_active_pr` via `pi.registerTool` in `extensions/index.ts`. No input parameters.
2. The handler runs `gh pr view --json number,url,state,headRefName,merged` (no `--head` flag needed; `gh` defaults to the current branch).
3. On success (exit code 0), parse the JSON and return it as a text block in the tool result.
4. On failure (non-zero exit, e.g. no PR found or `gh` not available), return a descriptive error string as the tool result text — do not throw.
5. Place the tool registration near the other PR-related tool (`create_pull_request`) for proximity.

**Verify**

- Agent can call `get_active_pr` and receive PR metadata when on a branch with an open PR.
- Calling on a branch with no PR returns a readable error string, not an exception.

---

#### Step 2 — Add `/plan-submit` command

**Recipe**

1. Register a new command `plan-submit` in `extensions/index.ts`.
2. Copy the entire current `/plan-close` handler body into `/plan-submit`, including: state read, plan file read, cleanup ceremony prompt construction, `pi.sendUserMessage` call with the full PR instructions. The commit message prefix should be `plan-submit:` instead of `plan-close:`.
3. Before sending the agent prompt, run `gh pr view --json url,state` (same child-process pattern used elsewhere) to check if a PR already exists on the current branch. If a PR is found (exit 0), call `ctx.ui.notify` with "PR already exists: <url> — plan remains active. Use /plan-close once it is merged." and return early.
4. Remove the archive-to-reference block and the `activePlan = null` / `writeState` call entirely — they must not appear in `/plan-submit`.
5. The `description` field for the command should read: `"Submit PR for the active plan without closing it — plan remains active for follow-up commits"`.

**Verify**

- `/plan-submit` triggers the cleanup ceremony and `create_pull_request` flow.
- After the tool call completes, `plan-state.json` still shows the plan as active (`activePlan` is non-null).
- Re-running `/plan-submit` on a branch with an existing PR shows the notify message and exits without re-triggering the ceremony.

---

#### Step 3 — Modify `/plan-close` to be merge-gated teardown only

**Recipe**

1. In the `/plan-close` handler in `extensions/index.ts`, remove the `pi.sendUserMessage` call and all cleanup ceremony logic (the entire prompt construction block).
2. At the start of the handler (after the `activePlan` null check and plan file read), run `gh pr view --json state,merged,url` for the current branch using the existing child-process pattern.
3. If `gh pr view` exits non-zero (no PR found), call `ctx.ui.notify("No PR found for branch '<branch>'. Run /plan-submit first.", "warning")` and return.
4. If the PR exists but `merged` is `false`, call `ctx.ui.notify("PR is not yet merged (<url>). Merge it before running /plan-close.", "warning")` and return.
5. If `merged` is `true`, proceed with the existing archive-to-reference logic and `activePlan = null` / `writeState` — unchanged from today.
6. Update the `description` field to: `"Archive the active plan — only runs after the PR has been merged"`.

**Verify**

- `/plan-close` on a branch whose PR is open returns a warning and does not archive the plan.
- `/plan-close` on a branch whose PR is merged archives the plan file to `docs/plans/reference/` and clears `activePlan` in state.
- `/plan-close` on a branch with no PR returns the "Run /plan-submit first" warning.

---

## Phase 2 (Future)

- **Review-fix workflow**: a lightweight command (e.g. `/pr-fix`) for responding to code review feedback on an open PR — incremental commits pushed to the branch without requiring a full plan step dispatch cycle.
- **`/plan-close` review ceremony**: optionally prompt the agent to summarize or review the merged PR before archiving, for changelogs or retrospective notes.
