# ADR-025: Wizard-First Agent Creation with Toggleable Form View

- **Date:** 2026-03-15
- **Status:** Accepted
- **Deciders:** djm204

## Context

The current beasts panel presents agent creation as a flat form embedded in the left column of a 3-column layout. Each beast catalog entry has its own interview form with basic text/select/file/directory fields and module on/off toggles. There is no guided flow, no deep configuration, and no way to configure LLM targets, skills, prompt frontloading, or git workflows.

The redesign requires exposing significantly more configuration surface: 8 distinct configuration areas (identity, workflow type, LLM targets, modules with deep config, skills, prompt frontloading, git workflow, review). Presenting all of this as a flat form would overwhelm users. A wizard provides guided progressive disclosure while keeping all configuration accessible.

## Decision

Implement agent creation as a multi-step wizard (default) with a toggle to switch to a single-page form view. Both views share the same Zustand store and render the same form sections — the wizard wraps them in step navigation, the form view renders them as collapsible accordions.

### Wizard Steps:
1. Identity (name, description)
2. Workflow Type (design interview, chunk design doc, issues agent, run chunked project)
3. LLM Targets (default provider/model, per-action overrides)
4. Modules & Configuration (toggle grid + deep config per module)
5. Skills (browsable registry with search/filter)
6. Prompt Frontloading (text + files with context health analysis)
7. Git Workflow (5 presets + override fields)
8. Review & Launch

## Consequences

### Positive
- Progressive disclosure prevents overwhelm — users see one concern at a time
- Toggle to form view serves power users who prefer scanning everything at once
- Shared store means no state loss when switching between wizard and form view
- Review step catches configuration errors before launch
- Step indicator provides orientation and progress feedback

### Negative
- More complex UI than a flat form — wizard step navigation, validation per step, back/next logic
- Two rendering modes (wizard + form) for the same content doubles the layout code (mitigated: sections are shared components, only the wrapper differs)

### Risks
- Wizard steps could become stale if new configuration areas are added without updating the step sequence (mitigated: steps map 1:1 to Zustand slice keys — adding a new config area requires adding a slice key, which naturally prompts adding a step)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Flat form only | Simple implementation | Overwhelming with 8 config areas, no guided flow | Too much surface area for new users; power users can still toggle to form view |
| Wizard only (no form toggle) | Simpler — one rendering mode | Power users forced through step-by-step for every agent | Unnecessary friction for experienced users who know what they want |
| Tabbed form | Middle ground between wizard and flat | No step progression, easy to miss tabs | Tabs don't convey order/progression; wizard stepper is more natural for creation flows |
