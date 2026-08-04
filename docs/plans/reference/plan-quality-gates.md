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

# AI Planning Doc: Plan Quality Gates

---

## Project Summary

Three agent-facing flows — `/modify-plan-start`, `/modify-plan-finish`, and `/plan-finish` — lack quality gates that prevent the agent from accepting vague step descriptions, jumping to edits before a proposal is agreed, or presenting an incomplete plan to the user. This plan adds mechanical write-blocking during the modify-plan investigation phase, a step-by-step on-disk implementability and granularity review in plan-finish before the user ever sees the plan, and a canonical `docs/step-granularity.md` reference doc the agent reads during all review passes. When done, the user never reviews a plan with ambiguous, underspecified, or oversized steps.

---

## Goals & Success Criteria

- `/modify-plan-start` mechanically blocks all write/edit tool calls — the agent cannot touch any file even if it tries; investigation and proposal are the only permitted actions
- `/modify-plan-start` instructs the agent to read the plan and relevant files, ask clarifying questions, check feasibility, and arrive at a precise proposal before prompting the user to run `/modify-plan-finish`
- `/modify-plan-finish` clears the write block, applies the agreed changes, runs the forward consistency check, gets user approval, commits, and updates GitHub issues
- `/plan-finish` instructs the agent to write a first-pass plan to disk, then walk the file one step at a time — checking implementability and granularity per-step, asking the user to resolve ambiguities, and updating each step on disk before moving to the next — before ever presenting the plan for review
- `docs/step-granularity.md` exists as a canonical reference; agent instructions in all review passes direct the agent to read it

---

## Relevant Files

- `extensions/index.ts` (modify) — add `modifyPlanMode` flag; extend `tool_call` handler and `before_agent_start` hook; rewrite `sendUserMessage` content for `/modify-plan-start`, `/modify-plan-finish`, and `/plan-finish`
- `docs/step-granularity.md` (add) — canonical step granularity heuristics reference

---

## Constraints

- Must use the same flag + `tool_call` + `before_agent_start` pattern already established by `planMode` — no new architectural primitives
- `modifyPlanMode` must block write/edit for **all** paths including `docs/` — the plan file lives in `docs/plans/` and must not be editable during the investigation phase; this differs from `planMode` which exempts `docs/`
- `docs/step-granularity.md` must not be inside `docs/plans/` — that directory is reserved for plan docs
- The fence rule (steps 1 through `currentStep` are locked in modify flows) is enforced via agent instructions, not mechanically — unchanged from current behavior

---

## Architecture & Design

- Add a `modifyPlanMode` boolean flag alongside the existing `planMode` flag; both flags are independent and can be checked separately in `tool_call` and `before_agent_start`
- `docs/step-granularity.md` is a plain markdown file on disk; agents read it via the `read` tool when instructed — it is not embedded in extension code, making it independently editable without a code change
- The step-by-step on-disk review in `/plan-finish` is purely an instruction change — no new mechanical enforcement needed since writes are already allowed in that flow

---

## Interfaces & Contracts

### `tool_call` handler (extended)

Extended to add a second guard block after the existing `planMode` block:

```ts
if (modifyPlanMode && ["write", "edit"].includes(event.toolName)) {
  // No docs/ exception — all paths blocked
  ctx.ui.notify(
    "⏸ Modify plan mode: write/edit blocked. Run /modify-plan-finish to apply changes.",
    "warning",
  );
  return {
    block: true,
    reason:
      "Modify plan investigation phase is active. write and edit are disabled. Discuss and propose only — run /modify-plan-finish when the user confirms the proposal.",
  };
}
```

### `before_agent_start` hook (extended)

Extended to add a second injection block after the existing `planMode` block:

