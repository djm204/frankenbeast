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

  it('flags functions with too many parameters', async () => {
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
