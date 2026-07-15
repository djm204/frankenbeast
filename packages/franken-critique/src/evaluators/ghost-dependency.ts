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
      // Skip local imports, including absolute paths/URLs used by dynamic loaders.
      if (isLocalImportSpecifier(specifier)) continue;

      // Skip Node built-ins, including node: prefixes and bare built-in subpaths.
      if (isNodeBuiltinSpecifier(specifier)) continue;

      const packageSpecifier = normalizePackageUrlSpecifier(specifier);

      // Extract package name (handle scoped packages and subpath imports)
      const packageName = packageSpecifier.startsWith('@')
        ? packageSpecifier.split('/').slice(0, 2).join('/')
        : packageSpecifier.split('/')[0]!;

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

function normalizePackageUrlSpecifier(specifier: string): string {
  return specifier
    .replace(/^(?:npm|jsr):/, '')
    .replace(/^(@[^/]+\/[^/@]+)@[^/]+/, '$1')
    .replace(/^([^/@]+)@[^/]+/, '$1');
}

function isLocalImportSpecifier(specifier: string): boolean {
  if (/^(?:npm|jsr):/.test(specifier)) return false;

  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier.startsWith('file:') ||
    (!specifier.startsWith('node:') && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) ||
    /^[A-Za-z]:/.test(specifier)
  );
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
      if (isTypeOnlyTemplateString(content, i)) {
        i = readTemplateString(content, i).endIndex;
        continue;
      }
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
  if (!canStartNativeDynamicImport(content, index - 'import'.length)) {
    return null;
  }

  let i = skipImportTrivia(content, index);
  if (content[i] !== '(') return null;

  i = skipImportTrivia(content, i + 1);

  const specifier = readDynamicImportArgumentSpecifier(content, i);
  if (!specifier) return null;

  const nextTokenIndex = skipTypeScriptNonNullAssertion(
    content,
    skipImportTrivia(content, specifier.endIndex + 1),
  );
  const assertedTokenIndex = skipTypeScriptImportArgumentAssertion(
    content,
    nextTokenIndex,
  );
  if (assertedTokenIndex !== nextTokenIndex) {
    return content[assertedTokenIndex] === ')' || content[assertedTokenIndex] === ','
      ? { value: specifier.value, endIndex: assertedTokenIndex - 1 }
      : null;
  }

  if (content[nextTokenIndex] !== ')' && content[nextTokenIndex] !== ',') {
    return null;
  }

  return specifier;
}

function skipTypeScriptNonNullAssertion(content: string, index: number): number {
  if (content[index] !== '!') return index;
  return skipImportTrivia(content, index + 1);
}

function skipTypeScriptImportArgumentAssertion(
  content: string,
  index: number,
): number {
  const keyword = startsWithKeyword(content, index, 'as')
    ? 'as'
    : startsWithKeyword(content, index, 'satisfies')
      ? 'satisfies'
      : null;
  if (!keyword) return index;

  let i = skipImportTrivia(content, index + keyword.length);
  while (i < content.length && content[i] !== ')' && content[i] !== ',') {
    if (content[i] === '/' && content[i + 1] === '/') {
      i = skipImportTrivia(content, skipSingleLineComment(content, i + 2));
      continue;
    }
    if (content[i] === '/' && content[i + 1] === '*') {
      i = skipImportTrivia(content, skipMultiLineComment(content, i + 2) + 1);
      continue;
    }
    i += 1;
  }

  return i;
}

function readDynamicImportArgumentSpecifier(
  content: string,
  index: number,
): StringLiteralRead | null {
  if (content[index] === '`') return readNoSubstitutionTemplateString(content, index);
  if (content[index] === "'" || content[index] === '"') {
    return readQuotedString(content, index);
  }

  if (content[index] === '<') {
    const assertionEnd = findTypeScriptAngleAssertionEnd(content, index);
    if (assertionEnd === -1) return null;
    const assertedStart = skipImportTrivia(content, assertionEnd + 1);
    return readDynamicImportArgumentSpecifier(content, assertedStart);
  }

  if (content[index] !== '(') return null;

  const nestedStart = skipImportTrivia(content, index + 1);
  const nested = readDynamicImportArgumentSpecifier(content, nestedStart);
  if (!nested) return null;

  const nextTokenIndex = skipTypeScriptNonNullAssertion(
    content,
    skipImportTrivia(content, nested.endIndex + 1),
  );
  const assertedTokenIndex = skipTypeScriptImportArgumentAssertion(
    content,
    nextTokenIndex,
  );
  const closingIndex = skipTypeScriptNonNullAssertion(content, assertedTokenIndex);
  if (content[closingIndex] !== ')') return null;

  return { value: nested.value, endIndex: closingIndex };
}

