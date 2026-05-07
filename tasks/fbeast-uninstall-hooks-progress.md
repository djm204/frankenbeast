# fbeast Uninstall Hooks Progress

- [x] Check for a matching progress document and create it if missing.
- [x] Reproduce the uninstall hook cleanup gap from source/tests before changing production code.
- [x] Add focused failing tests for generated hook script cleanup.
- [x] Implement minimal uninstall cleanup for generated hook scripts.
- [x] Run focused `franken-mcp-suite` tests and typecheck.
- [x] Record verification evidence and review notes.
- [x] Reproduce and fix bare `fbeast uninstall` selecting a non-Codex client when project Codex hooks exist.
- [x] Build `packages/franken-mcp-suite` so the linked CLI executes the latest `dist`.

## Review

- Red phase: `rtk npm test -- --run src/cli/uninstall.test.ts` failed because generated Gemini and Codex hook scripts still existed after uninstall.
- Green phase: `rtk npm test -- --run src/cli/uninstall.test.ts` passed with 16 tests.
- Focused verification: `rtk npm test -- --run src/cli/uninstall.test.ts src/cli/init.test.ts src/cli/uninstall-entrypoint.test.ts` passed with 38 tests.
- Typecheck: `rtk npm run typecheck` passed.
- Follow-up red phase after live retry: `rtk npm test -- --run src/cli/mcp-client-paths.test.ts src/cli/uninstall-entrypoint.test.ts` failed because project `.codex/` did not win over home `.claude`, and the direct `fbeast-uninstall` entrypoint ignored `--client=codex`.
- Follow-up green phase: `rtk npm test -- --run src/cli/mcp-client-paths.test.ts src/cli/uninstall-entrypoint.test.ts` passed with 3 tests.
- Follow-up focused verification: `rtk npm test -- --run src/cli/mcp-client-paths.test.ts src/cli/uninstall.test.ts src/cli/init.test.ts src/cli/uninstall-entrypoint.test.ts src/cli/main.test.ts` passed with 41 tests.
- Follow-up typecheck/build: `rtk npm run typecheck` and `rtk npm run build` passed.
