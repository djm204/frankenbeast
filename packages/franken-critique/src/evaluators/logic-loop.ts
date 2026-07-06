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

function isInsideComment(code: string, index: number): boolean {
  const lineStart = code.lastIndexOf('\n', index - 1) + 1;
  if (code.slice(lineStart, index).includes('//')) return true;

  const lastBlockStart = code.lastIndexOf('/*', index);
  const lastBlockEnd = code.lastIndexOf('*/', index);
  return lastBlockStart > lastBlockEnd;
}

function trimToBalancedSnippet(candidate: string): string {
  const firstOpen = candidate.indexOf('{');
  if (firstOpen < 0) return candidate;

  let depth = 0;
  for (let index = firstOpen; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(0, index + 1);
    }
  }

  return candidate;
}

function codeCandidates(code: string): string[] {
  const fencedBlocks = Array.from(code.matchAll(/```(?:[\w-]+)?\s*\n([\s\S]*?)```/g), (match) => match[1]).filter(
    (block): block is string => typeof block === 'string' && block.trim().length > 0,
  );
  const candidates = fencedBlocks.length > 0 ? [...fencedBlocks, code] : [code];

  for (const keyword of ['while', 'for', 'function', 'async function', 'class']) {
    let index = code.indexOf(keyword);
    while (index >= 0) {
      if (!isInsideComment(code, index)) {
        const snippet = code.slice(index);
        candidates.push(snippet, trimToBalancedSnippet(snippet));
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

  if (!code.includes('```')) {
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

function findRecursiveCallStart(node: AstNode, fnName: string): number | null {
  const visit = (current: AstNode, enterFunction = false): number | null => {
    if (current !== node && !enterFunction && isFunctionLike(current)) {
      return null;
    }

    if (current.type === 'CallExpression') {
      const callee = current.callee;
      if (isNode(callee) && callee.type === 'Identifier' && identifierName(callee) === fnName) {
        return current.start;
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
