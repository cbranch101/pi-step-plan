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

# AI Planning Doc: Remove GitHub Issues and Harden Branching

---

## Project Summary

This phase simplifies `pi-step-plan` for solo development by removing GitHub issue creation, update, tracking, and PR-closing integration from the plan workflow. It also hardens branch creation so new plans always branch from an updated `main` instead of the current branch, and it ensures PR submission pushes the feature branch before creating or updating a pull request. The phase is done when plans can be created, modified, executed, and closed without any GitHub issue workflow, while branch/PR operations fail early with clear guidance when prerequisites are not met.

---

## Goals & Success Criteria

- `/plan-finish`, `/modify-plan-finish`, `/plan-adopt`, and `/plan-close` no longer instruct the agent to create, update, pass, or close GitHub issues.
- `create_pull_request` accepts only PR content and optional inline review comments; it no longer accepts issue numbers or injects `closes #N` lines.
- New plan branch creation always starts from a clean working tree, switches to `main`, pulls `origin main`, rejects an existing local or remote `feature/<slug>` branch, and only then creates the feature branch.
- PR submission pushes the current feature branch to `origin` before attempting to create or reuse a PR.
- README documentation describes the simplified solo-developer workflow and no longer advertises GitHub issue management.

---

## Relevant Files

- `extensions/index.ts` (modify) — remove GitHub issue state/tools/prompts, update PR contract, and harden branch/push instructions.
- `README.md` (modify) — document the no-issues workflow, branch-from-main behavior, and PR submission expectations.
- `docs/plans/remove-github-issues-harden-branching.md` (add) — implementation work order for this phase.

---

## Constraints

- Do not add automatic GitHub repository creation in this phase.
- Branch setup must use hard-coded `main`; do not detect or substitute another default branch.
- If the working tree is dirty before creating the plan branch, stop and ask the user to commit, stash, or have an agent commit first.
- If `feature/<slug>` already exists locally or remotely, stop and ask the user what to do instead of reusing or overwriting it.
- If `origin` is missing when branch setup needs `git pull origin main`, allow the flow to fail clearly rather than creating a repository or remote.
- Preserve branch management and pull request creation; only GitHub issue management is removed.

---

## Architecture & Design

- `PlanProgress` no longer stores `githubIssues`; plan state tracks only step progress and the feature branch.
- Issue-management agent tools are deleted from the extension registration surface.
- Plan-generation and plan-adoption prompts become responsible for branch setup from `main` before writing/committing the plan doc.
- Plan-modification prompts keep the consistency-check and commit workflow but remove all issue-update instructions.
- PR creation becomes issue-agnostic: the tool confirms title/body/comments, pushes the branch, creates or finds the PR, and optionally posts inline review comments.

---

## Interfaces & Contracts

- Removed tools: `review_issue_outline`, `create_github_issues`, `update_github_issues`.
- Modified state contract: `PlanProgress` removes `githubIssues`.
- Modified `register_plan` behavior: initializes `currentStep`, `completedSteps`, and `branch` only.
- Modified `create_pull_request` input: remove `issueNumbers`; keep `title`, `body`, and `comments`.
- Modified `/plan-finish` and `/plan-adopt` agent instructions: branch setup must run from clean updated `main` and reject existing feature branches before plan doc creation/commit.
- Modified `/modify-plan-finish` agent instructions: no GitHub issue update phase.
- Modified `/plan-close` agent instructions: call `create_pull_request` without issue numbers.

---

## Dependencies

- No new package dependencies.
- Continued external CLI dependencies: `git` and `gh` for existing branch, push, and PR flows.
- Removed dependency on GitHub Issues being available or enabled for normal plan lifecycle usage.

**Outcome:** The extension keeps Git branch and PR support while removing all GitHub issue workflow coupling.

---

## Risks / Unknowns

- **Existing `.pi/plan-state.json` files may still contain `githubIssues`.** → Removing the field from TypeScript state should tolerate extra JSON properties at runtime; validate by typecheck and by reviewing state reads/writes for assumptions.
- **Prompt-only branch setup can still be skipped by an agent.** → Make the `/plan-finish` and `/plan-adopt` instructions explicit, ordered, and fail-fast; future phases can consider moving branch setup into extension-owned command logic.
- **Remote branch existence checks depend on `origin`.** → If `origin` is missing or inaccessible, the branch setup command sequence should fail before plan commit and tell the user to configure the remote.
- **Archived reference plans mention older GitHub issue behavior.** → Leave historical reference plans unchanged unless they affect active docs or runtime behavior.

---

## Decision Log

- **2026-08-18** — Removed GitHub issue workflow entirely because the intended user is working solo and does not need issue creation at plan finish or issue closure from PRs.
- **2026-08-18** — Kept pull request creation and branch management because they remain useful for review, CI, and merge discipline.
- **2026-08-18** — Branch setup must always start from hard-coded `main`, not the current branch, to prevent accidentally branching off another feature branch and making that branch the PR base.
- **2026-08-18** — Dirty working trees and pre-existing feature branches are blocking conditions during branch setup; the extension should ask the user instead of guessing whether to reuse, overwrite, commit, or stash.
- **2026-08-18** — Automatic repository creation is out of scope. If no remote exists, the workflow should fail clearly and let the user create/configure the repository separately.

