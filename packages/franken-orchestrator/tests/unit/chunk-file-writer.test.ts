import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChunkFileWriter } from '../../src/planning/chunk-file-writer.js';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';
import type { ValidationIssue } from '../../src/planning/chunk-validator.js';

const fixtureDir = join(__dirname, '__fixtures__', 'chunk-writer');

beforeEach(() => {
  mkdirSync(fixtureDir, { recursive: true });
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('ChunkFileWriter', () => {
  it('writes numbered chunk files with action-verb names', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'define-types',
        objective: 'Define shared type interfaces',
        files: ['src/types.ts', 'tests/types.test.ts'],
        successCriteria: 'Type definitions compile',
        verificationCommand: 'npx tsc --noEmit',
        dependencies: [],
        context: 'Types are shared across modules',
        designDecisions: 'Use branded types for IDs',
        interfaceContract: 'export interface Widget { id: string; name: string; }',
        edgeCases: 'Empty name should be rejected',
        antiPatterns: 'Avoid using any type',
      },
    ];

    const writer = new ChunkFileWriter(fixtureDir);
    const paths = writer.write(chunks);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('01_define-types.md');

    const content = readFileSync(paths[0], 'utf-8');
    expect(content).toContain('# Chunk 01: define-types');
    expect(content).toContain('## Objective');
    expect(content).toContain('Define shared type interfaces');
    expect(content).toContain('## Files');
    expect(content).toContain('- src/types.ts');
    expect(content).toContain('- tests/types.test.ts');
    expect(content).toContain('## Context');
    expect(content).toContain('Types are shared across modules');
    expect(content).toContain('## Design Decisions');
    expect(content).toContain('Use branded types for IDs');
    expect(content).toContain('## Interface Contract');
    expect(content).toContain('export interface Widget { id: string; name: string; }');
    expect(content).toContain('## Edge Cases');
    expect(content).toContain('Empty name should be rejected');
    expect(content).toContain('## Success Criteria');
    expect(content).toContain('Type definitions compile');
    expect(content).toContain('## Anti-patterns');
    expect(content).toContain('Avoid using any type');
    expect(content).toContain('## Verification Command');
    expect(content).toContain('npx tsc --noEmit');
  });

  it('writes all 10-field sections when present', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'implement-router',
        objective: 'Implement the HTTP router',
        files: ['src/router.ts'],
        successCriteria: 'Router tests pass',
        verificationCommand: 'npx vitest run tests/router.test.ts',
        dependencies: ['define-types'],
        context: 'Router handles all HTTP endpoints',
        designDecisions: 'Use Hono framework',
        interfaceContract: 'GET /widgets, POST /widgets',
        edgeCases: '404 for unknown routes',
        antiPatterns: 'Do not use express',
      },
    ];

    const writer = new ChunkFileWriter(fixtureDir);
    const paths = writer.write(chunks);
    const content = readFileSync(paths[0], 'utf-8');

    // All 10 section headers must appear (id/objective counted via # Chunk, files via ## Files)
    const expectedHeaders = [
      '## Objective',
      '## Files',
      '## Context',
      '## Design Decisions',
      '## Interface Contract',
      '## Edge Cases',
      '## Success Criteria',
      '## Anti-patterns',
      '## Verification Command',
      '## Dependencies',
    ];

    for (const header of expectedHeaders) {
      expect(content).toContain(header);
    }

    // Dependencies section should list the dependency
    expect(content).toContain('- define-types');
  });

  it('omits sections for undefined optional fields', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'minimal-chunk',
        objective: 'A minimal chunk with only required fields',
        files: ['src/foo.ts'],
        successCriteria: 'Tests pass',
        verificationCommand: 'npx vitest run',
        dependencies: [],
      },
    ];

    const writer = new ChunkFileWriter(fixtureDir);
    const paths = writer.write(chunks);
    const content = readFileSync(paths[0], 'utf-8');

    // Required sections present
    expect(content).toContain('## Objective');
    expect(content).toContain('## Files');
    expect(content).toContain('## Success Criteria');
    expect(content).toContain('## Verification Command');

    // Optional sections absent
    expect(content).not.toContain('## Context');
    expect(content).not.toContain('## Design Decisions');
    expect(content).not.toContain('## Interface Contract');
    expect(content).not.toContain('## Edge Cases');
    expect(content).not.toContain('## Anti-patterns');
    // Dependencies absent because empty array
    expect(content).not.toContain('## Dependencies');
  });

  it('appends warnings section when validation issues exist', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'define-types',
        objective: 'Define types',
        files: ['src/types.ts'],
        successCriteria: 'Types compile',
        verificationCommand: 'npx tsc --noEmit',
        dependencies: [],
      },
    ];

    const issues: ValidationIssue[] = [
      {
        severity: 'warning',
        chunkId: 'define-types',
        category: 'chunk_too_thin',
        description: 'Missing interface contract',
        suggestion: 'Add concrete signatures',
      },
      {
        severity: 'error',
        chunkId: 'define-types',
        category: 'missing_interface',
        description: 'No API boundary defined',
        suggestion: 'Define exports',
      },
      {
        // This issue targets a different chunk — should NOT appear in define-types file
        severity: 'warning',
        chunkId: 'other-chunk',
        category: 'design_gap',
        description: 'Unrelated issue',
        suggestion: 'Fix it',
      },
    ];

    const writer = new ChunkFileWriter(fixtureDir);
    const paths = writer.write(chunks, issues);
    const content = readFileSync(paths[0], 'utf-8');

    expect(content).toContain('## Warnings');
    expect(content).toContain('**[warning] chunk_too_thin**');
    expect(content).toContain('Missing interface contract');
    expect(content).toContain('Suggestion: Add concrete signatures');
    expect(content).toContain('**[error] missing_interface**');
    expect(content).toContain('No API boundary defined');
    // The other-chunk issue should NOT be in this file
    expect(content).not.toContain('Unrelated issue');
  });

  it('clears existing chunk files before writing', () => {
    const writer = new ChunkFileWriter(fixtureDir);

    // Write set 1
    const set1: ChunkDefinition[] = [
      {
        id: 'old-chunk-a',
        objective: 'Old A',
        files: ['a.ts'],
        successCriteria: 'A passes',
        verificationCommand: 'npm test',
        dependencies: [],
      },
      {
        id: 'old-chunk-b',
        objective: 'Old B',
        files: ['b.ts'],
        successCriteria: 'B passes',
        verificationCommand: 'npm test',
        dependencies: [],
      },
    ];
    const paths1 = writer.write(set1);
    expect(paths1).toHaveLength(2);

    // Write set 2 — different chunks
    const set2: ChunkDefinition[] = [
      {
        id: 'new-chunk-x',
        objective: 'New X',
        files: ['x.ts'],
        successCriteria: 'X passes',
        verificationCommand: 'npm test',
        dependencies: [],
      },
    ];
    const paths2 = writer.write(set2);

    // Set 2 should have only 1 file
    expect(paths2).toHaveLength(1);

    // Directory should only contain set 2's file
    const remaining = readdirSync(fixtureDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe('01_new-chunk-x.md');

    // Old files should be gone
    const content = readFileSync(paths2[0], 'utf-8');
    expect(content).toContain('New X');
    expect(content).not.toContain('Old A');
  });
});
