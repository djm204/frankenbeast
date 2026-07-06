import { Parser, parse } from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import type { Node } from 'acorn';
import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

// Keywords that legitimately exit (or suspend) a loop. `await`/`yield` cover
// intentional async event loops such as `while (true) { await queue.next(); }`.
const LOOP_EXIT_NODE_TYPES = new Set([
  'ReturnStatement',
  'ThrowStatement',
  'AwaitExpression',
  'YieldExpression',
]);

const FUNCTION_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const LOOP_OR_SWITCH_NODE_TYPES = new Set([
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'DoWhileStatement',
  'WhileStatement',
  'SwitchStatement',
]);

type AstNode = Node & Record<string, unknown>;
type Range = { start: number; end: number };

type AcornPlugin = (BaseParser: typeof Parser) => typeof Parser;

const TypeScriptParser = Parser.extend(tsPlugin({ jsx: { allowNamespaces: true } }) as unknown as AcornPlugin);

function isNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === 'object' && typeof (value as AstNode).type === 'string');
}

function childNodes(node: AstNode): AstNode[] {
  const children: AstNode[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
      continue;
    }

    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) children.push(item);
      }
    }
  }

  return children;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function isIndexInRanges(ranges: Range[], index: number): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function fenceRanges(code: string): Range[] {
  return Array.from(code.matchAll(/```(?:[\w-]+)?\s*\n([\s\S]*?)```/g), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'case',
  'delete',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
  'await',
]);

function isRegexLiteralStart(code: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(code[cursor]!)) cursor -= 1;
  if (cursor < 0) return true;

  if ('([{=,:;!&|?+-*%^~<>'.includes(code[cursor]!)) return true;

  const tokenEnd = cursor + 1;
  while (cursor >= 0 && /[A-Za-z0-9_$]/.test(code[cursor]!)) cursor -= 1;
  if (tokenEnd === cursor + 1) return false;

  const token = code.slice(cursor + 1, tokenEnd);
  return REGEX_PREFIX_KEYWORDS.has(token) && hasKeywordBoundary(code, token, cursor + 1);
}

function scanQuotedRange(code: string, index: number, ranges: Range[]): number {
  const quote = code[index];
  const start = index;
  index += 1;
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }
    if (code[index] === quote) {
      index += 1;
      break;
    }
    index += 1;
  }
  ranges.push({ start, end: index });
  return index;
}

function scanLineCommentRange(code: string, index: number, ranges: Range[]): number {
  const start = index;
  index = code.indexOf('\n', index + 2);
  if (index < 0) index = code.length;
  ranges.push({ start, end: index });
  return index;
}

function scanBlockCommentRange(code: string, index: number, ranges: Range[]): number {
  const start = index;
  const end = code.indexOf('*/', index + 2);
  index = end < 0 ? code.length : end + 2;
  ranges.push({ start, end: index });
  return index;
}

function scanRegexRange(code: string, index: number, ranges: Range[]): number {
  const start = index;
  index += 1;
  let inCharacterClass = false;
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }
    if (code[index] === '[') inCharacterClass = true;
    if (code[index] === ']') inCharacterClass = false;
    if (code[index] === '/' && !inCharacterClass) {
      index += 1;
      while (/[a-z]/i.test(code[index] ?? '')) index += 1;
      break;
    }
    index += 1;
  }
  ranges.push({ start, end: index });
  return index;
}

function scanTemplateRange(code: string, index: number, ranges: Range[]): number {
  let segmentStart = index;
  index += 1;

  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }

    if (code[index] === '$' && code[index + 1] === '{') {
      ranges.push({ start: segmentStart, end: index + 2 });
      index += 2;
      let expressionDepth = 1;

      while (index < code.length && expressionDepth > 0) {
        const char = code[index];
        const next = code[index + 1];

        if (char === '\\') {
          index += 2;
          continue;
        }
        if (char === '\'' || char === '"') {
          index = scanQuotedRange(code, index, ranges);
          continue;
        }
        if (char === '`') {
          index = scanTemplateRange(code, index, ranges);
          continue;
        }
        if (char === '/' && next === '/') {
          index = scanLineCommentRange(code, index, ranges);
          continue;
        }
        if (char === '/' && next === '*') {
          index = scanBlockCommentRange(code, index, ranges);
          continue;
        }
        if (char === '/' && isRegexLiteralStart(code, index)) {
          index = scanRegexRange(code, index, ranges);
          continue;
        }
        if (char === '{') expressionDepth += 1;
        if (char === '}') expressionDepth -= 1;
        index += 1;
      }

      segmentStart = index - 1;
      continue;
    }

    if (code[index] === '`') {
      index += 1;
      break;
    }
    index += 1;
  }

  ranges.push({ start: segmentStart, end: index });
  return index;
}

