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

  it('recovers from prose apostrophes and comment trivia before regex literals', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = [
      `Don't leave // ${pendingMarker}: same-line prose marker`,
      '````ts',
      `/* ${trackedMarker}(owner): block marker without colon */`,
      `/* ${pendingMarker.toLowerCase()}: lowercase block marker */`,
      '````',
      '/** Render the TODO column in this view. */',
      'const ratio = (a + b) / c;',
      `// ${trackedMarker}: division comment remains visible`,
      'const re = // docs before regex',
      `  /[/* ${hackMarker}: regex data */]/;`,
      `if (ok) foo(); else /[/* ${xxxMarker}: regex data */]/.test(value);`,
      `for (const m of /[/* ${xxxMarker}: regex data */]/g.exec(s) ?? []) {}`,
      `export default /[/* ${hackMarker}: regex data */]/;`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('4 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          !f.message.includes(hackMarker) &&
          !f.message.includes(xxxMarker),
      ),
    ).toBe(true);
  });


  it('keeps scanning array literals after division expressions', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const content = `const ratio = total() / [/* ${pendingMarker}: remove divisor */ divisor][0];`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker),
      ),
    ).toBe(true);
  });

  it('does not treat string slashes as line-comment trivia before regexes', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const content = `const s = "abc // def"; const re = /[/* ${pendingMarker}: regex data */]/;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some((f) => f.message.includes('unresolved marker comment')),
    ).toBe(false);
  });

  it('detects line-comment markers after plural possessive prose apostrophes', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const content = `Users' // ${pendingMarker}: migrate groups`;
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker),
      ),
    ).toBe(true);
  });

  it('keeps scanning comments after postfix non-null and increment divisions', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = [
      `const ratio = value! / denominator; // ${pendingMarker}: normalize`,
      `const incremented = i++ / denominator; // ${trackedMarker}: normalize`,
      `const decremented = i-- / denominator; // ${hackMarker}: normalize`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('3 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker),
      ),
    ).toBe(true);
  });

  it('skips regex literals used as statement bodies after control conditions', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const content = [
      `if (ok) /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `while (ok) /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `for (const value of values) /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `const ratio = total() / divisor; /* ${trackedMarker}: real block marker */`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker),
      ),
    ).toBe(true);
  });

  it('ignores block-comment-shaped markers in JSX text but not JSX comments', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = [
      `<p>/* ${pendingMarker}: shown to users */</p>`,
      `<p>prefix /* ${pendingMarker}: also shown */ suffix</p>`,
      `<p>{/* ${trackedMarker}: real JSX comment */}</p>`,
      `/* ${hackMarker}: real block marker */`,
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

  it('ignores multiline JSX text that contains block-comment-shaped markers', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const content = [
      '<section>',
      '  <p>',
      `    /* ${pendingMarker}: shown to users */`,
      '  </p>',
      `  <p>{/* ${trackedMarker}: real JSX comment */}</p>`,
      '</section>',
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker),
      ),
    ).toBe(true);
  });

  it('skips regex statement bodies after control conditions with string parens', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const content = [
      `if (label === ")") /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `while (label !== "(") /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `/* ${trackedMarker}: real block marker */`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker),
      ),
    ).toBe(true);
  });

  it('skips regex literals after comparison and division operators', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const content = [
      `const isPattern = value < /[/* ${pendingMarker}: regex data */]/.source;`,
      `const ratio = total / /[/* ${pendingMarker}: regex data */]/.source.length;`,
      `/* ${trackedMarker}: real block marker */`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('1 unresolved marker comment(s)') &&
          !f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker),
      ),
    ).toBe(true);
  });

  it('continues scanning markers after keyword property divisions and JSX closing tags', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = [
      `const ratio = config.default / total; // ${pendingMarker}: normalize`,
      `const grouped = source.in / total; /* ${trackedMarker}: normalize */`,
      `const node = <div></div>; // ${hackMarker}: remove`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('3 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker),
      ),
    ).toBe(true);
  });

  it('ignores fragment text and regex bodies after do/control conditions', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = [
      `const fragment = <>/* ${pendingMarker}: shown to users */</>;`,
      `if (/[)]/.test(value)) /[/* ${pendingMarker}: regex data */]/.test(value);`,
      `do /[/* ${pendingMarker}: regex data */]/.test(value); while (ok);`,
      `/* ${trackedMarker}: real block marker */`,
      `// ${hackMarker}: real line marker`,
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

  it('passes empty content', async () => {
    const evaluator = new ConcisenessEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
