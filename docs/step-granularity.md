# Step Granularity Reference

## Purpose

This document is read by the agent during `plan-finish` and `modify-plan` review passes to evaluate step sizing. Use it to decide whether a step should be split, kept as-is, or (rarely) merged with an adjacent step.

---

## Default Rule

**When in doubt, split.** The only cost of over-granularity is plan doc size in context. The consistency check pass handles step drift — over-splitting does not cause sequencing problems. The benefits of smaller steps (reviewability, specificity, smaller context per implementation session) outweigh the cost.

---

## Signs a Step Is Too Big

- Touches more than one system or subsystem
- Recipe items that could independently succeed or fail
- Verify criteria testing more than one independent behavior
- A step where a clean boundary could be drawn partway through — if you can describe a meaningful "done" state before reaching the end, the step should be split there

---

## Signs a Step Is the Right Size

- One focused change with a single clear purpose
- One clear done condition — you know exactly when the step is finished
- Implementable in a single agent session without context-switching between unrelated concerns
- If it fails, the failure is easy to locate and understand — the blast radius is contained

---

## Signs a Step Is Too Small (Rare)

A change so trivial that it adds no review value and could be safely combined with an adjacent step with zero risk of confusion or conflict. Use judgment here — this case is uncommon. When unsure, keep the steps separate.

---

## What to Do When a Step Is Too Big

1. Split it in place, giving each part a new action-oriented title that describes what specifically changes
2. Update the numbering of all subsequent steps accordingly
3. Run the consistency check across the affected range — verify that no later step now references a step number that has shifted, and that cross-step dependencies still make sense
