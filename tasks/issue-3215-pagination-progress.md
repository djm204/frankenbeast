# Issue #3215 tracked-agent pagination

- [x] Reproduce unbounded listing and pagination gaps with focused repository, route, and client tests.
- [x] Add a 50-row default and 200-row maximum.
- [x] Add opaque keyset cursors with a SQLite row-id high-water mark for stable continuation during inserts.
- [x] Scope dispatch-failure metadata to the returned page and capacity metadata to active agents.
- [x] Update the dashboard client to request a bounded page explicitly.
- [x] Run targeted tests, package test suites, lint, typecheck, build, and security lint.
- [ ] Open PR, obtain current-head Codex clean, and merge.

Implementation note: ordering is `created_at DESC, id DESC`; each cursor carries both the last key and the first-page row-id high-water mark, preventing duplicates/gaps from same-timestamp ties and excluding rows inserted after the first page.
