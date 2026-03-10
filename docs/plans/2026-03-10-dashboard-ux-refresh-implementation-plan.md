# Dashboard UX Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the Frankenbeast dashboard shell so it is more UX-friendly, mobile-friendly, and accessible while keeping the operator dashboard framing intact and giving controls a more intentional Material-inspired feel.

**Architecture:** Update the existing `ChatShell` component to support a mobile drawer, revised shell hierarchy, and an added top-level `Beasts` route, then restyle interactive controls with accessible Frankenbeast-aligned Material-inspired tokens. Preserve the current route and data flow shape so the refactor stays local to the web package.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, CSS

---

### Task 1: Lock in expected shell behavior with failing tests

**Files:**
- Modify: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Write the failing tests**

Add tests that verify:
- the version text is rendered in the sidebar footer instead of the brand block
- the mobile menu button exists with drawer accessibility attributes
- the top-level `Beasts` route is present in dashboard navigation
- the dashboard shell still shows core project/session/socket status text

**Step 2: Run test to verify it fails**

Run: `npm --workspace @frankenbeast/web test -- chat-shell`
Expected: FAIL because the current shell lacks the new route and control hooks, has no mobile drawer controls, and keeps the version near the brand.

**Step 3: Commit**

```bash
git add packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "test(web): cover refreshed dashboard shell"
```

### Task 2: Refactor the shell component for drawer navigation and footer metadata

**Files:**
- Modify: `packages/franken-web/src/components/chat-shell.tsx`

**Step 1: Write minimal implementation**

Update `ChatShell` to:
- track mobile drawer open/closed state
- add semantic menu and close buttons
- close the drawer after route changes
- move version rendering into the footer area
- add a `Beasts` top-level route with coming-soon summary text describing the future run ordering
- keep dashboard status visible while simplifying the header hierarchy

**Step 2: Run targeted tests**

Run: `npm --workspace @frankenbeast/web test -- chat-shell`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/franken-web/src/components/chat-shell.tsx packages/franken-web/tests/components/chat-shell.test.tsx
git commit -m "feat(web): add responsive dashboard shell"
```

### Task 3: Refresh styling for accessibility, mobile drawer behavior, and calmer chat hierarchy

**Files:**
- Modify: `packages/franken-web/src/styles/app.css`

**Step 1: Update styles**

Adjust CSS to:
- improve color contrast and focus states
- move version styling into the sidebar footer
- support the drawer overlay and mobile transitions
- rebalance the topbar, transcript, rail, and composer hierarchy
- improve nav density and tap targets across breakpoints
- introduce a unified Material-inspired control language for buttons, badges, and text inputs
- carry the new control treatment across chat and network page actions

**Step 2: Run tests and build**

Run: `npm --workspace @frankenbeast/web test`
Expected: PASS

Run: `npm --workspace @frankenbeast/web run build`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/franken-web/src/styles/app.css
git commit -m "style(web): refresh dashboard chat experience"
```

### Task 4: Final verification

**Files:**
- Review: `packages/franken-web/src/components/chat-shell.tsx`
- Review: `packages/franken-web/src/styles/app.css`
- Review: `packages/franken-web/tests/components/chat-shell.test.tsx`

**Step 1: Run final verification**

Run: `npm --workspace @frankenbeast/web test`
Expected: PASS

Run: `npm --workspace @frankenbeast/web run typecheck`
Expected: PASS

Run: `npm --workspace @frankenbeast/web run build`
Expected: PASS

**Step 2: Commit**

```bash
git add packages/franken-web/src/components/chat-shell.tsx packages/franken-web/src/styles/app.css packages/franken-web/tests/components/chat-shell.test.tsx docs/plans/2026-03-10-dashboard-ux-refresh-design.md docs/plans/2026-03-10-dashboard-ux-refresh-implementation-plan.md
git commit -m "feat(web): revamp dashboard shell ux"
```
