# Dashboard UX Refresh Design

## Goal

Revamp the Frankenbeast web dashboard so the chat experience is easier to use on desktop and mobile without losing the operator-dashboard framing. The refreshed shell should keep status visibility, move the version label to the bottom of the sidebar, use a mobile drawer for navigation, improve visual/accessibility quality while staying inside the Frankenbeast color system, and introduce a more intentional Material-inspired control language for interactive elements.

## Problem

The current dashboard shell in `packages/franken-web/src/components/chat-shell.tsx` and `packages/franken-web/src/styles/app.css` works functionally, but it still reads more like a first-pass admin console than a polished operator chat tool:

- The sidebar brand block is crowded, with version metadata competing with branding.
- Mobile collapses the sidebar into a dense stacked section instead of a real navigation pattern.
- The top bar and right rail are visually as loud as the transcript, so the conversation area does not feel primary.
- Contrast and focus treatment are uneven, especially in muted states and borders.
- Buttons, chips, and inputs look incidental rather than part of a deliberate control system.

## Constraints

- Preserve the Frankenbeast visual identity and dashboard framing.
- Keep the live status information visible in the chat experience.
- Use semantic, accessible controls and maintain keyboard navigation.
- Avoid major route architecture changes; this should remain a contained shell refactor around the existing React structure.
- Apply the new visual language only to controls, not to every card and panel surface.

## Chosen Approach

Use a chat-first dashboard shell:

- Desktop keeps a left sidebar, a primary workspace, and a contextual secondary rail.
- Mobile replaces the fixed sidebar with a drawer opened from a dedicated menu button.
- The header remains present, but status is compressed into a more readable strip so the chat area stays primary.
- The transcript and composer are visually upgraded toward a calmer, more conversation-focused layout.
- Frankenbeast green is reserved for actions, focus, active nav, and select highlights instead of being spread across every surface.
- Interactive controls adopt a soft-elevated Material-inspired treatment while the surrounding shell remains distinctly dashboard-like and matrix-toned.

This approach preserves the product shape while meaningfully improving usability.

## Layout Changes

### Sidebar

- Keep the branding at the top, but remove the version chip from the brand row.
- Add a short sidebar intro and move the version into the footer block at the bottom.
- Improve nav readability with stronger active states, larger tap targets, and clearer supporting summaries.
- Add a top-level `Beasts` route as a coming-soon destination.
- Describe `Beasts` as the future list of runs where active runs appear first and completed runs follow sorted by start date.

### Mobile Navigation

- Add a mobile menu button in the workspace header.
- Render the sidebar as an off-canvas drawer below tablet widths.
- Add an overlay and close affordances.
- Close the drawer when the route changes.
- Expose drawer state through `aria-expanded`, `aria-controls`, and semantic buttons.

### Top Bar

- Keep project and runtime status visible.
- Rebalance the top bar into a cleaner overview rather than a cluster of equally weighted cards.
- Allow stat items to wrap more naturally on smaller widths.

### Chat Workspace

- Give the transcript more visual weight and cleaner spacing.
- Keep the right rail, but reduce its surface intensity so it supports the chat rather than competing with it.
- Make the composer easier to scan and use on narrow screens.
- Preserve the current split between transcript, composer, cost, activity, and approval cards.

### Controls

- Keep the current shell surfaces, but introduce a unified control language for buttons, text entry, pills, and route badges.
- Use darker tonal button fills with a green-lit edge, restrained elevation, and clearer hover/pressed states rather than bright gradient-only treatments.
- Replace transparent secondary buttons with tonal secondary controls that still feel distinct from primary actions.
- Restyle text inputs and the composer textarea as filled controls with stronger focus glow, clearer placeholder treatment, and improved disabled states.
- Apply the same control rules to network page actions so the visual language stays consistent across routes.

## Accessibility

The refresh should follow the repo frontend rules in `.cursor/rules/web-frontend-accessibility.mdc` and related frontend guidance:

- Improve text and border contrast to align with WCAG 2.1 AA intent.
- Use clear visible focus indicators.
- Ensure all interactive elements are keyboard reachable.
- Use semantic buttons instead of clickable containers for drawer toggles and close actions.
- Keep route state and status understandable without relying on color alone.
- Verify the layout remains usable at mobile widths and high zoom.

## Testing Strategy

Update component tests in `packages/franken-web/tests/components/chat-shell.test.tsx` to cover:

- mobile drawer controls and accessibility attributes
- version placement in the sidebar footer
- presence of the top-level `Beasts` route
- continued visibility of key dashboard status elements
- navigation rendering in the revised shell

Run targeted web tests plus build/typecheck for `@frankenbeast/web`.

## Files Expected To Change

- `packages/franken-web/src/components/chat-shell.tsx`
- `packages/franken-web/src/styles/app.css`
- `packages/franken-web/tests/components/chat-shell.test.tsx`

## Non-Goals

- Reworking route structure or adding new pages
- Changing chat/network business logic
- Adding a new design system or dependency
