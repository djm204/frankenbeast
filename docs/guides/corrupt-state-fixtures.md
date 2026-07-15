# Corrupt-state parser fixtures

The disaster-recovery parser fixtures live next to the state reader they exercise. For network/liveness state, use `packages/franken-orchestrator/tests/unit/network/fixtures/corrupt-state/` and keep each fixture as the exact bytes a reader should encounter on disk.

When adding a new corrupt-state case:

1. Add a fixture file whose name describes the failure mode, such as `truncated-json.json` or `invalid-enum-values.json`.
2. Add the fixture to the reader test table with the expected diagnostic reason.
3. Assert the reader returns a structured diagnostic containing the original `path`, a `quarantinePath` when the file is moved aside, and a `repairHint` operators can act on.
4. Assert the corrupt file is quarantined or skipped safely and that the reader does not automatically write replacement state or perform destructive repair.
5. Cover at least these failure classes across disaster-recovery state readers: truncated JSON, wrong top-level type, missing required fields, duplicate ids, unknown schema versions, and invalid enum values.

For approval, memory, chat/Kanban-adjacent, and other state domains, prefer colocated fixtures beside the owning reader tests rather than a global fixture directory. Colocation keeps the fixture schema close to the parser contract and prevents unrelated readers from silently drifting.

Approval dashboard markdown fixtures live under `packages/franken-web/tests/fixtures/corrupt-approval-dashboard-markdown/` and must be rendered as inert text by dashboard components. Use these fixtures for truncated fences, marker-looking content, and HTML/button-looking fragments so tests prove corrupted approval copy cannot create forged controls or trusted prompt boundaries.
