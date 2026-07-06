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

  it('ignores braces inside regex literals after control headers', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `if (ok) /{{{{{{/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not mistake postfix division for a regex literal', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `counter++ / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after non-null assertions for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `total! / denom; total$! / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not trim line-comment markers inside strings before division', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const url = 'https://api', ratio = total / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('ignores braces inside regex literals after line comments', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `// note
/{{{{{{/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals after nested array brackets', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const rules = [[/{{{{{{/]];`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores comments before regex literals after keywords', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `function matches(input) {
  return /* note */ /{{{{{{/.test(input);
}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not let nested template literals mask following code', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'const x = `' +
      '${`outer ${`{{`}`}' +
      '`; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake JSX closing tags for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const jsxPair = '<A>{a && <B>{b}</B>}</A>;';
    const content = Array.from({ length: 6 }, () => jsxPair).join('\n');
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not mask prose contractions as quoted strings', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `Here's deeply nested code: if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('handles slash-heavy prose and URLs without hiding following braces', async () => {
    const evaluator = new ComplexityEvaluator();
    const slashHeavy = Array.from(
      { length: 300 },
      (_, i) => `https://example.com/path/${i}/asset`,
    ).join(' ');
    const content = `${slashHeavy}\nif (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not let Markdown fences mask nested code blocks', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `Example:\n\`\`\`ts\nif (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }\n\`\`\``;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('ignores braces inside regex literals after else branches', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `if (ok) run(); else /{{{{{{/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals in computed property indexes', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const value = obj[/{{{{{{/.source];`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not mistake division after generic type assertions for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const ratio = value as Box<number> / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not treat prose URLs as line comments', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `See https://example.test if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('ignores braces inside regex literals after arrow expression bodies', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const hasMany = (s) => /{{{{{{/.test(s);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not mask possessive apostrophes as quoted strings', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `PR #853's nested code: if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mask Markdown inline code as template literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `Refactor \`if (a) { if (b) { if (c) { if (d) { if (e) {} } } } }\``;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not treat regex-prefix words on properties as keywords', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const r = obj.return / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('still treats line comments after labels as comments', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `label:// {{{{{{`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals after block statements', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `if (ok) {} /[{][{][{][{][{]/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals after keyword-opened blocks', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `if (ok) {} else {} /{{{{{{/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('stops unterminated quoted strings at line breaks', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `users'\nif (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps tagged templates masked as template literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = 'const styles = css`{{{{{{`;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('keeps spaced template literals masked as template literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = 'const styles = `{{{{{{`;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('keeps Markdown inline code visible after prose keyword-like words', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'Example of `if (a) { if (b) { if (c) { if (d) { if (e) {} } } } }`';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps template literals at the start of input masked', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = '`{{{{{{`;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not mistake division after object literals for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const ratio = {} / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after object property values for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const o = { ratio: {} / denom }; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after contextual identifiers for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `let of = 10; const ratio = of / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after property control names for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `obj.if(ok) / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mistake division after angle-bracket assertions for regex literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const ratio = <Box>{} / denom; if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not mask plural possessive apostrophes as strings', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `users' nested code: if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not hide prose after unmatched double quotes', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `He said " nested code: if (a) { if (b) { if (c) { if (d) { if (e) {} } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps escaped newlines inside quoted strings masked', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = 'const value = "\\\n{{{{{{";';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('keeps CRLF escaped newlines inside quoted strings masked', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = 'const value = "\\\r\n{{{{{{";';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals after default exports', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `export default /{{{{{{/.test(input);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('keeps spaced tagged templates masked as template literals', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = 'const styles = css `{{{{{{`; const more = tag() `}}}}}}`;';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('ignores braces inside regex literals after word operators', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `const ok = key in /{{{{{{/.groups; for (const m of /}}}}}}/.exec(s) ?? []) { m; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      false,
    );
  });

  it('does not hide nested code after unmatched backticks', async () => {
    const evaluator = new ComplexityEvaluator();
    const content =
      'Use `foo\nif (a) { if (b) { if (c) { if (d) { if (e) {} } } } }';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('does not treat non-http prose URLs as line comments', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `See s3://bucket/path and gs://bucket/path before if (a) { if (b) { if (c) { if (d) { if (e) { doThing(); } } } } }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps leading Markdown inline code visible', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = '`if (a) { if (b) { if (c) { if (d) { if (e) {} } } } }`.';
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('nesting'))).toBe(
      true,
    );
  });

  it('keeps quoted prose snippets visible', async () => {
    const evaluator = new ComplexityEvaluator();
    const content = `The problematic code is "if (a) { if (b) { if (c) { if (d) { if (e) {} } } } }"`;
    const result = await evaluator.evaluate(createInput(content));

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
