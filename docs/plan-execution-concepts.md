# Plan Execution Concepts

This note captures an in-progress conversation about improving plan writing and step execution for LLM-assisted development. It is intentionally conceptual rather than final process guidance.

## Core Problem

An LLM is being asked to execute a plan one step at a time. Each execution happens in a bounded thread, so the plan needs executable units of work. If those units are too vague, the execution LLM invents product or architecture decisions. If they are too detailed, the plan becomes brittle, slow to update, and expensive to read.

The goal is to help planning and execution LLMs preserve the user's intent without turning every step into an exact diff.

## Role Dynamic

The user owns product behavior, architecture, workflow semantics, state/data contracts, and any technical tradeoff that affects the intended result.

The execution LLM should behave like a fixed-scope implementation contractor: highly capable at translating an approved work order into code, but not authorized to change the design, add adjacent behavior, introduce new surfaces, or make architectural decisions. Helpful extra work is a change request, not initiative.

A planning LLM, when used, is a translation aid: it helps turn user intent and context into refined executable artifacts. It does not own the decisions; it surfaces ambiguity and helps record the user's choices.

The useful pipeline is:

```text
user intent/context -> refined executable artifacts -> exact code
```

If the refined artifact is too vague, the implementation LLM starts doing planning during coding. If it is too detailed, the planning process starts writing brittle pseudo-code.

## Three Planning Gradients

### Step Size Gradient

How much work should happen before the execution thread resets?

- Too large: drift, bundled decisions, hard review, hidden scope creep, expensive rollback, and implementation starts rounding out adjacent behavior.
- Too small: overhead, fragmented context, noisy handoffs, and unnatural partial states.

The useful question is not “how many bullets?” but whether the step bundles multiple changes that could be accepted or rejected independently.

### Implementation Detail Gradient

How much construction detail belongs inside a step?

- Too little: acceptance-relevant decisions are omitted, so execution fills gaps.
- Too much: acceptance-irrelevant choices are specified, making the plan brittle and harder to maintain.

A step has enough detail when the remaining unspecified choices would not change whether the user accepts the result. It has too much detail when it specifies choices the user would accept either way.

### Planning Horizon Gradient

How far ahead should the plan specify executable work?

The actual question is: how many reviewable changes should be committed before stopping to learn from the implemented system?

Plan length is tied to feedback. A plan should specify enough future work to preserve continuity and reconcile current choices with likely next work, but not so much that speculative details become stale or clog the context window.

## Review Objects

A review object is the concrete change as something that can be accepted or rejected. It is not purely conceptual and not purely implementation detail. It includes enough shape to make the intended change judgeable.

Examples:

- “Denied payee group repair flow” is too broad; it bundles several review objects.
- “Clear denied payee group action” is a smaller review object.
- “Read-only transaction evidence for a denied input” is another review object.
- “Source hint summary pills” are also a review object because they are a separately judgeable visible UI addition.

The plan does not need to label review objects explicitly in every step. The concept is useful for deciding step boundaries: if a step includes several things the user could reject independently, it is probably too broad.

## Acceptance-Relevant Detail

The crux of implementation detail is relevance to acceptance.

A choice is acceptance-relevant if choosing differently could reasonably make the user say: “No, that is not the change I approved.”

Acceptance-relevant choices may include:

- user-visible behavior or UI surfaces;
- system behavior;
- state and persistence semantics;
- data contracts and invariants;
- workflow meaning;
- safety or privacy boundaries;
- architecture or abstraction choices;
- future compatibility that later work depends on.

Choices are usually not acceptance-relevant when they are routine local mechanics:

- private helper names;
- local loop/control-flow style;
- equivalent implementation mechanics under an agreed contract;
- incidental CSS details unless visual design is the thing being accepted.

This is why adding hint pills during denied repair was wrong: it added a new visible UI surface that the user could accept or reject independently. It should have been separately authorized. Conversely, specifying exact Tailwind classes for a warning panel would likely be too much detail unless those classes matter to acceptance.

## Meaningful Feedback Units

Implementation is also discovery. A meaningful feedback unit is the smallest set of implemented review objects that can teach something useful enough to refine the plan.

If the unit is too small, feedback is not meaningful. A helper function alone may compile but not reveal whether a workflow works. If the unit is too large, feedback arrives too late and may invalidate a large bundle of work.

The planning horizon should often extend to the next meaningful feedback unit, not necessarily the entire feature. The question is: what is the bare minimum set of changes that creates a usable, reviewable slice that can produce feedback?

## Current Working Insight

The plan should preserve user-owned decisions and prevent the execution LLM from selecting among meaningful options during implementation. It should not try to pin down every incidental coding choice.

A useful step is therefore one that:

- is small enough that its changed thing can be accepted or rejected without unpacking a whole workflow;
- includes the acceptance-relevant decisions needed to prevent drift;
- leaves routine local mechanics to the implementation contractor;
- fits within a planning horizon that reaches the next useful feedback point without over-specifying stale future work.

This is not final guidance yet. It is the conceptual ground for later heuristics.
