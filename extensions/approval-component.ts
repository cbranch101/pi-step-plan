/**
 * ApprovalComponent — pure TUI component for the step approval gate.
 *
 * Renders a truncated diff block followed by three action options:
 * Approve / Tweak / Reject. Arrow keys navigate, Enter confirms.
 *
 * Intentionally free of any `pi` or `ctx` references so it can be
 * tested in isolation.
 */

import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalAction = "approve" | "tweak" | "reject";

/** Minimal theme surface required by this component. */
export interface ApprovalTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

// ─── Static option definitions ────────────────────────────────────────────────

interface Option {
  label: string;
  action: ApprovalAction;
  /** Theme fg color applied to the selected option */
  color: string;
}

const OPTIONS: Option[] = [
  { label: "Approve", action: "approve", color: "success" },
  { label: "Tweak", action: "tweak", color: "warning" },
  { label: "Reject", action: "reject", color: "error" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export class ApprovalComponent {
  private selectedIndex = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  /**
   * @param diffLines     Pre-truncated diff lines ready to render.
   * @param onDone        Called with the chosen action when the user presses Enter.
   * @param theme         Optional theme for colours and bold styling.
   * @param requestRender Called after selection changes so the TUI host can
   *                      schedule a re-render.
   */
  constructor(
    private readonly diffLines: string[],
    private readonly onDone: (action: ApprovalAction) => void,
    private readonly theme?: ApprovalTheme,
    private readonly requestRender: () => void = () => {},
  ) {}

  // ── Component interface ───────────────────────────────────────────────────

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];

    // Diff block
    for (const line of this.diffLines) {
      lines.push(truncateToWidth(line, width));
    }

    // Separator
    lines.push("");

    // Options with cursor
    for (let i = 0; i < OPTIONS.length; i++) {
      const opt = OPTIONS[i]!;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? "> " : "  ";
      let text = `${prefix}${opt.label}`;

      if (isSelected && this.theme) {
        text = this.theme.fg(opt.color, this.theme.bold(text));
      }

      lines.push(truncateToWidth(text, width));
    }

    // Help row
    lines.push("");
    const help = "↑↓ navigate  •  enter select";
    lines.push(truncateToWidth(this.theme ? this.theme.fg("dim", help) : help, width));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selectedIndex > 0) {
      this.selectedIndex--;
      this.invalidate();
      this.requestRender();
    } else if (matchesKey(data, Key.down) && this.selectedIndex < OPTIONS.length - 1) {
      this.selectedIndex++;
      this.invalidate();
      this.requestRender();
    } else if (matchesKey(data, Key.enter)) {
      this.onDone(OPTIONS[this.selectedIndex]!.action);
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
