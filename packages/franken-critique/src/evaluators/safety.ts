import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';

const MAX_SAFETY_PATTERN_LENGTH = 1_000;

interface SafetyRuleLike {
  readonly pattern: string;
  readonly description: string;
  readonly severity: 'block' | 'warn';
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
          suggestion: `Remove or refactor code matching pattern: ${rule.pattern}`,
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

  private validateRulePattern(rule: SafetyRuleLike): EvaluationFinding | null {
    if (rule.pattern.length > MAX_SAFETY_PATTERN_LENGTH) {
      return this.createInvalidRuleFinding(
        rule,
        'Unsafe safety rule regex',
        `Shorten safety rule pattern below ${MAX_SAFETY_PATTERN_LENGTH} characters before enabling this rule.`,
      );
    }

    if (this.hasUnsafeRegexShape(rule.pattern)) {
      return this.createInvalidRuleFinding(
        rule,
        'Unsafe safety rule regex',
        'Replace nested quantifiers or backreferences before enabling this rule.',
      );
    }

    try {
      new RegExp(rule.pattern, 'g');
    } catch {
      return this.createInvalidRuleFinding(
        rule,
        'Invalid safety rule regex',
        'Fix or remove invalid pattern before enabling this rule.',
      );
    }

    return null;
  }

  private createInvalidRuleFinding(
    rule: SafetyRuleLike,
    prefix: string,
    suggestion: string,
  ): EvaluationFinding {
    return {
      message: `${prefix}: ${rule.description}`,
      severity: rule.severity === 'block' ? 'critical' : 'warning',
      suggestion,
    };
  }

  private hasUnsafeRegexShape(pattern: string): boolean {
    const normalized = this.removeEscapesAndCharacterClasses(pattern);
    return (
      this.hasBackreference(pattern) || this.hasNestedQuantifier(normalized)
    );
  }

  private removeEscapesAndCharacterClasses(pattern: string): string {
    let result = '';
    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '\\') {
        result += 'x';
        i += 1;
        continue;
      }
      if (char === '[') {
        result += 'x';
        while (i + 1 < pattern.length && pattern[i + 1] !== ']') i += 1;
        continue;
      }
      result += char;
    }
    return result;
  }

  private hasBackreference(pattern: string): boolean {
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i] !== '\\') continue;

      const runStart = i;
      while (i + 1 < pattern.length && pattern[i + 1] === '\\') i += 1;
      const slashCount = i - runStart + 1;
      const next = pattern[i + 1];

      if (slashCount % 2 === 1 && /[1-9]/u.test(next ?? '')) return true;
      if (slashCount % 2 === 1 && next === 'k' && pattern[i + 2] === '<') {
        return true;
      }
    }

    return false;
  }

  private hasNestedQuantifier(pattern: string): boolean {
    const patternWithoutGroupPrefixes = pattern.replace(
      /\(\?(?::|=|!|<(?!!|=)[A-Za-z][A-Za-z0-9_]*>)/gu,
      '(',
    );
    const groupWithQuantifiedAtomThenOuterQuantifier =
      /\((?:[^()\\]|\\.)*(?:[*+]|\{\d+,\d*\})(?:[^()\\]|\\.)*\)(?:[*+?]|\{\d+,?\d*\})/u;
    return groupWithQuantifiedAtomThenOuterQuantifier.test(
      patternWithoutGroupPrefixes,
    );
  }
}