```ts
if (modifyPlanMode) {
  return {
    systemPrompt: event.systemPrompt + `\n\n## ⏸ MODIFY PLAN MODE — INVESTIGATION ONLY\n` + ...
  };
}
```

Injected instructions cover: write/edit are mechanically blocked; do not run git; read the plan and referenced files before responding; ask what the user wants to change; check feasibility against actual files; ask clarifying questions until the change is unambiguous; only prompt the user to run `/modify-plan-finish` once they confirm the proposal.

### `/modify-plan-start` `sendUserMessage` (rewritten)

Instructs the agent to: read the plan; read files referenced in the plan that are relevant to the requested change; ask the user what they want to change; investigate feasibility and surface implications; ask clarifying questions; arrive at a precise, specific proposal; confirm with user; prompt them to run `/modify-plan-finish`.

### `/modify-plan-finish` `sendUserMessage` (rewritten)

Sets `modifyPlanMode = false` before sending. Instructs the agent to: scroll back through the conversation to identify the agreed proposal; apply those changes to the plan file; run the forward consistency check across all steps after the earliest modified step; present the result to the user for approval; loop until approved; commit; call `update_github_issues` if `githubIssues` is non-empty.

### `/plan-finish` `sendUserMessage` (rewritten)

Instructs the agent to:

1. Write the populated first-pass plan doc to disk
2. Read `docs/step-granularity.md`
3. Walk the plan's Steps section one step at a time, reading each from disk:
   - Can this step be implemented without making a design decision the user hasn't approved?
   - Is this step too big per the granularity reference?
   - If either: ask the user, resolve it, update the step on disk before moving to the next
4. Only after all steps pass the review, present the plan to the user for final approval
5. Incorporate feedback, repeat until approved
6. Commit, call `register_plan`, then proceed to issue creation

---

## Dependencies

- Unchanged. No new packages.

**Outcome:** No dependency changes required.

---

## Risks / Unknowns

- **`modifyPlanMode` not cleared if the user abandons a modify session** → Same in-memory reset risk as `planMode`; flag resets on pi restart. Acceptable given existing precedent.
- **Step-by-step review in `/plan-finish` increases round-trips for large plans** → Expected and acceptable; the goal is quality over speed. User can always edit the plan file directly and commit manually if they want to skip the review.
- **Agent applies modify-plan-finish changes incorrectly from a long discussion** → Mitigated by explicitly instructing the agent to scroll back through the conversation to find the agreed proposal rather than relying on memory.

---

## Decision Log

- **2026-08-04** — `modifyPlanMode` blocks all paths including `docs/`; the plan file lives in `docs/plans/` so the existing `planMode` docs/ exemption cannot be reused as-is
- **2026-08-04** — modify-plan-start is investigation + proposal only (no file edits); modify-plan-finish applies edits; this avoids the LLM conflating "proposed edit" with "applied edit" via mechanical enforcement rather than instructions alone
- **2026-08-04** — modify-plan-start review stays in-memory (not step-by-step on disk) because the scope of a modify is small by definition — holding a few changed steps in context is fine
- **2026-08-04** — plan-finish review is step-by-step on disk because a full plan can have many steps; the file is the accumulator so the agent never needs to hold all steps in working memory simultaneously
- **2026-08-04** — Granularity heuristics live in `docs/step-granularity.md`, not inlined into extension code; this keeps them independently editable and shared across all flows without a code change
- **2026-08-04** — Default heuristic is "split first, ask later": the only real downside of over-granularity is plan doc size; the consistency check pass eliminates step drift as a risk; benefits (reviewability, specificity, smaller context per step session) outweigh costs

---

## Steps

#### Step 1 — Create `docs/step-granularity.md`

**Recipe**

1. Create `docs/step-granularity.md` with the following content:
   - **Purpose** section: this doc is read by the agent during plan-finish and modify-plan review passes to evaluate step sizing
   - **Default rule**: when in doubt, split — the only cost of over-granularity is plan doc size in context; the consistency check pass handles step drift
   - **Signs a step is too big**: touches more than one system or subsystem; recipe items that could independently succeed or fail; verify criteria testing more than one independent behavior; a step where a clean boundary could be drawn partway through
   - **Signs a step is the right size**: one focused change; one clear done condition; implementable in a single agent session without context-switching; if it fails, the failure is easy to locate and understand
   - **Signs a step is too small** (rare): a change so trivial it adds no review value and could be safely combined with an adjacent step with zero risk — use judgment here since this is uncommon
   - **What to do when a step is too big**: split it in place, giving each part a new action-oriented title; update the numbering of subsequent steps accordingly; run the consistency check across the affected range

**Verify**

- `docs/step-granularity.md` exists and is readable
- The file does not live inside `docs/plans/`

---

#### Step 2 — Add `modifyPlanMode` flag and extend `tool_call` + `before_agent_start`

**Recipe**

1. Declare `let modifyPlanMode = false` immediately after the existing `let planMode = false` declaration (around line 284 of `extensions/index.ts`)
2. In the existing `tool_call` handler, add a second guard block after the `planMode` block: when `modifyPlanMode` is true, block `write` and `edit` for all paths with no `docs/` exception; notify the user with a warning; return `{ block: true, reason: "..." }` explaining that `/modify-plan-finish` must be run to apply changes
3. In the existing `before_agent_start` hook, add a second injection block after the `planMode` block: when `modifyPlanMode` is true, append a `## ⏸ MODIFY PLAN MODE — INVESTIGATION ONLY` section to the system prompt with the following instructions:
   - `write` and `edit` are mechanically blocked — do not attempt to call them
   - Do not run any git commands or make commits
   - Your job is to investigate and propose, not to apply
   - Read the plan and any files it references before forming a response
   - Ask the user what they want to change; do not assume
   - Check feasibility against the actual files on disk — do not take the request at face value
   - Ask clarifying questions until the intended change is fully unambiguous
   - Only prompt the user to run `/modify-plan-finish` once they have explicitly confirmed the proposal

