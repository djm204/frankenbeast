# Analytics JSON Parse Fix Progress

## Acceptance Criteria

- [x] Reproduce the likely failure path from code/config.
- [x] Add a failing regression test proving Vite proxies dashboard `/api` requests.
- [x] Implement the minimal proxy/config fix.
- [x] Verify targeted web tests, typecheck, and build.
- [x] Record final evidence and update task tracker.

## Notes

- Symptom: `JSON.parse: unexpected character at line 1 column 1 of the JSON data`.
- Root cause: managed dashboard starts Vite with same-origin API mode, but `vite.config.ts` only proxies `/v1`; `/api/analytics/*` falls through to Vite HTML, which the analytics client attempts to parse as JSON.
- Fix: added `/api` to `packages/franken-web/vite.config.ts` proxy table.
- Verification:
  - `npm test -- tests/vite-config.test.ts src/lib/analytics-api.test.ts src/pages/analytics-page.test.tsx` passes 7 tests.
  - `npm run typecheck` in `packages/franken-web` passes.
  - `npm run build` in `packages/franken-web` passes.
- Restarted web dev server at `http://127.0.0.1:5175/`.
