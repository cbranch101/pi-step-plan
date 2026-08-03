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

# AI Planning Doc: Plan Close / Reopen Flow

---

## Project Summary

The current `/plan-submit` + `/plan-close` split creates an unsolvable problem: the closing commit (archiving the plan file, clearing active plan state) has nowhere clean to land after a PR is merged. This phase eliminates `/plan-submit`, redesigns `/plan-close` to own the full closing ceremony on the feature branch (including PR creation), and introduces `/plan-reopen` as an escape hatch for post-review changes. The result is a flow where every plan state change is committed on the feature branch and lands in the PR — no post-merge commits ever required.

---

## Goals & Success Criteria

- `/plan-close` archives the plan file, clears state, commits, and creates a PR (or pushes if one already exists) — all from the feature branch
- `/plan-reopen` restores a closed plan so more work can be done, then `/plan-close` can be run again
- `/plan-submit` is removed
- No plan state changes ever need to be committed after a PR is merged

---

## Relevant Files

- `extensions/index.ts` (modify) — remove `/plan-submit`, redesign `/plan-close`, add `/plan-reopen`

---

## Constraints

- All conditionality (e.g. does a PR already exist?) lives in code, not delegated to the agent
- The closing commit must land on the feature branch, not main
- `/plan-reopen` must commit the restore so state is always tracked in git

---

## Architecture & Design

- `/plan-close` absorbs the PR creation logic from `/plan-submit`
- `/plan-close` checks for an existing PR via `gh pr view <branch> --json url,state`; if none, triggers the agent to create one; if one exists, just pushes
- `/plan-reopen` is the inverse of `/plan-close`: moves the plan file back from `docs/plans/reference/` to `docs/plans/`, restores `activePlan` in state, commits
- The `gh pr view` call in `/plan-close` passes the stored branch name explicitly so it works regardless of current branch

---

## Interfaces & Contracts

**`/plan-close` command**

1. Read `activePlan` from state — error if none
2. Archive plan file: move from `docs/plans/<name>.md` → `docs/plans/reference/<name>.md`
3. Clear `activePlan` in state, write state file
4. `git add -A && git commit -m "plan-close: <name>"`
5. Check for existing PR: `gh pr view <branch> --json url,state`
   - No PR → trigger agent to draft and call `create_pull_request`
   - PR exists → `git push`

**`/plan-reopen` command**

1. Check that `activePlan` is null and a plan file exists in `docs/plans/reference/` — error otherwise
2. Move plan file back to `docs/plans/`
3. Restore `activePlan` in state, write state file
4. `git add -A && git commit -m "plan-reopen: <name>"`
5. Notify user that the plan is active again

**`/plan-submit`** — removed entirely

---

## Dependencies

- Unchanged.

**Outcome:** No dependency changes required.

---

## Risks / Unknowns

- **`/plan-reopen` needs to know which plan to restore** — there may be multiple files in `reference/`; for now, if there is more than one, error and ask the user to specify.
- **Agent already references `/plan-submit` in prompts or system messages** — audit `extensions/index.ts` for any instructional text that mentions `/plan-submit` and update it.

---

## Decision Log

- **2026-08-03** — Removed `/plan-submit` in favor of a single `/plan-close` command. The root problem was that the closing commit (archive + state clear) had no clean branch to land on after a PR was merged. By moving the full closing ceremony — including PR creation — onto the feature branch via `/plan-close`, every plan state change is committed before the merge and travels in the PR. `/plan-reopen` provides the escape hatch for post-review iteration without requiring a separate "resubmit" command.
- **2026-08-03** — Conditionality for whether a PR exists lives in code, not the agent. Agent-driven conditionality is unreliable; the command checks `gh pr view` directly and branches accordingly.
- **2026-08-03** — `gh pr view` in `/plan-close` passes the stored branch name explicitly. The current-branch-implicit form fails whenever the user is not on the plan's branch, which is the normal case after switching branches.

---

## Steps

#### Step 1 — Remove `/plan-submit` and redesign `/plan-close`

**Recipe**

1. Delete the `/plan-submit` command registration and handler from `extensions/index.ts`
2. Replace the `/plan-close` handler with the new flow: archive plan file, clear state, commit, check for existing PR via `gh pr view <branch> --json url,state`, then either trigger agent to call `create_pull_request` or run `git push`
3. Remove any references to `/plan-submit` in instructional text or `sendUserMessage` prompts within `extensions/index.ts`

**Verify**

- Running `/plan-close` on a feature branch with no existing PR archives the plan, commits, and prompts the agent to create a PR
- Running `/plan-close` on a feature branch with an existing PR archives the plan, commits, and pushes without creating a duplicate PR

---

#### Step 2 — Add `/plan-reopen` command

**Recipe**

1. Register a new `/plan-reopen` command in `extensions/index.ts`
2. Handler: verify `activePlan` is null; find the most recent plan file in `docs/plans/reference/` (error if zero or more than one); move it back to `docs/plans/`; restore `activePlan` in state; write state; run `git add -A && git commit -m "plan-reopen: <name>"`; notify user
3. Run `npm run typecheck` to confirm no type errors

**Verify**

- Running `/plan-reopen` after `/plan-close` restores the plan file and state, and the commit appears in `git log`
- Running `/plan-close` again after `/plan-reopen` successfully re-archives and pushes

---

## Phase 2 (Future)

- Support specifying a plan name in `/plan-reopen` when multiple archived plans exist in `reference/`
