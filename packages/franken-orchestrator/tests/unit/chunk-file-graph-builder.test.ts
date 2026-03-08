import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChunkFileGraphBuilder } from '../../src/planning/chunk-file-graph-builder.js';
import type { PlanGraph, PlanTask } from '../../src/deps.js';

describe('ChunkFileGraphBuilder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'chunk-graph-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const intent = { goal: 'build the project' };

  function writeMdFile(name: string, content: string): void {
    writeFileSync(join(tmpDir, name), content, 'utf-8');
  }

  function taskById(tasks: readonly PlanTask[], id: string): PlanTask | undefined {
    return tasks.find((t) => t.id === id);
  }

  describe('chunk discovery', () => {
    it('discovers .md files matching ^\\d{2} pattern', async () => {
      writeMdFile('01_setup.md', 'Setup chunk');
      writeMdFile('02_build.md', 'Build chunk');
      writeMdFile('README.md', 'Not a chunk');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      // 2 chunks × 2 tasks each = 4 tasks
      expect(graph.tasks).toHaveLength(4);
    });

    it('excludes files with 00_ prefix', async () => {
      writeMdFile('00_overview.md', 'Overview — should be excluded');
      writeMdFile('01_setup.md', 'Setup chunk');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      // Only 01_setup → 2 tasks
      expect(graph.tasks).toHaveLength(2);
      const ids = graph.tasks.map((t) => t.id);
      expect(ids).not.toContain('impl:00_overview');
      expect(ids).not.toContain('harden:00_overview');
    });

    it('excludes non-.md files', async () => {
      writeMdFile('01_setup.md', 'Setup chunk');
      writeFileSync(join(tmpDir, '02_build.txt'), 'Not a markdown file');
      writeFileSync(join(tmpDir, '03_test.ts'), 'Not a markdown file');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(2);
    });

    it('sorts files alphabetically for natural chunk ordering', async () => {
      writeMdFile('03_last.md', 'Third');
      writeMdFile('01_first.md', 'First');
      writeMdFile('02_second.md', 'Second');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const ids = graph.tasks.map((t) => t.id);
      expect(ids).toEqual([
        'impl:01_first',
        'harden:01_first',
        'impl:02_second',
        'harden:02_second',
        'impl:03_last',
        'harden:03_last',
      ]);
    });
  });

  describe('task creation', () => {
    it('creates impl and harden tasks per chunk', async () => {
      writeMdFile('01_setup.md', 'Setup instructions');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(2);
      expect(taskById(graph.tasks, 'impl:01_setup')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:01_setup')).toBeDefined();
    });

    it('sets impl task objective from chunk file content', async () => {
      const content = '# Chunk 01\n\nImplement the feature.';
      writeMdFile('01_setup.md', content);

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const implTask = taskById(graph.tasks, 'impl:01_setup');
      expect(implTask).toBeDefined();
      expect(implTask!.objective).toContain(content);
    });

    it('sets harden task objective from chunk file content', async () => {
      const content = '# Chunk 01\n\nHarden the feature.';
      writeMdFile('01_setup.md', content);

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const hardenTask = taskById(graph.tasks, 'harden:01_setup');
      expect(hardenTask).toBeDefined();
      expect(hardenTask!.objective).toContain(content);
    });

    it('sets requiredSkills with cli:<chunkId> for impl tasks', async () => {
      writeMdFile('01_setup.md', 'Setup');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const implTask = taskById(graph.tasks, 'impl:01_setup');
      expect(implTask!.requiredSkills).toContain('cli:01_setup');
    });

    it('sets requiredSkills with cli:<chunkId> for harden tasks', async () => {
      writeMdFile('01_setup.md', 'Setup');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const hardenTask = taskById(graph.tasks, 'harden:01_setup');
      expect(hardenTask!.requiredSkills).toContain('cli:01_setup');
    });
  });

  describe('dependency wiring', () => {
    it('first impl task depends on nothing', async () => {
      writeMdFile('01_setup.md', 'Setup');
      writeMdFile('02_build.md', 'Build');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const impl01 = taskById(graph.tasks, 'impl:01_setup');
      expect(impl01!.dependsOn).toEqual([]);
    });

    it('harden:N depends on impl:N', async () => {
      writeMdFile('01_setup.md', 'Setup');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const harden01 = taskById(graph.tasks, 'harden:01_setup');
      expect(harden01!.dependsOn).toEqual(['impl:01_setup']);
    });

    it('impl:N+1 depends on harden:N', async () => {
      writeMdFile('01_setup.md', 'Setup');
      writeMdFile('02_build.md', 'Build');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const impl02 = taskById(graph.tasks, 'impl:02_build');
      expect(impl02!.dependsOn).toEqual(['harden:01_setup']);
    });

    it('wires full chain across three chunks', async () => {
      writeMdFile('01_a.md', 'A');
      writeMdFile('02_b.md', 'B');
      writeMdFile('03_c.md', 'C');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(6);

      // impl:01_a → no deps
      expect(taskById(graph.tasks, 'impl:01_a')!.dependsOn).toEqual([]);
      // harden:01_a → depends on impl:01_a
      expect(taskById(graph.tasks, 'harden:01_a')!.dependsOn).toEqual(['impl:01_a']);
      // impl:02_b → depends on harden:01_a
      expect(taskById(graph.tasks, 'impl:02_b')!.dependsOn).toEqual(['harden:01_a']);
      // harden:02_b → depends on impl:02_b
      expect(taskById(graph.tasks, 'harden:02_b')!.dependsOn).toEqual(['impl:02_b']);
      // impl:03_c → depends on harden:02_b
      expect(taskById(graph.tasks, 'impl:03_c')!.dependsOn).toEqual(['harden:02_b']);
      // harden:03_c → depends on impl:03_c
      expect(taskById(graph.tasks, 'harden:03_c')!.dependsOn).toEqual(['impl:03_c']);
    });
  });

  describe('edge cases', () => {
    it('empty directory produces empty PlanGraph', async () => {
      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toEqual([]);
    });

    it('directory with only non-matching files produces empty PlanGraph', async () => {
      writeMdFile('README.md', 'Readme');
      writeMdFile('00_overview.md', 'Overview');
      writeFileSync(join(tmpDir, 'notes.txt'), 'Notes');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toEqual([]);
    });

    it('throws descriptive error for non-existent directory', async () => {
      const badDir = join(tmpDir, 'does-not-exist');
      const builder = new ChunkFileGraphBuilder(badDir);

      await expect(builder.build(intent)).rejects.toThrow(/does-not-exist/);
    });

    it('single chunk produces exactly two tasks', async () => {
      writeMdFile('01_only.md', 'Only chunk');

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      expect(graph.tasks).toHaveLength(2);
      expect(graph.tasks[0]!.id).toBe('impl:01_only');
      expect(graph.tasks[1]!.id).toBe('harden:01_only');
    });
  });

  describe('prompt templates', () => {
    it('impl task objective matches build-runner impl prompt pattern', async () => {
      const chunkContent = '# Chunk 05\n\nDo the thing.';
      writeMdFile('05_thing.md', chunkContent);

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const implTask = taskById(graph.tasks, 'impl:05_thing');
      // Impl prompt should reference reading the chunk and TDD
      expect(implTask!.objective).toContain('Implement ALL features described');
      expect(implTask!.objective).toContain('TDD');
      expect(implTask!.objective).toContain('IMPL_05_thing_DONE');
    });

    it('harden task objective matches build-runner harden prompt pattern', async () => {
      const chunkContent = '# Chunk 05\n\nDo the thing.';
      writeMdFile('05_thing.md', chunkContent);

      const builder = new ChunkFileGraphBuilder(tmpDir);
      const graph = await builder.build(intent);

      const hardenTask = taskById(graph.tasks, 'harden:05_thing');
      // Harden prompt should reference hardening and success criteria
      expect(hardenTask!.objective).toContain('hardening');
      expect(hardenTask!.objective).toContain('success criteria');
      expect(hardenTask!.objective).toContain('HARDEN_05_thing_DONE');
    });
  });
});
