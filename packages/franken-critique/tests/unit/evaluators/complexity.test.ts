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

  it('flags functions with too many top-level parameters', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function complex(a, b, c, d, e, f, g) { return a; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.message.includes('parameter'))).toBe(
      true,
    );
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
