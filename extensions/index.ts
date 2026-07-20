import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ApprovalComponent } from "./approval-component.js";
import type { ApprovalAction } from "./approval-component.js";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  githubIssues: number[];
  branch: string | null;
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
 * Find the next step with a number >= stepNumber.
 * Returns null if no such step exists (all steps complete).
 */
function findStepByNumber(content: string, stepNumber: number): ActiveStep | null {
  const lines = content.split("\n");
  const stepHeadingRe = /^#### Step (\d+) [\u2014\u2013-] (.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(stepHeadingRe);
    if (!match) continue;
    if (parseInt(match[1], 10) < stepNumber) continue;

    const num = parseInt(match[1], 10);
    const title = match[2].trim();

    // Collect body: lines until the next step heading or end of file
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (stepHeadingRe.test(lines[j])) break;
      bodyLines.push(lines[j]);
    }

    return { number: num, title, body: bodyLines.join("\n").trim() };
  }

  return null;
}

// ─── Extension ────────────────────────────────────────────────────────────────

// ─── Notifications ───────────────────────────────────────────────────────────

function notifyOSC777(title: string, body: string): void {
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
  process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
  process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string): void {
  const type = "Windows.UI.Notifications";
  const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText01`;
  const toast = `[${type}.ToastNotification]::new($xml)`;
  const script = [
    `${mgr} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(${toast})`,
  ].join("; ");
  execFile("powershell.exe", ["-NoProfile", "-Command", script]);
}

function notify(title: string, body: string): void {
  if (process.env.WT_SESSION) {
    notifyWindows(title, body);
  } else if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(title, body);
  } else {
    notifyOSC777(title, body);
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("agent_end", () => {
    notify("Pi", "Ready for input");
  });

  let planMode = false;
  let revisePlanPath: string | null = null; // non-null when entered via /revise-plan
  let activeStepNumber: number | null = null; // non-null only while a step is dispatched

  // ── finish_step tool — agent calls this when done with a step ──────────────
  pi.registerTool({
    name: "finish_step",
    label: "Finish Step",
    description:
      "Call this ONLY when you have been explicitly dispatched a step via /next-step or /resume-step and have finished implementing it. " +
      "Do NOT call this during normal conversations, bug fixes, or any work outside of an active plan step. " +
      "Write a conventional commit message summarising exactly what you changed.",
    parameters: Type.Object({
      commitMessage: Type.String({
        description:
          "A conventional commit message for the changes made in this step (e.g. 'feat: add login form validation').",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      // Guard: only callable when a step was explicitly dispatched via /next-step or /resume-step
      if (activeStepNumber === null) {
        return {
          content: [
            {
              type: "text",
              text: "finish_step was called outside of an active step dispatch. No /next-step or /resume-step has been run in this session. Do not commit or modify state — stop and wait for user instructions.",
            },
          ],
          details: undefined,
        };
      }

      const commitMsg = params.commitMessage;

      // Collect diff --stat output
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

      if (fileChangeLines.length === 0) {
        displayLines.push("(no changes detected)");
      }

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
        { overlay: false },
      );

      // ── Reject ────────────────────────────────────────────────────────────
      if (!action || action === "reject") {
        return {
          content: [
            {
              type: "text",
              text: "Step rejected by user. Stop and wait for further instructions.",
            },
          ],
          details: undefined,
        };
      }

      // ── Tweak ─────────────────────────────────────────────────────────────
      if (action === "tweak") {
        const feedback = await ctx.ui.input("What do you want to change?");
        return {
          content: [
            {
              type: "text",
              text: feedback
                ? `User feedback: ${feedback}. Please make the requested changes and call finish_step again when done.`
                : "User requested changes. Please review your work and call finish_step again when done.",
            },
          ],
          details: undefined,
        };
      }

      // ── Approve ───────────────────────────────────────────────────────────
      // Re-read state before writing to avoid stale-state overwrites, then
      // advance plan progress so .pi/plan-state.json is included in the commit.
      const state = await readState(ctx.cwd);
      const planPath = state.activePlan;

      if (!planPath || !state.plans[planPath]) {
        ctx.ui.notify("State is inconsistent: no active plan found.", "error");
        return {
          content: [
            {
              type: "text",
              text: "State is inconsistent: activePlan is null or missing from plans map. currentStep was not updated and no commit was made. Do not proceed.",
            },
          ],
          details: undefined,
        };
      }

      const progress = state.plans[planPath];
      const stepNumber = progress.currentStep;
      if (!progress.completedSteps.includes(stepNumber)) {
        progress.completedSteps.push(stepNumber);
      }
      progress.currentStep = stepNumber + 1;
      await writeState(ctx.cwd, state);

      await pi.exec("git", ["add", "-A"]);
      const { code, stderr } = await pi.exec("git", ["commit", "-m", commitMsg]);

      if (code !== 0 && !stderr.includes("nothing to commit")) {
        ctx.ui.notify(`git commit failed: ${stderr}`, "error");
        return {
          content: [{ type: "text", text: `Git commit failed: ${stderr}. Do not proceed.` }],
          details: undefined,
        };
      }

      activeStepNumber = null;
      ctx.ui.notify(`Committed: ${commitMsg}`, "info");

      return {
        content: [
          {
            type: "text",
            text: `Step committed successfully: "${commitMsg}". Start a new session and run /next-step to continue.`,
          },
        ],
        details: undefined,
      };
    },
  });

  // ── review_issue_outline tool — agent calls this before create_github_issues ──
  pi.registerTool({
    name: "review_issue_outline",
    label: "Review Issue Outline",
    description:
      "Call this after the plan doc has been committed, BEFORE drafting full issue bodies. " +
      "Submit a list of proposed issue titles and one-sentence summaries so the user can approve the shape and granularity of the tickets. " +
      "If the user requests changes, revise the outline and call this tool again. " +
      "Only call create_github_issues once this tool returns an approved result.",
    parameters: Type.Object({
      issues: Type.Array(
        Type.Object({
          title: Type.String({ description: "Issue title" }),
          summary: Type.String({
            description: "One-sentence description of the problem this issue addresses",
          }),
        }),
        { description: "Proposed issue titles and summaries for granularity review" },
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const outlineText = params.issues
        .map((issue, i) => `${i + 1}. ${issue.title}\n   ${issue.summary}`)
        .join("\n\n");

      const confirmed = await ctx.ui.confirm(
        `Approve this issue outline? (${params.issues.length} issue${params.issues.length !== 1 ? "s" : ""})`,
        outlineText,
      );

      if (confirmed) {
        const approvedList = params.issues
          .map((issue, i) => `${i + 1}. ${issue.title} — ${issue.summary}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text:
                `Outline approved by user. Now expand each item into a full issue body and call create_github_issues with the complete bodies.\n\n` +
                `Approved outline:\n${approvedList}`,
            },
          ],
          details: undefined,
        };
      }

      const feedback = await ctx.ui.input(
        "What changes would you like to the issue outline? (leave blank to cancel)",
      );
      return {
        content: [
          {
            type: "text",
            text: feedback?.trim()
              ? `User requested changes to the outline: ${feedback.trim()}. Revise the outline and call review_issue_outline again. Do not call create_github_issues yet.`
              : "User declined the outline without feedback. Revise and call review_issue_outline again.",
          },
        ],
        details: undefined,
      };
    },
  });

  // ── create_github_issues tool — agent calls this after /plan-finish commit ──
  pi.registerTool({
    name: "create_github_issues",
    label: "Create GitHub Issues",
    description:
      "Call this after the plan doc has been committed during /plan-finish. " +
      "Submit drafted GitHub issues for user review; the extension will handle confirmation and creation via gh. " +
      "Do NOT run gh commands directly. If the tool returns feedback for any issue, revise that issue and call this tool again.",
    parameters: Type.Object({
      issues: Type.Array(
        Type.Object({
          title: Type.String({ description: "Issue title" }),
          body: Type.String({ description: "Issue body describing the problem being solved" }),
        }),
        { description: "Draft issues to present for user review" },
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const state = await readState(ctx.cwd);
      const planPath = state.activePlan;

      if (!planPath || !state.plans[planPath]) {
        return {
          content: [
            { type: "text", text: "No active plan found in state. Cannot create GitHub issues." },
          ],
          details: undefined,
        };
      }

      const createdNumbers: number[] = [];
      const feedbackItems: string[] = [];

      for (const issue of params.issues) {
        const confirmed = await ctx.ui.confirm(`Create this issue: "${issue.title}"?`, issue.body);

        if (confirmed) {
          let ghOutput: string;
          try {
            const { code, stdout, stderr } = await pi.exec("gh", [
              "issue",
              "create",
              "--title",
              issue.title,
              "--body",
              issue.body,
            ]);
            if (code !== 0) {
              ctx.ui.notify(`gh issue create failed: ${stderr}`, "error");
              return {
                content: [
                  {
                    type: "text",
                    text: `gh issue create failed: ${stderr}. Do not proceed with remaining issues.`,
                  },
                ],
                details: undefined,
              };
            }
            ghOutput = stdout.trim();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(`gh not available: ${msg}`, "error");
            return {
              content: [
                {
                  type: "text",
                  text: `gh is not installed or not authenticated: ${msg}. Cannot create issues.`,
                },
              ],
              details: undefined,
            };
          }

          // Parse issue number from URL (e.g. https://github.com/owner/repo/issues/42)
          const urlMatch = ghOutput.match(/\/issues\/(\d+)/);
          if (urlMatch) {
            const issueNumber = parseInt(urlMatch[1]!, 10);
            createdNumbers.push(issueNumber);
            ctx.ui.notify(`Created issue #${issueNumber}: ${issue.title}`, "info");
          } else {
            ctx.ui.notify(`Issue created but could not parse number from: ${ghOutput}`, "warning");
          }
        } else {
          const feedback = await ctx.ui.input(
            `Any feedback on "${issue.title}"? (leave blank to skip)`,
          );
          if (feedback?.trim()) {
            feedbackItems.push(`- "${issue.title}": ${feedback.trim()}`);
          }
        }
      }

      // Persist created issue numbers into state
      const freshState = await readState(ctx.cwd);
      if (freshState.activePlan && freshState.plans[freshState.activePlan]) {
        const progress = freshState.plans[freshState.activePlan];
        if (!progress.githubIssues) progress.githubIssues = [];
        for (const n of createdNumbers) {
          if (!progress.githubIssues.includes(n)) {
            progress.githubIssues.push(n);
          }
        }
        await writeState(ctx.cwd, freshState);
      }

      const createdSummary =
        createdNumbers.length > 0
          ? `Created ${createdNumbers.length} issue(s): ${createdNumbers.map((n) => `#${n}`).join(", ")}.`
          : "No issues were created.";

      if (feedbackItems.length > 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `${createdSummary}\n\n` +
                `The following issues were declined with feedback — please revise them and call create_github_issues again:\n` +
                feedbackItems.join("\n"),
            },
          ],
          details: undefined,
        };
      }

      return {
        content: [{ type: "text", text: createdSummary }],
        details: undefined,
      };
    },
  });

  // ── create_pull_request tool — agent calls this after /plan-close commit ────
  pi.registerTool({
    name: "create_pull_request",
    label: "Create Pull Request",
    description:
      "Call this after the cleanup commit during /plan-close. " +
      "Submit the drafted PR title, body, and the issue numbers returned by create_github_issues. " +
      "The extension will inject 'closes #N' lines for each issue number, then handle confirmation and creation via gh. " +
      "Do NOT run gh commands directly. If the tool returns feedback, revise and call this tool again.",
    parameters: Type.Object({
      title: Type.String({ description: "PR title" }),
      body: Type.String({ description: "PR body describing what this PR does" }),
      issueNumbers: Type.Array(Type.Number(), {
        description:
          "GitHub issue numbers to close with this PR — pass the numbers returned by create_github_issues. Pass an empty array if no issues were created.",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const issueNumbers: number[] = params.issueNumbers;

      const closesLines =
        issueNumbers.length > 0 ? "\n\n" + issueNumbers.map((n) => `closes #${n}`).join("\n") : "";

      const fullBody = params.body + closesLines;

      const confirmed = await ctx.ui.confirm(`Create this PR: "${params.title}"?`, fullBody);

      if (!confirmed) {
        const feedback = await ctx.ui.input(
          "What do you want to change about the PR? (leave blank to cancel)",
        );
        if (feedback?.trim()) {
          return {
            content: [
              {
                type: "text",
                text:
                  `User declined the PR with feedback: ${feedback.trim()}. ` +
                  `Please revise the title and/or body and call create_pull_request again.`,
              },
            ],
            details: undefined,
          };
        }
        return {
          content: [{ type: "text", text: "PR creation cancelled by user." }],
          details: undefined,
        };
      }

      let ghOutput: string;
      try {
        const { code, stdout, stderr } = await pi.exec("gh", [
          "pr",
          "create",
          "--title",
          params.title,
          "--body",
          fullBody,
        ]);
        if (code !== 0) {
          ctx.ui.notify(`gh pr create failed: ${stderr}`, "error");
          return {
            content: [
              {
                type: "text",
                text: `gh pr create failed: ${stderr}. Do not proceed.`,
              },
            ],
            details: undefined,
          };
        }
        ghOutput = stdout.trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`gh not available: ${msg}`, "error");
        return {
          content: [
            {
              type: "text",
              text: `gh is not installed or not authenticated: ${msg}. Cannot create PR.`,
            },
          ],
          details: undefined,
        };
      }

      ctx.ui.notify(`PR created: ${ghOutput}`, "info");
      return {
        content: [
          {
            type: "text",
            text: `Pull request created successfully: ${ghOutput}`,
          },
        ],
        details: undefined,
      };
    },
  });

  // ── Block destructive tools in plan mode ────────────────────────────────────
  pi.on("tool_call", (event, ctx) => {
    if (!planMode) return;

    if (["write", "edit"].includes(event.toolName)) {
      // In all plan modes, allow writes anywhere inside docs/
      const inputPath = (event.input as { path?: string }).path;
      if (inputPath && (inputPath.startsWith("docs/") || inputPath.startsWith("/docs/"))) return;

      const exitCmd = revisePlanPath ? "/resume-step" : "/plan-finish";
      ctx.ui.notify(
        `⏸ Plan mode: \`${event.toolName}\` blocked. Use ${exitCmd} to exit planning.`,
        "warning",
      );
      return {
        block: true,
        reason: revisePlanPath
          ? "Plan revision mode is active. write and edit are disabled outside of docs/. " +
            "Edit docs only — no implementation. Run /resume-step when done."
          : "Plan mode is active. write and edit are disabled outside of docs/. " +
            "Discuss and plan only — no implementation. Run /plan-finish when done.",
      };
    }
  });

  // ── Inject system prompt addition in plan mode ──────────────────────────────
  pi.on("before_agent_start", (event) => {
    if (!planMode) return;

    if (revisePlanPath) {
      return {
        systemPrompt:
          event.systemPrompt +
          `\n\n## ⏸ PLAN REVISION MODE ACTIVE\n` +
          `Step execution is paused. Your ONLY job right now is to discuss and revise the plan doc.\n` +
          `\n` +
          `**You must NOT:**\n` +
          `- Call write or edit on any file outside the docs/ directory\n` +
          `- Implement any code\n` +
          `\n` +
          `**You MUST:**\n` +
          `- Discuss what needs to change with the user\n` +
          `- Edit the plan doc directly when changes are agreed upon\n` +
          `- Stay in revision mode until the user runs /resume-step\n`,
      };
    }

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## ⏸ PLAN MODE ACTIVE\n` +
        `You are in a structured planning conversation. Your ONLY job right now is to think, ` +
        `ask clarifying questions, and discuss the approach.\n` +
        `\n` +
        `**You must NOT:**\n` +
        `- Call write or edit outside of the docs/ directory\n` +
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
          `3. Check the current branch with \`git branch --show-current\`. If it is already \`feature/<slug>\`, skip branch creation. Otherwise run \`git checkout -b feature/<slug> main\` to create and switch to it. All subsequent commits must happen on this branch.\n` +
          `4. Write the populated plan doc to \`${PLANS_DIR}/<slug>.md\` using the template below. Fill in every section from our conversation — do not leave placeholders.\n` +
          `5. Ask the user if they have any feedback or changes to the file.\n` +
          `6. Incorporate any feedback by editing the file, repeating step 5 until the user is satisfied.\n` +
          `7. Once the user approves, run: \`git add -A && git commit -m "Add plan doc: <slug>"\`\n` +
          `8. After committing, re-read the committed plan file and decide how to slice it into GitHub issues. ` +
          `Draft a title and one-sentence summary for each proposed issue — think about the right granularity, ` +
          `not too broad and not too fine. Issues should represent *problems being solved*, not plan sections.\n` +
          `9. Call the \`review_issue_outline\` tool with the proposed titles and summaries. ` +
          `If the user requests changes, revise the outline and call the tool again. ` +
          `Do NOT call \`create_github_issues\` until \`review_issue_outline\` returns an approved result.\n` +
          `10. Once the outline is approved, expand each item into a full issue body and call \`create_github_issues\`. ` +
          `Do NOT run any \`gh\` commands directly — only the tool is allowed to do that.\n\n` +
          `Here is the template:\n\n${PLAN_TEMPLATE}`,
        { deliverAs: "followUp" },
      );
    },
  });

  // ── /revise-plan ─────────────────────────────────────────────────────────────
  pi.registerCommand("revise-plan", {
    description: "Pause step execution and enter planning mode to revise the active plan",
    handler: async (_args, ctx) => {
      const state = await readState(ctx.cwd);

      if (!state.activePlan) {
        ctx.ui.notify("No active plan. Run /activate-plan first.", "warning");
        return;
      }

      const planPath = state.activePlan;
      const progress = state.plans[planPath];
      const stepNumber = progress?.currentStep ?? 1;

      let planContent: string;
      try {
        planContent = await readFile(join(ctx.cwd, planPath), "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planPath}`, "error");
        return;
      }

      planMode = true;
      revisePlanPath = planPath;

      ctx.ui.notify(
        `⏸ Revise mode enabled. Execution of step ${stepNumber} paused.\n` +
          `Only edits to the plan file are allowed. Run /resume-step when done.`,
        "info",
      );

      pi.sendUserMessage(
        `Execution of **Step ${stepNumber}** is paused for plan revision.\n\n` +
          `Here is the current plan:\n\n${planContent}\n\n` +
          `Tell the user you are ready to discuss changes and ask what they want to change. Do not analyze the plan or suggest changes yourself.`,
        { deliverAs: "followUp" },
      );
    },
  });

  // ── /resume-step ─────────────────────────────────────────────────────────────
  pi.registerCommand("resume-step", {
    description: "Exit plan revision mode and resume execution of the current step",
    handler: async (_args, ctx) => {
      planMode = false;
      revisePlanPath = null;

      const state = await readState(ctx.cwd);

      if (!state.activePlan) {
        ctx.ui.notify("No active plan. Run /activate-plan first.", "warning");
        return;
      }

      const planPath = state.activePlan;
      const progress = state.plans[planPath] ?? { currentStep: 1, completedSteps: [] };
      const stepNumber = progress.currentStep;

      let planContent: string;
      try {
        planContent = await readFile(join(ctx.cwd, planPath), "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planPath}`, "error");
        return;
      }

      const step = findStepByNumber(planContent, stepNumber);
      if (!step) {
        ctx.ui.notify(`Step ${stepNumber} not found in ${planPath}.`, "error");
        return;
      }

      const { stdout: diff } = await pi.exec("git", ["diff", "HEAD"]);

      const diffSection = diff.trim()
        ? `## Partial work already done on this step\n\nThe following changes were made before the plan was revised:\n\n\`\`\`diff\n${diff}\n\`\`\``
        : `## Partial work\n\nNo changes have been made yet on this step.`;

      ctx.ui.notify(`Resuming Step ${stepNumber}: ${step.title}`, "info");

      activeStepNumber = step.number;

      const message =
        `## Updated Plan\n\n${planContent}\n\n---\n\n` +
        `${diffSection}\n\n---\n\n` +
        `## Your task\n\n` +
        `Continue implementing **Step ${stepNumber} — ${step.title}**.\n\n` +
        `Step content:\n\n${step.body}\n\n` +
        `Take into account both the updated plan and the partial work already done above. ` +
        `Complete the step, then call the \`finish_step\` tool with a conventional commit message. ` +
        `Do not call any other tools after \`finish_step\`. Do not proceed to any other steps.`;

      pi.sendUserMessage(message, { deliverAs: "followUp" });
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
      const slug = selectedFile!.replace(/\.md$/, "");

      // Initialize state for this plan if not already tracked
      if (!state.plans[planPath]) {
        state.plans[planPath] = {
          currentStep: 1,
          completedSteps: [],
          githubIssues: [],
          branch: `feature/${slug}`,
        };
      }
      state.activePlan = planPath;
      await writeState(ctx.cwd, state);

      const progress = state.plans[planPath]!;
      const branchNote = progress.branch ? ` | Branch: ${progress.branch}` : "";
      ctx.ui.notify(
        `✅ Active plan set to: ${planPath}\n` +
          `Current step: ${progress.currentStep} | Completed: [${progress.completedSteps.join(", ")}]${branchNote}`,
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

      const stepNumber = progress.currentStep;
      const step = findStepByNumber(planContent, stepNumber);

      if (!step) {
        ctx.ui.notify(`🎉 All steps complete! Run /plan-close to finalize.`, "info");
        return;
      }

      ctx.ui.notify(`Dispatching Step ${step.number}: ${step.title}`, "info");

      activeStepNumber = step.number;

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

      const storedIssueNumbers = state.plans[planPath]?.githubIssues ?? [];
      const issueNumbersNote =
        storedIssueNumbers.length > 0
          ? `The following GitHub issue numbers were created for this plan and must be passed as \`issueNumbers\` to \`create_pull_request\`: [${storedIssueNumbers.join(", ")}].`
          : `No GitHub issues were created for this plan. Pass an empty array for \`issueNumbers\`.`;

      pi.sendUserMessage(
        `The active plan has been completed. Please do the following:\n\n` +
          `1. Review the full plan below and the current conversation thread.\n` +
          `2. Identify any other files in this repo that should be updated with decisions or outcomes ` +
          `from this plan (e.g. README.md, AGENTS.md, architecture docs, changelogs).\n` +
          `3. Make those updates now using the write and edit tools.\n` +
          `4. When done, run: \`git add -A && git commit -m "${commitMsg}"\`\n` +
          `5. After committing, draft a pull request title and a concise body describing what this plan accomplished. ` +
          `Then call the \`create_pull_request\` tool with the draft title, body, and the issue numbers listed below. ` +
          `Do NOT run any \`gh\` commands directly — only the tool is allowed to do that.\n\n` +
          `${issueNumbersNote}\n\n` +
          `## Plan name: ${planName}\n\n` +
          `## Plan content\n\n${planContent}`,
        { deliverAs: "followUp" },
      );

      // Archive the plan file to docs/plans/reference/ before clearing state
      const planFileName = planPath.split("/").pop()!;
      const refDir = join(ctx.cwd, PLANS_DIR, "reference");
      const srcPath = join(ctx.cwd, planPath);
      const destPath = join(refDir, planFileName);

      try {
        await mkdir(refDir, { recursive: true });
        try {
          await rename(srcPath, destPath);
        } catch (err: unknown) {
          // EXDEV: cross-device rename — fall back to copy + delete
          if ((err as NodeJS.ErrnoException).code === "EXDEV") {
            await copyFile(srcPath, destPath);
            await unlink(srcPath);
          } else {
            throw err;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Failed to archive plan file: ${msg}`, "error");
        return;
      }

      // Clear activePlan from state — only after successful archive
      const updatedState = await readState(ctx.cwd);
      updatedState.activePlan = null;
      await writeState(ctx.cwd, updatedState);
    },
  });

  // ── /plan-adopt ──────────────────────────────────────────────────────────────
  pi.registerCommand("plan-adopt", {
    description: "Adopt a pre-created plan doc from docs/plans/ without running /plan-start",
    handler: async (_args, ctx) => {
      await mkdir(join(ctx.cwd, PLANS_DIR), { recursive: true });

      const state = await readState(ctx.cwd);

      // Find .md files in docs/plans/ that are not already tracked in state
      const allFiles = (await readdir(join(ctx.cwd, PLANS_DIR)))
        .filter((f) => f.endsWith(".md"))
        .sort();

      const unadoptedFiles = allFiles.filter((f) => {
        const planPath = `${PLANS_DIR}/${f}`;
        return !state.plans[planPath];
      });

      if (unadoptedFiles.length === 0) {
        ctx.ui.notify(
          `No untracked plan files found in ${PLANS_DIR}/. ` +
            `All existing .md files are already in state, or the directory is empty.`,
          "warning",
        );
        return;
      }

      let selectedFile: string;
      if (unadoptedFiles.length === 1) {
        selectedFile = unadoptedFiles[0]!;
      } else {
        const selected = await ctx.ui.select("Select a plan to adopt", unadoptedFiles);
        if (!selected) {
          ctx.ui.notify("No plan selected.", "info");
          return;
        }
        selectedFile = selected;
      }

      const planPath = `${PLANS_DIR}/${selectedFile}`;
      const slug = selectedFile.replace(/\.md$/, "");

      let planContent: string;
      try {
        planContent = await readFile(join(ctx.cwd, planPath), "utf8");
      } catch {
        ctx.ui.notify(`Cannot read plan file: ${planPath}`, "error");
        return;
      }

      // Initialize state for the adopted plan and set it as active
      state.plans[planPath] = {
        currentStep: 1,
        completedSteps: [],
        githubIssues: [],
        branch: `feature/${slug}`,
      };
      state.activePlan = planPath;
      await writeState(ctx.cwd, state);

      ctx.ui.notify(`Adopting plan: ${planPath}`, "info");

      pi.sendUserMessage(
        `A pre-created plan doc is being adopted. Please do the following:\n\n` +
          `1. Read the plan below carefully.\n` +
          `2. Present a brief summary to the user and ask if they have any feedback or changes to the plan.\n` +
          `3. Incorporate any feedback by editing \`${planPath}\` directly. Repeat until the user is satisfied.\n` +
          `4. Check the current branch with \`git branch --show-current\`. If it is already \`feature/${slug}\`, skip branch creation. Otherwise run \`git checkout -b feature/${slug} main\` to create and switch to it. All subsequent commits must happen on this branch.\n` +
          `5. Once the user approves the plan, run: \`git add -A && git commit -m "Add plan doc: ${slug}"\`\n` +
          `6. After committing, re-read the committed plan file and decide how to slice it into GitHub issues. ` +
          `Draft a title and one-sentence summary for each proposed issue — think about the right granularity, ` +
          `not too broad and not too fine. Issues should represent *problems being solved*, not plan sections.\n` +
          `7. Call the \`review_issue_outline\` tool with the proposed titles and summaries. ` +
          `If the user requests changes, revise the outline and call the tool again. ` +
          `Do NOT call \`create_github_issues\` until \`review_issue_outline\` returns an approved result.\n` +
          `8. Once the outline is approved, expand each item into a full issue body and call \`create_github_issues\`. ` +
          `Do NOT run any \`gh\` commands directly — only the tool is allowed to do that.\n\n` +
          `## Plan file: ${planPath}\n\n` +
          `## Plan content\n\n${planContent}`,
        { deliverAs: "followUp" },
      );
    },
  });
}
