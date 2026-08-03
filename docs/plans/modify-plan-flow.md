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

# AI Planning Doc: Modify Plan Flow

---

## Project Summary

Add `/modify-plan-start` and `/modify-plan-finish` commands to the extension, replacing `/revise-plan` and `/resume-step`. Both commands are simple `sendUserMessage` wrappers — no mode flags, no blocking, no state changes. The conversation thread itself is the "mode". `/modify-plan-start` loads the plan and sets the agent up with fence rules; the agent edits the plan in that thread; `/modify-plan-finish` triggers the forward consistency check, approval loop, commit, and issue updates. After the commit, the next session picks up the updated plan via `/next-step` exactly as normal.

---

## Goals & Success Criteria

- `/modify-plan-start` loads the active plan and sends the agent a follow-up message with the plan content, the fence (only steps after `currentStep` may be modified), and modification instructions
- `/modify-plan-finish` sends the agent a follow-up message triggering the forward consistency check, user approval loop, plan commit, and issue updates
- `update_github_issues` allows the agent to propose edits to existing issues with user confirmation before calling `gh issue edit`
- `/revise-plan` and `/resume-step` are removed

---

## Relevant Files

- `extensions/index.ts` (modify) — add new commands, new tool, remove deprecated commands

---

## Constraints

- Only steps strictly after `currentStep` may be modified; completed steps and the active step are locked — enforced via agent instructions only, not mechanically
- `update_github_issues` must not call `gh` directly — only through the tool, matching the `create_github_issues` pattern
- Sub-step numbering (`1.1`, `1.2`) is permitted in plan docs but the step parser (`findStepByNumber`) does not need to handle it in this phase — sub-steps are treated as prose inside their parent step

---

## Architecture & Design

- Both commands are thin wrappers around `pi.sendUserMessage` — no flags, no blocking, no `before_agent_start` injection needed
- The conversation thread is the implicit "mode": the agent receives instructions about the fence and works within them for the duration of the thread
- No changes to the `tool_call` handler or `before_agent_start` hook are required

---

## Interfaces & Contracts

### New tool: `update_github_issues`

```ts
parameters: {
  issues: Array<{
    number: number; // existing GitHub issue number
    title?: string; // new title (omit to leave unchanged)
    body?: string; // new body (omit to leave unchanged)
  }>;
}
```

- Iterates issues, shows each proposed change to user via `ctx.ui.confirm`
- On confirm: runs `gh issue edit <number> [--title ...] [--body ...]`
- On decline: collects optional feedback and returns it so the agent can revise and call again
- Only issues stored in `state.plans[planPath].githubIssues` are eligible; agent must not pass arbitrary issue numbers

### State: Unchanged

No new state fields required.

---

## Dependencies

- Unchanged. No new packages.

---

## Risks / Unknowns

- **Plan file has uncommitted changes at `/modify-plan-start` time** → Detect with `git diff HEAD -- <planPath>` and warn the user; do not block, but make the risk clear
- **No GitHub issues were created for this plan** → `update_github_issues` step in `/modify-plan-finish` should be skipped gracefully if `githubIssues` array is empty

---

## Decision Log

- **2026-08-03** — `/modify-plan-start` + `/modify-plan-finish` replace `/revise-plan` + `/resume-step` entirely rather than coexisting; the old commands are removed to avoid confusion
- **2026-08-03** — Sub-step numbering (`1.1`) is explicitly allowed in plan prose but `findStepByNumber` is not updated in this phase; the parser only needs to handle whole-number steps for dispatch
- **2026-08-03** — no mode flag is needed; the conversation thread is the implicit modification context, and a crashed session is recoverable by the user simply re-editing the plan manually and committing

---

## Steps

#### Step 1 — Add `update_github_issues` tool

**Recipe**

1. Register a new `update_github_issues` tool in `extensions/index.ts` following the exact same structure as `create_github_issues`
2. Parameters: `issues` array of `{ number: number; title?: string; body?: string }`
3. For each issue: verify the number exists in `state.plans[planPath].githubIssues`; if not, return an error instructing the agent not to pass arbitrary numbers
4. Show each proposed change to the user via `ctx.ui.confirm` with a formatted diff of old vs new title/body
5. On confirm: run `gh issue edit <number>` with `--title` and/or `--body` as applicable
6. On decline: collect optional feedback via `ctx.ui.input` and return it so the agent can revise and call again
7. Return a summary of updated issue numbers and any declined items with feedback

**Verify**

- Tool is listed in the agent's available tools
- Calling with a valid issue number + new body shows a confirm prompt
- Calling with an issue number not in `githubIssues` returns an error without prompting

---

#### Step 2 — Add `/modify-plan-start` command

**Recipe**

1. Register `/modify-plan-start` command:
   a. Read state; if no active plan, notify and return
   b. Check for uncommitted changes to the plan file: `git diff HEAD -- <planPath>`; if dirty, warn the user via `ctx.ui.notify` with a warning severity but continue
   c. Read the plan file content
   d. Send a follow-up message to the agent containing: the full plan content, the current step number (the fence), and instructions that only steps after `currentStep` may be modified — completed steps and the active step are locked and must not be touched; tell the agent to ask the user what changes they want to make

**Verify**

- Running `/modify-plan-start` with no active plan shows a warning and exits
- Running `/modify-plan-start` with a dirty plan file shows a warning but continues
- After running the command, the agent receives the plan content and fence instructions and prompts the user for changes

---

#### Step 3 — Add `/modify-plan-finish` command and remove deprecated commands

**Recipe**

1. Register `/modify-plan-finish` command:
   a. Read state to get `currentStep` and `githubIssues`
   b. Send a follow-up message instructing the agent to:
   - Scan all steps after the earliest modified step through the end of the plan and verify they are still consistent with the changes made; update any that are out of sync
   - Present the full set of proposed changes to the user for approval
   - Incorporate feedback and loop until the user approves
   - Once approved, commit the plan file with `git add -A && git commit -m "plan: modify — <short reason>"`
   - If `githubIssues` is non-empty, read each issue via `gh issue view`, identify any affected by the plan changes, and call `update_github_issues` with proposed edits; if `githubIssues` is empty, skip this step
2. Remove the `/revise-plan` command registration entirely
3. Remove the `/resume-step` command registration entirely
4. Remove the `revisePlanPath` variable and all references to it
5. Remove the `revisePlanPath` branch from the `before_agent_start` system prompt injection

**Verify**

- `/modify-plan-finish` fires the follow-up message
- `/revise-plan` and `/resume-step` are no longer registered (running them shows "unknown command")
- The `before_agent_start` hook no longer references `revisePlanPath`
