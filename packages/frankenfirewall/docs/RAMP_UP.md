# frankenfirewall (MOD-01) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses a `stubFirewall` adapter in `dep-factory.ts`.

## Module Overview
`frankenfirewall` is a model-agnostic proxy that enforces safety guardrails between the agent and LLM providers. It scans for prompt injections, masks PII, and enforces schema compliance.

## Current Functionality (Implemented but Unused)
- **Injection Scanner**: Uses regex and entropy patterns to detect malicious prompt engineering.
- **PII Masker**: Redacts sensitive info (emails, SSNs, phone numbers) before data reaches the LLM.
- **Interceptors**: Bidirectional pipeline for inbound (request) and outbound (response) sanitization.
- **Hono Server**: Can be run as a standalone HTTP proxy server.

## Integration Gap
The `franken-orchestrator` currently performs no input sanitization because it uses a no-op firewall stub. **Phase 8 Focus**: Wire this package into the orchestrator's `runIngestion` phase to enable the first layer of the Beast Loop defense.

## Key API
- `runPipeline`: The primary entry point for sanitizing a request/response pair.
- `InjectionScanner`: Specialized logic for blocking adversarial input.
- `PiiMasker`: Logic for identifying and redacting sensitive data.

## Build & Test
```bash
npm run build          # tsc
npm test               # vitest run (unit)
npm run test:coverage  # verifies guardrail efficacy
```

## Dependencies
- `hono`: For the optional HTTP proxy server.
- `@franken/types`: For shared LLM request/response shapes.
