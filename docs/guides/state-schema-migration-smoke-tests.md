# State schema migration smoke tests

Frankenbeast state schema migrations are guarded by a focused smoke suite in `packages/franken-brain/tests/unit/state-schema-migration-smoke.test.ts`.

The smoke tests cover two operator-critical paths:

1. A legacy v0 memory-state SQLite database can be opened by the current runtime, upgraded in place, and still returns durable working memory, episodic events, and recovery checkpoints.
2. A database that advertises a future unsupported schema version fails closed before migration code creates or alters runtime state tables.

Run the smoke suite from the repository root:

```bash
npm run test --workspace @franken/brain -- state-schema-migration-smoke.test.ts
```

If this suite fails during a schema change, treat it as a migration compatibility blocker. Either add an explicit migration path that preserves existing durable state, or update the unsupported-version failure path so operators get a deterministic fail-closed error instead of partial database drift.
