import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Embedded plan doc template ───────────────────────────────────────────────
const PLAN_TEMPLATE = `<!--
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

STRUCTURAL RULES
- This meta block must remain in all versions of the doc.
- Append new Steps to the end; do not renumber completed ones.
- Each Step must map to one checklist item.
- Remove placeholder comments after first population.
- For interfaces, dependencies, or workflows that are unchanged, simply mark "Unchanged."

END AI_DOC_META_GUIDANCE
-->

# AI Planning Doc: [Project Name]

---

## Project Summary

[2–4 sentences describing the problem, system impact, and done condition for this phase only.]

---

## Goals & Success Criteria

- [Measurable capability or behavioral outcome]
- [Measurable capability or behavioral outcome]
- [Measurable capability or behavioral outcome]

---

## Relevant Files

- \`path/to/file\` (add|modify|remove) — [purpose]

---

## Constraints

- [Hard boundary or external rule that cannot change]
- [Hard boundary or external rule that cannot change]

---

## Architecture & Design

- [Structural delta: directory, dependency, build, import, or testability change]
- [Structural delta]

---

## Interfaces & Contracts

[New or modified APIs, data schemas, build workflows, or import paths only. Mark unchanged ones as "Unchanged."]

---

## Dependencies

- [Grouped overview: new additions, removals, or conflicts]

**Outcome:** [1-line summary of successful resolution]

---

## Risks / Unknowns

- **[Risk]** → [Mitigation / Validation]
- **[Risk]** → [Mitigation / Validation]

---

## Decision Log

- **[Date]** — [Rationale, tradeoff, alternatives]

---

## Steps

#### Step 1 — [Action-Oriented Title]

**Recipe**
1) [What changes, not how to click or run commands]
2) [Reference affected file(s) or function(s)]

**Verify**
- [ ] [Behavioral outcome]
- [ ] [Integration validation]

---

## Phase 2 (Future)

- [Deferred action or future phase intent]
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPlanFile(cwd: string): string {
  try {
    const settingsPath = join(cwd, ".pi", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { planFile?: string };
    if (settings.planFile) return join(cwd, settings.planFile);
  } catch {
    // fall through to default
  }
  return join(cwd, "dev-plan.md");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let planMode = false;

  // ── Block destructive tools in plan mode ────────────────────────────────────
  pi.on("tool_call", (event, ctx) => {
    if (!planMode) return;

    if (["bash", "write", "edit"].includes(event.toolName)) {
      ctx.ui.notify(
        `⏸ Plan mode: \`${event.toolName}\` blocked. Use /plan-finish to exit planning.`,
        "warning",
      );
      return {
        block: true,
        reason:
          "Plan mode is active. bash, write, and edit are disabled during planning. " +
          "Discuss and plan only — no implementation. Run /plan-finish when done.",
      };
    }
  });

  // ── Inject system prompt addition in plan mode ──────────────────────────────
  pi.on("before_agent_start", (event) => {
    if (!planMode) return;

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## ⏸ PLAN MODE ACTIVE\n` +
        `You are in a structured planning conversation. Your ONLY job right now is to think, ` +
        `ask clarifying questions, and discuss the approach.\n` +
        `\n` +
        `**You must NOT:**\n` +
        `- Call bash, write, or edit under any circumstances\n` +
        `- Start implementing anything\n` +
        `- Write code in responses unless it is illustrative pseudocode\n` +
        `\n` +
        `**You MUST:**\n` +
        `- Ask questions to fill in gaps before proposing a design\n` +
        `- Produce a clear, structured plan when asked\n` +
        `- Stay in discussion mode until the user runs /plan-finish\n` +
        `\nWhen /plan-finish is called, you will be asked to populate this template from our conversation:\n\n` +
        PLAN_TEMPLATE,
    };
  });

  // ── /plan-start ─────────────────────────────────────────────────────────────
  pi.registerCommand("plan-start", {
    description: "Enter planning mode — discussion only, no file writes or bash execution",
    handler: (_args, ctx) => {
      planMode = true;
      ctx.ui.notify(
        "⏸ Plan mode enabled. bash, write, and edit are blocked.\n" +
          "Discuss and plan freely. Run /plan-finish when ready to generate the plan doc.",
        "info",
      );
      return Promise.resolve();
    },
  });

  // ── /plan-finish ─────────────────────────────────────────────────────────────
  pi.registerCommand("plan-finish", {
    description: "Exit planning mode and generate a populated plan doc from the conversation",
    handler: (_args, ctx) => {
      planMode = false;
      const planFile = getPlanFile(ctx.cwd);

      ctx.ui.notify(`Plan mode disabled. Asking agent to generate plan doc → ${planFile}`, "info");

      pi.sendUserMessage(
        `Our planning discussion is complete. Please do the following now:\n\n` +
          `1. Review our full conversation above and extract all decisions, goals, constraints, ` +
          `architecture choices, and action items.\n` +
          `2. Write a populated plan doc to \`${planFile}\` using the template below. ` +
          `Fill in every section from our conversation — do not leave placeholders.\n` +
          `3. After writing the file, run: \`git add -A && git commit -m "Add plan doc"\`\n\n` +
          `Here is the template:\n\n${PLAN_TEMPLATE}`,
        { deliverAs: "followUp" },
      );
      return Promise.resolve();
    },
  });

  // ── /next-step ───────────────────────────────────────────────────────────────
  pi.registerCommand("next-step", {
    description: "Find the next unchecked step in the plan and dispatch it to the agent",
    handler: (_args, ctx) => {
      ctx.ui.notify("next-step: not yet implemented", "info");
      return Promise.resolve();
    },
  });
}
