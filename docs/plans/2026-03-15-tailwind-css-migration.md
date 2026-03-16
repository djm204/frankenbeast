# Tailwind CSS Migration — Fast-Follow Plan

**Date:** 2026-03-15
**Related ADR:** ADR-023
**Scope:** Migrate existing `packages/franken-web/src/styles/app.css` (955 lines) from hand-written BEM CSS to Tailwind v4 utility classes

---

## Overview

ADR-023 introduces Tailwind v4 for the beasts panel rewrite. During the initial implementation, Tailwind and the existing `app.css` coexist — new components use Tailwind, old components keep their BEM classes. This document plans the migration of existing components to Tailwind, eliminating the dual-system overhead.

## Principles

1. **Page-by-page migration** — migrate one page/component tree at a time, not individual classes
2. **No visual regressions** — each migrated page must look identical before and after
3. **Delete as you go** — remove BEM classes from `app.css` as their components are migrated
4. **Preserve CSS custom properties** — `--bg`, `--accent`, `--text-muted`, etc. stay as Tailwind theme tokens; they are not deleted
5. **Test each page** — visual smoke test after each migration (manual or screenshot diff)

## CSS Custom Properties → Tailwind Theme Mapping

```css
/* Existing → Tailwind theme token */
--bg: #040804              → bg-beast-bg
--bg-elevated              → bg-beast-elevated
--bg-panel                 → bg-beast-panel
--accent: #86e45f          → text-beast-accent, bg-beast-accent, border-beast-accent
--accent-strong: #b7ff81   → text-beast-accent-strong
--accent-soft              → bg-beast-accent-soft
--text: #f3faef            → text-beast-text
--text-muted: #c0d0bc      → text-beast-muted
--text-subtle: #9fb09b     → text-beast-subtle
--danger: #ff7a6b          → text-beast-danger, bg-beast-danger
--control-bg               → bg-beast-control
--control-shadow           → shadow-beast-control
```

## Migration Order

Migrate in order of decreasing isolation (least shared components first):

### Phase 1: Layout Shell & Navigation
**Target:** `.dashboard-shell`, `.sidebar`, `.sidebar__nav`, `.sidebar__link`, `.sidebar__status`, `.topbar`, `.topbar__stats`, `.version-chip`
**Estimated classes:** ~80 lines
**Risk:** Low — structural layout, minimal interactivity

### Phase 2: Chat Page
**Target:** `.chat-page`, `.transcript-pane`, `.message-card`, `.message-card__meta`, `.message-card__tier`, `.message-card__receipt`, `.composer`, `.session-switcher`
**Estimated classes:** ~250 lines
**Risk:** Medium — message rendering is the most visible surface

### Phase 3: Shared Controls
**Target:** `.field-control`, `.field-stack`, `.field-error`, `.button`, `.button--primary`, `.button--secondary`, `.button--compact`, `.rail-card`, `.cost-grid`
**Estimated classes:** ~150 lines
**Risk:** Medium — shared across pages; must verify no regressions on other pages

### Phase 4: Network Page
**Target:** `.network-page`, `.network-config-editor`, `.network-service-card`
**Estimated classes:** ~100 lines
**Risk:** Low — self-contained page

### Phase 5: Activity & Approval Components
**Target:** `.activity-list`, `.activity-event`, `.approval-card__*`
**Estimated classes:** ~120 lines
**Risk:** Low — used in chat rail, isolated

### Phase 6: Remaining Component Styles & Animations
**Target:** Any remaining component-scoped styles not covered by Phases 1–5 (e.g., `.modal-*`, status animations, transitions, scrollbar customizations)
**Estimated classes:** ~100 lines
**Risk:** Low — isolated visual effects

### Phase 7: Global Styles, Resets & Delete `app.css`
**Target:** `:root` custom property declarations, `*, *::before` resets, `@keyframes`, `body` styles, global media queries — the foundational styles that must migrate last because all components depend on them
**Estimated classes:** ~155 lines (these are the styles that can't be removed until everything else is migrated)
**Steps:**
- Move `:root` custom properties into Tailwind `@theme` config
- Replace CSS resets with Tailwind's preflight (or keep as a minimal `base.css` if needed)
- Migrate `@keyframes` to Tailwind's `@keyframes` in config or a minimal utility CSS file
- Delete `app.css` entirely
- Verify no component references BEM classes
- Run full visual smoke test across all pages

## Per-Phase Checklist

For each phase:

- [ ] Identify all components using the target BEM classes
- [ ] Convert each component's JSX to Tailwind utility classes
- [ ] Verify Radix `data-state` styling still works (if applicable)
- [ ] Delete migrated BEM classes from `app.css`
- [ ] Visual smoke test (compare before/after)
- [ ] Run existing tests — ensure no regressions
- [ ] Commit with message: `refactor(web): migrate [component] to Tailwind`

## Estimated Effort

| Phase | Lines Removed | Complexity |
|-------|--------------|------------|
| 1. Layout Shell | ~80 | Low |
| 2. Chat Page | ~250 | Medium |
| 3. Shared Controls | ~150 | Medium |
| 4. Network Page | ~100 | Low |
| 5. Activity/Approval | ~120 | Low |
| 6. Remaining | ~100 | Low |
| 7. Delete app.css | ~155 (remaining) | Low |
| **Total** | **~955** | — |

## Success Criteria

- `app.css` deleted from the project
- All styling via Tailwind utility classes + CSS custom properties in Tailwind config
- Zero visual regressions across all dashboard pages
- No BEM class references in any JSX/TSX file
- Bundle size equal to or smaller than current CSS output
