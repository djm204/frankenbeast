import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';

const IDENTIFIER_PATTERN = /[A-Za-z0-9_$]/;
const QUOTE_CHARS = new Set(["'", '"', '`']);

interface StringLiteralRead {
  value: string;
  endIndex: number;
}

export class GhostDependencyEvaluator implements Evaluator {
  readonly name = 'ghost-dependency';
  readonly category = 'deterministic' as const;

  private readonly knownPackages: ReadonlySet<string>;

  constructor(knownPackages: readonly string[]) {
    this.knownPackages = new Set(knownPackages);
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];
    const seen = new Set<string>();

    for (const specifier of extractDependencySpecifiers(input.content)) {
      // Skip relative imports
      if (specifier.startsWith('.')) continue;

      // Skip node: built-ins
      if (specifier.startsWith('node:')) continue;

      // Extract package name (handle scoped packages and subpath imports)
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]!;

      if (seen.has(packageName)) continue;
      seen.add(packageName);

      if (!this.knownPackages.has(packageName)) {
        findings.push({
          message: `Ghost dependency detected: "${packageName}" is not in the known package registry`,
          severity: 'critical',
          suggestion: `Add "${packageName}" to dependencies or remove the import`,
        });
      }
    }

    const score = findings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }
}

function extractDependencySpecifiers(content: string): string[] {
  const specifiers: string[] = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (ch === '/' && next === '/') {
      i = skipSingleLineComment(content, i + 2);
      continue;
    }

    if (ch === '/' && next === '*') {
      i = skipMultiLineComment(content, i + 2);
      continue;
    }

    if (QUOTE_CHARS.has(ch)) {
      i = skipStringLiteral(content, i);
      continue;
    }

    if (startsWithKeyword(content, i, 'import')) {
      const imported = readStaticImportSpecifier(content, i + 'import'.length);
      if (imported) {
        specifiers.push(imported.value);
        i = imported.endIndex;
      }
      continue;
    }

    if (startsWithKeyword(content, i, 'require')) {
      const required = readRequireSpecifier(content, i + 'require'.length);
      if (required) {
        specifiers.push(required.value);
        i = required.endIndex;
      }
    }
  }

  return specifiers;
}

function startsWithKeyword(
  content: string,
  index: number,
  keyword: string,
): boolean {
  if (!content.startsWith(keyword, index)) return false;

  const before = content[index - 1];
  const after = content[index + keyword.length];

  return (
    (!before || !IDENTIFIER_PATTERN.test(before)) &&
    (!after || !IDENTIFIER_PATTERN.test(after))
  );
}

function readStaticImportSpecifier(
  content: string,
  index: number,
): StringLiteralRead | null {
  let i = skipWhitespace(content, index);

  // Ignore dynamic import(...) expressions; they were not covered by the original evaluator.
  if (content[i] === '(') return null;

  while (i < content.length) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (ch === '/' && next === '/') {
      i = skipSingleLineComment(content, i + 2) + 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i = skipMultiLineComment(content, i + 2) + 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      return readQuotedString(content, i);
    }

    if (ch === ';') return null;

    i += 1;
  }

  return null;
}

function readRequireSpecifier(
  content: string,
  index: number,
): StringLiteralRead | null {
  let i = skipWhitespace(content, index);
  if (content[i] !== '(') return null;

  i = skipWhitespace(content, i + 1);
  if (content[i] !== "'" && content[i] !== '"') return null;

  return readQuotedString(content, i);
}

function readQuotedString(
  content: string,
  startIndex: number,
): StringLiteralRead | null {
  const quote = content[startIndex]!;
  let value = '';

  for (let i = startIndex + 1; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '\\') {
      const escaped = content[i + 1];
      if (escaped) {
        value += escaped;
        i += 1;
      }
      continue;
    }

    if (ch === quote) {
      return { value, endIndex: i };
    }

    value += ch;
  }

  return null;
}

function skipWhitespace(content: string, index: number): number {
  let i = index;
  while (i < content.length && /\s/.test(content[i]!)) i += 1;
  return i;
}

function skipSingleLineComment(content: string, index: number): number {
  const newlineIndex = content.indexOf('\n', index);
  return newlineIndex === -1 ? content.length : newlineIndex;
}

function skipMultiLineComment(content: string, index: number): number {
  const endIndex = content.indexOf('*/', index);
  return endIndex === -1 ? content.length : endIndex + 1;
}

function skipStringLiteral(content: string, startIndex: number): number {
  const quote = content[startIndex]!;

  for (let i = startIndex + 1; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === quote) return i;
  }

  return content.length;
}