function canStartNativeDynamicImport(
  content: string,
  importIndex: number,
): boolean {
  const previousIndex = previousNonTriviaIndex(content, importIndex - 1);
  const previous = previousIndex === null ? null : content[previousIndex]!;
  if (
    previous === '#' ||
    (previous === '.' &&
      previousIndex !== null &&
      !isSpreadOperand(content, previousIndex))
  ) {
    return false;
  }

  const statementStart = findDynamicImportStatementStart(content, importIndex);
  const prefix = content.slice(statementStart + 1, importIndex);
  const prefixWithoutTrailingTrivia = stripTrailingTrivia(prefix).trimEnd();
  if (/\b(?:as|satisfies)$/.test(prefixWithoutTrailingTrivia)) {
    return false;
  }
  const isTernaryBranch = hasTernaryBranchMarker(prefix);
  const isObjectLiteralValue = isLikelyObjectLiteralValue(content, importIndex);
  const isNestedTypeReference = endsInsideNestedTypeReference(
    prefix,
    isObjectLiteralValue,
  );

  return !(
    isNestedTypeReference ||
    isTypeOnlyImportReferenceUse(prefix, content, importIndex) ||
    isInsideGenericTypeArgument(prefix, content, importIndex) ||
    isInsideTypeDeclaration(prefix) ||
    isInsideTypeAnnotation(prefix, content, importIndex, isTernaryBranch)
  );
}

function isSpreadOperand(content: string, dotIndex: number): boolean {
  return content.slice(dotIndex - 2, dotIndex + 1) === '...';
}

function findDynamicImportStatementStart(content: string, importIndex: number): number {
  let statementStart = content.lastIndexOf(';', importIndex - 1);
  while (
    statementStart !== -1 &&
    (isSemicolonInsideTypeBody(content, statementStart) ||
      isIndexInsideStringOrComment(content, statementStart))
  ) {
    statementStart = content.lastIndexOf(';', statementStart - 1);
  }

  return statementStart;
}

function isIndexInsideStringOrComment(content: string, index: number): boolean {
  let quote: string | null = null;
  let blockComment = false;
  let lineComment = false;

  for (let i = 0; i < index; i += 1) {
    const ch = content[i]!;
    const next = content[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
  }

  return quote !== null || blockComment || lineComment;
}

function isTypeOnlyTemplateString(content: string, templateIndex: number): boolean {
  const statementStart = findDynamicImportStatementStart(content, templateIndex);
  const prefix = content.slice(statementStart + 1, templateIndex);
  const isTernaryBranch = hasTernaryBranchMarker(prefix);
  return (
    endsInsideNestedTypeReference(prefix) ||
    isInsideTypeDeclaration(prefix) ||
    isInsideTypeAnnotation(prefix, content, templateIndex, isTernaryBranch)
  );
}

function findTypeScriptAngleAssertionEnd(content: string, index: number): number {
  let depth = 0;
  for (let i = index; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '<') depth += 1;
    if (ch === '>') {
      depth -= 1;
      if (depth === 0) return i;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipStringLiteral(content, i);
    }
  }

  return -1;
}

function isSemicolonInsideTypeBody(content: string, semicolonIndex: number): boolean {
  let searchIndex = semicolonIndex;
  while (searchIndex > 0) {
    const openBraceIndex = findContainingOpenBrace(content, searchIndex);
    if (openBraceIndex === -1) return false;

    const beforeBrace = content.slice(0, openBraceIndex);
    if (
      /(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+[A-Za-z_$][\w$]*|type\s+[A-Za-z_$][\w$]*(?:\s*<[^>{}]*)?\s*=)\b[\s\S]*$/.test(beforeBrace) ||
      /(?:\bas\s*|\bsatisfies\s*|:)\s*$/.test(beforeBrace.trimEnd())
    ) {
      return true;
    }

    searchIndex = openBraceIndex;
  }

  return false;
}

