import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ApprovalComponent } from "./approval-component.js";
import type { ApprovalAction } from "./approval-component.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
- [Behavioral outcome]
- [Integration validation]

---

## Phase 2 (Future)

- [Deferred action or future phase intent]
`;

// ─── State file ───────────────────────────────────────────────────────────────

interface PlanProgress {
  currentStep: number;
  completedSteps: number[];
}

interface PlanState {
  activePlan: string | null;
  plans: Record<string, PlanProgress>;
}

const PLANS_DIR = "docs/plans";
const STATE_FILE = ".pi/plan-state.json";

async function readState(cwd: string): Promise<PlanState> {
  const raw = await readFile(join(cwd, STATE_FILE), "utf8").catch(() => null);
  return raw ? (JSON.parse(raw) as PlanState) : { activePlan: null, plans: {} };
}

async function writeState(cwd: string, state: PlanState): Promise<void> {
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await writeFile(join(cwd, STATE_FILE), JSON.stringify(state, null, 2) + "\n", "utf8");
}

// ─── Step parsing ────────────────────────────────────────────────────────────

interface ActiveStep {
  number: number;
  title: string;
  body: string;
}

/**
 * Extract a specific step's content by step number from a plan markdown file.
 * Returns null if the step number is not found.
 */
function findStepByNumber(content: string, stepNumber: number): ActiveStep | null {
  const lines = content.split("\n");
  const stepHeadingRe = /^#### Step (\d+) — (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(stepHeadingRe);
    if (!match) continue;
    if (parseInt(match[1], 10) !== stepNumber) continue;

    const title = match[2].trim();

    // Collect body: lines until the next #### or ## heading or end of file
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith("#### ") || lines[j].startsWith("## ")) break;
      bodyLines.push(lines[j]);
    }

    return { number: stepNumber, title, body: bodyLines.join("\n").trim() };
  }

  return null;
}

/**
 * Count total steps in a plan file.
 */
function countSteps(content: string): number {
  const matches = content.match(/^#### Step \d+ — /gm);
  return matches ? matches.length : 0;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let planMode = false;
  let proposedCommitMessage: string | null = null;

  // ── finish_step tool — agent calls this when done with a step ──────────────
  pi.registerTool({
    name: "finish_step",
    label: "Finish Step",
    description:
      "Call this when you have finished implementing the current step. " +
      "Write a conventional commit message summarising exactly what you changed.",
    parameters: Type.Object({
      commitMessage: Type.String({
        description:
          "A conventional commit message for the changes made in this step (e.g. 'feat: add login form validation').",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      proposedCommitMessage = params.commitMessage;
      return {
        content: [{ type: "text", text: `Commit message recorded. Stop here — do not call any more tools.` }],
        details: undefined,
      };
    },
  });

  // ── Approval gate on agent_end ──────────────────────────────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    // ── step approval flow ────────────────────────────────────────────────────
    if (!proposedCommitMessage) return;

    const commitMsg = proposedCommitMessage;
    proposedCommitMessage = null;

    const state = await readState(ctx.cwd);
    const planPath = state.activePlan;
    const stepNumber = planPath ? (state.plans[planPath]?.currentStep ?? null) : null;

    const { stdout: diffStat } = await pi.exec("git", ["diff", "--stat", "HEAD"]);
    const fileChangeLines = diffStat.split("\n").filter((l) => / \| /.test(l));
    const MAX_DISPLAY = 10;

    const displayLines: string[] = [
      `Commit: ${commitMsg}`,
      "",
      ...(fileChangeLines.length <= MAX_DISPLAY
        ? fileChangeLines
        : [
            ...fileChangeLines.slice(0, MAX_DISPLAY),
            `  ...and ${fileChangeLines.length - MAX_DISPLAY} more files`,
          ]),
    ];
    if (fileChangeLines.length === 0) displayLines.push("(no changes detected)");

    const action = await ctx.ui.custom<ApprovalAction | null>(
      (tui, theme, _kb, done) => {
        const component = new ApprovalComponent(
          displayLines,
          done,
          { fg: (c, t) => theme.fg(c as ThemeColor, t), bold: (t) => theme.bold(t) },
          () => tui.requestRender(),
        );
        return {
          render: (w: number) => component.render(w),
          invalidate: () => component.invalidate(),
          handleInput: (data: string) => component.handleInput(data),
        };
      },
      { overlay: true },
    );

    if (!action || action === "reject") {
      ctx.ui.notify(`Step rejected. Provide feedback and re-run /next-step when ready.`, "warning");
      return;
    }

    if (action === "tweak") {
      const feedback = await ctx.ui.input("What do you want to change?");
      if (feedback) pi.sendUserMessage(feedback, { deliverAs: "followUp" });
      // Re-arm: restore commit message so gate fires again on next agent_end
      proposedCommitMessage = commitMsg;
      return;
    }

    // ── Approve ───────────────────────────────────────────────────────────────
    await pi.exec("git", ["add", "-A"]);
    const { code, stderr } = await pi.exec("git", ["commit", "-m", commitMsg]);

    if (code !== 0 && !stderr.includes("nothing to commit")) {
      ctx.ui.notify(`git commit failed: ${stderr}`, "error");
      return;
    }

    ctx.ui.notify(`Committed: ${commitMsg}`, "info");

    if (planPath && state.plans[planPath] && stepNumber !== null) {
      const progress = state.plans[planPath];
      if (!progress.completedSteps.includes(stepNumber)) {
        progress.completedSteps.push(stepNumber);
      }
      progress.currentStep = stepNumber + 1;
      await writeState(ctx.cwd, state);
    }

    pi.sendUserMessage("/auto-advance", { deliverAs: "followUp" });
  });

  // ── Block destructive tools in plan mode ────────────────────────────────────
  pi.on("tool_call", (event, ctx) => {
    if (!planMode) return;

    if (["write", "edit"].includes(event.toolName)) {
      ctx.ui.notify(
        `⏸ Plan mode: \`${event.toolName}\` blocked. Use /plan-finish to exit planning.`,
        "warning",
      );
      return {
        block: true,
        reason:
          "Plan mode is active. write and edit are disabled during planning. " +
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
        `- Call write or edit under any circumstances\n` +
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
    description: "Enter planning mode — discussion only, no file writes",
    handler: (_args, ctx) => {
      planMode = true;
      ctx.ui.notify(
        "⏸ Plan mode enabled. write and edit are blocked.\n" +
          "Discuss and plan freely. Run /plan-finish when ready to generate the plan doc.",
        "info",
      );
      return Promise.resolve();
    },
  });

  // ── /plan-finish ─────────────────────────────────────────────────────────────
  pi.registerCommand("plan-finish", {
    description: "Exit planning mode and generate a populated plan doc from the conversation",
    handler: async (_args, ctx) => {
      planMode = false;
      await mkdir(join(ctx.cwd, PLANS_DIR), { recursive: true });
      const plansDir = join(ctx.cwd, PLANS_DIR);

      ctx.ui.notify(
        `Plan mode disabled. Asking agent to generate plan doc → ${plansDir}/<slug>.md`,
        "info",
      );

      pi.sendUserMessage(
        `Our planning discussion is complete. Please do the following now:\n\n` +
          `1. Review our full conversation above and extract all decisions, goals, constraints, ` +
          `architecture choices, and action items.\n` +
          `2. Choose a short kebab-case slug for this plan based on its title (e.g. "auth-refactor", "api-redesign").\n` +
          `3. Write the populated plan doc to \`${PLANS_DIR}/<slug>.md\` using the template below. Fill in every section from our conversation — do not leave placeholders.\n` +
          `4. Ask the user if they have any feedback or changes to the file.\n` +
          `5. Incorporate any feedback by editing the file, repeating step 4 until the user is satisfied.\n` +
          `6. Once the user approves, run: \`git add -A && git commit -m "Add plan doc: <slug>"\`\n\n` +
          `Here is the template:\n\n${PLAN_TEMPLATE}`,
        { deliverAs: "followUp" },
      );
    },
  });

  // ── /activate-plan ──────────────────────────────────────────────────────────
  pi.registerCommand("activate-plan", {
    description: "Select a plan from docs/plans/ and set it as the active plan",
    handler: async (_args, ctx) => {
      await mkdir(join(ctx.cwd, PLANS_DIR), { recursive: true });
      const files = (await readdir(join(ctx.cwd, PLANS_DIR)))
        .filter((f) => f.endsWith(".md"))
        .sort();

      if (files.length === 0) {
        ctx.ui.notify(
          `No plan files found in ${PLANS_DIR}/. Run /plan-finish to generate one.`,
          "warning",
        );
        return;
      }

      const state = await readState(ctx.cwd);

      // Build display options: show current step progress if tracked
      const options = files.map((f) => {
        const planPath = `${PLANS_DIR}/${f}`;
        const progress = state.plans[planPath];
        const suffix = progress
          ? ` (step ${progress.currentStep}, done: [${progress.completedSteps.join(", ")}])`
          : " (new)";
        return `${f}${suffix}`;
      });

      const selected = await ctx.ui.select("Select a plan to activate", options);
      if (!selected) {
        ctx.ui.notify("No plan selected.", "info");
        return;
      }

      // Extract filename from display string
      const selectedFile = files[options.indexOf(selected)];
      const planPath = `${PLANS_DIR}/${selectedFile}`;

      // Initialize state for this plan if not already tracked
      if (!state.plans[planPath]) {
        state.plans[planPath] = { currentStep: 1, completedSteps: [] };
      }
      state.activePlan = planPath;
      await writeState(ctx.cwd, state);

      const progress = state.plans[planPath];
      ctx.ui.notify(
        `✅ Active plan set to: ${planPath}\n` +
          `Current step: ${progress.currentStep} | Completed: [${progress.completedSteps.join(", ")}]`,
        "info",
      );
    },
  });

  // ── /next-step ───────────────────────────────────────────────────────────────
  pi.registerCommand("next-step", {
    description: "Dispatch the current step from the active plan to the agent",
    handler: async (_args, ctx) => {
      const state = await readState(ctx.cwd);

      if (!state.activePlan) {
        ctx.ui.notify("No active plan. Run /activate-plan to select one.", "warning");
        return;
      }

      const planPath = state.activePlan;
      const progress = state.plans[planPath] ?? { currentStep: 1, completedSteps: [] };

      let planContent: string;
      try {
        planContent = await readFile(join(ctx.cwd, planPath), "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planPath}`, "error");
        return;
      }

      const totalSteps = countSteps(planContent);
      const stepNumber = progress.currentStep;

      if (stepNumber > totalSteps) {
        ctx.ui.notify(`🎉 All ${totalSteps} steps complete! Run /plan-close to finalize.`, "info");
        return;
      }

      const step = findStepByNumber(planContent, stepNumber);
      if (!step) {
        ctx.ui.notify(`Step ${stepNumber} not found in ${planPath}. Check the plan file.`, "error");
        return;
      }

      ctx.ui.notify(`Dispatching Step ${step.number}: ${step.title}`, "info");

      const message =
        `## Plan\n\n${planContent}\n\n---\n\n` +
        `## Your task\n\n` +
        `Implement **Step ${step.number} — ${step.title}**.\n\n` +
        `Step content:\n\n${step.body}\n\n` +
        `When you have finished implementing the step, call the \`finish_step\` tool with a ` +
        `conventional commit message describing exactly what you changed. ` +
        `Do not call any other tools after \`finish_step\`. Do not proceed to any other steps.`;

      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });

  // ── /auto-advance ────────────────────────────────────────────────────────────
  pi.registerCommand("auto-advance", {
    description: "Internal: start a new session pre-seeded with plan context and run /next-step",
    handler: async (_args, ctx) => {
      const result = await ctx.newSession({
        withSession: async (replacementCtx) => {
          await replacementCtx.sendUserMessage("/next-step");
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("New session cancelled — run /next-step manually to continue.", "warning");
      }
    },
  });

  // ── /plan-close ──────────────────────────────────────────────────────────────
  pi.registerCommand("plan-close", {
    description: "Finalize the active plan: update relevant repo files and commit",
    handler: async (_args, ctx) => {
      const state = await readState(ctx.cwd);

      if (!state.activePlan) {
        ctx.ui.notify("No active plan to close. Run /activate-plan first.", "warning");
        return;
      }

      const planPath = state.activePlan;

      let planContent: string;
      try {
        planContent = await readFile(join(ctx.cwd, planPath), "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planPath}`, "error");
        return;
      }

      ctx.ui.notify(`Closing plan: ${planPath}`, "info");

      const planName = planPath.split("/").pop()?.replace(/\.md$/, "") ?? planPath;
      const commitMsg = `plan-close: ${planName}`;

      pi.sendUserMessage(
        `The active plan has been completed. Please do the following:\n\n` +
          `1. Review the full plan below and the current conversation thread.\n` +
          `2. Identify any other files in this repo that should be updated with decisions or outcomes ` +
          `from this plan (e.g. README.md, AGENTS.md, architecture docs, changelogs).\n` +
          `3. Make those updates now using the write and edit tools.\n` +
          `4. When done, run: \`git add -A && git commit -m "${commitMsg}"\`\n` +
          `5. After committing, your work here is complete.\n\n` +
          `## Plan name: ${planName}\n\n` +
          `## Plan content\n\n${planContent}`,
        { deliverAs: "followUp" },
      );

      // Clear activePlan from state
      const updatedState = await readState(ctx.cwd);
      updatedState.activePlan = null;
      await writeState(ctx.cwd, updatedState);
    },
  });
}
