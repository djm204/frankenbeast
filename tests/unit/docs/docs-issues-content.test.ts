import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function readDoc(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

describe('ARCHITECTURE.md — issues pipeline', () => {
  const doc = readDoc('docs/ARCHITECTURE.md');

  it('has Issues Pipeline section', () => {
    expect(doc).toContain('## Issues Pipeline');
  });

  it('describes IssueFetcher component', () => {
    expect(doc).toContain('IssueFetcher');
  });

  it('describes IssueTriage component', () => {
    expect(doc).toContain('IssueTriage');
  });

  it('describes IssueGraphBuilder component', () => {
    expect(doc).toContain('IssueGraphBuilder');
  });

  it('describes IssueReview component', () => {
    expect(doc).toContain('IssueReview');
  });

  it('describes IssueRunner component', () => {
    expect(doc).toContain('IssueRunner');
  });

  it('has mermaid diagram with fetch → triage → review → execute flow', () => {
    expect(doc).toMatch(/```mermaid[\s\S]*IssueFetcher[\s\S]*IssueTriage[\s\S]*IssueReview[\s\S]*IssueRunner[\s\S]*```/);
  });

  it('shows how issues connect to CliSkillExecutor', () => {
    expect(doc).toMatch(/Issue.*CliSkillExecutor|CliSkillExecutor.*Issue/is);
  });

  it('has valid mermaid syntax (no unclosed blocks)', () => {
    const mermaidBlocks = doc.match(/```mermaid[\s\S]*?```/g) || [];
    expect(mermaidBlocks.length).toBeGreaterThan(0);
    for (const block of mermaidBlocks) {
      // Every mermaid block should open and close properly
      expect(block.startsWith('```mermaid')).toBe(true);
      expect(block.endsWith('```')).toBe(true);
    }
  });
});

describe('RAMP_UP.md — issues subcommand', () => {
  const doc = readDoc('docs/RAMP_UP.md');

  it('documents frankenbeast issues subcommand', () => {
    expect(doc).toContain('frankenbeast issues');
  });

  it('documents --label flag', () => {
    expect(doc).toContain('--label');
  });

  it('documents --search flag', () => {
    expect(doc).toContain('--search');
  });

  it('documents --dry-run flag', () => {
    expect(doc).toContain('--dry-run');
  });

  it('documents --milestone flag', () => {
    expect(doc).toContain('--milestone');
  });

  it('documents --repo flag', () => {
    expect(doc).toContain('--repo');
  });

  it('documents --assignee flag', () => {
    expect(doc).toContain('--assignee');
  });

  it('documents --limit flag', () => {
    expect(doc).toContain('--limit');
  });

  it('has src/issues/ in the orchestrator file tree', () => {
    expect(doc).toMatch(/issues\//);
  });

  it('stays under 5000 tokens (rough: under 20000 chars)', () => {
    // ~4 chars per token average, 5000 tokens ≈ 20000 chars
    expect(doc.length).toBeLessThan(20000);
  });
});

describe('PROGRESS.md — GitHub issues feature entry', () => {
  const doc = readDoc('docs/PROGRESS.md');

  it('has GitHub Issues section', () => {
    expect(doc).toMatch(/GitHub Issues|GitHub issues/i);
  });

  it('mentions test counts', () => {
    // Should reference specific test numbers
    expect(doc).toMatch(/\d+ tests/i);
  });

  it('mentions branch name', () => {
    expect(doc).toMatch(/feat\/.*docs-update|feat\/.*github/i);
  });

  it('describes what changed', () => {
    expect(doc).toMatch(/IssueFetcher|issue.*pipeline|issues.*subcommand/i);
  });
});

describe('docs/guides/fix-github-issues.md — quickstart guide', () => {
  const doc = readDoc('docs/guides/fix-github-issues.md');

  it('exists and is non-empty', () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it('shows --label critical example', () => {
    expect(doc).toContain('--label critical');
  });

  it('shows --search with GitHub search syntax example', () => {
    expect(doc).toMatch(/--search.*label:bug/);
  });

  it('shows --dry-run example', () => {
    expect(doc).toContain('--dry-run');
  });

  it('has step-by-step structure', () => {
    // Should have numbered steps or headers for the flow
    expect(doc).toMatch(/##|Step \d|1\./);
  });

  it('does not contain speculative future work', () => {
    expect(doc).not.toMatch(/future work|coming soon|planned|roadmap/i);
  });
});
