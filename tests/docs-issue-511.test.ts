import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #511 ramp-up documentation', () => {
  it('keeps RAMP_UP aligned with the current package set', () => {
    const rampUp = readDoc('docs/RAMP_UP.md');
    const packages = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(ROOT, 'packages', entry.name, 'package.json')))
      .map((entry) => entry.name)
      .sort();

    expect(packages).toHaveLength(10);
    expect(packages).toContain('franken-mcp-suite');
    expect(packages).toContain('live-bench');
    expect(rampUp).toContain('10 first-party packages');
    expect(rampUp).toContain('packages/franken-mcp-suite/');
    expect(rampUp).toContain('packages/live-bench/');
    expect(rampUp).not.toContain('All **8 packages**');
  });

  it('documents fail-closed dependency assembly instead of passthrough fallback', () => {
    const rampUp = readDoc('docs/RAMP_UP.md');

    expect(rampUp).toContain('does **not** synthesize permissive passthrough success deps');
    expect(rampUp).toContain('createBeastDeps failed:');
    expect(rampUp).toContain('FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1');
    expect(rampUp).not.toContain('Falls back to passthrough stubs only when `createBeastDeps()` throws');
  });

  it('documents explicit resume behavior and provides the agent ramp-up file', () => {
    const rampUp = readDoc('docs/RAMP_UP.md');
    const agentRampUp = readDoc('docs/AGENT_RAMP_UP.md');

    expect(rampUp).toContain('Cold `frankenbeast run` clears existing execution checkpoint/chunk-session state');
    expect(rampUp).toContain('`frankenbeast run --resume` preserves that state and fails fast when no checkpoint exists');
    expect(rampUp).not.toContain('`--resume` parsed but not a distinct control path');
    expect(agentRampUp).toContain('## Active Decisions');
    expect(agentRampUp).toContain('ADR-033');
    expect(agentRampUp).toContain('Fail-closed deps');
    expect(agentRampUp).toContain('Resume semantics');
  });
});
