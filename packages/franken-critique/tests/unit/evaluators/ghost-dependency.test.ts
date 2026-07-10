import { describe, it, expect } from 'vitest';
import { GhostDependencyEvaluator } from '../../../src/evaluators/ghost-dependency.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('GhostDependencyEvaluator', () => {
  const knownPackages = ['express', 'zod', 'vitest', '@franken/brain'];

  it('implements Evaluator interface', () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    expect(evaluator.name).toBe('ghost-dependency');
    expect(evaluator.category).toBe('deterministic');
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('passes when all imports are known', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import express from 'express';\nimport { z } from 'zod';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('ignores imports and require calls inside comments', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `// import ghost from 'ghost-package';\n/* const hidden = require('unknown-lib'); */\nimport express from 'express';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores import-like text inside string literals', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const message = "import ghost from 'ghost-package'";\nconst dynamic = 'require(\"unknown-lib\")';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('does not treat import.meta string comparisons as imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `if (import.meta.env.MODE === 'production') {\n  console.log('ready');\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects require calls inside template literal interpolations', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = "const value = `${require('ghost-package')}`;";
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('reads static import specifiers after string-named bindings', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { "foo" as foo } from "ghost-package";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('reads static import specifiers after bindings named from', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { from } from "ghost-package";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('allows comments between from and the module specifier', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { x } from /* generated */ "ghost-package";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('detects ghost dependencies in named re-exports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `export { pluginFactory } from 'ghost-package';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('detects ghost dependencies in namespace re-exports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `export * from 'unknown-lib';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('unknown-lib');
  });

  it('detects ghost dependencies in dynamic import expressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const plugin = await import('ghost-package');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('passes known packages in dynamic import expressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const schema = await import("zod");`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores relative, URL, and node built-in dynamic import expressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      const local = await import('./local-plugin.js');
      const absoluteLocal = await import('/tmp/generated/plugin.mjs');
      const fileUrlLocal = await import('file:///tmp/generated/plugin.mjs');
      const dataUrl = await import('data:text/javascript,export default 1');
      const browserUrl = await import('https://cdn.example.test/plugin.mjs');
      const windowsLocal = await import('C:\\tmp\\generated\\plugin.mjs');
      const fs = await import('node:fs/promises');
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects dynamic import expressions with comments and import attributes', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const plugin = await import /* chunk */ ('ghost-package', { with: { type: 'json' } });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });
  it('detects no-substitution template literal dynamic imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = 'const plugin = await import(`ghost-package`);';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('ignores method calls and TypeScript import types', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      type Ghost = import('ghost-package').Ghost;
      type MultilineGhost =
        import('ghost-package').Ghost;
      type GhostShape = { dep: import('ghost-package').Ghost };
      type ConditionalGhost<T> = T extends true
        ? import('ghost-package').Ghost
        : import('another-ghost').Ghost;
      type GhostModule = typeof import('ghost-package');
      const p: Promise<import('ghost-package').Ghost> = Promise.resolve({} as never);
      const cast = value as import('ghost-package').Ghost;
      function typedParam(dep?: import('ghost-package').Ghost) {}
      class TypedField { dep?: import('ghost-package').Ghost }
      const plugin = loader.import('unknown-lib');
      this.#import('private-loader');
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects dynamic imports used as object values and nested option expressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      const loaders = { plugin: import('ghost-package') };
      const nestedLoaders = { opts: {}, plugin: import('nested-ghost') };
      const spreadLoader = { ...import('spread-ghost') };
      const multilineLoaders = {
        plugin: import('another-ghost')
      };
      const selected = ready ? import('zod') : import('missing-branch');
      type AlreadyDeclared = {}
      const semicolonlessRuntime = await import('semicolonless-ghost');
      interface PreviousDeclaration {}
      load(import('post-interface-ghost'));
      const runtimeTypeof = typeof import('runtime-ghost');
      await import('zod', { with: makeOptions(require('unknown-lib')) });
      const quoted = { 'plugin': import('quoted-key-ghost') };
      const numeric = { 1: import('numeric-key-ghost') };
      const computed = { [pluginName]: import('computed-key-ghost') };
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(12);
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ghost-package'),
        expect.stringContaining('nested-ghost'),
        expect.stringContaining('spread-ghost'),
        expect.stringContaining('another-ghost'),
        expect.stringContaining('missing-branch'),
        expect.stringContaining('semicolonless-ghost'),
        expect.stringContaining('post-interface-ghost'),
        expect.stringContaining('runtime-ghost'),
        expect.stringContaining('unknown-lib'),
        expect.stringContaining('quoted-key-ghost'),
        expect.stringContaining('numeric-key-ghost'),
        expect.stringContaining('computed-key-ghost'),
      ]),
    );
  });

  it('ignores object-literal import keys', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const cfg = { import: { from: 'ghost-package' } };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('does not treat regex literal contents as comments', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const pattern = /[/*]/;\nimport ghost from 'ghost-package';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('recognizes regex literals after keywords', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `function check(source) { return /[/*]/.test(source); }\nrequire('ghost-package');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('recognizes awaited regex literals', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `async function check(source) { await /[//]/.test(source); require('ghost-package'); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('does not treat division after postfix operators as regex literals', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const ratio = count++ / total;\nrequire('ghost-package');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('does not treat JSX closing tags as regex literals', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const el = <div></div>; require('ghost-package');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('keeps scanning template interpolations after regex braces', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content =
      "const value = `${/}/.test(source) && require('ghost-package')}`;";
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('ignores dynamic require expressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const adapter = require('adapter-' + target);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('fails when an unknown package is imported', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import ghost from 'ghost-package';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('ignores relative imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { foo } from './local.js';\nimport bar from '../utils/bar.js';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores node: built-in imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import { readFile } from 'node:fs/promises';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores bare Node built-ins and built-in subpath imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      import fs from 'fs';
      import { join } from 'path';
      import { readFile } from 'fs/promises';
      const platform = require('os').platform();
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('still detects packages with names similar to Node built-ins', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      import fsExtra from 'fs-extra';
      import test from 'test';
      import customFsTool from 'fs/foo';
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(3);
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fs-extra'),
        expect.stringContaining('test'),
        expect.stringContaining('fs'),
      ]),
    );
  });

  it('detects require() calls with unknown packages', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `const x = require('unknown-lib');`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('unknown-lib');
  });

  it('handles scoped packages correctly', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import brain from '@franken/brain';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects multiple ghost dependencies', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `import a from 'ghost-a';\nimport b from 'ghost-b';`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(2);
  });

  it('passes with no imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const result = await evaluator.evaluate(createInput('const x = 1;'));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
