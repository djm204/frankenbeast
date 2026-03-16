# ADR-024: Introduce Zustand for Complex Form State Management

- **Date:** 2026-03-15
- **Status:** Accepted
- **Deciders:** djm204

## Context

The beasts panel redesign introduces two complex state management needs:

1. **Agent creation wizard** — 8-step form with per-step validation, cross-step dependencies (e.g., module toggles affect which config sections appear), wizard/form mode toggle that must preserve state, and a review step that reads all prior steps.
2. **Agent detail edit mode** — dirty tracking via snapshot diff, save/cancel with discard confirmation, hot-swap vs restart-required field classification.

The current dashboard uses React hooks (useState, useEffect) exclusively. While hooks work for simple state, the wizard's cross-component state sharing and dirty tracking logic would require deep prop drilling or context providers that add complexity without structure.

## Decision

Introduce Zustand (~1KB gzipped) with two store slices:

- **`wizardSlice`** — current step index, form values per step, validation errors per step, wizard vs form mode toggle
- **`agentEditSlice`** — last-saved config snapshot, current edit values, computed `isDirty` flag, field-level restart-required metadata

The rest of the dashboard continues using React hooks. No migration of existing state management.

## Consequences

### Positive
- Zero-boilerplate store definition — no reducers, actions, or providers
- Wizard state survives component unmounts (step navigation) without prop drilling
- Dirty tracking is a simple snapshot diff in the store — no custom hook gymnastics
- ~1KB gzipped — negligible bundle impact
- Sliced store keeps concerns separated while sharing a single subscription

### Negative
- Introduces a new state management pattern alongside React hooks
- Developers must decide which pattern to use for new state (guideline: hooks for local UI state, Zustand for cross-component form state)

### Risks
- Store slices could grow into a monolithic state blob if not disciplined (mitigated: strict two-slice boundary, no other dashboard state moves to Zustand without a new ADR)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| React hooks + Context | No new dependencies | Prop drilling or multiple context providers, re-render performance issues with large forms | Context causes unnecessary re-renders; wizard state is too complex for useState chains |
| Redux Toolkit | Industry standard, great devtools | Heavy boilerplate (slices, actions, selectors), overkill for two form stores | Excessive ceremony for the scope of state being managed |
| Jotai | Atomic state model, minimal boilerplate | Less intuitive for form-shaped state (prefers atoms over objects) | Zustand's object-store model maps more naturally to form state |
| React Hook Form | Purpose-built for forms, validation built-in | Wizard multi-step support is awkward, doesn't handle non-form state (agent edit snapshots) | Only solves half the problem; still need something for dirty tracking and edit mode |
