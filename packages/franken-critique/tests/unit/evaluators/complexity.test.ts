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

  it('flags functions with too many parameters', async () => {
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

  it('ignores braces inside strings, regex literals, and comments when checking nesting', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      `
function bracesInText() {
  const json = "{{{{{{";
  const template = ` +
      '`render ${"{"} and ${/}/.test(input)}`' +
      `;
  const pattern = /[{][}]{4,}/;
  // }}}}}}
  /* {{{{{{ */
  return json + template + pattern.source;
}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('flags actual nested blocks even when strings and comments contain braces', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `
function stillNested() {
  const ignored = "{{{{{{"; // }}}}}}
  if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }
}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('flags executable blocks inside template interpolations', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'const output = `' +
      '${(() => { if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } } })()}' +
      '`;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after indexed access for a regex literal', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `
const ratio = values[i] / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('ignores braces inside regex literals after await', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `async function matches(input) {
  return await /{{{{{{/.test(input);
}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals at array starts', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const rules = [/[{][{][{][{][{]/];`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
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
