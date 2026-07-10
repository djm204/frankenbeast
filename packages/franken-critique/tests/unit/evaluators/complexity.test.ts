import { describe, it, expect } from 'vitest';
import { ComplexityEvaluator } from '../../../src/evaluators/complexity.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ComplexityEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new ComplexityEvaluator();
    expect(evaluator.name).toBe('complexity');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes simple code', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function add(a: number, b: number): number {\n  return a + b;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('ignores braces and nested patterns inside comments', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function sample(value: boolean) {\n  // if (value) {\n  //   doThing();\n  // }\n  return value ? 'ok' : 'skip';\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores braces in string literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function sample(value: boolean) {\n  const marker = '{ { { { {';\n  const other = "{ }";\n  return value ? marker : other;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('ignores dense braces inside strings and comments for nesting depth', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'function sample(value: boolean) {',
      '  const objectLike = "{{{{{{";',
      '  const templateText = `{{{{{{`;',
      '  // }}}}}}',
      '  /* {{{{{{ */',
      '  return value ? objectLike : templateText;',
      '}',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('preserves active code inside template literal interpolations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'function sample() {\n  return `${(() => { if (a) { if (b) { if (c) { if (d) { work(); } } } } })()}`;\n}';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not let regex literals hide later active code', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const pattern = /[/*]/;\nif (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('recognizes regex literals after keywords', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function check(source) { return /[/*]/.test(source); }\nif (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('recognizes awaited regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `async function check(source) { await /[//]/.test(source); if (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not treat division after postfix operators as regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const ratio = count++ / total;\nif (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not treat JSX closing tags as regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const el = <div></div>; if (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps template interpolation code after regex braces', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'function sample() {\n  return `${/}/.test(source) && (() => { if (a) { if (b) { if (c) { if (d) { work(); } } } } })()}`;\n}';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('ignores nested TypeScript commas inside function parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'function configure(options: {',
      '  alpha: string,',
      '  beta: [string, number],',
      '  gamma: Map<string, { id: string, label: string }>,',
      '  delta: { enabled: boolean, retries: number },',
      "} = { alpha: 'a', beta: ['b', 1], gamma: undefined, delta: { enabled: true, retries: 3 } }) {",
      '  return options.alpha;',
      '}',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('does not let default comparison expressions hide top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(limit = n < max, a, b, c, d, e) { return limit; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('does not count parenthesized variable expressions as arrow parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const value = (a, b, c, d, e, f);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('ignores TypeScript declarations without implementation bodies', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `declare function external(a, b, c, d, e, f): void;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('keeps generic argument commas nested while counting parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function usesMap(a: Map<string, number>, b, c, d, e) { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('counts parameters for wrapped arrow functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const fn = ((a, b, c, d, e, f) => { return a; });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('does not let comparisons before later generic parameters hide top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(limit = n < max, map: Map<string, number>, a, b, c, d) { return map; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('ignores declared functions returning object literal types', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `declare function external(a, b, c, d, e, f): { ok: boolean };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('counts parameters for wrapped async arrow functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const fn = (async (a, b, c, d, e, f) => { return a; });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('does not let paired default comparisons hide top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(limit = n < max, threshold = x > y, a, b, c, d) { return limit; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('ignores non-declare overload signatures returning object literal types', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function parse(a, b, c, d, e, f): { ok: boolean };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('ignores semicolonless overload signatures before implementations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'function parse(a, b, c, d, e, f): void',
      'function parse(a, b) { return a; }',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('does not let nested default comparisons hide top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex({ x = a < b }, c = d > e, p1, p2, p3, p4) { return x; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('keeps generic call commas nested inside default values', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function ok(value = make<string, number>(), a, b, c, d): void { return value; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      false,
    );
  });

  it('counts parameters for wrapped generic arrow functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const fn = (<T,>(a, b, c, d, e, f) => { return a; });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('counts parameters for whitespace-wrapped arrow functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const fn = (\n  (a, b, c, d, e, f) => { return a; }\n);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('flags functions with too many top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f, g) { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('flags typed function declarations with too many parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a: string, b: number, c: boolean, d: Date, e: RegExp, f: URL): Promise<void> { return Promise.resolve(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('flags typed arrow functions with generic return annotations and too many parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a: string, b: number, c: boolean, d: Date, e: RegExp, f: URL): Promise<void> => { return Promise.resolve(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
  });

  it('does not split nested generic parameter annotations as top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function ok(value: Record<string, number>, next: Map<string, number>, result: Result<string, number>) { return value; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('flags very long typed function declarations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function longFn(): Result<string | number> {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('long'))).toBe(true);
  });

  it('flags very long function declarations with object-shaped return types', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function longFn(): { ok: boolean } {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('long'))).toBe(true);
  });

  it('flags functions with too many parameters after less-than defaults', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function compare(a = x < y, b, c, d, e, f) { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('does not treat later callback arrows as initializer arrows', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const result = (a, b, c, d, e, f).map(x => { return x; });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('flags typed arrows with object-union return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a: string, b: number, c: boolean, d: Date, e: RegExp, f: URL): { ok: boolean } | null => { return { ok: true }; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('does not collect expression-bodied arrows as block functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const value = () => ({ ok: true });\nif (a) { doThing(); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('counts typed callback parameters with generic return commas', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(cb: () => Result<string, number>, b: number, c: boolean, d: Date, e: RegExp, f: URL) { return cb; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags long functions with function-type object return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function make(): () => { ok: boolean } {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags declarations with nested generic return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f): Promise<Map<string, number>> { return Promise.resolve(new Map()); }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags arrows with parenthesized return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f): (string | number) => { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags grouped arrow initializers', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = ((a, b, c, d, e, f) => { return a; });`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('keeps ternary defaults with comparisons out of type parsing', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a = cond ? foo : x < y, b, c, d, e, f) { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags long functions with keyof object return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function longFn(): keyof { a: string } {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags generic function declarations with too many parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex<T>(a, b, c, d, e, f) { return a as T; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags generic arrow initializers with too many parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = <T>(a, b, c, d, e, f) => { return a as T; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags long functions with conditional object return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function longFn<T>(): T extends { a: string } ? A : B {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags arrows with function-type object return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f): (x: string) => { ok: boolean } | null => { return null; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('ignores semicolonless ambient declarations before other declarations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'declare function external(a, b, c, d, e, f): { ok: boolean }',
      'interface Shape { ok: boolean }',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('ignores semicolonless overloads without return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'function parse(a, b, c, d, e, f)',
      'function parse(a, b) { return a; }',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('ignores exported signatures before later declarations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'export function external(a, b, c, d, e, f): { ok: boolean }',
      'export interface Shape { ok: boolean }',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('flags expression-bodied arrows with parenthesized return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f): (string | number) => a;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags declarations with function-type return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f): () => void { return () => {}; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags block arrows with function-type return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f): () => void => { return () => {}; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('ignores semicolonless signatures before imports', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'export function external(a, b, c, d, e, f): void',
      "import { Shape } from './shape'",
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('keeps named imports from becoming semicolonless signature bodies', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = [
      'export function external(a, b, c, d, e, f): void',
      "import { Shape } from './shape'",
      'function ok(a, b) { return a ?? b; }',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('flags long declarations with non-object function return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function makeCallback(): () => void {\n${lines.join('\n')}\n  return () => undefined;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('keeps declaration keywords inside multiline return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = [
      'function makeResult(): Promise<{',
      '  type: string;',
      '}> {',
      ...lines,
      "  return Promise.resolve({ type: 'ok' });",
      '}',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags long block arrows with non-object function return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `const makeCallback = (): () => void => {\n${lines.join('\n')}\n  return () => undefined;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags parameters on declarations with non-object function return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f): () => void { return () => undefined; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags parameters on block arrows with non-object function return annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f): () => void => { return () => undefined; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags generic arrow functions with function type constraints', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = <T extends () => void>(a, b, c, d, e, f) => { return a as T; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags long functions with nested arrow return types inside generic annotations', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = `function longFn(): Box<() => { ok: boolean }> {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags expression-bodied arrows with too many parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (a, b, c, d, e, f) => a;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags deeply grouped arrow initializers', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const complex = (((a, b, c, d, e, f) => { return a; }));`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('keeps keyword suffixes in multiline return annotations from hiding implementation bodies', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i}: number = ${i};`);
    const content = [
      'function longFn():',
      '  Myinterface {',
      ...lines,
      '  return undefined;',
      '}',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('long'))).toBe(true);
  });

  it('flags parameter count even when a parsed function body is unclosed', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f) { if (a) { return b; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('flags typed parameter count even when a parsed function body is unclosed', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f): void { if (a) { return b; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(true);
  });

  it('keeps unclosed conditional return types from becoming function bodies', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function external(a, b, c, d, e, f): T extends { id: string`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((finding) => finding.message.includes('parameter'))).toBe(false);
  });

  it('flags deeply nested code', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('flags very long functions', async () => {
    const evaluator = new ComplexityEvaluator();
    const lines = Array.from({ length: 60 }, (_, i) => `  const x${i} = ${i};`);
    const content = `function longFn() {\n${lines.join('\n')}\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('long'))).toBe(true);
  });

  it('passes empty content', async () => {
    const evaluator = new ComplexityEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
