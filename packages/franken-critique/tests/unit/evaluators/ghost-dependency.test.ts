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
      const importMap = await import('#internal/tool');
      const fs = await import('node:fs/promises');
      const fsWithQuery = await import('node:fs/promises?raw');
      const pathWithFragment = require('path/posix#worker');
      const escapedKnown = await import('z\\u006fd');
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

  it('balances TypeScript assertions inside dynamic import arguments', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      const plugin = await import(('ghost-package' as Record<string, unknown>));
      const other = await import(('another-ghost' satisfies Record<string, unknown>));
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ghost-package'),
        expect.stringContaining('another-ghost'),
      ]),
    );
  });

  it('checks external package URL specifiers', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const known = await evaluator.evaluate(
      createInput(`await import('npm:zod@3.24.0'); import path from 'jsr:@franken/brain@1'; await import('zod?raw'); await import('@franken/brain#worker');`),
    );
    const unknown = await evaluator.evaluate(
      createInput(`import helper from 'npm:ghost-package/subpath';`),
    );
    const nonPackageUrl = await evaluator.evaluate(
      createInput(`await import('zod@999'); import brain from '@franken/brain@1';`),
    );

    expect(known.verdict).toBe('pass');
    expect(known.findings).toHaveLength(0);
    expect(unknown.verdict).toBe('fail');
    expect(unknown.findings).toHaveLength(1);
    expect(unknown.findings[0]!.message).toContain('ghost-package');
    expect(nonPackageUrl.verdict).toBe('fail');
    expect(nonPackageUrl.findings).toHaveLength(2);
    expect(nonPackageUrl.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('zod@999'),
        expect.stringContaining('@franken/brain@1'),
      ]),
    );
  });

  it('detects no-substitution template literal dynamic imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = 'const plugin = await import(`ghost-package`);';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain('ghost-package');
  });

  it('decodes escaped no-substitution template import specifiers', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const known = await evaluator.evaluate(
      createInput(
        "const templateKnown = await import(`z\\u006fd`);\n" +
          "const escapedLocal = await import(`\\u002e/local-plugin.js`);",
      ),
    );
    const unknown = await evaluator.evaluate(
      createInput("const templateUnknown = await import(`gh\\u006fst-package`);"),
    );

    expect(known.verdict).toBe('pass');
    expect(known.findings).toHaveLength(0);
    expect(unknown.verdict).toBe('fail');
    expect(unknown.findings).toHaveLength(1);
    expect(unknown.findings[0]!.message).toContain('ghost-package');
  });

  it('handles Codex scanner regression cases without hiding runtime imports', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content =
      "foo('x<y', import('string-angle-ghost'));\n" +
      "const deps = [a<b, import('array-comparison-ghost')];\n" +
      "return a<b, import('return-comparison-ghost');\n" +
      "load('https://example.invalid', import('colon-string-ghost'));\n" +
      "const el = <div>import('jsx-text-ghost'){(foo({}), import('jsx-expression-ghost'))}</div>;\n" +
      "const taggy = '<B>'; import('tag-string-ghost'); const close = '</B>';\n" +
      "await import('z\\\n" +
      "od');";
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(6);
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('string-angle-ghost'),
        expect.stringContaining('array-comparison-ghost'),
        expect.stringContaining('return-comparison-ghost'),
        expect.stringContaining('colon-string-ghost'),
        expect.stringContaining('jsx-expression-ghost'),
        expect.stringContaining('tag-string-ghost'),
      ]),
    );
    expect(result.findings.map((finding) => finding.message)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('jsx-text-ghost')]),
    );
  });

  it('handles template type and malformed escape Codex regressions', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const typeOnly = await evaluator.evaluate(
      createInput(
        "type Mapped<T> = { [K in `${import('mapped-key-ghost').Name}`]: T };\n" +
          "type Conditional<T> = T extends `${import('conditional-template-ghost').Name}` ? true : false;",
      ),
    );
    const malformedEscape = await evaluator.evaluate(
      createInput("const plugin = await import('\\u{FFFFFF}');"),
    );

    expect(typeOnly.verdict).toBe('pass');
    expect(typeOnly.findings).toHaveLength(0);
    expect(malformedEscape.verdict).toBe('fail');
    expect(malformedEscape.findings).toHaveLength(1);
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
      const unionType: Promise<string | import('ghost-package').Ghost> = Promise.resolve({} as never);
      const commaType = value as Foo<Bar, import('ghost-package').Ghost>;
      const multiField: { name: string, plugin: import('ghost-package').Plugin } = { name: 'x' };
      const conditional: T extends true ? import('ghost-package').Ghost : string = fallback;
      function generic<T extends import('ghost-package').Ghost>() {}
      class Box<T = import('ghost-package').Ghost> {}
      const cast = value as import('ghost-package').Ghost;
      function typedParam(dep?: import('ghost-package').Ghost) {}
      class TypedField { dep?: import('ghost-package').Ghost }
      class RequiredTypedField { dep: import('ghost-package').Ghost }
      const typeofCast = value as typeof import('ghost-package');
      const typeofSatisfies = value satisfies typeof import('ghost-package');
      const keyofCast = value as keyof import('ghost-package').Shape;
      function keyed<T extends keyof typeof import('ghost-package')>() {}
      class Plugin implements import('ghost-package').Plugin {}
      class MultiPlugin implements KnownPlugin, import('ghost-package').Plugin {}
      const commentedCast = value as /* generated */ import('ghost-package').Shape;
      const angleImportAssertion = <import('ghost-package').Shape>value;
      class CommentedPlugin implements /* generated */ import('ghost-package').Plugin {}
      const parenthesizedCast = value as (import('ghost-package').Plugin);
      const parenthesizedSatisfies = value satisfies (import('ghost-package').Plugin);
      const objectTypeAssertion = value as { loader: import('ghost-package').Loader };
      const templateTypeAssertion = value as \`\${import('template-assertion-ghost').Name}\`;
      const commentedTemplateTypeAssertion = value as /* generated */ \`\${import('template-assertion-ghost').Name}\`;
      const tupleAssertion = value as [import('ghost-package').Tuple];
      const tupleAssertionWithComma = value as [string, import('ghost-package').Tuple];
      const tupleSatisfiesWithComma = value satisfies [string, import('ghost-package').Tuple];
      const readonlyAssertion = value as readonly import('ghost-package').Readonly[];
      const genericCall = createPlugin<import('ghost-package').Options>();
      const indexedGenericCall = createPlugin<import('ghost-package')['Options']>();
      const nonFinalGenericCall = createPlugin<import('ghost-package').Options, Other>();
      const unionGenericCall = createPlugin<import('ghost-package').Options | Other>();
      const nestedGenericCall = createPlugin<Readonly<import('ghost-package').Options>, Other>();
      const nestedTypeArgument = createPlugin<Foo<Bar>, import('ghost-package').Options>();
      const functionTypeArgument = createPlugin<() => void, import('ghost-package').Options>();
      const genericArrow = <T extends import('ghost-package').Options>() => undefined;
      function f<T extends import('ghost-package').Foo>() {}
      class C { f<T extends import('ghost-package').Foo>() {} }
      type SemicolonLiteral = ";" | import('ghost-package').T;
      function typeofGeneric<T extends typeof import('ghost-package')>() {}
      const typeofCall = createPlugin<typeof import('ghost-package')>();
      const typeofImportAttributes = createPlugin<typeof import('ghost-package', { with: { 'resolution-mode': 'import' } })>();
      const ambientModule = declare module "ambient" { export type T = import('ghost-package').T };
      declare global { type GlobalGhost = import('ghost-package').T }
      declare module "nested-ambient" {
        export type AmbientGhost =
          typeof import('ghost-package');
      }
      declare global {
        export type NestedGlobalGhost =
          import('ghost-package').T;
      }
      const unionAssertion = value as string | import('ghost-package').Shape;
      const functionType = (() => {}) as () => import('ghost-package').Factory;
      const typedFunctionValue: () => import('ghost-package').Factory = () => ({}) as never;
      const typedParamFunctionValue: (x: string) => import('ghost-package').Factory = () => ({}) as never;
      const typedConstructorValue: new () => import('ghost-package').Factory = Impl;
      const typedGenericFunctionValue: <T>() => import('ghost-package').Factory = impl;
      const typedNestedFunctionValue: (cb: () => void) => import('ghost-package').Factory = impl;
      const typedImportParamFunctionValue: (x: import('ghost-package').Input) => import('ghost-package').Factory = impl;
      interface Cfg { name: string; plugin: import('ghost-package').Plugin }
      type InlineObject = { name: string; plugin: import('ghost-package').Plugin };
      type NestedInlineObject = { nested: { ok: string }; plugin: typeof import('ghost-package') };
      declare namespace N { type T = import('ghost-package').T }
      namespace ExportedTypeNamespace { export type T = import('ghost-package').T }
      type TemplateKey = \`\${import('ghost-package').Name}\`;
      type NestedTemplateKey = \`\${\`\${string}\`} \${import('ghost-package').Name}\`;
      const url = 'http://example.invalid'; loader.import('ghost-package');
      const plugin = loader.import('unknown-lib');
      loader./* generated */import('unknown-lib');
      this.#import('private-loader');
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('detects runtime imports around TypeScript annotation syntax', async () => {
    const evaluator = new GhostDependencyEvaluator(knownPackages);
    const content = `
      const cfg: { plugin: import('object-type-ghost').Plugin } = {};
      async function load(): Promise<unknown> { return import('typed-function-ghost'); }
      async function bare(): Promise<void> { import('bare-function-ghost'); }
      function* yielded(): Generator { yield import('yielded-function-ghost'); }
      const logicalAnd = ready && import('logical-and-ghost');
      const logicalOr = fallback || import('logical-or-ghost');
      type T = {}
      void import('void-after-type-ghost');
      type U = {}
      (async () => import('iife-after-type-ghost'))();
      type V = {}
      else import('else-after-type-ghost');
      type W = {}
      do { import('do-after-type-ghost'); } while (false);
      type X = {}
      catch { import('catch-after-type-ghost'); }
      type Y = {}
      finally { import('finally-after-type-ghost'); }
      export const exported = await import('export-after-type-ghost');
      type BareDynamic = {}
      ready && import('identifier-led-after-type-ghost');
      type SimpleAlias = string
      import('simple-type-after-ghost');
      type VoidAlias = string
      void import('void-simple-type-after-ghost');
      type PunctuationArrayAlias = {}
      [import('punctuation-array-after-type-ghost')].forEach(load);
      type PunctuationBangAlias = {}
      !import('punctuation-bang-after-type-ghost');
      type DecoratorAlias = {}
      @dec(import('decorator-after-type-ghost'))
      class DecoratedAfterType {}
      type UsingAlias = {}
      using dep = import('using-after-type-ghost');
      interface NewAfterType {}
      new Loader(import('new-after-type-ghost'));
      interface SameLine {} import('same-line-interface-ghost');
      interface NamespaceMerge {}
      namespace NamespaceMerge { export const plugin = import('namespace-merge-ghost'); }
      interface AbstractMerge {}
      abstract class AbstractRuntime { static plugin = import('abstract-class-ghost'); }
      async function awaited(): Promise<void> { await import('awaited-function-ghost'); }
      const arrow = (opts: Options) => import('arrow-body-ghost');
      switch (kind) { case 'plugin': return import('switch-case-ghost'); }
      loadPlugin: import('label-ghost');
      const parenthesized = await import(('parenthesized-ghost'));
      const parenthesizedAsserted = await import(('parenthesized-asserted-ghost' as const));
      const nestedParenthesizedNonNull = await import((('nested-parenthesized-non-null-ghost')!));
      const angleAsserted = await import(<const>'angle-asserted-ghost');
      const genericAngleAsserted = await import(<Readonly<string>>'generic-angle-ghost');
      const literalAsserted = await import('literal-asserted-ghost' as const);
      const literalSatisfied = await import('literal-satisfied-ghost' satisfies string);
      const nonNullAsserted = await import('non-null-asserted-ghost'!);
      const runtimeTernary = kind === 'extends' ? fallback : import('ternary-ghost');
      const lessThanRuntime = count < import('less-than-ghost');
      const compactLessThanRuntime = count<import('compact-less-than-ghost');
      const compactLessThan = a<b, y = import('compact-less-than-assignment-ghost');
      const lessThanArgument = load(count < limit, import('less-than-argument-ghost'));
      const compactLessThanArgument = load(a<b, import('compact-comparison-argument-ghost'));
      const compactNamedLessThanArgument = load(count<limit, import('compact-named-comparison-argument-ghost'));
      const compactUpperLessThanArgument = load(Foo<Bar, import('compact-uppercase-comparison-argument-ghost'), baz);
      const comparisonArgument = load(count <= limit, import('comparison-argument-ghost'));
      const bitwiseRuntime = flags | import('bitwise-or-ghost');
      const bitwiseAfterAnnotation: number = flags | import('bitwise-after-annotation-ghost');
      const bitwiseObjectValue = { loader: flags | import('bitwise-object-value-ghost') };
      const commentedBitwiseObjectValue = { loader /* generated */ : flags | import('commented-bitwise-object-value-ghost') };
      const chainedAfterTypeValue = import('chained-type-value-ghost').then(load);
      const typedInitializerChain: Promise<unknown> = import('typed-initializer-chain-ghost').then(load);
      type DoneAlias = string
      load(import('after-type-alias-call-ghost'));
      const typeNamedObject = { type: import('type-named-object-ghost') };
      class TypeNamedField { type = import('type-named-field-ghost') }
      schema.as(import('as-call-ghost'));
      as(import('keyword-helper-ghost'));
      Plugin<import('uppercase-less-than-ghost');
      let dep: SomeType
      load(import('after-typed-var-ghost'));
      async function loadObject(): { plugin: string } { return import('object-shaped-return-ghost'); }
      type Done = string
      sql\`\${require('tagged-template-ghost')}\`;
      let dep2: SomeType
      void import('void-after-typed-decl-ghost');
      let dep3: SomeType
      import('bare-after-typed-decl-ghost');
      const cfg = value as { dep: string }
      void import('after-object-assertion-ghost');
      const cfg2 = value satisfies { dep: string }
      import('bare-after-object-assertion-ghost');
      const cfg3 = value as { dep: string } /* generated */
      import('bare-after-commented-object-assertion-ghost');
      const cfg4 = value as { dep: string }
      [import('punctuation-array-after-assertion-ghost')].forEach(load);
      const cfg5 = value satisfies { dep: string }
      !import('punctuation-bang-after-assertion-ghost');
      (value as { dep: string }).load(import('method-after-object-assertion-ghost'));
      (value as { dep: string }) && import('logical-after-object-assertion-ghost');
      const cfg6 = value as { dep: string }, cfg7 = import('comma-after-object-assertion-ghost');
      const cfg8 = value as { dep: string }
      try { import('try-after-object-assertion-ghost'); } catch {}
      const cfg9 = value satisfies { dep: string }
      do { import('do-after-object-assertion-ghost'); } while (false);
      const cfg10 = value as { dep: string }
      catch { import('catch-after-object-assertion-ghost'); }
      const cfg11 = value satisfies { dep: string }
      finally { import('finally-after-object-assertion-ghost'); }
      const annotatedArrow = (): any => import('annotated-arrow-body-ghost');
      const typedArrowInitializer: (x: string) => Promise<unknown> = (x) => import('typed-arrow-initializer-ghost');
      type TemplateAlias = string
      const templateAfterTypeAlias = \`\${require('template-after-type-alias-ghost')}\`;
      type ClassFieldTemplateAlias = string
      class ClassFieldTemplateAfterType { loader = \`\${import('class-field-template-after-type-ghost')}\` }
      const angleAssertedArrow = import(<string & (() => void)>'angle-assertion-arrow-ghost');
      type DefaultExportAlias = string
      export default async function defaultLoader() { return import('export-default-after-type-ghost'); }
      type DefaultExportExpressionAlias = string
      export default import('export-default-expression-after-type-ghost');
      interface ModuleExportsAfterType {}
      module.exports = { loader: import('module-exports-after-type-ghost') };
      interface CallAfterType {}
      foo(import('call-after-type-ghost'));
      function typedObjectParam(opts: { path: string }) { return import('object-param-body-ghost'); }
      const url = 'http://example.invalid'
      import('chained-after-colon-ghost').then(load);
      type ChainAfterAlias = Foo
      import('chained-after-type-alias-ghost').then(load);
      const runtimeTypeofProperty = typeof import('runtime-typeof-property-ghost').then;
      const objectTypeKey = { type: import('object-type-key-ghost') };
      const typeOptionBeforeLoader = { type: 'json', loader: import('type-option-loader-ghost') };
      const chainedObjectValue = { plugin: import('chained-object-value-ghost').then(load) };
      const chainedTernaryValue = ready ? fallback : import('chained-ternary-value-ghost').then(load);
      const awaitedTypeNamedObject = { type: await import('awaited-type-named-object-ghost') };
      const nestedTypeNamedObject = { type: { loader: import('nested-type-named-object-ghost') } };
      await import('zod', { with: { type: await import('nested-type-attribute-ghost') } });
      type DecoratedAfterType = {}
      @dec(import('decorator-after-type-ghost'))
      class DecoratedAfterTypeClass {}
      type UsingAfterType = {}
      using dep = import('using-after-type-ghost');
      function objectReturn(): { type: string } { return import('object-return-type-key-ghost'); }
      function templateAfterTypedParam(opts: { path: string }) { return \`\${require('template-after-typed-param-ghost')}\`; }
      const assertedPair = value as Foo, chained = import('chained-after-assertion-ghost').then(load);
      const assertedAssignment = value as { dep: string }
      foo = import('assignment-after-object-assertion-ghost');
      const assertedFunction = value satisfies { dep: string }
      function afterAssertion() { return import('function-after-object-assertion-ghost'); }
      const as = String.raw; as\`\${require('as-tagged-template-ghost')}\`;
      const satisfies = String.raw; satisfies\`\${require('satisfies-tagged-template-ghost')}\`;
      const asIdentifier = 1; as; import('as-contextual-identifier-ghost');
      const satisfiesIdentifier = 1; satisfies; import('satisfies-contextual-identifier-ghost');
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(103);
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('typed-function-ghost'),
        expect.stringContaining('bare-function-ghost'),
        expect.stringContaining('yielded-function-ghost'),
        expect.stringContaining('logical-and-ghost'),
        expect.stringContaining('logical-or-ghost'),
        expect.stringContaining('void-after-type-ghost'),
        expect.stringContaining('iife-after-type-ghost'),
        expect.stringContaining('else-after-type-ghost'),
        expect.stringContaining('do-after-type-ghost'),
        expect.stringContaining('catch-after-type-ghost'),
        expect.stringContaining('finally-after-type-ghost'),
        expect.stringContaining('export-after-type-ghost'),
        expect.stringContaining('identifier-led-after-type-ghost'),
        expect.stringContaining('simple-type-after-ghost'),
        expect.stringContaining('void-simple-type-after-ghost'),
        expect.stringContaining('punctuation-array-after-type-ghost'),
        expect.stringContaining('punctuation-bang-after-type-ghost'),
        expect.stringContaining('decorator-after-type-ghost'),
        expect.stringContaining('using-after-type-ghost'),
        expect.stringContaining('new-after-type-ghost'),
        expect.stringContaining('namespace-merge-ghost'),
        expect.stringContaining('abstract-class-ghost'),
        expect.stringContaining('awaited-function-ghost'),
        expect.stringContaining('arrow-body-ghost'),
        expect.stringContaining('switch-case-ghost'),
        expect.stringContaining('label-ghost'),
        expect.stringContaining('parenthesized-ghost'),
        expect.stringContaining('parenthesized-asserted-ghost'),
        expect.stringContaining('nested-parenthesized-non-null-ghost'),
        expect.stringContaining('angle-asserted-ghost'),
        expect.stringContaining('generic-angle-ghost'),
        expect.stringContaining('literal-asserted-ghost'),
        expect.stringContaining('literal-satisfied-ghost'),
        expect.stringContaining('non-null-asserted-ghost'),
        expect.stringContaining('ternary-ghost'),
        expect.stringContaining('less-than-ghost'),
        expect.stringContaining('compact-less-than-ghost'),
        expect.stringContaining('compact-less-than-assignment-ghost'),
        expect.stringContaining('less-than-argument-ghost'),
        expect.stringContaining('compact-comparison-argument-ghost'),
        expect.stringContaining('compact-named-comparison-argument-ghost'),
        expect.stringContaining('compact-uppercase-comparison-argument-ghost'),
        expect.stringContaining('comparison-argument-ghost'),
        expect.stringContaining('bitwise-or-ghost'),
        expect.stringContaining('bitwise-after-annotation-ghost'),
        expect.stringContaining('bitwise-object-value-ghost'),
        expect.stringContaining('commented-bitwise-object-value-ghost'),
        expect.stringContaining('chained-type-value-ghost'),
        expect.stringContaining('typed-initializer-chain-ghost'),
        expect.stringContaining('after-type-alias-call-ghost'),
        expect.stringContaining('type-named-object-ghost'),
        expect.stringContaining('type-named-field-ghost'),
        expect.stringContaining('as-call-ghost'),
        expect.stringContaining('keyword-helper-ghost'),
        expect.stringContaining('uppercase-less-than-ghost'),
        expect.stringContaining('after-typed-var-ghost'),
        expect.stringContaining('object-shaped-return-ghost'),
        expect.stringContaining('tagged-template-ghost'),
        expect.stringContaining('void-after-typed-decl-ghost'),
        expect.stringContaining('bare-after-typed-decl-ghost'),
        expect.stringContaining('after-object-assertion-ghost'),
        expect.stringContaining('bare-after-object-assertion-ghost'),
        expect.stringContaining('bare-after-commented-object-assertion-ghost'),
        expect.stringContaining('punctuation-array-after-assertion-ghost'),
        expect.stringContaining('punctuation-bang-after-assertion-ghost'),
        expect.stringContaining('method-after-object-assertion-ghost'),
        expect.stringContaining('logical-after-object-assertion-ghost'),
        expect.stringContaining('comma-after-object-assertion-ghost'),
        expect.stringContaining('try-after-object-assertion-ghost'),
        expect.stringContaining('do-after-object-assertion-ghost'),
        expect.stringContaining('catch-after-object-assertion-ghost'),
        expect.stringContaining('finally-after-object-assertion-ghost'),
        expect.stringContaining('annotated-arrow-body-ghost'),
        expect.stringContaining('typed-arrow-initializer-ghost'),
        expect.stringContaining('template-after-type-alias-ghost'),
        expect.stringContaining('class-field-template-after-type-ghost'),
        expect.stringContaining('angle-assertion-arrow-ghost'),
        expect.stringContaining('export-default-after-type-ghost'),
        expect.stringContaining('export-default-expression-after-type-ghost'),
        expect.stringContaining('module-exports-after-type-ghost'),
        expect.stringContaining('call-after-type-ghost'),
        expect.stringContaining('object-param-body-ghost'),
        expect.stringContaining('chained-after-colon-ghost'),
        expect.stringContaining('chained-after-type-alias-ghost'),
        expect.stringContaining('runtime-typeof-property-ghost'),
        expect.stringContaining('object-type-key-ghost'),
        expect.stringContaining('type-option-loader-ghost'),
        expect.stringContaining('chained-object-value-ghost'),
        expect.stringContaining('chained-ternary-value-ghost'),
        expect.stringContaining('awaited-type-named-object-ghost'),
        expect.stringContaining('nested-type-named-object-ghost'),
        expect.stringContaining('nested-type-attribute-ghost'),
        expect.stringContaining('decorator-after-type-ghost'),
        expect.stringContaining('using-after-type-ghost'),
        expect.stringContaining('object-return-type-key-ghost'),
        expect.stringContaining('template-after-typed-param-ghost'),
        expect.stringContaining('chained-after-assertion-ghost'),
        expect.stringContaining('assignment-after-object-assertion-ghost'),
        expect.stringContaining('function-after-object-assertion-ghost'),
        expect.stringContaining('as-tagged-template-ghost'),
        expect.stringContaining('satisfies-tagged-template-ghost'),
        expect.stringContaining('as-contextual-identifier-ghost'),
        expect.stringContaining('satisfies-contextual-identifier-ghost'),
      ]),
    );
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
      const commented = { /* generated */ plugin: import('commented-key-ghost') };
      const nestedOption = { with: { loader: import('nested-option-ghost') } };
      await import('zod', { with: { type: await import('nested-import-option-ghost') } });
      const commentedValue = { loader /* generated */: import('commented-value-ghost') };
      const invalidNode = await import('node:not-a-real-builtin');
    `;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(17);
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
        expect.stringContaining('commented-key-ghost'),
        expect.stringContaining('nested-option-ghost'),
        expect.stringContaining('nested-import-option-ghost'),
        expect.stringContaining('commented-value-ghost'),
        expect.stringContaining('node:not-a-real-builtin'),
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
