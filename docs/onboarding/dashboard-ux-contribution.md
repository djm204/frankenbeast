---
title: Dashboard UX contribution checklist
description: A first-time contributor path for making and verifying focused Frankenbeast dashboard UX and accessibility changes.
---

# Dashboard UX contribution checklist

Use this path when an issue changes the browser dashboard in `packages/franken-web/`. It turns a visual or interaction problem into a focused, reviewable change with reproducible evidence. Keep backend or shared-contract changes out of the pull request unless the issue explicitly requires them.

## 1. Reproduce and bound the problem

Read the issue and check for an existing pull request before editing. Record:

- the dashboard page, panel, or workflow where the problem appears;
- the smallest sequence of actions that reproduces it;
- expected and actual behavior;
- the viewport size and browser used;
- whether keyboard, pointer, loading, empty, error, or success states are affected.

Use the [architecture map](architecture-map.md) to confirm ownership. Dashboard components, hooks, and browser clients belong to `packages/franken-web/`; API response or route changes may also require `packages/franken-orchestrator/src/http/` and shared DTO changes may require `@franken/types`.

Do not include operator tokens, provider keys, private issue text, customer data, or unredacted logs in screenshots or recordings.

## 2. Start the narrowest useful dashboard

Install dependencies through the normal bootstrap path if needed:

```bash
npm run bootstrap -- --no-docker
```

For a visual or component-only change that does not need live backend data:

```bash
npm --workspace @franken/web run dev
```

For chat or API-backed behavior, run the backend and dashboard in separate terminals:

```bash
# Terminal 1
npm --workspace @franken/orchestrator run chat-server -- --base-dir "$PWD"

# Terminal 2
npm --workspace @franken/web run dev:chat
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). Follow the package [dashboard README](../../packages/franken-web/README.md) when you need a custom backend port, Beast controls, or separate daemon topology.

## 3. Follow existing UI and accessibility patterns

Before creating a new component, inspect the nearest component, hook, test, and existing Radix primitive. Keep the change consistent with current styles and interaction patterns.

Verify each affected state that the issue can reach:

- keyboard-only operation, logical tab order, and visible focus;
- an accessible name for interactive controls and announced validation or status text;
- focus behavior for dialogs, popovers, drawers, and destructive confirmations;
- narrow and wide viewports without clipped controls or hidden required actions;
- loading, empty, error, disabled, and success states where applicable;
- readable text and controls without relying on color alone.

Prefer semantic HTML and the repository's existing Radix primitives over hand-written keyboard or focus management.

## 4. Add focused regression coverage

Put component and hook regressions under `packages/franken-web/tests/`. Test the user-visible outcome rather than implementation details, including keyboard or failure-state behavior when it caused the issue.

Run the narrow test first, replacing the example path with the file you changed:

```bash
npm run test --workspace @franken/web -- tests/components/example.test.tsx
```

Then run the package gates:

```bash
npm run test --workspace @franken/web
npm run typecheck --workspace @franken/web
npm run lint --workspace @franken/web
npm run build --workspace @franken/web
```

If the change also modifies a backend route or shared DTO, run the affected orchestrator or types tests and builds selected by the [test command decision tree](test-command-decision-tree.md). Record real outcomes; do not describe a skipped check as passing.

## 5. Supply reviewable UX evidence

In the pull request, include:

- exact reproduction steps and the user-visible result;
- before and after screenshots or a short recording when the change is visual;
- the viewport and browser used for manual verification;
- keyboard and focus checks performed;
- exact automated verification commands and results;
- `Closes #<issue-number>` on its own line.

Redact sensitive values and crop unrelated private content before uploading evidence. If a state cannot be reproduced locally, say which state was not verified and why instead of implying complete coverage.

Return to the root [contributor guide](../../CONTRIBUTING.md) for branch, commit, pull-request, CI, and review-loop steps.
