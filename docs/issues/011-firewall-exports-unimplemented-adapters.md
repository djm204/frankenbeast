# Issue: `frankenfirewall` Publicly Exports Adapters That Only Throw

Severity: medium
Area: `frankenfirewall`

## Summary

The package root exports `GeminiAdapter` and `MistralAdapter`, but both classes are TODO shells that throw on every interface method.

## Intended Behavior

Anything exported from the package root should either be supported or clearly marked as internal/experimental and excluded from the main public API.

## Current Behavior

- `src/index.ts` re-exports both adapters.
- Both adapter classes throw `Not implemented` for capability validation, request transformation, execution, and response transformation.

## Evidence

- `frankenfirewall/src/index.ts:5-9`
- `frankenfirewall/src/adapters/gemini/gemini-adapter.ts:5-33`
- `frankenfirewall/src/adapters/mistral/mistral-adapter.ts:5-33`
- `docs/PROGRESS.md:24-27`

## Impact

- Consumers can import apparently supported adapters that fail immediately at runtime.
- The public surface is broader than the supported surface.

## Acceptance Criteria

- Either implement these adapters, move them behind an experimental entrypoint, or stop exporting them from the package root.
- Document support status explicitly.
