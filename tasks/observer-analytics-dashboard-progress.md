# Observer Analytics Dashboard Progress

## Acceptance Criteria

- [x] Use the existing `.worktrees/fbeast-obs-dashboard` worktree and approved spec as source context.
- [x] Backend exposes read-only `/api/analytics/summary`, `/api/analytics/sessions`, `/api/analytics/events`, and `/api/analytics/events/:id`.
- [x] Backend normalizes observer audit, cost ledger, governor decisions, security detections, cost rows, and Beast failures where available.
- [x] Analytics route is live in the dashboard shell.
- [x] Web page renders summary cards, filters, activity table, decisions/failures table, and read-only detail drawer.
- [x] Session/tool/outcome/time filters affect the visible analytics data.
- [x] Targeted backend and frontend tests cover the implemented behavior.
- [x] Typecheck/build verification passes or documented blockers are recorded.

## Notes

- Source progress context: `tasks/worktrees-web-dashboard-observability-progress.md` in the main worktree.
- Design source: `docs/superpowers/specs/2026-04-26-observer-analytics-dashboard-design.md`.
- Red verification:
  - `npm test -- tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts` fails on missing analytics service/routes.
  - `npm test -- src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` fails on missing analytics client/page.
- Green verification:
  - `npm test -- tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts` passes 7 tests.
  - `npm test -- src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` passes 6 tests.
- Type/build verification:
  - `npm run typecheck` in `packages/franken-orchestrator` passed.
  - `npm run typecheck` in `packages/franken-web` passed.
  - `npm run build` in `packages/franken-orchestrator` passed.
  - `npm run build` in `packages/franken-web` passed.
- Release-commit verification rerun on 2026-04-28:
  - `npm test -- --run tests/unit/analytics/analytics-service.test.ts tests/unit/http/analytics-routes.test.ts` in `packages/franken-orchestrator` passed 7 tests.
  - `npm test -- --run tests/vite-config.test.ts src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` in `packages/franken-web` passed 7 tests.
  - `npm run typecheck` passed in both `packages/franken-orchestrator` and `packages/franken-web`.
  - `npm run build` passed in both `packages/franken-orchestrator` and `packages/franken-web`.
- Local web dev server:
  - Started from `packages/franken-web`.
  - URL: `http://127.0.0.1:5174/`.
