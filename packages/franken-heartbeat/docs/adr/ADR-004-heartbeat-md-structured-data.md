# ADR-004: HEARTBEAT.md as Structured Data Source

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

MOD-08 needs a persistent, human-readable checklist of watchlist items and a reflection log. The project outline defines a `HEARTBEAT.md` file with two sections: "Active Watchlist" (checkbox items) and "Reflection Log" (dated entries). This file must be both machine-parseable and human-editable.

## Decision

Parse `HEARTBEAT.md` as structured markdown with two known sections:

- **Active Watchlist**: Lines matching `- [ ] <text>` or `- [x] <text>`
- **Reflection Log**: Lines matching `- *<label>:* <text>`

The parser and writer are **pure functions** — they take a string and return typed data (or vice versa). File I/O is handled by the orchestrator, not the parser module.

Unknown sections are preserved as passthrough content to avoid data loss.

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| JSON/YAML config file | Not human-friendly for quick edits; loses readability of markdown |
| SQLite database | Over-engineered for a small checklist; not human-editable |
| TOML | Less familiar to most users; markdown is already the project standard |

## Consequences

- **Positive:** Human-readable and editable with any text editor.
- **Positive:** Pure functions are trivially testable.
- **Negative:** Markdown parsing is fragile — unusual formatting may not parse.
- **Mitigation:** Graceful handling of malformed lines (skip with warning, not crash).
