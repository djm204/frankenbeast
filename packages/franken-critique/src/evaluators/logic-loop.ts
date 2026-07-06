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

function isRegexLiteralStart(code: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(code[cursor]!)) cursor -= 1;
  if (cursor < 0) return true;

  return '([{=,:;!&|?+-*%^~<>'.includes(code[cursor]!);
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

    const char = code[index];
    const next = code[index + 1];

    if ((char === '\'' || char === '"') && !isIndexInRanges(ranges, index)) {
      const quote = char;
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
      continue;
    }

    if (char === '`' && !isIndexInRanges(ranges, index)) {
      const start = index;
      index += 1;
      while (index < code.length) {
        if (code[index] === '\\') {
          index += 2;
          continue;
        }
        if (code[index] === '`') {
          index += 1;
          break;
        }
        index += 1;
      }
      ranges.push({ start, end: index });
      continue;
    }

    if (char === '/' && next === '/') {
      const start = index;
      index = code.indexOf('\n', index + 2);
      if (index < 0) index = code.length;
      ranges.push({ start, end: index });
      continue;
    }

    if (char === '/' && next === '*') {
      const start = index;
      const end = code.indexOf('*/', index + 2);
      index = end < 0 ? code.length : end + 2;
      ranges.push({ start, end: index });
      continue;
    }

    if (char === '/' && isRegexLiteralStart(code, index)) {
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

function containsIfStatement(node: AstNode, enterFunction = false): boolean {
  const visit = (current: AstNode, allowFunctionBody = false): boolean => {
    if (current !== node && !allowFunctionBody && isFunctionLike(current)) return false;
    if (current.type === 'IfStatement') return true;
    if (current.type === 'CallExpression' && isNode(current.callee)) {
      const invokedFunction = invokedFunctionCallee(current.callee);
      if (invokedFunction) return visit(invokedFunction, true);
    }
    return childNodes(current).some((child) => visit(child));
  };

  return visit(node, enterFunction);
}

function identifierName(node: AstNode): string | undefined {
  const name = node.name;
  return typeof name === 'string' ? name : undefined;
}

function localFunctionDeclaration(root: AstNode, name: string): AstNode | null {
  const visit = (current: AstNode): AstNode | null => {
    if (current !== root && isFunctionLike(current)) {
      const id = current.id;
      if (isNode(id) && id.type === 'Identifier' && identifierName(id) === name) return current;
      return null;
    }

    for (const child of childNodes(current)) {
      const found = visit(child);
      if (found) return found;
    }

    return null;
  };

  return visit(root);
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
          const helper = localFunctionDeclaration(node, callName);
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

function hasReturnBefore(node: AstNode, position: number, enterFunction = false): boolean {
  const visit = (current: AstNode, allowFunctionBody = false): boolean => {
    if (current !== node && !allowFunctionBody && isFunctionLike(current)) return false;
    if (current.type === 'ReturnStatement' && current.start < position) return true;
    if (current.type === 'CallExpression' && isNode(current.callee)) {
      const invokedFunction = invokedFunctionCallee(current.callee);
      if (invokedFunction) return visit(invokedFunction, true);
    }
    return childNodes(current).some((child) => visit(child));
  };

  return visit(node, enterFunction);
}

function syntaxMaskedText(code: string): string {
  const chars = [...code];
  for (const range of ignoredSyntaxRanges(code, true)) {
    for (let index = range.start; index < range.end && index < chars.length; index += 1) {
      chars[index] = ' ';
    }
  }
  return chars.join('');
}

function fallbackInfiniteLoopFindings(code: string): EvaluationFinding[] {
  const masked = syntaxMaskedText(code);
  const findings: EvaluationFinding[] = [];
  const loopHeaders = [/while\s*\(\s*true\s*\)/g, /for\s*\(\s*;\s*;\s*\)/g];

  for (const loopHeader of loopHeaders) {
    for (const match of masked.matchAll(loopHeader)) {
      const start = match.index ?? 0;
      const snippet = trimToBalancedSnippet(masked.slice(start));
      if (/\b(break|return|throw|await|yield)\b/.test(snippet)) continue;
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
    const asts = parseJavaScript(input.content);

    for (const ast of asts) {
      this.checkInfiniteLoops(ast, findings);
      this.checkUnguardedRecursion(ast, findings);
    }

    if (asts.length === 0) {
      findings.push(...fallbackInfiniteLoopFindings(input.content));
    }

    const score = findings.length === 0 ? 1 : 0;

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
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
            const hasGuard = containsIfStatement(node) || hasReturnBefore(node, recursiveCallStart);
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
