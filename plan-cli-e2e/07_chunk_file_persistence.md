# Chunk 07: Chunk File Persistence

## Objective

Extend `file-writer.ts` with functions to write and clear numbered chunk `.md` files in `.frankenbeast/plans/`. After `LlmGraphBuilder` decomposes a design doc into chunks, each chunk definition is written as a separate file for user review and RALPH loop consumption.

## Files

- **Modify**: `franken-orchestrator/src/cli/file-writer.ts` — add `writeChunkFiles`, `clearChunkFiles`
- **Modify**: `franken-orchestrator/tests/unit/cli/file-writer.test.ts` — add chunk file tests

## Key Reference Files

- `franken-orchestrator/src/planning/llm-graph-builder.ts` — `ChunkDefinition` shape: `{ id, objective, files, successCriteria, verificationCommand, dependencies }`
- `plan-approach-c/01_checkpoint_store.md` — example chunk file format
- `franken-orchestrator/src/cli/file-writer.ts` — existing design doc functions (from chunk 06)

## Interface

```typescript
export interface ChunkDefinition {
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];
}

/**
 * Writes chunk definitions as numbered .md files.
 * Clears existing chunks first.
 * Returns absolute paths of written files.
 */
export function writeChunkFiles(paths: ProjectPaths, chunks: ChunkDefinition[]): string[];

/**
 * Removes all numbered chunk .md files from the plans directory.
 */
export function clearChunkFiles(paths: ProjectPaths): void;
```

## Implementation

Add to `file-writer.ts`:

```typescript
export interface ChunkDefinition {
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];
}

/**
 * Removes all numbered chunk .md files from the plans directory.
 * Matches files starting with two digits (e.g., 01_auth.md, 02_db.md).
 */
export function clearChunkFiles(paths: ProjectPaths): void {
  if (!existsSync(paths.plansDir)) return;
  const files = readdirSync(paths.plansDir);
  for (const f of files) {
    if (/^\d{2}/.test(f) && f.endsWith('.md')) {
      unlinkSync(resolve(paths.plansDir, f));
    }
  }
}

/**
 * Writes chunk definitions as numbered .md files.
 * Clears existing chunks first to handle regeneration.
 * Returns absolute paths of written files.
 */
export function writeChunkFiles(paths: ProjectPaths, chunks: ChunkDefinition[]): string[] {
  clearChunkFiles(paths);

  return chunks.map((chunk, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const safeName = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${num}_${safeName}.md`;
    const filePath = resolve(paths.plansDir, filename);

    const content = [
      `# Chunk ${num}: ${chunk.id}`,
      '',
      '## Objective',
      '',
      chunk.objective,
      '',
      '## Files',
      '',
      ...chunk.files.map((f) => `- ${f}`),
      '',
      '## Success Criteria',
      '',
      chunk.successCriteria,
      '',
      '## Verification Command',
      '',
      '```bash',
      chunk.verificationCommand,
      '```',
      '',
      ...(chunk.dependencies.length > 0
        ? ['## Dependencies', '', ...chunk.dependencies.map((d) => `- ${d}`), '']
        : []),
    ].join('\n');

    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  });
}
```

## Test Cases

Add to `file-writer.test.ts`:

```typescript
describe('file-writer (chunk files)', () => {
  // ... same testDir/paths setup as chunk 06 tests ...

  const sampleChunks: ChunkDefinition[] = [
    {
      id: 'auth-system',
      objective: 'Implement user authentication',
      files: ['src/auth.ts', 'tests/auth.test.ts'],
      successCriteria: 'Auth tests pass',
      verificationCommand: 'npx vitest run tests/auth.test.ts',
      dependencies: [],
    },
    {
      id: 'user-db',
      objective: 'Set up user database',
      files: ['src/db.ts'],
      successCriteria: 'DB connection established',
      verificationCommand: 'npx vitest run tests/db.test.ts',
      dependencies: ['auth-system'],
    },
  ];

  describe('writeChunkFiles', () => {
    it('writes numbered chunk files', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('01_auth-system.md');
      expect(result[1]).toContain('02_user-db.md');
      expect(existsSync(result[0])).toBe(true);
      expect(existsSync(result[1])).toBe(true);
    });

    it('writes correct content format', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[0], 'utf-8');
      expect(content).toContain('# Chunk 01: auth-system');
      expect(content).toContain('## Objective');
      expect(content).toContain('Implement user authentication');
      expect(content).toContain('## Files');
      expect(content).toContain('- src/auth.ts');
      expect(content).toContain('## Success Criteria');
      expect(content).toContain('## Verification Command');
      expect(content).toContain('npx vitest run tests/auth.test.ts');
    });

    it('includes dependencies section when present', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[1], 'utf-8');
      expect(content).toContain('## Dependencies');
      expect(content).toContain('- auth-system');
    });

    it('omits dependencies section when empty', () => {
      const result = writeChunkFiles(paths, sampleChunks);
      const content = readFileSync(result[0], 'utf-8');
      expect(content).not.toContain('## Dependencies');
    });

    it('clears existing chunks before writing', () => {
      writeChunkFiles(paths, sampleChunks);
      const newChunks = [sampleChunks[0]];
      const result = writeChunkFiles(paths, newChunks);
      expect(result).toHaveLength(1);
      // Old 02_ file should be gone
      const files = readdirSync(paths.plansDir).filter((f) => /^\d{2}/.test(f));
      expect(files).toHaveLength(1);
    });
  });

  describe('clearChunkFiles', () => {
    it('removes numbered md files', () => {
      writeChunkFiles(paths, sampleChunks);
      clearChunkFiles(paths);
      const files = readdirSync(paths.plansDir).filter((f) => /^\d{2}/.test(f));
      expect(files).toHaveLength(0);
    });

    it('does not remove design.md', () => {
      writeDesignDoc(paths, '# Design');
      writeChunkFiles(paths, sampleChunks);
      clearChunkFiles(paths);
      expect(existsSync(paths.designDocFile)).toBe(true);
    });

    it('handles empty directory gracefully', () => {
      expect(() => clearChunkFiles(paths)).not.toThrow();
    });
  });
});
```

## Success Criteria

- [ ] `writeChunkFiles()` writes numbered `01_<id>.md`, `02_<id>.md`, etc.
- [ ] File content includes Objective, Files, Success Criteria, Verification Command sections
- [ ] Dependencies section included only when non-empty
- [ ] `writeChunkFiles()` clears existing chunks first (handles regeneration)
- [ ] `clearChunkFiles()` removes only numbered `.md` files, not `design.md`
- [ ] `clearChunkFiles()` handles empty/missing directory
- [ ] Chunk IDs are sanitized for filesystem safety
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/cli/file-writer.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/file-writer.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- Sanitize chunk IDs: replace non-alphanumeric/underscore/hyphen with `_`
- `clearChunkFiles` regex: `/^\d{2}/` — must NOT match `design.md`
- Zero-pad chunk numbers with `padStart(2, '0')`
- Do NOT import `LlmGraphBuilder` — define `ChunkDefinition` locally to avoid coupling
- Use `.js` extensions in all import paths