function ignoredSyntaxRanges(code: string, includeFences = false): Range[] {
  const ranges: Range[] = includeFences ? fenceRanges(code) : [];
  let index = 0;

  while (index < code.length) {
    const fenced = includeFences ? ranges.find((range) => range.start === index) : undefined;
    if (fenced) {
      index = fenced.end;
      continue;
    }
    if (isIndexInRanges(ranges, index)) {
      index += 1;
      continue;
    }

    const char = code[index];
    const next = code[index + 1];

    if (char === '\'' || char === '"') {
      index = scanQuotedRange(code, index, ranges);
      continue;
    }

    if (char === '`') {
      index = scanTemplateRange(code, index, ranges);
      continue;
    }

    if (char === '/' && next === '/') {
      index = scanLineCommentRange(code, index, ranges);
      continue;
    }

    if (char === '/' && next === '*') {
      index = scanBlockCommentRange(code, index, ranges);
      continue;
    }

    if (char === '/' && isRegexLiteralStart(code, index)) {
      index = scanRegexRange(code, index, ranges);
      continue;
    }

    index += 1;
  }

  return mergeRanges(ranges);
}

function trimToBalancedSnippet(candidate: string): string {
  const ignoredRanges = ignoredSyntaxRanges(candidate);
  const firstOpen = candidate.indexOf('{');
  if (firstOpen < 0) return candidate;

  let depth = 0;
  for (let index = firstOpen; index < candidate.length; index += 1) {
    if (isIndexInRanges(ignoredRanges, index)) continue;

    const char = candidate[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(0, index + 1);
    }
  }

  return candidate;
}

function hasKeywordBoundary(code: string, keyword: string, index: number): boolean {
  const before = code[index - 1] ?? '';
  const after = code[index + keyword.length] ?? '';
  return !/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after);
}

