import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';

const MAX_SAFETY_PATTERN_LENGTH = 1_000;

interface RegexGroupState {
  startIndex: number;
  containsQuantifiedAtom: boolean;
  containsAmbiguousAlternation: boolean;
}

export class SafetyEvaluator implements Evaluator {
  readonly name = 'safety';
  readonly category = 'deterministic' as const;

  private readonly guardrails: GuardrailsPort;

  constructor(guardrails: GuardrailsPort) {
    this.guardrails = guardrails;
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const rules = await this.guardrails.getSafetyRules();
    const findings: EvaluationFinding[] = [];
    let hasBlock = false;

    for (const rule of rules) {
      const validationFinding = this.validateRulePattern(rule);
      if (validationFinding) {
        if (validationFinding.severity === 'critical') hasBlock = true;
        findings.push(validationFinding);
        continue;
      }

      const regex = new RegExp(rule.pattern, 'g');
      if (regex.test(input.content)) {
        const isBlock = rule.severity === 'block';
        if (isBlock) hasBlock = true;

        findings.push({
          message: `Safety rule violated: ${rule.description}`,
          severity: isBlock ? 'critical' : 'warning',
          suggestion: 'Remove or refactor code matching this safety rule.',
        });
      }
    }

    const warningCount = findings.filter(
      (f) => f.severity === 'warning',
    ).length;
    const score = hasBlock
      ? 0
      : warningCount > 0
        ? Math.max(0, 1 - warningCount * 0.2)
        : 1;

    return {
      evaluatorName: this.name,
      verdict: hasBlock ? 'fail' : 'pass',
      score,
      findings,
    };
  }

  private validateRulePattern(rule: {
    pattern: string;
    description: string;
    severity: 'block' | 'warn';
  }): EvaluationFinding | null {
    const severity = rule.severity === 'block' ? 'critical' : 'warning';

    if (rule.pattern.length > MAX_SAFETY_PATTERN_LENGTH) {
      return {
        message: `Unsafe safety rule regex: ${rule.description}`,
        severity,
        suggestion: `Shorten safety rule pattern below ${MAX_SAFETY_PATTERN_LENGTH} characters before enabling this rule.`,
      };
    }

    if (this.hasUnsafeRegexShape(rule.pattern)) {
      return {
        message: `Unsafe safety rule regex: ${rule.description}`,
        severity,
        suggestion:
          'Replace nested or ambiguous quantifiers before enabling this rule.',
      };
    }

    try {
      new RegExp(rule.pattern, 'g');
    } catch {
      return {
        message: `Invalid safety rule regex: ${rule.description}`,
        severity,
        suggestion: 'Fix or remove invalid pattern before enabling this rule.',
      };
    }

    return null;
  }

  private hasUnsafeRegexShape(pattern: string): boolean {
    return this.hasNestedQuantifiedExpression(pattern);
  }

  private hasNestedQuantifiedExpression(pattern: string): boolean {
    const stack: RegexGroupState[] = [
      {
        startIndex: -1,
        containsQuantifiedAtom: false,
        containsAmbiguousAlternation: false,
      },
    ];
    const groupHistory: RegexGroupState[] = [];
    let previousToken: 'atom' | 'group' | 'none' = 'none';

    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;

      if (char === '\\') {
        i += 1;
        previousToken = 'atom';
        continue;
      }

      if (char === '[') {
        i = this.skipCharacterClass(pattern, i);
        previousToken = 'atom';
        continue;
      }

      if (char === '(') {
        stack.push({
          startIndex: i,
          containsQuantifiedAtom: false,
          containsAmbiguousAlternation: false,
        });
        if (pattern[i + 1] === '?') {
          i += 1;
        }
        previousToken = 'none';
        continue;
      }

      if (char === ')' && stack.length > 1) {
        const group = stack.pop()!;
        if (
          this.hasOverlappingAlternation(pattern.slice(group.startIndex + 1, i))
        ) {
          group.containsAmbiguousAlternation = true;
        }
        if (group.containsQuantifiedAtom) {
          stack.at(-1)!.containsQuantifiedAtom = true;
        }
        if (group.containsAmbiguousAlternation) {
          stack.at(-1)!.containsAmbiguousAlternation = true;
        }
        groupHistory.push(group);
        previousToken = 'group';
        continue;
      }

      const quantifier = this.quantifierAt(pattern, i);
      if (quantifier !== null) {
        if (previousToken === 'group' && quantifier.variable) {
          const quantifiedGroup = groupHistory.at(-1);
          if (
            quantifiedGroup?.containsQuantifiedAtom ||
            quantifiedGroup?.containsAmbiguousAlternation
          ) {
            return true;
          }
        }

        if (quantifier.variable) {
          stack.at(-1)!.containsQuantifiedAtom = true;
        }
        i = quantifier.end;
        previousToken = 'none';
        continue;
      }

      if (char !== '^' && char !== '$' && char !== '|') {
        previousToken = 'atom';
      } else {
        previousToken = 'none';
      }
    }

    return false;
  }

  private hasOverlappingAlternation(groupContent: string): boolean {
    const alternatives = this.splitTopLevelAlternatives(
      this.stripGroupPrefix(groupContent),
    );
    if (alternatives.length < 2) return false;

    return alternatives.some((left, leftIndex) =>
      alternatives.some(
        (right, rightIndex) =>
          leftIndex !== rightIndex &&
          left.length > 0 &&
          right.length > 0 &&
          (left.startsWith(right) || right.startsWith(left)),
      ),
    );
  }

  private stripGroupPrefix(groupContent: string): string {
    if (groupContent.startsWith('?:')) return groupContent.slice(2);
    if (groupContent.startsWith('?=') || groupContent.startsWith('?!')) {
      return groupContent.slice(2);
    }
    if (groupContent.startsWith('?<=') || groupContent.startsWith('?<!')) {
      return groupContent.slice(3);
    }

    const namedCapture = groupContent.match(/^\?<[^>]+>/);
    if (namedCapture) return groupContent.slice(namedCapture[0].length);

    return groupContent;
  }

  private splitTopLevelAlternatives(groupContent: string): string[] {
    const alternatives: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < groupContent.length; i += 1) {
      const char = groupContent[i]!;

      if (char === '\\') {
        current += groupContent.slice(i, i + 2);
        i += 1;
        continue;
      }

      if (char === '[') {
        const end = this.skipCharacterClass(groupContent, i);
        current += groupContent.slice(i, end + 1);
        i = end;
        continue;
      }

      if (char === '(') {
        depth += 1;
      } else if (char === ')' && depth > 0) {
        depth -= 1;
      }

      if (char === '|' && depth === 0) {
        alternatives.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    alternatives.push(current);
    return alternatives;
  }

  private skipCharacterClass(pattern: string, start: number): number {
    for (let i = start + 1; i < pattern.length; i += 1) {
      if (pattern[i] === '\\') {
        i += 1;
        continue;
      }
      if (pattern[i] === ']') return i;
    }
    return pattern.length - 1;
  }

  private quantifierAt(
    pattern: string,
    start: number,
  ): { end: number; variable: boolean } | null {
    const char = pattern[start];
    if (char === '+' || char === '*' || char === '?') {
      return { end: start, variable: true };
    }
    if (char !== '{') return null;

    const close = pattern.indexOf('}', start + 1);
    if (close === -1) return null;

    const body = pattern.slice(start + 1, close);
    const match = body.match(/^(\d+)(?:,(\d*)?)?$/);
    if (!match) return null;

    return { end: close, variable: body.includes(',') };
  }
}