function findContainingOpenBrace(content: string, index: number): number {
  let depth = 0;

  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = content[i]!;
    if (ch === '}') {
      depth += 1;
      continue;
    }
    if (ch !== '{') continue;
    if (depth === 0) return i;
    depth -= 1;
  }

  return -1;
}

function endsInsideNestedTypeReference(
  prefix: string,
  isObjectLiteralValue = false,
): boolean {
  const prefixWithoutTrailingTrivia = stripTrailingTrivia(prefix);
  if (/(?:^|[^.])(?:\bas\s+|\bsatisfies\s+|\bkeyof\s*|\bimplements\s*)\(*\s*(?:(?:keyof|typeof)\s*)?$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }
  if (/(?:\bas\s+|\bsatisfies\s+)\(\s*\)\s*=>\s*$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }
  if (/(?:\bas\s+|\bsatisfies\s+)(?:readonly\s*)?(?:\[\s*)?$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }

  const trimmed = prefix.trimEnd();

  if (
    /(?:,|\bextends\b|=)$/.test(trimmed) &&
    hasUnclosedGenericTypeArgument(trimmed)
  ) {
    return true;
  }

  const operator = trimmed.at(-1);
  if (operator === '<') return /(?:[>\]])<$/.test(trimmed) || /^\s*(?:const|let|var)?\s*[A-Za-z_$][\w$]*\s*=\s*<$/.test(trimmed);

  if (operator !== '|' && operator !== '&') return false;
  if (isObjectLiteralValue) return false;

  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex !== -1 && /[=;]/.test(trimmed.slice(colonIndex + 1))) {
    return false;
  }

  return (
    trimmed.at(-2) !== operator &&
    (hasUnclosedGenericTypeArgument(trimmed) ||
      /(?:\bas\b|\bsatisfies\b|:)\s*[\s\S]*[|&]$/.test(trimmed))
  );
}

