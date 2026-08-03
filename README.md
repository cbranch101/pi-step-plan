# pi-step-plan

A [pi](https://earendil.works) extension that adds structured, step-by-step plan execution to AI-assisted development. Plans are Markdown documents committed to the repo; the extension provides commands to activate them, dispatch steps to the agent, track progress, manage GitHub issues, and close plans with PRs.

---

## Overview

Plans are Markdown files following the **AI Planning Doc** template (see `extensions/index.ts` for the embedded template, and `docs/plans/reference/` for completed plan examples). Each plan has a numbered step list. The extension tracks which step is active and dispatches one step at a time so the agent works within a bounded, reviewable scope.

The conversation thread is the unit of execution. Each `/next-step` opens a fresh thread for the active step. Modifying a plan mid-execution uses `/modify-plan-start` + `/modify-plan-finish` in a dedicated thread — no mode flags or state changes are needed.

---

## Commands

### Plan lifecycle

| Command          | Description                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| `/plan-start`    | Create a new plan doc from the embedded template and open it in the editor |
| `/activate-plan` | Set a plan file as the active plan (reads a path or prompts)               |
| `/next-step`     | Dispatch the current active step to the agent in a new thread              |
| `/plan-close`    | Close the completed plan: cleanup commit + draft PR + close GitHub issues  |
| `/plan-adopt`    | Adopt an existing plan file that was committed outside the extension       |

### Plan modification

| Command               | Description                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/modify-plan-start`  | Load the active plan into the current thread and instruct the agent to accept modification requests; only steps **after** the current step may be changed |
| `/modify-plan-finish` | Instruct the agent to run the forward consistency check, get user approval, commit the updated plan, and update any affected GitHub issues                |

> **Note:** `/revise-plan` and `/resume-step` have been removed and replaced by `/modify-plan-start` and `/modify-plan-finish`.

---

## Agent Tools

These tools are exposed to the agent (visible in the system prompt). They follow a confirm-before-act pattern — the user approves each operation via a prompt before any `gh` command runs.

| Tool                   | When called                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `finish_step`          | At the end of a `/next-step` thread; commits the work and advances the step counter                        |
| `review_issue_outline` | During `/plan-finish`; lets the user approve the shape of proposed GitHub issues before bodies are drafted |
| `create_github_issues` | During `/plan-finish`; drafts and creates GitHub issues after the outline is approved                      |
| `update_github_issues` | During `/modify-plan-finish`; proposes edits to existing issues with per-issue user confirmation           |
| `create_pull_request`  | During `/plan-close`; drafts and opens the PR, then posts inline review comments                           |

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
  └─ agent: if githubIssues non-empty → call update_github_issues for affected issues
```

**Fence rule:** completed steps and the active step are locked. Only steps strictly after `currentStep` may be modified. This is enforced by agent instructions, not mechanically.

**Dirty plan detection:** `/modify-plan-start` checks `git diff HEAD -- <planPath>` and warns if the plan has uncommitted local changes, but does not block.

---

## Execution Model

- Plans are committed Markdown files; the extension reads and writes them via the filesystem.
- State (active plan path, current step number, GitHub issue numbers) is persisted by the extension in pi's state store.
- Each `/next-step` dispatch sends the step recipe to the agent in a new conversation thread; the agent calls `finish_step` when done.
- Sub-step numbering (`1.1`, `1.2`) is allowed in plan prose; the step parser (`findStepByNumber`) handles whole-number steps only — sub-steps are treated as prose inside their parent step.

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
# 1. Create and edit a plan
/plan-start

# 2. Activate it (if not already active)
/activate-plan

# 3. Create GitHub issues for the plan
/plan-finish   # (review_issue_outline → create_github_issues)

# 4. Execute steps one at a time
/next-step     # dispatches Step 1; agent calls finish_step when done
/next-step     # dispatches Step 2; ...

# 5. If you need to change a future step mid-execution
/modify-plan-start    # load plan + fence instructions into thread
# ... describe changes; agent edits plan ...
/modify-plan-finish   # consistency check → approval → commit → issue updates

# 6. Close the plan when all steps are done
/plan-close    # cleanup commit + create_pull_request
```
