# Chunk 12: Security Audit

## Objective

Perform a comprehensive security audit of the entire Frankenbeast framework module-by-module using the `.cursor/rules/security-fundamentals.mdc` guidelines. Produce a structured security audit report for review and remediation planning.

## Files

- Create: `docs/security/security-audit-2026-03-05.md`

## Context

Frankenbeast consists of 10 modules, each a separate git repo tracked as gitlinks:

1. **frankenfirewall** — Input sanitization, injection detection, PII redaction, adapter-based LLM proxying
2. **franken-skills** — Skill registry, execution types (llm/function/mcp), skill contracts
3. **franken-brain** — Memory orchestrator, episodic traces, context hydration
4. **franken-planner** — Plan decomposition, task DAGs, topological sorting
5. **franken-observer** — Tracing, spans, cost calculation, token budget tracking
6. **franken-critique** — Evaluation pipelines, critique loops, quality scoring
7. **franken-governor** — Approval gateways, HITL channels, policy enforcement
8. **franken-heartbeat** — System health monitoring, self-improvement suggestions
9. **franken-types** — Shared type definitions, branded types
10. **franken-orchestrator** — Beast Loop, CLI, phases, port adapters, deps factory

Security-relevant areas from `.cursor/rules/security-fundamentals.mdc`:
- Zero trust principles
- Input validation at system boundaries
- Secrets management (API keys, env vars)
- Output sanitization
- Dependency security
- Error handling (no sensitive data leakage)

## Success Criteria

- [ ] Audit report created at `docs/security/security-audit-2026-03-05.md`
- [ ] Each module has its own section with: purpose, attack surface, findings, severity, recommendations
- [ ] Severity ratings: Critical, High, Medium, Low, Informational
- [ ] Specific code references (file:line) for each finding
- [ ] Executive summary with risk assessment
- [ ] Covers these categories per module:
  - Input validation (user input, LLM responses, MCP tool results)
  - Authentication & authorization (API keys, governor approvals)
  - Data leakage (PII in logs, error messages, traces)
  - Injection attacks (prompt injection, command injection, XSS)
  - Dependency vulnerabilities (npm audit)
  - Error handling (stack traces, sensitive data in errors)
  - Secrets management (env vars, config files)
  - Rate limiting & resource exhaustion (token budgets, timeouts)
- [ ] Remediation priority list (ordered by severity × likelihood)
- [ ] `npm audit` run for each module and results included

## Verification Command

```bash
# Verify the audit file exists and has content for all modules
test -f docs/security/security-audit-2026-03-05.md && \
  grep -c "## Module" docs/security/security-audit-2026-03-05.md
```

## Hardening Requirements

### Audit Process
- Read every module's source code, focusing on: entry points, external I/O, error handlers, logging, config loading
- Run `npm audit` in each module directory
- Check for hardcoded secrets, API keys, or credentials in source
- Check for unvalidated user input that flows to LLM prompts (prompt injection)
- Check for unvalidated LLM responses that flow to code execution
- Check for PII leakage in logging (especially the new Logger utility)
- Check that the firewall actually blocks known injection patterns
- Check that the governor actually enforces approval for HITL tasks

### Report Format
```markdown
# Frankenbeast Security Audit — 2026-03-05

## Executive Summary
[Overall risk assessment, critical findings count, recommendation summary]

## Module 1: frankenfirewall
### Purpose
### Attack Surface
### Findings
| # | Severity | Category | Description | File:Line | Recommendation |
|---|----------|----------|-------------|-----------|----------------|
### npm audit
[Output of npm audit]

## Module 2: franken-skills
[... same structure ...]

## Remediation Priority
| Priority | Module | Finding | Effort |
|----------|--------|---------|--------|
```

### Sensitive Data Storage — Specific Focus
- No **plaintext** storage of API keys, tokens, or credentials at rest (config files, source code, logs, traces, context objects)
- Encrypted/secure storage (e.g., OS keychain, encrypted config, vault) is acceptable — plaintext is not
- Environment variables are acceptable for runtime injection but must not be persisted to disk in plaintext
- Verify API keys are not logged at any level (info, debug, warn, error)
- Verify API keys are not included in error messages or stack traces
- Verify API keys are not stored in BeastContext, MemoryContext, or EpisodicEntry
- Verify `--verbose` mode does not print API keys or other secrets
- Check for any plaintext storage of secrets in config-loader.ts, deps-factory.ts, and all adapter constructors
- If any plaintext storage at rest is found, classify as **Critical** severity
- Recommend encrypted config or OS keychain integration for the future dashboard

### What NOT to Include
- Do not include false positives or theoretical attacks without evidence
- Do not include code style issues (that's not a security audit)
- Do not modify any code in this chunk — audit only, remediation is separate work
