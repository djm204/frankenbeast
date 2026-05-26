import { Worker } from 'node:worker_threads';
import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';

const MAX_SAFETY_PATTERN_LENGTH = 1_000;
const REGEX_TEST_TIMEOUT_MS = 500;

interface SafetyRuleLike {
  readonly pattern: string;
  readonly description: string;
  readonly severity: 'block' | 'warn';
}

type RegexTestResult =
  | { readonly kind: 'match'; readonly matched: boolean }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'error' };

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

      const testResult = await this.testRulePattern(
        rule.pattern,
        input.content,
      );
      if (testResult.kind === 'timeout' || testResult.kind === 'error') {
        const finding = this.createInvalidRuleFinding(
          rule,
          testResult.kind === 'timeout'
            ? 'Unsafe safety rule regex'
            : 'Invalid safety rule regex',
          testResult.kind === 'timeout'
            ? `Regex evaluation exceeded ${REGEX_TEST_TIMEOUT_MS}ms and was terminated.`
            : 'Fix or remove invalid pattern before enabling this rule.',
        );
        if (finding.severity === 'critical') hasBlock = true;
        findings.push(finding);
        continue;
      }

      if (testResult.matched) {
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
    return /\\(?:[1-9]|k<)/u.test(pattern);
  }

  private hasNestedQuantifier(pattern: string): boolean {
    const groupWithQuantifiedAtomThenOuterQuantifier =
      /\((?:\?:|\?<[A-Za-z][A-Za-z0-9_]*>)?[^)]*(?:[*+?]|\{\d+,?\d*\})[^)]*\)(?:[*+?]|\{\d+,?\d*\})/u;
    return groupWithQuantifiedAtomThenOuterQuantifier.test(pattern);
  }

  private testRulePattern(
    pattern: string,
    content: string,
  ): Promise<RegexTestResult> {
    return new Promise((resolve) => {
      const worker = new Worker(
        `
          const { parentPort, workerData } = require('node:worker_threads');
          try {
            const regex = new RegExp(workerData.pattern, 'g');
            parentPort.postMessage({ kind: 'match', matched: regex.test(workerData.content) });
          } catch {
            parentPort.postMessage({ kind: 'error' });
          }
        `,
        { eval: true, workerData: { pattern, content } },
      );
      let settled = false;
      const finish = (result: RegexTestResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        resolve(result);
      };
      const timeout = setTimeout(
        () => finish({ kind: 'timeout' }),
        REGEX_TEST_TIMEOUT_MS,
      );

      worker.once('message', (message: RegexTestResult) => finish(message));
      worker.once('error', () => finish({ kind: 'error' }));
    });
  }
}
