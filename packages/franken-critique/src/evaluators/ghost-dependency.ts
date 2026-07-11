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

function isLocalImportSpecifier(specifier: string): boolean {
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
        i = skipStringLiteral(content, i);
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

  const closingIndex = skipImportTrivia(content, nested.endIndex + 1);
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
  const isTernaryBranch = hasTernaryBranchMarker(prefix);
  const isNestedTypeReference = endsInsideNestedTypeReference(prefix);

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
  while (statementStart !== -1 && isSemicolonInsideTypeBody(content, statementStart)) {
    statementStart = content.lastIndexOf(';', statementStart - 1);
  }

  return statementStart;
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
  const openBraceIndex = content.lastIndexOf('{', semicolonIndex);
  if (openBraceIndex === -1) return false;
  const closeBraceIndex = content.lastIndexOf('}', semicolonIndex);
  if (closeBraceIndex > openBraceIndex) return false;

  const beforeBrace = content.slice(0, openBraceIndex);
  return (
    /(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?(?:interface\s+[A-Za-z_$][\w$]*|type\s+[A-Za-z_$][\w$]*(?:\s*<[^>{}]*)?\s*=)\b[\s\S]*$/.test(beforeBrace) ||
    /(?:\bas\s*|\bsatisfies\s*|:)\s*$/.test(beforeBrace.trimEnd())
  );
}

function endsInsideNestedTypeReference(prefix: string): boolean {
  const prefixWithoutTrailingTrivia = stripTrailingTrivia(prefix);
  if (/(?:\bas\s*|\bsatisfies\s*|\bkeyof\s*|\bimplements\s*)\(*\s*(?:(?:keyof|typeof)\s*)?$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }
  if (/(?:\bas\s*|\bsatisfies\s*)\(\s*\)\s*=>\s*$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }
  if (/(?:\bas\s*|\bsatisfies\s*)\s*(?:readonly\s*)?(?:\[\s*)?$/.test(prefixWithoutTrailingTrivia)) {
    return true;
  }

  const trimmed = prefix.trimEnd();

  if (
    /(?:,|\bextends\b|=)$/.test(trimmed) &&
    trimmed.lastIndexOf('<') > trimmed.lastIndexOf('>')
  ) {
    return true;
  }

  const operator = trimmed.at(-1);
  if (operator === '<') return /(?:[A-Z_$][\w$]*|[>\]])<$/.test(trimmed);

  if (operator !== '|' && operator !== '&') return false;

  return (
    trimmed.at(-2) !== operator &&
    (trimmed.lastIndexOf('<') > trimmed.lastIndexOf('>') ||
      /(?:\bas\b|\bsatisfies\b|:)\s*[\s\S]*[|&]$/.test(trimmed))
  );
}

function isInsideGenericTypeArgument(
  prefix: string,
  content: string,
  importIndex: number,
): boolean {
  const trimmed = prefix.trimEnd();
  if (!/[A-Za-z_$][\w$]*<$/.test(trimmed)) return false;
  if (trimmed.lastIndexOf('<') < trimmed.lastIndexOf('>')) return false;

  const dynamicImport = readDynamicImportSpecifierForTypeContext(
    content,
    importIndex + 'import'.length,
  );
  if (!dynamicImport) return false;

  let i = skipImportTrivia(content, dynamicImport.endIndex + 1);
  while (content[i] === '.' || (content[i] === '[' && content[i + 1] === ']')) {
    if (content[i] === '.') {
      i = skipImportTrivia(content, i + 1);
      if (!/[A-Za-z_$]/.test(content[i] ?? '')) return false;
      while (isIdentifierCharacter(content[i] ?? '')) i += 1;
      i = skipImportTrivia(content, i);
      continue;
    }
    i = skipImportTrivia(content, i + 2);
  }

  return content[i] === '>';
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
  if (/\{\s*(?:return|throw|void|await|yield|case|default)\b[\s\S]*$/.test(trimmed)) {
    return false;
  }

  if (/(?:\btype\b|\binterface\b|\bimplements\b|\bkeyof\b|\btypeof\b|\bas\b|\bsatisfies\b)[\s\S]*$/.test(trimmed)) {
    return true;
  }

  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex === -1) return false;
  const openBraceIndex = trimmed.lastIndexOf('{');
  const semicolonIndex = trimmed.lastIndexOf(';');
  return colonIndex > semicolonIndex && !/\{\s*(?:return|throw|void|await|yield|case|default)\b[\s\S]*$/.test(trimmed.slice(openBraceIndex));
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
  return (
    /(?:^|[;{}\n])\s*(?:export\s+)?(?:declare\s+)?(?:type|interface)\b/.test(prefix) &&
    !hasCompletedTypeDeclarationBeforeImport(prefix) &&
    !/\n\s*(?:export\s+)?(?:const|let|var|await|return|throw|new|if|for|while|switch|try|function|async\s+function|class)\b/.test(
      prefix,
    ) &&
    !/\}\s*(?:export\s+)?(?:const|let|var|await|return|throw|new|if|for|while|switch|try|function|async\s+function|class)\b[\s\S]*$/.test(
      prefix,
    ) &&
    !/\}\s*(?:export\s+)?$/.test(prefix) &&
    !/\}\s*\n\s*(?:export\s+)?(?:void\s*$|\(|(?:void\s+)?import\s*\(|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\()/.test(
      prefix,
    )
  );
}

function hasCompletedTypeDeclarationBeforeImport(prefix: string): boolean {
  const newlineIndex = prefix.lastIndexOf('\n');
  if (newlineIndex === -1) return false;

  const suffix = prefix.slice(newlineIndex + 1);
  if (!/^\s*(?:export\s+)?(?:void\s*)?$/.test(suffix)) return false;

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

  const annotationIndex = prefix.lastIndexOf(':');
  if (annotationIndex === -1) return false;

  const beforeAnnotation = prefix.slice(0, annotationIndex);
  if (/\bcase\s+[\s\S]*$/.test(beforeAnnotation)) return false;
  if (/(?:\bas|\bsatisfies)\s*\{[^}]*$/.test(beforeAnnotation)) return true;
  if (/:\s*\{[^}]*$/.test(beforeAnnotation)) return true;
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
      !/[=;]/.test(outerAnnotationSuffix)
    ) {
      return true;
    }
  }

  const annotationSuffix = prefix.slice(annotationIndex + 1);
  if (/[=;]/.test(annotationSuffix)) return false;
  if (/=>/.test(annotationSuffix)) {
    return /^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*(?:\[\])?)\s*=>\s*$/.test(
      annotationSuffix,
    );
  }
  if (/^\s*(?:return|throw|void|await)\b/.test(annotationSuffix)) return false;
  if (/\{[\s\S]*\b(?:return|throw|void|await|yield|case|default)\b/.test(annotationSuffix)) {
    return false;
  }
  if (/\{[\s\S]*$/.test(annotationSuffix)) {
    return false;
  }

  return !isLikelyObjectLiteralValue(content, importIndex);
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

  let i = colonIndex - 1;
  while (i >= 0 && /\s/.test(content[i]!)) i -= 1;

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
