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

describe('ADR 009: Global CLI Design', () => {
  const adrPath = 'docs/adr/009-global-cli-design.md';

  it('should exist', () => {
    expect(existsSync(resolve(ROOT, adrPath))).toBe(true);
  });

  it('should have Status section', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Status');
  });

  it('should have Context section', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Context');
  });

  it('should have Decision section', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Decision');
  });

  it('should have Consequences section', () => {
    const content = readFile(adrPath);
    expect(content).toContain('## Consequences');
  });

  it('should document global installation', () => {
    const content = readFile(adrPath);
    expect(content).toContain('npm install -g');
  });

  it('should document convention-based project layout', () => {
    const content = readFile(adrPath);
    expect(content).toContain('.frankenbeast/');
  });

  it('should document three entry modes', () => {
    const content = readFile(adrPath);
    expect(content).toContain('--design-doc');
    expect(content).toContain('--plan-dir');
    expect(content).toContain('interview');
  });

  it('should document subcommands', () => {
    const content = readFile(adrPath);
    expect(content).toContain('frankenbeast interview');
    expect(content).toContain('frankenbeast plan');
    expect(content).toContain('frankenbeast run');
  });

  it('should not conflict with existing ADR numbers', () => {
    // ADRs 001-008 already exist; 009 must be new
    expect(existsSync(resolve(ROOT, 'docs/adr/008-approach-c-full-pipeline.md'))).toBe(true);
    expect(existsSync(resolve(ROOT, adrPath))).toBe(true);
  });
});

describe('README.md Usage section', () => {
  it('should have a Usage section', () => {
    const content = readFile('README.md');
    expect(content).toContain('## Usage');
  });

  it('should document interactive session entry modes', () => {
    const content = readFile('README.md');
    expect(content).toContain('frankenbeast --design-doc');
    expect(content).toContain('frankenbeast --plan-dir');
    expect(content).toContain('frankenbeast run --resume');
  });

  it('should document subcommands', () => {
    const content = readFile('README.md');
    expect(content).toContain('frankenbeast interview');
    expect(content).toContain('frankenbeast plan');
    expect(content).toContain('frankenbeast run');
  });

  it('should document global flags', () => {
    const content = readFile('README.md');
    expect(content).toContain('--base-dir');
    expect(content).toContain('--base-branch');
    expect(content).toContain('--budget');
    expect(content).toContain('--provider');
    expect(content).toContain('--verbose');
  });

  it('should document project layout', () => {
    const content = readFile('README.md');
    expect(content).toContain('.frankenbeast/');
    expect(content).toContain('config.json');
    expect(content).toContain('plans/');
    expect(content).toContain('.build/');
  });

  it('should preserve existing sections', () => {
    const content = readFile('README.md');
    expect(content).toContain('## Quick Start');
    expect(content).toContain('## Architecture');
    expect(content).toContain('## Modules');
    expect(content).toContain('## License');
  });
});

describe('ARCHITECTURE.md CLI Pipeline section', () => {
  it('should have a CLI Pipeline section', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    expect(content).toContain('## CLI Pipeline');
  });

  it('should include a Mermaid diagram', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    const cliPipelineStart = content.indexOf('## CLI Pipeline');
    const afterSection = content.substring(cliPipelineStart);
    expect(afterSection).toContain('```mermaid');
    expect(afterSection).toContain('flowchart');
  });

  it('should document entry detection modes', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    const cliPipelineStart = content.indexOf('## CLI Pipeline');
    const afterSection = content.substring(cliPipelineStart);
    expect(afterSection).toContain('InterviewLoop');
    expect(afterSection).toContain('LlmGraphBuilder');
    expect(afterSection).toContain('BeastLoop');
  });

  it('should document HITM review loops', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    const cliPipelineStart = content.indexOf('## CLI Pipeline');
    const afterSection = content.substring(cliPipelineStart);
    expect(afterSection).toContain('HITM Review');
  });

  it('should document project state location', () => {
    const content = readFile('docs/ARCHITECTURE.md');
    const cliPipelineStart = content.indexOf('## CLI Pipeline');
    const afterSection = content.substring(cliPipelineStart);
    expect(afterSection).toContain('.frankenbeast/');
  });
});