---

## Steps

#### Step 1 — Remove GitHub Issue State and Tools

**Recipe**

1. In `extensions/index.ts`, remove `githubIssues` from `PlanProgress` and from all state initialization paths including `register_plan`, `/activate-plan`, and `/plan-adopt`.
2. Delete the `review_issue_outline`, `create_github_issues`, and `update_github_issues` tool registrations and any helper-only logic used solely by those tools.
3. Update `/plan-finish` so, after committing and calling `register_plan`, it stops; remove all instructions to slice the plan into issues, review issue outlines, or create issues.
4. Update `/modify-plan-finish` so it performs only forward consistency check, user approval, and commit; remove the issue-update section and all references to `githubIssues`.

Changes not required by these bullets are out of scope for this Step.

**Verify**

- Searching active runtime code for `review_issue_outline`, `create_github_issues`, `update_github_issues`, and `githubIssues` finds no remaining live references in `extensions/index.ts`.
- `/plan-finish` and `/modify-plan-finish` prompts no longer mention GitHub issues.
- `npm run typecheck` passes.

---

#### Step 2 — Simplify Pull Request Contract

**Recipe**

1. In `extensions/index.ts`, remove `issueNumbers` from the `create_pull_request` tool description, parameter schema, local variable handling, and body construction.
2. Remove `closes #N` injection from PR bodies.
3. Update the `/plan-close` prompt so it instructs the agent to call `create_pull_request` with only `title`, `body`, and `comments`.
4. Remove `/plan-close` logic that reads stored issue numbers or builds issue-number guidance for the PR prompt.

Changes not required by these bullets are out of scope for this Step.

**Verify**

- The `create_pull_request` schema contains `title`, `body`, and `comments`, with no `issueNumbers` field.
- The PR body is exactly the user-approved body, with no automatic issue-closing footer.
- `/plan-close` instructions no longer mention issue numbers or `closes #N`.
- `npm run typecheck` passes.

---

#### Step 3 — Harden Plan Branch Setup From Main

**Recipe**

1. Update the `/plan-finish` agent instructions so branch setup happens before writing the plan doc and follows this fail-fast sequence: verify clean working tree; `git switch main`; `git pull origin main`; verify `feature/<slug>` does not exist locally; verify `feature/<slug>` does not exist on `origin`; create/switch to `feature/<slug>` from updated `main`.
2. Update the `/plan-adopt` agent instructions with the same branch setup sequence before committing the adopted plan.
3. Make the instructions explicit that any failure in the sequence must stop the workflow before plan doc creation or commit, and the agent must ask the user how to proceed.
4. Preserve the existing `register_plan` call after the plan doc commit, passing the committed plan path and current feature branch.

Changes not required by these bullets are out of scope for this Step.

**Verify**

- `/plan-finish` no longer says to create a branch from the current branch or to skip branch creation because the current branch already has the target name.
- `/plan-finish` and `/plan-adopt` both instruct the agent to switch to `main`, pull `origin main`, and reject existing local or remote feature branches.
- The branch setup instructions run before plan writing/commit instructions.
- `npm run typecheck` passes.

---

#### Step 4 — Ensure PR Submission Pushes the Feature Branch

**Recipe**

1. Keep or update `create_pull_request` so it runs `git push --set-upstream origin HEAD` before checking for an existing PR or creating a new one.
2. Ensure push failure returns a clear tool message instructing the agent/user to resolve the push issue and retry PR creation.
3. Review `/plan-close` existing-PR path and ensure branch changes are pushed before the close flow reports success for an existing PR.

Changes not required by these bullets are out of scope for this Step.

**Verify**

- `create_pull_request` cannot call `gh pr create` before a successful push.
- Push failures do not proceed to PR creation or review posting.
- Existing-PR `/plan-close` behavior still pushes branch changes and reports push failures clearly.
- `npm run typecheck` passes.

---

#### Step 5 — Update Documentation

**Recipe**

1. Update `README.md` to remove GitHub issue lifecycle claims from the overview, command/tool tables, execution model, and example workflow.
2. Document that plans are still committed on feature branches and closed via PRs, but issue creation/update/closure is no longer part of the extension.
3. Document the branch-from-`main` setup rule for `/plan-finish` and `/plan-adopt`, including dirty-tree and existing-branch failure behavior.
4. Document that automatic GitHub repository creation is not provided; users must configure `origin` separately before workflows that require pulling/pushing.

Changes not required by these bullets are out of scope for this Step.

**Verify**

- README no longer lists issue-management tools or instructs users to create issues during `/plan-finish`.
- README accurately describes `create_pull_request` without `issueNumbers`.
- `npm run lint` and `npm run typecheck` pass.

---

## Phase 2 (Future)

- Consider moving branch setup out of agent prompts and into extension-owned command logic for stronger enforcement.
- Consider adding a separate repository bootstrap command or Pi skill to create/configure a GitHub repository and `origin` remote for empty repos.
- Consider migration cleanup for existing `.pi/plan-state.json` files that still contain historical `githubIssues` arrays.
