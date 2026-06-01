import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
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

// ─── Step parsing ────────────────────────────────────────────────────────────

interface ActiveStep {
  number: number;
  title: string;
  body: string;
  rawHeading: string; // the exact "#### Step N — Title" line as written
}

/**
 * Find the first step with a ☐ checkbox in the heading.
 * Returns null if none found.
 */
function findNextStep(content: string): ActiveStep | null {
  // Match "#### Step N — Title" lines where N and title follow the heading
  const stepHeadingRe = /^#### Step (\d+) — (.+)$/m;
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for headings that haven't been checked off
    // Checked steps have ☑ somewhere in the heading; unchecked have no ☑
    const match = line.match(stepHeadingRe);
    if (!match) continue;

    // Check if this step is already completed (☑ in the line)
    if (line.includes("☑")) continue;

    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    const rawHeading = line;

    // Collect body: everything from the next line until the next #### heading or end
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith("#### ") || lines[j].startsWith("## ")) break;
      bodyLines.push(lines[j]);
    }

    return { number, title, body: bodyLines.join("\n").trim(), rawHeading };
  }

  return null;
}

/**
 * Flip the first occurrence of rawHeading in content from ☐ to ☑ (or mark as done).
 * Since the heading itself doesn't contain ☐, we mark it by appending ☑ to the heading.
 */
function markStepComplete(content: string, step: ActiveStep): string {
  // Replace the exact heading with a version that has ☑ prepended to the title
  const completed = step.rawHeading.replace(
    `Step ${step.number} — ${step.title}`,
    `Step ${step.number} — ☑ ${step.title}`,
  );
  return content.replace(step.rawHeading, completed);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let planMode = false;
  let activeStep: ActiveStep | null = null;

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

  // ── Approval gate on agent_end ──────────────────────────────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    if (!activeStep || !ctx.hasUI) return;

    const step = activeStep;
    const planFile = getPlanFile(ctx.cwd);

    const approved = await ctx.ui.confirm(
      `✅ Step ${step.number} complete?`,
      `Approve "${step.title}" to commit and advance.`,
    );

    if (!approved) {
      activeStep = null;
      ctx.ui.notify(
        `Step ${step.number} rejected. Provide feedback and re-run /next-step when ready.`,
        "warning",
      );
      return;
    }

    // Commit work
    await pi.exec("git", ["add", "-A"]);
    const { code, stderr } = await pi.exec("git", [
      "commit",
      "-m",
      `Step ${step.number}: ${step.title}`,
    ]);

    if (code !== 0 && !stderr.includes("nothing to commit")) {
      ctx.ui.notify(`git commit failed: ${stderr}`, "error");
    } else {
      ctx.ui.notify(`Committed: Step ${step.number} — ${step.title}`, "info");
    }

    // Mark step complete in plan file
    try {
      const content = readFileSync(planFile, "utf8");
      const updated = markStepComplete(content, step);
      writeFileSync(planFile, updated, "utf8");

      // Commit the updated plan file
      await pi.exec("git", ["add", planFile]);
      await pi.exec("git", [
        "commit",
        "--allow-empty",
        "-m",
        `Mark Step ${step.number} complete in plan`,
      ]);
    } catch (err) {
      ctx.ui.notify(`Failed to update plan file: ${String(err)}`, "error");
    }

    // Clear active step, then queue /auto-advance
    activeStep = null;
    pi.sendUserMessage("/auto-advance", { deliverAs: "followUp" });
  });

  // ── /next-step ───────────────────────────────────────────────────────────────
  pi.registerCommand("next-step", {
    description: "Find the next unchecked step in the plan and dispatch it to the agent",
    handler: (_args, ctx) => {
      const planFile = getPlanFile(ctx.cwd);

      let content: string;
      try {
        content = readFileSync(planFile, "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planFile}`, "error");
        return Promise.resolve();
      }

      const step = findNextStep(content);
      if (!step) {
        ctx.ui.notify("🎉 All steps are complete! No remaining ☐ steps found.", "info");
        return Promise.resolve();
      }

      activeStep = step;
      ctx.ui.notify(`Dispatching Step ${step.number}: ${step.title}`, "info");

      const message =
        `## Plan\n\n${content}\n\n---\n\n` +
        `## Your task\n\n` +
        `Implement **Step ${step.number} — ${step.title}** (marked above).\n\n` +
        `When done, stop — do not proceed to any other steps.`;

      pi.sendUserMessage(message, { deliverAs: "followUp" });
      return Promise.resolve();
    },
  });

  // ── /auto-advance ────────────────────────────────────────────────────────────
  pi.registerCommand("auto-advance", {
    description: "Internal: start a new session pre-seeded with plan context and run /next-step",
    handler: async (_args, ctx) => {
      const planFile = getPlanFile(ctx.cwd);

      let planContent = "";
      try {
        planContent = readFileSync(planFile, "utf8");
      } catch {
        // Plan file may not exist yet; continue without it
      }

      const currentSession = ctx.sessionManager.getSessionFile();
      const planContentSnapshot = planContent; // capture before session teardown

      const result = await ctx.newSession({
        parentSession: currentSession,
        setup: async (sm) => {
          if (planContentSnapshot) {
            sm.appendMessage({
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `## Current Plan\n\nHere is the current state of the plan file (${planFile}):\n\n` +
                    "```markdown\n" +
                    planContentSnapshot +
                    "\n```\n\nPlan loaded. Ready to implement the next step.",
                },
              ],
              timestamp: Date.now(),
            });
          }
        },
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage("/next-step");
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("New session cancelled — run /next-step manually to continue.", "warning");
      }
    },
  });
}
