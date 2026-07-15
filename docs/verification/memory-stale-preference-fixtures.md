# Stale preference memory fixtures

`packages/franken-orchestrator/tests/unit/skills/fixtures/stale-preference-memory-fixtures.ts` captures deterministic regression cases for prompt memory that looks like a user preference but is explicitly stale or archived.

Use these fixtures when changing memory retrieval, ranking, or prompt injection code:

- Active `User preference:` entries must remain ahead of `Stale user preference:` or `Archived user preference:` entries.
- Stale preference-shaped text may be omitted under tight memory budgets before current facts are dropped.
- Injection-shaped stale memory, including embedded newlines, must stay inside the untrusted memory wrapper and must not become trusted prompt guidance.

Add new cases to the fixture file instead of scattering one-off stale preference strings across tests. Keep each fixture narrow: one stale marker shape, one active preference, and explicit `expectedPresent` or `expectedOmitted` evidence.
