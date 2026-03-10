# Frankenbeast Technical Scrutiny Report — 2026-03-10

## Overview

After a three-pass deep dive into the architecture, implementation, and build infrastructure, I have identified critical discrepancies between the project's documentation and its actual state. While the repository contains high-quality individual packages, the **Orchestrator integration is a "veneer"** that bypasses most safety and intelligence features in the default CLI path.

---

## 1. The "Missing" (Lies in the Documentation)

### ❌ McpRegistry (MOD-MCP)
The documentation (`ARCHITECTURE.md`, `RAMP_UP.md`) describes a robust `McpRegistry` and `McpClient` system for external tool integration.
- **Reality:** `packages/franken-mcp/src/registry/` is entirely missing. The `index.ts` only exports types. There is no implementation of the registry or the tool routing logic.
- **Status:** Non-functional.

### ❌ Real PII Scanning (MOD-03)
The brain module claims to have a PII guard that blocks or redacts sensitive information.
- **Reality:** `IPiiScanner` is a total stub. No real PII scanning library (like `presidio`) is integrated. It relies on a mock in tests and a regex-based `pii-masker` in the firewall (which is bypassed by the CLI).
- **Status:** Stubbed.

### ❌ Real Planning & Critique (MOD-04/MOD-06)
The Beast Loop is documented to run a recursive planning and critique loop.
- **Reality:** The `ChunkFileGraphBuilder` used by the CLI produces a static, linear plan (`impl` -> `harden` pairs) and **explicitly bypasses the critique loop**. The `franken-planner` and `franken-critique` modules are wired as stubs in `dep-factory.ts`.
- **Status:** Bypassed in CLI.

---

## 2. The "Broken" (Integration Debt)

### ⚠️ Stubbed CLI Path
The `createCliDeps` factory in `franken-orchestrator` wires 6 out of 8 core modules as **stubs**.
- **Firewall:** `(input) => ({ sanitizedText: input, violations: [], blocked: false })`
- **Memory:** Returns empty context.
- **Governor:** Always returns `approved`.
- **Heartbeat:** Returns empty improvements.
- **Impact:** The "Guardrails Framework" is currently providing **zero guardrails** in its primary user-facing mode.

### ⚠️ Typecheck & Build Fragility
Root-level typechecking is inconsistent. `franken-mcp` and `frankenfirewall` have reported build failures in `docs/issues/`, yet Turbo often reports them as cached/successful because they are excluded from some dependency chains.

---

## 3. The "Dangerous" (Critical Vulnerabilities)

### 🚨 Command Injection (#32)
`GitBranchIsolator` uses raw shell string interpolation for git commands. A maliciously crafted chunk ID or branch name can execute arbitrary commands on the host machine.
```typescript
// Example of the vulnerability in src/skills/git-branch-isolator.ts
this.exec(`git checkout -b ${branchName}`); // branchName is not sanitized
```

### 🚨 Unauthenticated HTTP Servers (#46, #47)
The Hono-based servers for the **Firewall** and **Governor** are designed to be standalone services but currently lack authentication or signature verification on critical endpoints.
- **Firewall:** No auth on `/v1/chat/completions`.
- **Governor:** Slack webhooks lack HMAC-SHA256 signature verification in the current implementation (despite ADR-016 claiming it's there).

### 🚨 Unbounded Memory (#37)
`WorkingMemoryStore` in `franken-brain` grows without limit. In a long-running session or a high-turn chat, this will lead to OOM (Out of Memory) crashes.

---

## 4. Recent Fixes (Verified & Resolved)

### ✅ Fixed: Broken Cost Tracking
The `CliObserverBridge` was reporting $0 estimated cost for all sessions.
- **Root Cause:** `CliSkillExecutor` was calling `recordTokenUsage` without a `model` parameter, causing the `TokenCounter` to ignore the records. Additionally, `DEFAULT_PRICING` was missing aliases for common provider names like `claude`, `gemini`, and `aider`.
- **Resolution:**
  - Updated `IterationResult` and `MartinLoop` to capture the active provider name.
  - Fixed `CliSkillExecutor` to pass the provider name to `recordTokenUsage`.
  - Added pricing aliases to `DEFAULT_PRICING` (e.g., `claude` -> `claude-sonnet-4-6`).
  - Injected observability into `AdapterLlmClient` to track tokens for planning and triage phases.
- **Status:** Verified working.

---

## 5. The "Bright Spots" (Functional Components)

Despite the integration gaps, several components are exceptionally well-built:
- **`MartinLoop`**: A robust, session-aware CLI agent runner with rate-limit cascading and transcript compaction.
- **`EpisodicMemoryStore`**: Solid SQLite implementation with clean migrations and Zod validation.
- **`BeastLogger`**: A sophisticated, crash-safe logging system with ANSI styling and service labels.
- **`CliObserverBridge`**: Now accurately tracks tokens and costs (USD) following recent fixes to the recording pipeline.

---

## Final Senior Engineer Verdict

Frankenbeast is currently a **high-fidelity prototype** rather than a "deterministic guardrails framework." The packages are modular and ready for integration, but the **orchestrator is cheating** by using stubs and linear graph builders to bypass the complexity of real planning and safety checks.

**Immediate Action Required:**
1. **Sanitize Shell Commands:** Patch the command injection in `git-branch-isolator`.
2. **Implement `McpRegistry`:** Move it from "Design Doc" to "Source Code."
3. **Un-stub the Firewall:** Wire the real `frankenfirewall` into `dep-factory.ts` so the regex scanners actually run.
4. **Fix the Governor Auth:** Implement the signature verification described in the ADRs.
