import { isBuiltin } from 'node:module';

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

interface TemplateRead {
  specifiers: string[];
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

      // Skip Node built-ins, including node: prefixes and bare built-in subpaths.
      if (isNodeBuiltinSpecifier(specifier)) continue;

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

function isNodeBuiltinSpecifier(specifier: string): boolean {
  return isBuiltin(specifier);
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

    if (ch === '/' && isRegexLiteralStart(content, i)) {
      i = skipRegexLiteral(content, i);
      continue;
    }

    if (ch === '`') {
      const template = readTemplateString(content, i);
      specifiers.push(...template.specifiers);
      i = template.endIndex;
      continue;
    }

    if (ch === "'" || ch === '"') {
      i = skipStringLiteral(content, i);
      continue;
    }

    if (startsWithKeyword(content, i, 'import')) {
      const dynamicallyImported = readDynamicImportSpecifier(
        content,
        i + 'import'.length,
      );
      if (dynamicallyImported) {
        specifiers.push(dynamicallyImported.value);
        i = dynamicallyImported.endIndex;
        continue;
      }

      const imported = readStaticImportSpecifier(content, i + 'import'.length);
      if (imported) {
        specifiers.push(imported.value);
        i = imported.endIndex;
      }
      continue;
    }

    if (startsWithKeyword(content, i, 'export')) {
      const reexported = readStaticImportSpecifier(content, i + 'export'.length);
      if (reexported) {
        specifiers.push(reexported.value);
        i = reexported.endIndex;
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

  // Ignore import.meta, dynamic import(...), and non-declaration object keys like
  // `{ import: { from: 'pkg' } }`.
  if (content[i] === '.' || content[i] === '(' || content[i] === ':') {
    return null;
  }

  if (content[i] === "'" || content[i] === '"') {
    return readQuotedString(content, i);
  }

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

    if (QUOTE_CHARS.has(ch)) {
      i = skipStringLiteral(content, i) + 1;
      continue;
    }

    if (startsWithKeyword(content, i, 'from')) {
      const specifierStart = skipImportTrivia(content, i + 'from'.length);
      if (content[specifierStart] === "'" || content[specifierStart] === '"') {
        return readQuotedString(content, specifierStart);
      }
      i += 'from'.length;
      continue;
    }

    if (ch === ';') return null;

    i += 1;
  }

  return null;
}

function readDynamicImportSpecifier(
  content: string,
  index: number,
): StringLiteralRead | null {
  let i = skipWhitespace(content, index);
  if (content[i] !== '(') return null;

  i = skipImportTrivia(content, i + 1);
  if (content[i] !== "'" && content[i] !== '"') return null;

  const specifier = readQuotedString(content, i);
  if (!specifier) return null;

  const closeParenIndex = skipImportTrivia(content, specifier.endIndex + 1);
  if (content[closeParenIndex] !== ')') return null;

  return { value: specifier.value, endIndex: closeParenIndex };
}

function readRequireSpecifier(
  content: string,
  index: number,
): StringLiteralRead | null {
  let i = skipWhitespace(content, index);
  if (content[i] !== '(') return null;

  i = skipWhitespace(content, i + 1);
  if (content[i] !== "'" && content[i] !== '"') return null;

  const specifier = readQuotedString(content, i);
  if (!specifier) return null;

  const closeParenIndex = skipWhitespace(content, specifier.endIndex + 1);
  if (content[closeParenIndex] !== ')') return null;

  return specifier;
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

function readTemplateString(content: string, startIndex: number): TemplateRead {
  const specifiers: string[] = [];

  for (let i = startIndex + 1; i < content.length; i++) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === '`') {
      return { specifiers, endIndex: i };
    }

    if (ch === '$' && next === '{') {
      const expression = readTemplateExpression(content, i + 1);
      specifiers.push(...extractDependencySpecifiers(expression.value));
      i = expression.endIndex;
    }
  }

  return { specifiers, endIndex: content.length };
}

function readTemplateExpression(
  content: string,
  openBraceIndex: number,
): StringLiteralRead {
  let depth = 1;
  let value = '';

  for (let i = openBraceIndex + 1; i < content.length; i++) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (ch === '/' && next === '/') {
      const endIndex = skipSingleLineComment(content, i + 2);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === '/' && next === '*') {
      const endIndex = skipMultiLineComment(content, i + 2);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === '/' && isRegexLiteralStart(content, i)) {
      const endIndex = skipRegexLiteral(content, i);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (QUOTE_CHARS.has(ch)) {
      const endIndex = skipStringLiteral(content, i);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      value += ch;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { value, endIndex: i };
      value += ch;
      continue;
    }

    value += ch;
  }

  return { value, endIndex: content.length };
}

function skipWhitespace(content: string, index: number): number {
  let i = index;
  while (i < content.length && /\s/.test(content[i]!)) i += 1;
  return i;
}

function skipImportTrivia(content: string, index: number): number {
  let i = skipWhitespace(content, index);

  while (i < content.length) {
    if (content[i] === '/' && content[i + 1] === '/') {
      i = skipWhitespace(content, skipSingleLineComment(content, i + 2));
      continue;
    }

    if (content[i] === '/' && content[i + 1] === '*') {
      i = skipWhitespace(content, skipMultiLineComment(content, i + 2) + 1);
      continue;
    }

    return i;
  }

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

function isRegexLiteralStart(content: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const ch = content[i]!;
    if (/\s/.test(ch)) continue;

    if (
      (ch === '+' || ch === '-') &&
      previousNonWhitespace(content, i - 1) === ch
    ) {
      return false;
    }

    if (isIdentifierCharacter(ch)) {
      const wordStart = readIdentifierStart(content, i);
      const word = content.slice(wordStart, i + 1);
      return REGEX_PREFIX_KEYWORDS.has(word);
    }

    if (ch === '<' && /[A-Za-z>]/.test(content[index + 1] ?? '')) {
      return false;
    }

    return '([{:;,=!?&|+-*~^%<>'.includes(ch);
  }

  return true;
}

function previousNonWhitespace(content: string, index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const ch = content[i]!;
    if (!/\s/.test(ch)) return ch;
  }

  return null;
}

function readIdentifierStart(content: string, index: number): number {
  let i = index;
  while (i > 0 && isIdentifierCharacter(content[i - 1]!)) i -= 1;
  return i;
}

function isIdentifierCharacter(ch: string): boolean {
  return /[$_A-Za-z0-9]/.test(ch);
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

function skipRegexLiteral(content: string, startIndex: number): number {
  let inCharacterClass = false;

  for (let i = startIndex + 1; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === '[') {
      inCharacterClass = true;
      continue;
    }

    if (ch === ']') {
      inCharacterClass = false;
      continue;
    }

    if (ch === '/' && !inCharacterClass) {
      while (/[A-Za-z]/.test(content[i + 1] ?? '')) i += 1;
      return i;
    }
  }

  return content.length;
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
