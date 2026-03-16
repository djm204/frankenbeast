# ADR-023: Introduce Tailwind CSS v4 for New Component Styling

- **Date:** 2026-03-15
- **Status:** Accepted
- **Deciders:** djm204

## Context

The beasts panel redesign introduces a large number of new components (wizard, slide-in panel, agent list with configurable density, deep module config forms). The current styling approach is a single 955-line `app.css` file with BEM-style classes and CSS custom properties. Writing new BEM classes for every layout, spacing, and color variation in the new components is slow and produces CSS that's hard to iterate on quickly.

## Decision

Adopt Tailwind CSS v4 using the native Vite plugin (`@tailwindcss/vite`). Map existing CSS custom properties (`--bg`, `--accent`, `--text-muted`, etc.) to Tailwind theme tokens. All new beasts panel components use Tailwind utility classes exclusively. Existing `app.css` remains untouched — coexistence during a transition period, with full migration tracked as a fast-follow (see `docs/plans/2026-03-15-tailwind-css-migration.md`).

## Consequences

### Positive
- Rapid iteration on layout and styling — utility classes are faster than writing/naming new CSS classes
- Industry-standard approach — any developer familiar with Tailwind can contribute immediately
- Smaller production CSS — Tailwind v4 purges unused styles automatically
- Responsive design utilities (`sm:`, `md:`, `lg:`) simplify density toggle and mobile support
- Native Vite plugin means zero PostCSS configuration

### Negative
- Two styling systems coexist until the existing CSS is migrated
- Developers must know which system applies to which components during transition
- Tailwind utility classes in JSX can be verbose for complex layouts

### Risks
- Style conflicts between old BEM classes and Tailwind utilities on shared elements (mitigated: beasts panel is a full rewrite, no shared elements during transition)
- Tailwind v4 is newer — potential for minor ecosystem gaps (mitigated: v4 is stable release, Vite plugin is first-party)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Continue with hand-written CSS | No new dependencies, consistent with existing code | Slow iteration, growing CSS file, no purging | Doesn't scale for the volume of new components |
| CSS Modules | Scoped styles, no naming conflicts | Still requires writing full CSS, no utility shortcuts | Same speed problem as hand-written CSS |
| Styled Components / Emotion | CSS-in-JS colocation, dynamic styling | Runtime cost, new paradigm, bundle overhead | Runtime CSS generation is unnecessary overhead |
| Tailwind v3 | Mature, well-documented | Requires PostCSS config, larger config surface | v4 native Vite plugin is simpler; v4 is current |
