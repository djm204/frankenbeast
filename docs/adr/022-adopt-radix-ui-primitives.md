# ADR-022: Adopt Radix UI Primitives as Component Foundation

- **Date:** 2026-03-15
- **Status:** Accepted
- **Deciders:** djm204

## Context

The beasts panel redesign requires complex interactive controls: modal dialogs, slide-in panels, accordion sections, cascading selects, toggle groups, tooltips, alert dialogs, popovers, and scroll areas. Building these from scratch with correct keyboard navigation, ARIA attributes, and focus management is expensive and error-prone. The current dashboard has no component library — all controls are hand-written in `app.css`.

## Decision

Adopt Radix UI primitives (`@radix-ui/react-*`) as the component foundation for the beasts panel and all future dashboard UI work. Install only the specific packages needed (tree-shaking at the package level). Style all primitives using Tailwind CSS utility classes and existing CSS custom properties — Radix ships unstyled.

### Packages adopted:
- `react-dialog`, `react-accordion`, `react-select`, `react-toggle`, `react-toggle-group`
- `react-tooltip`, `react-alert-dialog`, `react-popover`, `react-scroll-area`
- `react-separator`

### Not using Radix for:
- **Slide-in detail panel** — bespoke `<aside>` with CSS transitions (Dialog's modal semantics conflict with non-modal side panels)
- **Wizard step indicator** — custom component (Tabs allows free navigation, incompatible with validation-gated step progression)

## Consequences

### Positive
- WCAG 2.1 AA accessibility out of the box (keyboard nav, ARIA, focus management)
- No styling opinions — integrates with existing CSS custom properties and Tailwind
- Each primitive is a separate npm package — no bundle bloat from unused components
- Maintained by WorkOS with strong funding and active development
- Reduces custom accessibility code we'd otherwise need to write and maintain

### Negative
- Adds ~10 new npm dependencies (one per primitive)
- Team must learn Radix's `data-state` attribute pattern for styling interactive states
- Radix major version bumps could require migration effort

### Risks
- Radix API breaking changes across major versions (mitigated: primitives are stable, v1+ for most)
- Over-reliance on Radix patterns could make future library swaps harder (mitigated: primitives are thin wrappers, not deep abstractions)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Hand-written components | No dependencies, full control | High effort, accessibility gaps, maintenance burden | Too expensive for the number of controls needed |
| shadcn/ui | Copy-paste (no runtime dep), pre-styled | Requires Tailwind (adopted separately), opinionated styling to override | Added overhead of maintaining copied component code; Radix directly is leaner |
| Headless UI | Similar to Radix, lightweight | Smaller component set, Tailwind-assumed | Fewer primitives available; would still need to build several controls from scratch |
| Material UI / Chakra | Full design system, rich component set | Heavy bundle, strong style opinions, difficult to theme to match existing green dark theme | Style conflict with existing design, excessive bundle size |
