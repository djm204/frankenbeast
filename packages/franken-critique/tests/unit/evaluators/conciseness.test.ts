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

  it('keeps excessive-comment feedback informational and non-blocking', async () => {
    const evaluator = new ConcisenessEvaluator();
    const content = [
      '// Explain the public contract.',
      '// Document the supported edge case.',
      'export const value = 1;',
    ].join('\n');

    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Excessive comment ratio: 67%'),
        severity: 'info',
      }),
    ]);
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

  it('flags unresolved marker comments with tracked source locations', async () => {
    const evaluator = new ConcisenessEvaluator();
    const pendingMarker = ['TO', 'DO'].join('');
    const trackedMarker = ['FIX', 'ME'].join('');
    const hackMarker = ['HA', 'CK'].join('');
    const content = `// ${pendingMarker}: fix this later\nconst x = 1;\n// ${trackedMarker}: tracked follow-up\n// ${hackMarker}: temporary workaround`;
    const result = await evaluator.evaluate(createInput(content));

    const finding = result.findings.find(
      (f) =>
        f.message.includes(pendingMarker) &&
        f.message.includes(trackedMarker) &&
        f.message.includes(hackMarker),
    );

    expect(finding).toBeTruthy();
    expect(finding?.location).toBe('lines 1, 3-4');
    expect(finding?.suggestion).toContain('tracked issues');
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

  it('bounds execution and memory on oversized inputs (>500KB)', async () => {
    const evaluator = new ConcisenessEvaluator();
    // Generate an input larger than 500KB (600,000 chars)
    const largeLine = 'const x = 42; // some code comment\n';
    const oversizedContent = largeLine.repeat(20_000); // ~700KB
    expect(oversizedContent.length).toBeGreaterThan(500_000);

    const start = Date.now();
    const result = await evaluator.evaluate(createInput(oversizedContent));
    const duration = Date.now() - start;

    expect(result.evaluatorName).toBe('conciseness');
    expect(duration).toBeLessThan(1000); // Execution should complete very quickly
  });

  it('bounds execution on oversized all-whitespace inputs (>500KB)', async () => {
    const evaluator = new ConcisenessEvaluator();
    // Regression test: the empty-content short-circuit must run on the
    // truncated content, not the raw input, or an oversized whitespace-only
    // payload would still be scanned in full by `.trim()` before the
    // MAX_INPUT_BYTES cap is ever applied — defeating the resource bound.
    const oversizedWhitespace = ' '.repeat(600_000);
    expect(oversizedWhitespace.length).toBeGreaterThan(500_000);

    const start = Date.now();
    const result = await evaluator.evaluate(createInput(oversizedWhitespace));
    const duration = Date.now() - start;

    expect(result.verdict).toBe('pass');
    expect(duration).toBeLessThan(1000);
  });

  describe('resource-bounding regressions after rebase', () => {
    it('bounds work on inputs with many regex literals after control-condition parens', async () => {
      // Regression test for a quadratic path in collectCodeMarkers():
      // findMatchingOpeningParen() previously rescanned the entire
      // preceding prefix from scratch every time a `/` immediately
      // followed a `)`, so many `if (x) /a/;`-shaped lines degrade to
      // O(n^2). A crafted ~24KB input of this shape was clocked at ~7s
      // pre-fix; a correctly linear scan should stay well under a second
      // even for a substantially larger input.
      const evaluator = new ConcisenessEvaluator();
      const pathologicalLine = 'if (x) /a/;\n';
      const pathologicalContent = pathologicalLine.repeat(5_000); // ~65KB

      const start = Date.now();
      const result = await evaluator.evaluate(createInput(pathologicalContent));
      const duration = Date.now() - start;

      expect(result.evaluatorName).toBe('conciseness');
      expect(duration).toBeLessThan(1000);
    });

    it('scales roughly linearly (not quadratically) as pathological input grows', async () => {
      // Complexity-based check that avoids relying on a single fragile
      // wall-clock threshold: quadratic behavior means an 8x larger input
      // takes ~64x longer, while linear behavior takes ~8x longer. Assert
      // a generous bound that a quadratic regression would blow through
      // but ordinary CI timing jitter should not.
      const evaluator = new ConcisenessEvaluator();
      const pathologicalLine = 'if (x) /a/;\n';
      const small = pathologicalLine.repeat(1_000);
      const large = pathologicalLine.repeat(8_000);

      const smallStart = Date.now();
      await evaluator.evaluate(createInput(small));
      const smallDuration = Math.max(Date.now() - smallStart, 1);

      const largeStart = Date.now();
      await evaluator.evaluate(createInput(large));
      const largeDuration = Date.now() - largeStart;

      expect(largeDuration).toBeLessThan(smallDuration * 20);
    });

    it('preserves an open block comment that spans the truncation boundary', async () => {
      // Regression test: if truncation cuts through a block comment before
      // its closing `*/`, the naive BLOCK_COMMENT_PATTERN regex used for
      // comment-ratio scoring requires a literal closing delimiter and so
      // silently drops the entire (truncated) comment from the ratio,
      // making an almost-all-comment payload score as if it had ~0%
      // comments instead of the ~99%+ it should.
      const evaluator = new ConcisenessEvaluator();
      const commentLine = 'x'.repeat(78);
      const linesNeeded = Math.ceil(600_000 / (commentLine.length + 1));
      const body = `${commentLine}\n`.repeat(linesNeeded);
      // The closing `*/` sits well past the 500,000-byte cutoff, so the
      // truncated content ends mid-comment with no closing delimiter.
      const content = `/*\n${body}*/\n`;
      expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(500_000);

      const result = await evaluator.evaluate(createInput(content));

      const ratioFinding = result.findings.find((f) =>
        f.message.startsWith('Excessive comment ratio:'),
      );
      expect(ratioFinding).toBeTruthy();
      const percentage = Number(
        ratioFinding?.message.match(/Excessive comment ratio: (\d+)%/)?.[1],
      );
      expect(percentage).toBeGreaterThan(90);
    });

    it('truncates at a UTF-8 byte boundary, not a UTF-16 code-unit boundary', async () => {
      // Regression test: MAX_INPUT_BYTES is measured against
      // `String.length`, which counts UTF-16 code units, not bytes. Each
      // '中' character is 1 UTF-16 code unit but 3 UTF-8 bytes, so 170,000
      // of them is only ~170K by `.length` (nowhere near the old
      // character-count cap) yet ~510KB by actual byte size -- past the
      // intended 500,000-byte memory bound.
      const evaluator = new ConcisenessEvaluator();
      const marker = ['TO', 'DO'].join('');
      const filler = '中'.repeat(170_000);
      const content = `${filler}\n// ${marker}: filler marker\n`;
      expect(content.length).toBeLessThan(500_000);
      expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(500_000);

      const result = await evaluator.evaluate(createInput(content));

      // The marker sits after the true 500,000-byte cutoff, so a
      // byte-accurate truncation must drop it entirely.
      expect(
        result.findings.some((f) =>
          f.message.includes('unresolved marker comment'),
        ),
      ).toBe(false);
    });

    it('does not corrupt output when the byte cutoff lands mid-character', async () => {
      // 500,000 is not a multiple of 3, so a naive byte slice at exactly
      // MAX_INPUT_BYTES would split the last multi-byte character in half,
      // producing invalid UTF-8 / mojibake. The evaluator should still
      // resolve cleanly.
      const evaluator = new ConcisenessEvaluator();
      const filler = '中'.repeat(200_000); // 600,000 bytes

      const result = await evaluator.evaluate(createInput(filler));

      expect(result.evaluatorName).toBe('conciseness');
      expect(result.verdict).toBe('pass');
    });
  });
});

