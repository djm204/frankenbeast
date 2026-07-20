# Issue #3171 — Bound PR reviewer diff fetches

- [x] Reconstruct prior attempt, live issue, branch, and host-local reviewer source.
- [x] Fast-forward the isolated issue branch to current `origin/main`.
- [x] Add failing coverage proving API and `gh` fallback reads are capped before decode.
- [x] Productize the reviewer script with one shared byte cap and explicit truncation notice.
- [x] Run targeted Python and root test coverage plus repository quality gates.
- [ ] Commit, push, open a one-issue PR, and complete CI/Codex review gates.
- [ ] Merge, record durable lessons if useful, and close the Kanban card.
