# pi-step-plan

A [pi](https://earendil.works) extension that adds structured, step-by-step plan execution to AI-assisted development. Plans are Markdown documents committed to feature branches; the extension provides commands to activate them, dispatch steps to the agent, track progress, and close plans by opening or updating PRs.

---

## Overview

Plans are Markdown files following the **AI Planning Doc** template (see `extensions/index.ts` for the embedded template, and `docs/plans/reference/` for completed plan examples). Each plan has a numbered step list. The extension tracks which step is active and dispatches one step at a time so the agent works within a bounded, reviewable scope.

The conversation thread is the unit of execution. Each `/next-step` opens a fresh thread for the active step. Modifying a plan mid-execution uses `/modify-plan-start` + `/modify-plan-finish` in a dedicated thread — no mode flags or state changes are needed.

---

## Commands

### Plan lifecycle

| Command          | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `/plan-start`    | Start planning in discussion mode; run `/plan-finish` when ready to write the plan doc |
| `/plan-finish`   | Generate, review, commit, and register a new plan on a fresh `feature/<slug>` branch   |
| `/activate-plan` | Set a plan file as the active plan (reads a path or prompts)                          |
| `/next-step`     | Dispatch the current active step to the agent in a new thread                         |
| `/plan-close`    | Archive the plan, commit the archive, then push/create or update the PR               |
| `/plan-adopt`    | Adopt an existing untracked plan file and commit it on a fresh `feature/<slug>` branch |

### Plan modification

| Command               | Description                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/modify-plan-start`  | Load the active plan into the current thread and instruct the agent to accept modification requests; only steps **after** the current step may be changed |
| `/modify-plan-finish` | Instruct the agent to run the forward consistency check, get user approval, and commit the updated plan                                                 |

> **Note:** `/revise-plan` and `/resume-step` have been removed and replaced by `/modify-plan-start` and `/modify-plan-finish`.

---

## Agent Tools

These tools are exposed to the agent (visible in the system prompt). PR creation follows a confirm-before-act pattern — the user approves the PR package before any `gh` command runs.

| Tool                  | When called                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `finish_step`         | At the end of a `/next-step` thread; commits the work and advances the step counter                                   |
| `register_plan`       | During `/plan-finish`; initializes the plan entry in state after the plan doc is committed                            |
| `get_active_pr`       | Any time; returns current PR metadata (number, URL, state, merged) for the active branch via `gh pr view`             |
| `create_pull_request` | During `/plan-close`; accepts `title`, `body`, and `comments`, pushes the branch, opens/reuses the PR, and posts comments |

---

## Plan Modification Flow

```
/modify-plan-start
  └─ agent receives: full plan content + current step fence + instructions
  └─ user describes desired changes; agent edits the plan in the thread

/modify-plan-finish
  └─ agent: forward consistency check across all steps after the earliest changed step
  └─ agent: present diff to user for approval; loop until approved
  └─ agent: git commit the updated plan
```

**Fence rule:** completed steps and the active step are locked. Only steps strictly after `currentStep` may be modified. This is enforced by agent instructions, not mechanically.

**Dirty plan detection:** `/modify-plan-start` checks `git diff HEAD -- <planPath>` and warns if the plan has uncommitted local changes, but does not block.

---

## Execution Model

- Plans are committed Markdown files; the extension reads and writes them via the filesystem.
- State (active plan path, current step number, completed steps, and feature branch) is persisted by the extension in pi's state store.
- Each `/next-step` dispatch sends the step recipe to the agent in a new conversation thread; the agent calls `finish_step` when done.
- Sub-step numbering (`1.1`, `1.2`) is allowed in plan prose; the step parser (`findStepByNumber`) handles whole-number steps only — sub-steps are treated as prose inside their parent step.

### Branch and PR lifecycle

`/plan-finish` and `/plan-adopt` put each plan on a dedicated feature branch before the plan commit. The agent must verify a clean working tree, switch to hard-coded `main`, pull `origin main`, reject any existing local or remote `feature/<slug>` branch, then create `feature/<slug>` from the updated `main`. If the tree is dirty, the branch already exists, or any git command fails, the workflow stops before plan creation/adoption is committed and asks the user how to proceed.

`/plan-close` archives the active plan into `docs/plans/reference/`, commits that cleanup, pushes the feature branch to `origin`, and creates or reuses a pull request. `create_pull_request` receives only the PR `title`, `body`, and optional inline review `comments`; it does not add issue-closing footers.

This extension does not create GitHub repositories or configure remotes. Configure `origin` yourself before using workflows that need `git pull origin main`, `git push`, or `gh pr create`.

---

## Repository Layout

```
extensions/
  index.ts          — all commands, tools, and state management
  approval-component.ts — shared TUI component for confirm/reject UI
docs/
  plan-execution-concepts.md  — conceptual notes on step sizing and plan writing
  plans/
    reference/      — completed plan docs (historical reference)
```

---

## Example Plan Workflow

```bash
# 1. Discuss and shape a plan
/plan-start

# 2. Finish the plan on a fresh feature branch from updated main
/plan-finish   # clean tree → switch main → pull origin main → create feature/<slug> → commit/register plan

# 3. Execute steps one at a time
/next-step     # dispatches Step 1; agent calls finish_step when done
/next-step     # dispatches Step 2; ...

# 4. If you need to change a future step mid-execution
/modify-plan-start    # load plan + fence instructions into thread
# ... describe changes; agent edits plan ...
/modify-plan-finish   # consistency check → approval → commit

# 5. Close the plan and create/update the PR
/plan-close    # archives plan → commits → pushes branch → create_pull_request as needed
```
