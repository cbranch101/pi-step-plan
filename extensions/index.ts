import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("plan-start", {
    description: "Enter planning mode — discussion only, no file writes or bash execution",
    handler: async (_args, ctx) => {
      ctx.ui.notify("plan-start: not yet implemented", "info");
    },
  });

  pi.registerCommand("plan-finish", {
    description: "Exit planning mode and generate a populated plan doc from the conversation",
    handler: async (_args, ctx) => {
      ctx.ui.notify("plan-finish: not yet implemented", "info");
    },
  });

  pi.registerCommand("next-step", {
    description: "Find the next unchecked step in the plan and dispatch it to the agent",
    handler: async (_args, ctx) => {
      ctx.ui.notify("next-step: not yet implemented", "info");
    },
  });
}
