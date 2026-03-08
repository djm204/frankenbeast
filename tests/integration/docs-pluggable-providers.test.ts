import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function readFile(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

describe('ADR 010: Pluggable CLI Providers', () => {
  const adrPath = 'docs/adr/010-pluggable-cli-providers.md';

  it('should exist', () => {
    expect(existsSync(resolve(ROOT, adrPath))).toBe(true);
  });

  it('should have Status: Accepted', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Status');
    expect(content).toMatch(/Accepted/);
  });

  it('should have all standard ADR sections', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
  });

  it('should document the replacement of hardcoded union type', () => {
    const content = readFile(adrPath);
    expect(content).toContain('ICliProvider');
    expect(content).toContain('ProviderRegistry');
  });

  it('should list consequence: single-file provider addition', () => {
    const content = readFile(adrPath);
    expect(content).toMatch(/single.file/i);
  });

  it('should list consequence: provider-agnostic MartinLoop/CliLlmAdapter', () => {
    const content = readFile(adrPath);
    expect(content).toContain('MartinLoop');
    expect(content).toContain('CliLlmAdapter');
    expect(content).toMatch(/provider.agnostic/i);
  });

  it('should list consequence: config file overrides', () => {
    const content = readFile(adrPath);
    expect(content).toMatch(/config/i);
    expect(content).toMatch(/override/i);
  });

  it('should mention Warp as deferred', () => {
    const content = readFile(adrPath);
    expect(content).toMatch(/Warp/i);
    expect(content).toMatch(/deferred/i);
  });

  it('should not contain the hardcoded union type', () => {
    const content = readFile(adrPath);
    expect(content).not.toMatch(/'claude'\s*\|\s*'codex'/);
  });
});

describe('ARCHITECTURE.md provider registry updates', () => {
  it('should show ProviderRegistry in Orchestrator Internals component table', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toContain('ProviderRegistry');
  });

  it('should show provider directory in component table', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toContain('providers/');
  });

  it('should show how MartinLoop consumes the registry', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    // MartinLoop should reference the registry pattern
    const martinSection = content.indexOf('MartinLoop');
    expect(martinSection).toBeGreaterThan(-1);
    expect(content).toMatch(/MartinLoop.*registry|registry.*MartinLoop/is);
  });

  it('should show how CliLlmAdapter consumes the registry', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toMatch(/CliLlmAdapter.*ICliProvider|ICliProvider.*CliLlmAdapter/is);
  });

  it('should mention --provider CLI flag', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toContain('--provider');
  });

  it('should mention --providers CLI flag', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toContain('--providers');
  });

  it('should mention config providers section', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toMatch(/providers.*config|config.*providers/is);
  });

  it('should not contain hardcoded union type', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).not.toMatch(/'claude'\s*\|\s*'codex'/);
  });
});

describe('RAMP_UP.md provider system updates', () => {
  it('should include providers/ directory in orchestrator tree', () => {
    const content = readFile('docs/RAMP_UP.md');
    expect(content).toContain('providers/');
  });

  it('should mention all 4 providers', () => {
    const content = readFile('docs/RAMP_UP.md');
    const lower = content.toLowerCase();
    expect(lower).toContain('claude');
    expect(lower).toContain('codex');
    expect(lower).toContain('gemini');
    expect(lower).toContain('aider');
  });

  it('should mention the registry pattern', () => {
    const content = readFile('docs/RAMP_UP.md');
    expect(content).toContain('ProviderRegistry');
  });

  it('should stay under 5000 tokens (approx 3750 words)', () => {
    const content = readFile('docs/RAMP_UP.md');
    const wordCount = content.split(/\s+/).length;
    // 5000 tokens ≈ 3750 words for English text
    expect(wordCount).toBeLessThan(3750);
  });

  it('should not contain hardcoded union type', () => {
    const content = readFile('docs/RAMP_UP.md');
    expect(content).not.toMatch(/'claude'\s*\|\s*'codex'/);
  });
});
