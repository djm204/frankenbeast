import { describe, it, expect } from 'vitest';
import { ConcisenessEvaluator } from '../../../src/evaluators/conciseness.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ConcisenessEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new ConcisenessEvaluator();
    expect(evaluator.name).toBe('conciseness');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes concise code', async () => {
    const evaluator = new ConcisenessEvaluator();
    const content = `export function greet(name: string): string {\n  return \`Hello, \${name}\`;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('flags excessive comments relative to code', async () => {
    const evaluator = new ConcisenessEvaluator();
    const lines = [
      '// This function adds two numbers together',
      '// It takes two parameters a and b',
      '// It returns the sum of a and b',
      '// This is a very important function',
      '// Do not remove this function',
      '// It is used in many places',
      '// The function is pure',
      '// The function has no side effects',
      'function add(a, b) { return a + b; }',
    ];
    const result = await evaluator.evaluate(createInput(lines.join('\n')));

    expect(result.findings.some((f) => f.message.includes('comment'))).toBe(
      true,
    );
  });

  it('counts inline unresolved comments toward the comment ratio', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const lines = [
      `const first = 1; // ${pendingMarker}: replace placeholder`,
      `const second = 2; // ${trackedMarker}: remove duplication`,
      `const third = 3; // ${hackMarker}: temporary fallback`,
      'const fourth = 4;',
    ];
    const result = await evaluator.evaluate(createInput(lines.join('\n')));

    expect(
      result.findings.some((f) =>
        f.message.startsWith('Excessive comment ratio:'),
      ),
    ).toBe(true);
  });

  it('flags unresolved marker comments', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = `// ${pendingMarker}: fix this later\n// ${trackedMarker}: tracked follow-up\n// ${hackMarker}: temporary workaround\nconst x = 1;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker),
      ),
    ).toBe(true);
  });

  it('flags unresolved markers in block comments without matching strings', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = `
const literal = "${pendingMarker}: visible to users";
/* ${pendingMarker}: remove workaround */
/** ${trackedMarker}: tracked follow-up */
/*
 * ${hackMarker}: temporary behavior
 * ${xxxMarker}: remove temporary behavior
 */
const x = 1;
`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('4 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker) &&
          f.message.includes(xxxMarker),
      ),
    ).toBe(true);
  });

  it('does not count comment-shaped markers inside strings or twice inside block comments', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const content = `
const text = "/* ${pendingMarker}: visible to users */";
const template = \`// ${trackedMarker}: example only\`;
/* // ${pendingMarker}: real block marker */
const x = 1;
`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          !f.message.includes(trackedMarker),
      ),
    ).toBe(true);
  });

  it('handles regex literals, template interpolation comments, and markdown fences', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = [
      `const pattern = /[/* ${pendingMarker}: regex data */]/;`,
      `const value = \`${'${'}answer /* ${trackedMarker}: real interpolation comment */}\`;`,
      '```ts',
      `// ${hackMarker}: fenced code comment`,
      '```',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('2 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker),
      ),
    ).toBe(true);
  });

  it('handles return regexes, nested template braces, and JSX-adjacent comments', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = [
      `function pattern() { return /[/* ${pendingMarker}: regex data */]/; }`,
      `const value = \`${'${'}condition ? { nested: true } : /* ${trackedMarker}: real nested expression comment */ fallback}\`;`,
      '<div />',
      `// ${hackMarker}: adjacent jsx line comment`,
      '</div>',
      `/* ${xxxMarker}: adjacent jsx block comment */`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('3 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker) &&
          f.message.includes(xxxMarker),
      ),
    ).toBe(true);
  });

  it('passes empty content', async () => {
    const evaluator = new ConcisenessEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