function isPlausibleSnippetStart(code: string, keyword: string, index: number): boolean {
  const rest = code.slice(index + keyword.length).trimStart();
  if (keyword === 'while' || keyword === 'for') return rest.startsWith('(');
  if (keyword === 'function' || keyword === 'async function') return /^[*\s]*[A-Za-z_$({]/.test(rest);
  if (keyword === 'class') return /^[A-Za-z_$]/.test(rest);
  return true;
}

function pushCandidate(candidates: string[], seen: Set<string>, candidate: string): void {
  const normalized = candidate.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  candidates.push(normalized);
}

function codeCandidates(code: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const fences = Array.from(code.matchAll(/```(?:[\w-]+)?\s*\n([\s\S]*?)```/g));
  for (const match of fences) {
    const block = match[1];
    if (typeof block === 'string' && block.trim().length > 0) pushCandidate(candidates, seen, block);
  }
  pushCandidate(candidates, seen, code);

  const ignoredRanges = ignoredSyntaxRanges(code, true);
  const maxFallbackSnippets = 200;
  let fallbackSnippetCount = 0;

  for (const keyword of ['async function', 'function', 'while', 'for', 'class']) {
    let index = code.indexOf(keyword);
    while (index >= 0) {
      if (
        fallbackSnippetCount < maxFallbackSnippets &&
        hasKeywordBoundary(code, keyword, index) &&
        isPlausibleSnippetStart(code, keyword, index) &&
        !isIndexInRanges(ignoredRanges, index)
      ) {
        const snippet = code.slice(index);
        const trimmed = trimToBalancedSnippet(snippet);
        pushCandidate(candidates, seen, trimmed);
        if (trimmed === snippet) pushCandidate(candidates, seen, snippet);
        fallbackSnippetCount += 1;
      }
      index = code.indexOf(keyword, index + keyword.length);
    }
  }

  return candidates.flatMap((candidate) => [candidate, `${candidate}\n}`, `${candidate}\n}}`, `${candidate}\n}}}`]);
}

function parseJavaScript(code: string): AstNode[] {
  const asts: AstNode[] = [];
  const seen = new Set<string>();
  const baseOptions = {
    ecmaVersion: 'latest' as const,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowHashBang: true,
  };

  const parseCandidate = (candidate: string, sourceType: 'module' | 'script'): AstNode | null => {
    try {
      try {
        return TypeScriptParser.parse(candidate, {
          ...baseOptions,
          sourceType,
          locations: true,
        }) as unknown as AstNode;
      } catch {
        return parse(candidate, { ...baseOptions, sourceType }) as unknown as AstNode;
      }
    } catch {
      return null;
    }
  };

  if (!code.trimStart().startsWith('```')) {
    for (const sourceType of ['module', 'script'] as const) {
      const ast = parseCandidate(code, sourceType);
      if (ast) return [ast];
    }
  }

  for (const candidate of codeCandidates(code)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    for (const sourceType of ['module', 'script'] as const) {
      const ast = parseCandidate(candidate, sourceType);
      if (ast) {
        asts.push(ast);
        break;
      }
    }
  }

  return asts;
}

function parsesAsJavaScript(code: string): boolean {
  if (code.trimStart().startsWith('```')) return false;
  const baseOptions = {
    ecmaVersion: 'latest' as const,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowHashBang: true,
  };

  for (const sourceType of ['module', 'script'] as const) {
    try {
      TypeScriptParser.parse(code, { ...baseOptions, sourceType, locations: true });
      return true;
    } catch {
      try {
        parse(code, { ...baseOptions, sourceType });
        return true;
      } catch {
        // Try the next source type.
      }
    }
  }

  return false;
}

function isFunctionLike(node: AstNode): boolean {
  return FUNCTION_NODE_TYPES.has(node.type);
}

function isInfiniteWhile(node: AstNode): boolean {
  if (node.type !== 'WhileStatement') return false;
  const test = node.test;
  return isNode(test) && test.type === 'Literal' && test.value === true;
}

function isInfiniteFor(node: AstNode): boolean {
  return (
    node.type === 'ForStatement' &&
    node.init == null &&
    node.test == null &&
    node.update == null
  );
}

function hasLoopExit(body: AstNode): boolean {
  const visit = (node: AstNode, nestedLoopOrSwitchDepth: number): boolean => {
    if (isFunctionLike(node)) return false;

    if (node.type === 'ForOfStatement' && node.await === true) return true;

    if (LOOP_EXIT_NODE_TYPES.has(node.type)) return true;

    if (node.type === 'BreakStatement') {
      return nestedLoopOrSwitchDepth === 0;
    }

    const nextDepth = LOOP_OR_SWITCH_NODE_TYPES.has(node.type)
      ? nestedLoopOrSwitchDepth + 1
      : nestedLoopOrSwitchDepth;

    for (const child of childNodes(node)) {
      if (visit(child, nextDepth)) return true;
    }

    return false;
  };

  if (body.type === 'BlockStatement' && Array.isArray(body.body)) {
    return body.body.some((statement) => isNode(statement) && visit(statement, 0));
  }

  return visit(body, 0);
}

function invokedFunctionCallee(callee: AstNode): AstNode | null {
  if (isFunctionLike(callee)) return callee;
  if (callee.type !== 'MemberExpression') return null;

  const property = callee.property;
  const object = callee.object;
  const propertyName = isNode(property) ? identifierName(property) : undefined;
  if ((propertyName === 'call' || propertyName === 'apply') && isNode(object) && isFunctionLike(object)) {
    return object;
  }

  return null;
}

function containsIfStatement(
  node: AstNode,
  enterFunction = false,
  beforePosition = Number.POSITIVE_INFINITY,
  targetName?: string,
): boolean {
  const enteredHelpers = new Set<string>();
  const visit = (current: AstNode, allowFunctionBody = false, activePosition = beforePosition): boolean => {
    if (
      current !== node &&
      !allowFunctionBody &&
      typeof current.start === 'number' &&
      current.start > activePosition
    ) {
      return false;
    }
    if (current !== node && !allowFunctionBody && isFunctionLike(current)) return false;
    if (current.type === 'IfStatement' && current.start < activePosition) return true;
    if (current.type === 'CallExpression' && isNode(current.callee)) {
      const callee = current.callee;
      if (callee.type === 'Identifier') {
        const callName = identifierName(callee);
        if (callName && !enteredHelpers.has(callName)) {
          const helper = localFunctionDeclaration(node, callName, current.start);
          if (helper) {
            const helperPosition = targetName ? findRecursiveCallStart(helper, targetName) ?? activePosition : activePosition;
            enteredHelpers.add(callName);
            if (visit(helper, true, helperPosition)) return true;
            enteredHelpers.delete(callName);
          }
        }
      }
      const invokedFunction = invokedFunctionCallee(callee);
      if (invokedFunction) return visit(invokedFunction, true, activePosition);
    }
    return childNodes(current).some((child) => visit(child, false, activePosition));
  };

  return visit(node, enterFunction);
}

function containsIfInRecursivePath(node: AstNode, position: number): boolean {
  const visit = (current: AstNode): boolean => {
    if (current.type === 'IfStatement' && current.start < position) return true;
    if (
      current !== node &&
      typeof current.start === 'number' &&
      typeof current.end === 'number' &&
      (current.start > position || current.end < position)
    ) {
      return false;
    }
    return childNodes(current).some((child) => visit(child));
  };

  return visit(node);
}

function identifierName(node: AstNode): string | undefined {
  const name = node.name;
  return typeof name === 'string' ? name : undefined;
}

function functionBodyStatements(root: AstNode): AstNode[] {
  const body = root.body;
  if (isNode(body) && body.type === 'BlockStatement' && Array.isArray(body.body)) {
    return body.body.filter(isNode);
  }
  if (root.type === 'BlockStatement' && Array.isArray(body)) return body.filter(isNode);
  if (Array.isArray(body)) return body.filter(isNode);
  return [];
}

function containsPosition(node: AstNode, position: number): boolean {
  return typeof node.start === 'number' && typeof node.end === 'number' && node.start <= position && position <= node.end;
}

function lexicalScopesAt(root: AstNode, position: number): AstNode[] {
  const scopes: AstNode[] = [];
  const visit = (current: AstNode): void => {
    if (!containsPosition(current, position)) return;
    if (functionBodyStatements(current).length > 0) scopes.push(current);
    for (const child of childNodes(current)) visit(child);
  };

  visit(root);
  return scopes;
}

function localFunctionDeclaration(root: AstNode, name: string, callStart = Number.POSITIVE_INFINITY): AstNode | null {
  const scopes = lexicalScopesAt(root, callStart).reverse();

  for (const scope of scopes) {
    for (const statement of functionBodyStatements(scope)) {
      if (statement.type === 'FunctionDeclaration') {
        const id = statement.id;
        if (isNode(id) && id.type === 'Identifier' && identifierName(id) === name) return statement;
        continue;
      }

      if (statement.start > callStart) continue;

      const declarations = statement.type === 'VariableDeclaration' && Array.isArray(statement.declarations)
        ? statement.declarations
        : [];
      for (const declaration of declarations) {
        if (!isNode(declaration)) continue;
        if (isNode(declaration.id) && identifierName(declaration.id) === name) {
          const init = declaration.init;
          if (isNode(init) && isFunctionLike(init)) return init;
        }
      }
    }
  }

  return null;
}

function findRecursiveCallStart(node: AstNode, fnName: string): number | null {
  const enteredHelpers = new Set<string>();
  const visit = (current: AstNode, enterFunction = false): number | null => {
    if (current !== node && !enterFunction && isFunctionLike(current)) {
      return null;
    }

    if (current.type === 'CallExpression') {
      const callee = current.callee;
      if (isNode(callee) && callee.type === 'Identifier') {
        const callName = identifierName(callee);
        if (callName === fnName) {
          return current.start;
        }

        if (callName && !enteredHelpers.has(callName)) {
          const helper = localFunctionDeclaration(node, callName, current.start);
          if (helper) {
            enteredHelpers.add(callName);
            const found = visit(helper, true);
            enteredHelpers.delete(callName);
            if (found != null) return found;
          }
        }
      }

      if (isNode(callee)) {
        const invokedFunction = invokedFunctionCallee(callee);
        if (invokedFunction) {
          const found = visit(invokedFunction, true);
          if (found != null) return found;
        }
      }
    }

    for (const child of childNodes(current)) {
      const found = visit(child);
      if (found != null) return found;
    }

    return null;
  };

  return visit(node);
}

function hasReturnBefore(node: AstNode, position: number, enterFunction = false, targetName?: string): boolean {
  const enteredHelpers = new Set<string>();
  const visit = (current: AstNode, allowFunctionBody = false, activePosition = position): boolean => {
    if (
      current !== node &&
      !allowFunctionBody &&
      typeof current.start === 'number' &&
      current.start > activePosition
    ) {
      return false;
    }
    if (current !== node && !allowFunctionBody && isFunctionLike(current)) return false;
    if (current.type === 'ReturnStatement' && current.start < activePosition) return true;
    if (current.type === 'CallExpression' && isNode(current.callee)) {
      const callee = current.callee;
      if (callee.type === 'Identifier') {
        const callName = identifierName(callee);
        if (callName && !enteredHelpers.has(callName)) {
          const helper = localFunctionDeclaration(node, callName, current.start);
          if (helper) {
            const helperPosition = targetName ? findRecursiveCallStart(helper, targetName) ?? activePosition : activePosition;
            enteredHelpers.add(callName);
            if (visit(helper, true, helperPosition)) return true;
            enteredHelpers.delete(callName);
          }
        }
      }
      const invokedFunction = invokedFunctionCallee(callee);
      if (invokedFunction) return visit(invokedFunction, true, activePosition);
    }
    return childNodes(current).some((child) => visit(child, false, activePosition));
  };

  return visit(node, enterFunction);
}

function syntaxMaskedText(code: string): string {
  const chars = code.split('');
  for (const range of ignoredSyntaxRanges(code, false)) {
    for (let index = range.start; index < range.end && index < chars.length; index += 1) {
      chars[index] = ' ';
    }
  }
  return chars.join('');
}

function hasFallbackLoopExit(snippet: string): boolean {
  const firstOpen = snippet.indexOf('{');
  if (firstOpen < 0) return /\b(await|yield)\b/.test(snippet);

  const nestedScopeDepths: number[] = [];
  let pendingNestedScope = false;
  let conciseArrowDepth: number | null = null;
  let depth = 0;

  const startsKeyword = (keyword: string, index: number): boolean =>
    snippet.startsWith(keyword, index) && hasKeywordBoundary(snippet, keyword, index);

  for (let index = firstOpen; index < snippet.length; index += 1) {
    const char = snippet[index];

    if (char === '}') {
      if (nestedScopeDepths.at(-1) === depth) nestedScopeDepths.pop();
      if (conciseArrowDepth === depth) conciseArrowDepth = null;
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === '{') {
      depth += 1;
      if (pendingNestedScope && depth > 1) nestedScopeDepths.push(depth);
      pendingNestedScope = false;
      continue;
    }

    if (depth <= 0) continue;

    if (char === ';' && conciseArrowDepth === depth) {
      conciseArrowDepth = null;
      continue;
    }

    if (snippet.startsWith('=>', index)) {
      const next = snippet.slice(index + 2).trimStart()[0];
      if (next === '{') {
        pendingNestedScope = true;
      } else {
        conciseArrowDepth = depth;
      }
      index += 1;
      continue;
    }

    let consumedNestedKeyword = false;
    for (const keyword of ['function', 'class', 'while', 'for', 'switch']) {
      if (startsKeyword(keyword, index)) {
        pendingNestedScope = true;
        index += keyword.length - 1;
        consumedNestedKeyword = true;
        break;
      }
    }
    if (consumedNestedKeyword) continue;

    if (nestedScopeDepths.length > 0 || conciseArrowDepth != null) continue;

    for (const keyword of ['break', 'return', 'throw', 'await', 'yield']) {
      if (startsKeyword(keyword, index)) return true;
    }
  }

  return false;
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fallbackRecursionFindings(code: string): EvaluationFinding[] {
  const masked = syntaxMaskedText(code.replace(/^```[^\n]*$/gm, ''));
  const findings: EvaluationFinding[] = [];

  for (const match of masked.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    const fnName = match[1];
    const start = match.index ?? 0;
    if (!fnName) continue;
    const snippet = trimToBalancedSnippet(masked.slice(start));
    const selfCall = new RegExp(`\\b${escapeRegExpLiteral(fnName)}\\s*\\(`).exec(snippet.slice(match[0].length));
    if (!selfCall) continue;
    const beforeCall = snippet.slice(0, match[0].length + selfCall.index);
    if (/\b(if|return|throw)\b/.test(beforeCall)) continue;
    findings.push({
      message: `Potential unguarded recursion detected: "${fnName}" calls itself without a visible base case`,
      severity: 'critical',
      suggestion: `Add a base case (if/return) before the recursive call to "${fnName}"`,
    });
    break;
  }

  return findings;
}

function dedupeFindings(findings: EvaluationFinding[]): EvaluationFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.severity}\0${finding.message}\0${finding.suggestion ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackInfiniteLoopFindings(code: string): EvaluationFinding[] {
  const withoutFenceDelimiters = code.replace(/^```[^\n]*$/gm, '');
  const masked = syntaxMaskedText(withoutFenceDelimiters);
  const findings: EvaluationFinding[] = [];
  const loopHeaders = [/while\s*\(\s*true\s*\)/g, /for\s*\(\s*;\s*;\s*\)/g];

  for (const loopHeader of loopHeaders) {
    for (const match of masked.matchAll(loopHeader)) {
      const start = match.index ?? 0;
      const snippet = trimToBalancedSnippet(masked.slice(start));
      if (hasFallbackLoopExit(snippet)) continue;
      findings.push({
        message: 'Potential infinite loop detected: loop has no break or return statement',
        severity: 'critical',
        suggestion: 'Add a break condition or return statement inside the loop',
      });
      break;
    }
  }

  return findings;
}

export class LogicLoopEvaluator implements Evaluator {
  readonly name = 'logic-loop';
  readonly category = 'deterministic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];
    const fullSourceParses = parsesAsJavaScript(input.content);
    const asts = parseJavaScript(input.content);

    for (const ast of asts) {
      this.checkInfiniteLoops(ast, findings);
      this.checkUnguardedRecursion(ast, findings);
    }

    if (!fullSourceParses && !findings.some((finding) => finding.message.includes('infinite loop'))) {
      findings.push(...fallbackInfiniteLoopFindings(input.content));
    }
    if (!fullSourceParses && !findings.some((finding) => finding.message.includes('recursion'))) {
      findings.push(...fallbackRecursionFindings(input.content));
    }

    const uniqueFindings = dedupeFindings(findings);
    const score = uniqueFindings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: uniqueFindings.length === 0 ? 'pass' : 'fail',
      score,
      findings: uniqueFindings,
    };
  }

  private checkInfiniteLoops(ast: AstNode, findings: EvaluationFinding[]): void {
    const visit = (node: AstNode): void => {
      if ((isInfiniteWhile(node) || isInfiniteFor(node)) && isNode(node.body) && !hasLoopExit(node.body)) {
        findings.push({
          message: 'Potential infinite loop detected: loop has no break or return statement',
          severity: 'critical',
          suggestion: 'Add a break condition or return statement inside the loop',
        });
      }

      for (const child of childNodes(node)) visit(child);
    };

    visit(ast);
  }

  private checkUnguardedRecursion(ast: AstNode, findings: EvaluationFinding[]): void {
    const visit = (node: AstNode): void => {
      const namedFunction =
        (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && isNode(node.id)
          ? node.id
          : null;

      if (namedFunction?.type === 'Identifier') {
        const fnName = identifierName(namedFunction);
        if (fnName) {
          const recursiveCallStart = findRecursiveCallStart(node, fnName);
          if (recursiveCallStart != null) {
            const hasGuard =
              containsIfStatement(node, false, recursiveCallStart, fnName) ||
              containsIfInRecursivePath(node, recursiveCallStart) ||
              hasReturnBefore(node, recursiveCallStart, false, fnName);
            if (!hasGuard) {
              findings.push({
                message: `Potential unguarded recursion detected: "${fnName}" calls itself without a visible base case`,
                severity: 'critical',
                suggestion: `Add a base case (if/return) before the recursive call to "${fnName}"`,
              });
            }
          }
        }
      }

      for (const child of childNodes(node)) visit(child);
    };

    visit(ast);
  }
}
