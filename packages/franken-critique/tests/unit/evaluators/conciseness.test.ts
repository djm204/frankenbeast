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

  it('handles edge cases from current Codex scanner findings', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = [
      `const open = "<p>"; /* ${pendingMarker}: real block marker */ const close = "</p>";`,
      `/**** ${trackedMarker}: banner block marker ****/`,
      `<p>/* ${pendingMarker}: shown to users */<span /></p>`,
      `const chars = [.../[/* ${pendingMarker}: regex data */]/.source];`,
      `const compact = value</[/* ${pendingMarker}: regex data */]/.source;`,
      `const ratio = /* // docs */ a / total; // ${hackMarker}: real line marker`,
      `/* ${xxxMarker}: final real block marker */`,
    ].join('\n');
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

  it('handles follow-up Codex scanner edge cases', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = [
      `<p><span />/* ${pendingMarker}: shown to users */</p>`,
      `<Tooltip label="a > b">/* ${pendingMarker}: shown to users */</Tooltip>`,
      `<div><span />/* ${pendingMarker}: shown sibling text */<strong /></div>`,
      `<p>a=b; c /* ${pendingMarker}: shown punctuation */</p>`,
      `const md = \`\`\`ts\n/* ${pendingMarker}: fenced template text */\n\`\`\`;`,
      `const widget = <Widget value={/* ${trackedMarker}: prop expression */ value} />;`,
      `const generic = make<Item>(); /* ${trackedMarker}: real block marker */ return <div />;`,
      `const cls = /[//]/; const ratio = a / b; // ${hackMarker}: normalize`,
      `const x = <div>text</div>; // ${hackMarker}: real jsx-adjacent line marker`,
      `const ratio = {} / total; // ${trackedMarker}: real brace division marker`,
      `if (ok) {}`,
      `/[/* ${pendingMarker}: regex data */]/.test(value);`,
      `const compact = value</a[/* ${pendingMarker}: regex data */]/.source;`,
      `const first = <div />`,
      `/* ${pendingMarker}: ASI-separated real block marker */`,
      `const second = <span />;`,
      `/** @${pendingMarker.toLowerCase()} remove workaround */`,
      `/* ${xxxMarker}: final real block marker */`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('8 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker) &&
          f.message.includes(xxxMarker),
      ),
    ).toBe(true);
  });

  it('handles JSX and TypeScript angle edge cases from Codex follow-up findings', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const content = [
      `const widget = <Widget value={a > b ? /* ${pendingMarker}: compare */ value : fallback} />;`,
      `const generic = make<Foo /* ${trackedMarker}: type */>();`,
      `const arrow = <T /* ${hackMarker}: generic */>() => value;`,
      `const first = <p></p>; /* ${xxxMarker}: statement-level */ const second = <div />;`,
      `const comparison = a < b /* ${pendingMarker}: compare operands */ > c;`,
      `const quoted = <Widget text={"} >"} value={/* ${trackedMarker}: later prop */ x} />;`,
      `return /[//]/.source / total; // ${hackMarker}: real line marker`,
      `const constrained = <T extends Foo /* ${trackedMarker}: constrained generic */>() => value;`,
      `const attrComment = <Widget /* ${hackMarker}: tag trivia */ value={1} />;`,
      `<_Foo>/* ${pendingMarker}: shown to users */</_Foo>`,
      `const ratio = of / total; // ${xxxMarker}: contextual identifier division`,
      `class C { m(total) { return this.#default / total; // ${pendingMarker}: private field division } }`,
      `const expr = <>{items.map((item) => <span /> /* ${trackedMarker}: jsx expression comment */)}</>;`,
      `${Array.from({ length: 24 }, (_, index) => `<p>text ${index}</p>`).join('')}`,
      `<p>/* ${pendingMarker}: shown to users */</p>`,
    ].join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(
      result.findings.some(
        (f) =>
          f.message.includes('12 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          f.message.includes(hackMarker) &&
          f.message.includes(xxxMarker),
      ),
    ).toBe(true);
  });

  it('handles recursive JSX, private fields, and JSX expression comments from Codex follow-up findings', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const xxxMarker = ['X', 'XX'].join('');
    const repeatedJsx = `<>{${Array.from({ length: 25 }, (_, index) => `<p>text ${index}</p>`).join('')}}</>`;
    const content = [
      repeatedJsx,
      `class Example { #default = 1; value(total: number) { return this.#default / total; // ${pendingMarker}: private field division } }`,
      `const fragment = <>{items.map((item) => <span key={item.id} /> /* ${trackedMarker}: expression comment */)}</>;`,
      `<p><span />/* ${hackMarker}: shown sibling text */</p>`,
      `/* ${xxxMarker}: final real block marker */`,
    ].join('\n');
    const start = Date.now();
    const result = await evaluator.evaluate(createInput(content));

    expect(Date.now() - start).toBeLessThan(1000);
    expect(
      result.findings.some(
        (f) =>
          f.message.includes('3 unresolved marker comment(s)') &&
          f.message.includes(pendingMarker) &&
          f.message.includes(trackedMarker) &&
          !f.message.includes(hackMarker) &&
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
