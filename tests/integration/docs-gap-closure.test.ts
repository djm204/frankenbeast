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

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe('docs/RAMP_UP.md — gap closure updates', () => {
  const content = () => readFile('docs/RAMP_UP.md');

  it('should stay under 5000 tokens (~3750 words)', () => {
    const words = wordCount(content());
    expect(words).toBeLessThanOrEqual(3750);
  });

  it('should not claim executeTask() is stub-level', () => {
    const text = content();
    expect(text).not.toContain('executeTask() is stub-level');
  });

  it('should not claim CLI requires --dry-run', () => {
    const text = content();
    expect(text).not.toContain('CLI requires `--dry-run`');
  });

  it('should document --design-doc flag', () => {
    expect(content()).toContain('--design-doc');
  });

  it('should document --config flag for JSON config loading', () => {
    expect(content()).toContain('--config');
  });

  it('should document --verbose trace viewer on :4040', () => {
    const text = content();
    expect(text).toContain('--verbose');
    expect(text).toContain('4040');
  });

  it('should mention real token counting in observer section', () => {
    const text = content();
    expect(text).toMatch(/token\s*(count|track)/i);
  });

  it('should mention cost tracking', () => {
    const text = content();
    expect(text).toMatch(/cost\s*(track|calc)/i);
  });

  it('should mention budget enforcement', () => {
    const text = content();
    expect(text).toMatch(/budget\s*(enforce|limit|circuit)/i);
  });

  it('should mention service labels in CLI output', () => {
    expect(content()).toContain('service label');
  });

  it('should document CliLlmAdapter', () => {
    expect(content()).toContain('CliLlmAdapter');
  });

  it('should document CliObserverBridge', () => {
    expect(content()).toContain('CliObserverBridge');
  });
});

describe('docs/ARCHITECTURE.md — gap closure updates', () => {
  const content = () => readFile('docs/ARCHITECTURE.md');

  it('should list CliLlmAdapter in Orchestrator Internals', () => {
    const text = content();
    const internalsIdx = text.indexOf('## Orchestrator Internals') ?? text.indexOf('Orchestrator Internals');
    expect(internalsIdx).toBeGreaterThan(-1);
    const section = text.substring(internalsIdx);
    expect(section).toContain('CliLlmAdapter');
  });

  it('should list CliObserverBridge in Orchestrator Internals', () => {
    const text = content();
    const internalsIdx = text.indexOf('Orchestrator Internals');
    const section = text.substring(internalsIdx);
    expect(section).toContain('CliObserverBridge');
  });

  it('should have a Mermaid diagram showing CLI → CliLlmAdapter → claude --print', () => {
    const text = content();
    expect(text).toContain('CliLlmAdapter');
    expect(text).toContain('claude --print');
  });

  it('should have a Mermaid diagram showing CLI → CliSkillExecutor → RalphLoop', () => {
    const text = content();
    expect(text).toContain('CliSkillExecutor');
    expect(text).toContain('RalphLoop');
  });

  it('should document CliObserverBridge bridging IObserverModule ↔ ObserverDeps', () => {
    const text = content();
    expect(text).toContain('CliObserverBridge');
    expect(text).toMatch(/IObserverModule/);
  });
});

describe('docs/PROGRESS.md — gap closure entries', () => {
  const content = () => readFile('docs/PROGRESS.md');

  it('should mention cli-gap-analysis gaps are closed', () => {
    const text = content();
    expect(text).toMatch(/cli.gap/i);
  });

  it('should have entries for CliLlmAdapter work', () => {
    expect(content()).toContain('CliLlmAdapter');
  });

  it('should have entries for observer bridge work', () => {
    expect(content()).toMatch(/observer/i);
  });

  it('should have entries for config file loading', () => {
    expect(content()).toMatch(/config.*load/i);
  });

  it('should have entries for trace viewer', () => {
    expect(content()).toMatch(/trace.*viewer/i);
  });

  it('should preserve Phase 1 section', () => {
    expect(content()).toContain('## Phase 1');
  });

  it('should preserve final test counts', () => {
    expect(content()).toContain('Final Test Counts');
  });
});

describe('docs/cli-gap-analysis.md — resolution status', () => {
  const content = () => readFile('docs/cli-gap-analysis.md');

  it('should have a Resolution Summary section', () => {
    expect(content()).toContain('Resolution Summary');
  });

  it('should mark GAP-1 as CLOSED', () => {
    const text = content();
    // Find GAP-1 section and verify CLOSED nearby
    const gap1Idx = text.indexOf('GAP-1');
    expect(gap1Idx).toBeGreaterThan(-1);
    const surroundingText = text.substring(gap1Idx, gap1Idx + 200);
    expect(surroundingText).toMatch(/CLOSED/i);
  });

  it('should mark GAP-2 as CLOSED', () => {
    const text = content();
    const gap2Idx = text.indexOf('GAP-2');
    expect(gap2Idx).toBeGreaterThan(-1);
    const surroundingText = text.substring(gap2Idx, gap2Idx + 200);
    expect(surroundingText).toMatch(/CLOSED/i);
  });

  it('should mark GAP-3 as CLOSED', () => {
    const text = content();
    const gap3Idx = text.indexOf('GAP-3');
    expect(gap3Idx).toBeGreaterThan(-1);
    const surroundingText = text.substring(gap3Idx, gap3Idx + 200);
    expect(surroundingText).toMatch(/CLOSED/i);
  });

  it('should mark GAP-4 as CLOSED', () => {
    const text = content();
    const gap4Idx = text.indexOf('GAP-4');
    expect(gap4Idx).toBeGreaterThan(-1);
    const surroundingText = text.substring(gap4Idx, gap4Idx + 200);
    expect(surroundingText).toMatch(/CLOSED/i);
  });

  it('should mark GAP-5 as CLOSED', () => {
    const text = content();
    const gap5Idx = text.indexOf('GAP-5');
    expect(gap5Idx).toBeGreaterThan(-1);
    const surroundingText = text.substring(gap5Idx, gap5Idx + 200);
    expect(surroundingText).toMatch(/CLOSED/i);
  });

  it('should have Status column in remediation priority table', () => {
    const text = content();
    const tableIdx = text.indexOf('Remediation Priority');
    expect(tableIdx).toBeGreaterThan(-1);
    const tableSection = text.substring(tableIdx, tableIdx + 500);
    expect(tableSection).toContain('Status');
  });
});
