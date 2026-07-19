# Issue #2843 Progress

- [x] Inspect issue, task context, shared lessons, and live-bench artifact path surfaces.
- [x] Add failing corpus tests for absolute, traversal, non-normalized, and Windows-style paths.
- [x] Validate expected artifact and file-check paths during schema parsing.
- [x] Validate paths on programmatically constructed tasks before workspace provisioning.
- [x] Add descriptor-pinned artifact inspection helpers that reject symlink roots/components and revalidate file identity after open.
- [x] Add a symlink-swap regression proving later pathname replacement cannot redirect an opened artifact read.
- [x] Run targeted regression tests.
- [x] Run package tests, typecheck, build, lint, and security/secret checks.
- [ ] Review the final diff and obtain code review.
- [ ] Commit, push, open one PR linked to #2843, and verify CI/Codex.
- [ ] Merge, record reusable lessons, and close the Kanban card with evidence.
