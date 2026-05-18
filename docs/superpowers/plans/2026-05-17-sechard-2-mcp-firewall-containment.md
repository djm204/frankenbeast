# Chunk 2: MCP Schema Enforcement & Firewall Path Containment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce advertised MCP tool input schemas centrally before any handler runs, and constrain firewall file scanning to the configured project root.

**Architecture:** Add a single `validateToolArguments` gate in `createMcpServer`'s `CallTool` path so every tool inherits required/type/no-extra-property validation from its already-declared `inputSchema`. Add real-path root containment to the firewall adapter's `scanFile`. Self-contained to `franken-mcp-suite`; no cross-package changes.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Node `fs`/`path`, Vitest.

---

## Verified Gap Evidence (current `main` @ `610a0ea`, 2026-05-17)

- `packages/franken-mcp-suite/src/shared/server-factory.ts` `CallToolRequestSchema` handler calls `tool.handler((args ?? {}) as Record<string, unknown>)` with **no** validation against `tool.inputSchema` (which is defined and advertised at the `ListTools` path). Required/type/extra-property checks do not happen.
- `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts` `scanFile(path)` does `readFileSync(path, 'utf8')` directly — any caller-supplied absolute or `../` path is read.

## File Structure

- Modify `packages/franken-mcp-suite/src/shared/server-factory.ts` — add `validateToolArguments(tool, args)` and call it in the `CallTool` handler before `tool.handler`.
- Modify `packages/franken-mcp-suite/src/shared/server-factory.test.ts` — required/type/extra-property red tests.
- Modify `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts` — root-contained `scanFile`.
- Modify `packages/franken-mcp-suite/src/servers/firewall.ts` — pass the intended root to the adapter.
- Modify `packages/franken-mcp-suite/src/servers/firewall.test.ts` — outside-root rejection tests.

---

## Task 1: Central MCP input-schema validation

**Files:**
- Modify: `packages/franken-mcp-suite/src/shared/server-factory.ts` (`CallTool` handler)
- Test: `packages/franken-mcp-suite/src/shared/server-factory.test.ts`

- [ ] **Step 1: Write failing validation tests**

In `server-factory.test.ts`:

```ts
function makeServerWithSpy() {
  const calls: unknown[] = [];
  const tool: ToolDef = {
    name: 'echo',
    description: 'echo',
    inputSchema: { type: 'object', properties: { msg: { type: 'string', description: 'm' } }, required: ['msg'] },
    handler: async (args) => { calls.push(args); return { content: [{ type: 'text', text: 'ok' }] }; },
  };
  return { srv: createMcpServer('t', '1', [tool]), calls, tool };
}

it('rejects missing required property without calling the handler', async () => {
  const { srv, calls } = makeServerWithSpy();
  const res = await callTool(srv, 'echo', {}); // helper invokes the CallTool handler
  expect(res.isError).toBe(true);
  expect(calls).toHaveLength(0);
});

it('rejects wrong property type', async () => {
  const { srv, calls } = makeServerWithSpy();
  const res = await callTool(srv, 'echo', { msg: 123 });
  expect(res.isError).toBe(true);
  expect(calls).toHaveLength(0);
});

it('rejects unknown extra property', async () => {
  const { srv, calls } = makeServerWithSpy();
  const res = await callTool(srv, 'echo', { msg: 'hi', extra: 1 });
  expect(res.isError).toBe(true);
  expect(calls).toHaveLength(0);
});

it('passes a valid argument object through to the handler', async () => {
  const { srv, calls } = makeServerWithSpy();
  const res = await callTool(srv, 'echo', { msg: 'hi' });
  expect(res.isError).toBeFalsy();
  expect(calls).toEqual([{ msg: 'hi' }]);
});
```

If `server-factory.test.ts` has no `callTool` helper, add one that constructs the server and calls the registered `CallToolRequestSchema` handler with `{ params: { name, arguments } }` (mirror the SDK request shape used by sibling tests).

- [ ] **Step 2: Run, verify failure**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/shared/server-factory.test.ts`
Expected: FAIL — handler is called with raw args; `calls` is non-empty, `isError` falsy.

- [ ] **Step 3: Implement `validateToolArguments`**

In `server-factory.ts`, add before `createMcpServer`:

```ts
function validateToolArguments(
  tool: ToolDef,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, message: `Tool ${tool.name} expects an object argument` };
  }
  const obj = args as Record<string, unknown>;
  const schema = tool.inputSchema;
  for (const req of schema.required ?? []) {
    if (!(req in obj) || obj[req] === undefined) {
      return { ok: false, message: `Tool ${tool.name} missing required property: ${req}` };
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      return { ok: false, message: `Tool ${tool.name} received unknown property: ${key}` };
    }
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (prop.type === 'integer' ? !Number.isInteger(value) : actual !== prop.type) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be ${prop.type}` };
    }
  }
  return { ok: true, value: obj };
}
```

In the `CallToolRequestSchema` handler, after the `if (!tool) {...}` block and before `tool.handler(...)`:

```ts
const validated = validateToolArguments(tool, args ?? {});
if (!validated.ok) {
  return { content: [{ type: 'text' as const, text: `Error: ${validated.message}` }], isError: true };
}
const result = await tool.handler(validated.value);
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/shared/server-factory.test.ts`
Expected: PASS. Run the full suite — `npm test --` — and fix any server whose tests passed loosely-typed args that the schema legitimately forbids (tighten the test's args, not the validator).

- [ ] **Step 5: Commit**

```bash
git add packages/franken-mcp-suite/src/shared/server-factory.ts packages/franken-mcp-suite/src/shared/server-factory.test.ts
git commit -m "fix(mcp-suite): enforce advertised tool input schemas centrally"
```

---

## Task 2: Firewall scan-file root containment

**Files:**
- Modify: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts` (`scanFile`)
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
- Test: `packages/franken-mcp-suite/src/servers/firewall.test.ts`

- [ ] **Step 1: Write failing containment tests**

In `firewall.test.ts`, in a temp project root:

```ts
it('rejects scanning a path outside the project root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fw-root-'));
  const adapter = createFirewallAdapter(join(root, 'fw.db'), 'standard', { root });
  await expect(adapter.scanFile('../../etc/passwd')).rejects.toThrow(/outside.*root/i);
  await expect(adapter.scanFile('/etc/passwd')).rejects.toThrow(/outside.*root/i);
});