**Verify**

- After `/modify-plan-start` is run, attempting to call `write` or `edit` on any path (including inside `docs/`) is blocked with the warning notification and a clear block reason
- The system prompt during a modify-plan-start session contains the `MODIFY PLAN MODE` section
- Neither block applies when both `planMode` and `modifyPlanMode` are false

---

#### Step 3 — Rewrite `/modify-plan-start` and `/modify-plan-finish` messages

**Recipe**

1. In the `/modify-plan-start` handler:
   - Set `modifyPlanMode = true` before sending the message
   - Replace the existing `sendUserMessage` with a message that instructs the agent to: read the full plan content (already provided in the message); read any files referenced in the plan that are relevant to the requested change area; ask the user what changes they want; investigate whether those changes are feasible given the current codebase and plan; surface any implications or conflicts; ask clarifying questions until the change is unambiguous; present a precise proposal describing exactly what would change and why; once the user confirms, prompt them to run `/modify-plan-finish` — do not edit any files or run git
2. In the `/modify-plan-finish` handler:
   - Set `modifyPlanMode = false` **before** sending the message, so write/edit are unblocked when the agent acts
   - Replace the existing `sendUserMessage` with a message that instructs the agent to: scroll back through this conversation to identify the proposal the user confirmed; apply those changes to the plan file; run the forward consistency check across all steps after the earliest modified step, updating any that are out of sync; present the full diff of changes to the user for approval; incorporate feedback and loop until the user explicitly approves; commit with `git add -A && git commit -m "plan: modify — <short reason>"`; if `githubIssues` is non-empty, read each affected issue and call `update_github_issues` with proposed edits

**Verify**

- Running `/modify-plan-start` sets `modifyPlanMode = true` and the agent message instructs investigation before proposal
- Running `/modify-plan-finish` sets `modifyPlanMode = false` before the agent message so writes succeed
- The agent in a finish session applies changes based on the conversation history, not free invention

---

#### Step 4 — Rewrite `/plan-finish` message with step-by-step on-disk review

**Recipe**

1. In the `/plan-finish` handler, replace the existing `sendUserMessage` with a message that instructs the agent to follow this exact sequence:
   a. Review the full conversation and extract all decisions, goals, constraints, architecture choices, and action items
   b. Choose a kebab-case slug; check/create the feature branch
   c. Write the populated first-pass plan doc to `docs/plans/<slug>.md` — fill every section, do not leave placeholders
   d. Read `docs/step-granularity.md`
   e. Walk the Steps section of the plan one step at a time, reading each step from disk:
   - Ask: "If I were implementing this step right now, would I know exactly what to do, or would I have to make a design decision the user has not approved?"
   - Ask: "Is this step too big per the granularity reference?"
   - If either question surfaces an issue: stop, ask the user to resolve it, update the step on disk with the decision, then continue to the next step
   - Do not move to the next step until the current step is resolved and written to disk
     f. After all steps pass the review, present the completed plan to the user for final approval
     g. Incorporate any feedback by editing the file; repeat until the user approves
     h. Commit: `git add -A && git commit -m "Add plan doc: <slug>"`
     i. Call `register_plan` immediately after committing
     j. Proceed to issue outline (`review_issue_outline`) and creation (`create_github_issues`) as before

**Verify**

- Running `/plan-finish` results in the agent writing a first-pass plan and then stepping through each step individually before presenting the plan for user review
- The agent asks at least one clarifying question or makes at least one on-disk update during the step review pass on any plan with a non-trivial step
- The user never sees the plan for approval until all steps have passed the implementability and granularity check

---

## Phase 2 (Future)

- **Step sequencing validation**: check that each step's dependencies exist before it runs — i.e., the agent verifies that anything a step relies on was built in a prior step, not a later one; this is a separate pass distinct from the granularity and implementability checks added here
- **UI indicator for `modifyPlanMode`**: status bar widget showing when the write block is active, matching the pattern that could also be added for `planMode`