function hasUnclosedGenericTypeArgument(trimmed: string): boolean {
  const lastOpen = findUnclosedAngleBracketIndex(trimmed);
  if (lastOpen === -1) return false;

  // Runtime less-than expressions such as `load(count < limit, import('x'))`
  // also leave an earlier `<` in the prefix.  Treat it as a generic/type
  // context only when the `<` is attached to the preceding type/callee token.
  const typeArgumentPrefix = trimmed.slice(lastOpen + 1).trim();
  if (/^[A-Za-z_$][\w$]*\s*,\s*$/.test(typeArgumentPrefix)) {
    const tokenStart = findIdentifierStartBefore(trimmed, lastOpen - 1);
    const previousIndex = tokenStart === -1 ? null : previousNonTriviaIndex(trimmed, tokenStart - 1);
    if (previousIndex !== null && trimmed[previousIndex] === '(') return false;
  }

  const beforeOpen = trimmed[lastOpen - 1];
  if (beforeOpen === undefined) return false;
  if (/\s/.test(beforeOpen)) {
    const previousIndex = previousNonTriviaIndex(trimmed, lastOpen - 1);
    return previousIndex !== null && /[=({[,]/.test(trimmed[previousIndex]!);
  }

  const tokenStart = findIdentifierStartBefore(trimmed, lastOpen - 1);
  if (tokenStart === -1) return false;
  const token = trimmed.slice(tokenStart, lastOpen);
  if (token.length > 0) return true;

  const previousIndex = previousNonTriviaIndex(trimmed, tokenStart - 1);
  return previousIndex !== null && /[.>\]]/.test(trimmed[previousIndex]!);
}

function findIdentifierStartBefore(content: string, index: number): number {
  let i = index;
  if (!isIdentifierCharacter(content[i] ?? '')) return -1;
  while (i >= 0 && isIdentifierCharacter(content[i] ?? '')) i -= 1;
  return i + 1;
}

function findUnclosedAngleBracketIndex(trimmed: string): number {
  let depth = 0;

  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const ch = trimmed[i]!;
    if (ch === '>') {
      if (trimmed[i - 1] === '=') continue;
      depth += 1;
      continue;
    }
    if (ch !== '<') continue;
    if (depth === 0) return i;
    depth -= 1;
  }

  return -1;
}

function isInsideGenericTypeArgument(
  prefix: string,
  content: string,
  importIndex: number,
): boolean {
  const trimmed = prefix.trimEnd();
  if (!hasUnclosedGenericTypeArgument(trimmed)) return false;

  const dynamicImport = readDynamicImportSpecifierForTypeContext(
    content,
    importIndex + 'import'.length,
  );
  if (!dynamicImport) return false;

  let i = skipImportTrivia(content, dynamicImport.endIndex + 1);
  while (content[i] === '.' || content[i] === '[') {
    if (content[i] === '.') {
      i = skipImportTrivia(content, i + 1);
      if (!/[A-Za-z_$]/.test(content[i] ?? '')) return false;
      while (isIdentifierCharacter(content[i] ?? '')) i += 1;
      i = skipImportTrivia(content, i);
      continue;
    }
    const indexedAccessEnd = findBalancedBracketEnd(content, i);
    if (indexedAccessEnd === -1) return false;
    i = skipImportTrivia(content, indexedAccessEnd + 1);
  }

  if (content[i] !== '>' && content[i] !== ',' && content[i] !== '|' && content[i] !== '&') {
    return false;
  }

  if (content[i] === ',') return true;

  if (content[i] === '>') {
    const afterDelimiter = skipImportTrivia(content, i + 1);
    return !isIdentifierCharacter(content[afterDelimiter] ?? '');
  }

  return true;
}

function findBalancedBracketEnd(content: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipStringLiteral(content, i);
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function isTypeOnlyImportReferenceUse(
  prefix: string,
  content: string,
  importIndex: number,
): boolean {
  const dynamicImport = readDynamicImportSpecifierForTypeContext(
    content,
    importIndex + 'import'.length,
  );
  if (!dynamicImport) return false;

  const afterImport = skipImportTrivia(content, dynamicImport.endIndex + 1);
  if (
    content[afterImport] !== '.' &&
    content[afterImport] !== '>' &&
    !(content[afterImport] === '[' && content[afterImport + 1] === ']')
  ) {
    return false;
  }

  const trimmed = prefix.trimEnd();
  if (hasCompletedStatementBeforeImport(prefix)) return false;
  if (/\{\s*(?:return|throw|void|await|yield|case|default)\b[\s\S]*$/.test(trimmed)) {
    return false;
  }

  if (/(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?(?:type|interface)\b[\s\S]*$/.test(trimmed)) {
    return true;
  }
  if (/\b(?:declare\s+)?namespace\b[\s\S]*\{\s*(?:export\s+)?type\b[\s\S]*$/.test(trimmed)) {
    return true;
  }
  if (/(?:^|[^.])(?:\bimplements\b|\bkeyof\b)\s*(?:\([^)]*)?$/.test(trimmed)) {
    return true;
  }
  if (/\bimplements\b[\s\S]*,\s*$/.test(trimmed)) {
    return true;
  }
  if (/(?:^|[^.])\bkeyof\s+typeof\s*(?:\([^)]*)?$/.test(trimmed)) {
    return true;
  }
  if (/(?:^|[^.])\btypeof\s*(?:\([^)]*)?$/.test(trimmed)) {
    return (
      isInsideGenericTypeArgument(prefix, content, importIndex) ||
      isInsideTypeDeclaration(prefix) ||
      isInsideTypeAnnotation(prefix, content, importIndex, false)
    );
  }
  if (isInsideOpenTypeAssertion(trimmed)) {
    return true;
  }

  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex === -1) return false;
  const openBraceIndex = trimmed.lastIndexOf('{');
  const semicolonIndex = trimmed.lastIndexOf(';');
  const annotationSuffix = trimmed.slice(colonIndex + 1);
  if (/[=;]/.test(annotationSuffix)) return false;
  return colonIndex > semicolonIndex && !/\{\s*(?:return|throw|void|await|yield|case|default)\b[\s\S]*$/.test(trimmed.slice(openBraceIndex));
}

function hasCompletedStatementBeforeImport(prefix: string): boolean {
  const newlineIndex = prefix.lastIndexOf('\n');
  if (newlineIndex === -1) return false;

  const suffix = prefix.slice(newlineIndex + 1);
  if (!/^\s*$/.test(suffix)) return false;

  const previousLine = prefix.slice(0, newlineIndex).trimEnd();
  return !/[=?:,|&<{([]$/.test(previousLine) && !/\bextends\s*$/.test(previousLine);
}

function isInsideOpenTypeAssertion(trimmedPrefix: string): boolean {
  const assertionMatch = /(?:^|[^.])\b(?:as|satisfies)\b/g;
  let latestAssertionIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = assertionMatch.exec(trimmedPrefix)) !== null) {
    latestAssertionIndex = match.index;
  }
  if (latestAssertionIndex === -1) return false;

  const suffix = trimmedPrefix.slice(latestAssertionIndex);
  if (/}\s*\)?\s*\n\s*(?:void\s+)?import\s*\($/.test(suffix)) {
    return false;
  }
  const lastComma = suffix.lastIndexOf(',');
  const lastEquals = suffix.lastIndexOf('=');
  const lastArrow = suffix.lastIndexOf('=>');
  if (hasUnclosedAssertionTypeContainer(suffix)) return lastArrow === -1;
  return lastComma === -1 && lastEquals === -1 && lastArrow === -1;
}

function hasUnclosedAssertionTypeContainer(suffix: string): boolean {
  return findUnclosedAngleBracketIndex(suffix) !== -1 || suffix.lastIndexOf('[') > suffix.lastIndexOf(']');
}

function readDynamicImportSpecifierForTypeContext(
  content: string,
  index: number,
): StringLiteralRead | null {
  let i = skipImportTrivia(content, index);
  if (content[i] !== '(') return null;
  i = skipImportTrivia(content, i + 1);
  const specifier = readDynamicImportArgumentSpecifier(content, i);
  if (!specifier) return null;
  const nextTokenIndex = skipImportTrivia(content, specifier.endIndex + 1);
  return content[nextTokenIndex] === ')'
    ? { value: specifier.value, endIndex: nextTokenIndex }
    : null;
}

function stripTrailingTrivia(content: string): string {
  const i = skipTriviaBackward(content, content.length - 1);
  return content.slice(0, i + 1);
}

function isInsideTypeDeclaration(prefix: string): boolean {
  if (/(?:^|[;{}\n])\s*(?:type|interface)\s*[:=]\s*(?:await\s+)?$/.test(prefix.trimEnd())) {
    return false;
  }
  if (/}\s*(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*(?:=|\(|\[)|module\.exports\s*=)[\s\S]*$/.test(prefix)) {
    return false;
  }

  return (
    /(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?(?:type|interface)\b/.test(prefix) &&
    !hasCompletedTypeDeclarationBeforeImport(prefix) &&
    !/\n\s*(?:export\s+)?(?:@|default\b|const|let|var|using|await|return|throw|new|if|for|while|switch|try|function|async\s+function|class)\b/.test(
      prefix,
    ) &&
    !/\}\s*(?:export\s+)?(?:@|default\b|const|let|var|using|await|return|throw|new|if|for|while|switch|try|function|async\s+function|class)\b[\s\S]*$/.test(
      prefix,
    ) &&
    !/\}\s*(?:export\s+)?$/.test(prefix) &&
    !/\}\s*\n\s*(?:export\s+)?(?:void\s*$|[!~+\-\[(@]|using\b|(?:void\s+)?import\s*\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\()/.test(
      prefix,
    )
  );
}

function hasCompletedTypeDeclarationBeforeImport(prefix: string): boolean {
  const newlineIndex = prefix.lastIndexOf('\n');
  if (newlineIndex === -1) return false;

  const suffix = prefix.slice(newlineIndex + 1);
  if (
    !/^\s*(?:export\s+)?(?:void\s*)?$/.test(suffix) &&
    !/^\s*(?:export\s+)?(?:default\b|[!~+\-\[(@]|using\b|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\(|\s*$)|(?:void\s+)?import\s*\(|await\b|return\b|throw\b|new\b|const\b|let\b|var\b)/.test(
      suffix,
    )
  ) {
    return false;
  }

  const previousLine = prefix.slice(0, newlineIndex).trimEnd();
  return !/[=?:,|&<{([]$/.test(previousLine) && !/\bextends\s*$/.test(previousLine);
}

function isInsideTypeAnnotation(
  prefix: string,
  content: string,
  importIndex: number,
  isTernaryBranch: boolean,
): boolean {
  if (isTernaryBranch && !isInsideConditionalType(prefix)) return false;

  const annotationIndex = findActiveTypeAnnotationIndex(prefix);
  if (annotationIndex === -1) return false;
  if (hasCompletedStatementBeforeImport(prefix)) return false;

  const beforeAnnotation = prefix.slice(0, annotationIndex);
  if (/\bcase\s+[\s\S]*$/.test(beforeAnnotation)) return false;
  if (
    /(?:\bas|\bsatisfies)\s*\{[^}]*$/.test(beforeAnnotation) &&
    !isLikelyObjectLiteralValue(content, importIndex) &&
    !hasRuntimeAfterAnnotation(prefix, annotationIndex)
  ) {
    return true;
  }
  if (
    /:\s*\{[^}]*$/.test(beforeAnnotation) &&
    !isLikelyObjectLiteralValue(content, importIndex) &&
    !hasRuntimeAfterAnnotation(prefix, annotationIndex)
  ) {
    return true;
  }
  if (
    /(?:^|[;{}\n])\s*[A-Za-z_$][\w$]*$/.test(beforeAnnotation) &&
    !/\bclass\b[\s\S]*\{[^}]*$/.test(beforeAnnotation)
  ) {
    return false;
  }

  const outerAnnotationIndex = beforeAnnotation.lastIndexOf(':');
  if (outerAnnotationIndex !== -1) {
    const outerAnnotationSuffix = beforeAnnotation.slice(outerAnnotationIndex + 1);
    if (
      outerAnnotationSuffix.includes('{') &&
      !outerAnnotationSuffix.includes('}') &&
      !/[=;]/.test(outerAnnotationSuffix) &&
      !isLikelyObjectLiteralValue(content, importIndex)
    ) {
      return true;
    }
  }

  const annotationSuffix = prefix.slice(annotationIndex + 1);
  if (hasRuntimeAfterClosedTypeContext(annotationSuffix)) return false;
  if (/=>/.test(annotationSuffix)) {
    if (/\)\s*:\s*[^=]*=>\s*$/.test(prefix)) return false;
    return /^\s*(?:new\s*)?(?:\([\s\S]*\)|<[^>]*>\s*\([\s\S]*\)|[A-Za-z_$][\w$]*(?:\[\])?)\s*=>\s*$/.test(
      annotationSuffix,
    );
  }
  if (/[=;]/.test(annotationSuffix)) return false;
  if (/^\s*(?:return|throw|void|await)\b/.test(annotationSuffix)) return false;
  if (/\n\s*(?:void\s*)?$|\n\s*(?:[!~+\-\[(@]|using\b|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(|(?:void\s+)?import\s*\(|await\b|return\b|throw\b|new\b|const\b|let\b|var\b)/.test(annotationSuffix)) {
    return false;
  }
  if (/\{[\s\S]*\b(?:return|throw|void|await|yield|case|default)\b/.test(annotationSuffix)) {
    return false;
  }
  if (/\{[\s\S]*$/.test(annotationSuffix)) {
    return false;
  }

  return !isLikelyObjectLiteralValue(content, importIndex);
}

function findActiveTypeAnnotationIndex(prefix: string): number {
  const annotationIndex = prefix.lastIndexOf(':');
  if (annotationIndex === -1) return -1;

  const annotationSuffix = prefix.slice(annotationIndex + 1);
  if (!/=>\s*$/.test(annotationSuffix)) return annotationIndex;

  const outerAnnotationIndex = prefix.slice(0, annotationIndex).lastIndexOf(':');
  if (outerAnnotationIndex === -1) return annotationIndex;

  const outerSuffix = prefix.slice(outerAnnotationIndex + 1);
  return /=>\s*$/.test(outerSuffix) ? outerAnnotationIndex : annotationIndex;
}

function hasRuntimeAfterAnnotation(prefix: string, annotationIndex: number): boolean {
  return hasRuntimeAfterClosedTypeContext(prefix.slice(annotationIndex + 1));
}

function hasRuntimeAfterClosedTypeContext(annotationSuffix: string): boolean {
  return /}\s*\)?(?:\s*\{\s*(?:return|throw|void|await|yield|case|default)\b|[^\S\n]*\n\s*(?:void\s*$|[!~+\-\[(@]|using\b|(?:void\s+)?import\s*\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(|await\b|return\b|throw\b|new\b|const\b|let\b|var\b))/.test(
    annotationSuffix,
  );
}

function isInsideConditionalType(prefix: string): boolean {
  const questionIndex = prefix.lastIndexOf('?');
  if (questionIndex === -1) return false;

  const condition = prefix.slice(0, questionIndex);
  return /\bextends\b/.test(condition) && !/(?:={2,3}|!==?|[<>]=?)/.test(condition);
}

function hasTernaryBranchMarker(prefix: string): boolean {
  const questionIndex = prefix.lastIndexOf('?');
  if (questionIndex === -1) return false;

  const afterQuestion = skipWhitespace(prefix, questionIndex + 1);
  return prefix[afterQuestion] !== ':';
}

function isLikelyObjectLiteralValue(content: string, importIndex: number): boolean {
  const colonIndex = content.lastIndexOf(':', importIndex - 1);
  if (colonIndex === -1) return false;

  let i = skipTriviaBackward(content, colonIndex - 1);

  if (content[i] === "'" || content[i] === '"') {
    i = skipQuotedKeyBackward(content, i);
  } else if (content[i] === ']') {
    i = skipBalancedKeyBackward(content, i);
  } else if (/[0-9]/.test(content[i] ?? '')) {
    while (i >= 0 && /[0-9._]/.test(content[i]!)) i -= 1;
  } else {
    while (i >= 0 && isIdentifierCharacter(content[i]!)) i -= 1;
  }

  i = skipTriviaBackward(content, i);

  if (content[i] === '{') {
    const beforeBrace = content.slice(0, i).trimEnd();
    if (/(?:\bas|\bsatisfies)\s*$/.test(beforeBrace)) {
      return false;
    }
    if (/(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?type\s+[A-Za-z_$][\w$]*(?:\s*<[^>{}]*)?\s*=\s*$/.test(beforeBrace)) {
      return false;
    }
    if (/\bclass\s+[A-Za-z_$][\w$]*(?:\s*<[^>{}]*)?$/.test(beforeBrace)) {
      return false;
    }
  }

  return content[i] === '{' || content[i] === ',';
}

function skipTriviaBackward(content: string, index: number): number {
  let i = index;

  while (i >= 0) {
    while (i >= 0 && /\s/.test(content[i]!)) i -= 1;

    if (content[i] === '/' && content[i - 1] === '*') {
      i -= 2;
      while (i >= 1 && !(content[i - 1] === '/' && content[i] === '*')) i -= 1;
      i -= 2;
      continue;
    }

    if (isInsideLineCommentBackward(content, i)) {
      while (i >= 0 && content[i] !== '\n') i -= 1;
      continue;
    }

    return i;
  }

  return i;
}

function isInsideLineCommentBackward(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  let quote: string | null = null;

  for (let i = lineStart; i <= index; i++) {
    const ch = content[i]!;
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '/' && content[i + 1] === '/') return true;
  }

  return false;
}

function skipQuotedKeyBackward(content: string, quoteIndex: number): number {
  const quote = content[quoteIndex]!;

  for (let i = quoteIndex - 1; i >= 0; i -= 1) {
    if (content[i] !== quote) continue;

    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && content[j] === '\\'; j -= 1) {
      backslashCount += 1;
    }

    if (backslashCount % 2 === 0) return i - 1;
  }

  return quoteIndex - 1;
}

function skipBalancedKeyBackward(content: string, closeIndex: number): number {
  let depth = 0;

  for (let i = closeIndex; i >= 0; i -= 1) {
    const ch = content[i]!;
    if (ch === ']') depth += 1;
    if (ch === '[') {
      depth -= 1;
      if (depth === 0) return i - 1;
    }
  }

  return closeIndex - 1;
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

function readNoSubstitutionTemplateString(
  content: string,
  startIndex: number,
): StringLiteralRead | null {
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

    if (ch === '$' && content[i + 1] === '{') return null;
    if (ch === '`') return { value, endIndex: i };

    value += ch;
  }

  return null;
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
  const indexOfPrevious = previousNonWhitespaceIndex(content, index);
  return indexOfPrevious === null ? null : content[indexOfPrevious]!;
}

function previousNonWhitespaceIndex(
  content: string,
  index: number,
): number | null {
  for (let i = index; i >= 0; i--) {
    const ch = content[i]!;
    if (!/\s/.test(ch)) return i;
  }

  return null;
}

function previousNonTriviaIndex(content: string, index: number): number | null {
  const i = skipTriviaBackward(content, index);
  return i < 0 ? null : i;
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