it('allows scanning a file inside the project root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fw-root-'));
  writeFileSync(join(root, 'safe.txt'), 'hello');
  const adapter = createFirewallAdapter(join(root, 'fw.db'), 'standard', { root });
  const res = await adapter.scanFile('safe.txt');
  expect(res.verdict).toBe('clean');
});
```

- [ ] **Step 2: Run, verify failure**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts`
Expected: FAIL — `createFirewallAdapter` has no root option; `scanFile` reads any path.

- [ ] **Step 3: Implement containment**

In `firewall-adapter.ts`: add a third options parameter and a containment helper. Change the factory signature to
`createFirewallAdapter(dbPathOrDeps: string | FirewallAdapterDeps, tier: InjectionTier = 'standard', options: { root?: string } = {})`
and add at the top of the string branch:

```ts
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = realpathSync(resolve(options.root ?? process.env.FBEAST_ROOT ?? process.cwd()));

function resolveContained(requested: string): string {
  const target = resolve(root, requested);
  const realTarget = realpathSync(target); // throws ENOENT for missing — acceptable, caller handles
  if (realTarget !== root && !realTarget.startsWith(root + sep)) {
    throw new Error(`Refusing to scan path outside project root: ${requested}`);
  }
  return realTarget;
}
```

Change `scanFile` to:

```ts
async scanFile(path) {
  const safePath = resolveContained(path);
  const content = readFileSync(safePath, 'utf8');
  const result = scanWithPatterns(content, patterns);
  logScan(content, result);
  return result;
},
```

In `servers/firewall.ts`, pass the intended root when constructing the adapter (use the server's existing project-root/`FBEAST_ROOT` resolution; if none exists there, pass `{ root: process.env.FBEAST_ROOT ?? process.cwd() }`).

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/franken-mcp-suite && npm test -- --run src/servers/firewall.test.ts src/adapters/firewall-adapter.test.ts`
Expected: PASS. Update existing firewall-adapter tests that scanned absolute temp paths to construct the adapter with `{ root }` pointing at that temp dir.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-mcp-suite/src/adapters/firewall-adapter.ts packages/franken-mcp-suite/src/servers/firewall.ts packages/franken-mcp-suite/src/servers/firewall.test.ts packages/franken-mcp-suite/src/adapters/firewall-adapter.test.ts
git commit -m "fix(mcp-suite): contain firewall scan_file to project root"
```

---

## Task 3: Closeout — ADR + audit follow-up + verification

**Files:**
- Create: `docs/adr/035-mcp-input-validation-and-path-containment.md`
- Modify: `docs/audits/agent-systems-audit-2026-04-28.md`

- [ ] **Step 1: Write ADR-035**

Record: all MCP tools now validate against their declared `inputSchema` (required, primitive type, integer, no-extra-property) before the handler runs; `fbeast_firewall_scan_file` resolves and real-path-checks against the project root and refuses outside-root reads. Residual: validation is structural (no deep JSON-schema `format`/nested objects) — note the boundary explicitly.

- [ ] **Step 2: Audit follow-up**

In `docs/audits/agent-systems-audit-2026-04-28.md` `Follow-Up Implementation Status`, map the Pillar-1 gap lines "MCP tool schemas are metadata, not enforced validation" and "File scanning can read arbitrary supplied paths" to `fixed`, citing commits/tests.

- [ ] **Step 3: Verify the chunk**

```bash
cd packages/franken-mcp-suite && npm test -- --run src/shared/server-factory.test.ts src/servers/firewall.test.ts src/adapters/firewall-adapter.test.ts && npm test -- && npm run typecheck
```
Expected: all exit `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/035-mcp-input-validation-and-path-containment.md docs/audits/agent-systems-audit-2026-04-28.md
git commit -m "docs: ADR-035 and audit follow-up for MCP/firewall hardening"
```

---

## Self-Review

- **Spec coverage:** Both Pillar-1 input-boundary gaps (unenforced MCP schemas, arbitrary-path file read) each have a failing-first task. Validation is centralized in `createMcpServer` so every tool inherits it (DRY).
- **Placeholder scan:** Every code step shows real code; the validator handles object/array/`integer` cases explicitly rather than "add validation".
- **Type consistency:** `validateToolArguments` consumes the existing `ToolDef`/`ToolInputSchema`; `createFirewallAdapter`'s new third arg is `{ root?: string }` used identically in adapter, server, and tests; `resolveContained` is the single containment path used by `scanFile`.

## Execution Handoff

Plan complete. **(1) Subagent-Driven (recommended)** or **(2) Inline Execution** via executing-plans.
