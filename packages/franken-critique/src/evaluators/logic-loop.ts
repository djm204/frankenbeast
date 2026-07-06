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

const TypeScriptParser = Parser.extend(tsPlugin() as unknown as AcornPlugin);

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

function parseJavaScript(code: string): AstNode | null {
  const baseOptions = {
    ecmaVersion: 'latest' as const,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowHashBang: true,
  };

  for (const candidate of [code, `${code}\n}`, `${code}\n}}`, `${code}\n}}}`]) {
    for (const sourceType of ['module', 'script'] as const) {
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
        // Try the next source type or the next simple truncation repair.
      }
    }
  }

  return null;
}

function isFunctionLike(node: AstNode): boolean {
  return FUNCTION_NODE_TYPES.has(node.type);
}

function isClassLike(node: AstNode): boolean {
  return node.type === 'ClassDeclaration' || node.type === 'ClassExpression';
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
    if (isFunctionLike(node) || isClassLike(node)) return false;

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

function containsIfStatement(node: AstNode): boolean {
  const visit = (current: AstNode): boolean => {
    if (current !== node && (isFunctionLike(current) || isClassLike(current))) return false;
    if (current.type === 'IfStatement') return true;
    return childNodes(current).some(visit);
  };

  return visit(node);
}

function identifierName(node: AstNode): string | undefined {
  const name = node.name;
  return typeof name === 'string' ? name : undefined;
}

function findRecursiveCallStart(node: AstNode, fnName: string): number | null {
  const visit = (current: AstNode, enterFunction = false): number | null => {
    if (current !== node && !enterFunction && (isFunctionLike(current) || isClassLike(current))) {
      return null;
    }

    if (current.type === 'CallExpression') {
      const callee = current.callee;
      if (isNode(callee) && callee.type === 'Identifier' && identifierName(callee) === fnName) {
        return current.start;
      }

      if (isNode(callee) && isFunctionLike(callee)) {
        const found = visit(callee, true);
        if (found != null) return found;
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

function hasReturnBefore(node: AstNode, position: number): boolean {
  const visit = (current: AstNode): boolean => {
    if (current !== node && (isFunctionLike(current) || isClassLike(current))) return false;
    if (current.type === 'ReturnStatement' && current.start < position) return true;
    return childNodes(current).some(visit);
  };

  return visit(node);
}

export class LogicLoopEvaluator implements Evaluator {
  readonly name = 'logic-loop';
  readonly category = 'deterministic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const findings: EvaluationFinding[] = [];
    const ast = parseJavaScript(input.content);

    if (ast) {
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
      if (node.type === 'FunctionDeclaration') {
        const id = node.id;
        const fnName = isNode(id) && id.type === 'Identifier' ? identifierName(id) : undefined;

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
