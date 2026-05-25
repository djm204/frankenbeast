import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';

const MAX_SAFETY_PATTERN_LENGTH = 1_000;
const MAX_ALTERNATIVE_PREFIX_TOKENS = 32;

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
        if (previousToken === 'group' && quantifier.repeatsGroup) {
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
    ).map((alternative) => this.expandSimpleAlternativePrefix(alternative));
    if (alternatives.length < 2) return false;

    return alternatives.some((left, leftIndex) =>
      alternatives.some(
        (right, rightIndex) =>
          leftIndex !== rightIndex &&
          left.length > 0 &&
          right.length > 0 &&
          this.tokenPrefixOverlaps(left, right),
      ),
    );
  }

  private expandSimpleAlternativePrefix(alternative: string): string[] {
    const tokens: string[] = [];

    for (let i = 0; i < alternative.length; i += 1) {
      if (alternative[i] === '(') {
        const close = this.findClosingGroup(alternative, i);
        if (close === -1) break;
        const groupedPrefixes = this.splitTopLevelAlternatives(
          this.stripGroupPrefix(alternative.slice(i + 1, close)),
        )
          .map((nestedAlternative) =>
            this.expandSimpleAlternativePrefix(nestedAlternative),
          )
          .filter((prefix) => prefix.length > 0);
        if (groupedPrefixes.length > 0) {
          tokens.push(
            `ALT:${groupedPrefixes
              .map((prefix) => prefix[0])
              .filter((token) => token !== undefined)
              .join(',')}`,
          );
        }
        if (tokens.length >= MAX_ALTERNATIVE_PREFIX_TOKENS) break;
        i = close;
        continue;
      }

      const token = this.regexAtomTokenAt(alternative, i);
      if (token === null) break;

      for (
        let count = 0;
        count < token.repeatCount && tokens.length < MAX_ALTERNATIVE_PREFIX_TOKENS;
        count += 1
      ) {
        tokens.push(token.value);
      }
      if (tokens.length >= MAX_ALTERNATIVE_PREFIX_TOKENS) break;
      i = token.end;
    }

    return tokens;
  }

  private findClosingGroup(pattern: string, start: number): number {
    let depth = 0;
    for (let i = start; i < pattern.length; i += 1) {
      const char = pattern[i];
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '[') {
        i = this.skipCharacterClass(pattern, i);
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private regexAtomTokenAt(
    pattern: string,
    start: number,
  ): { value: string; end: number; repeatCount: number } | null {
    const char = pattern[start];
    if (char === undefined || char === '^' || char === '$' || char === '|') {
      return null;
    }

    let value: string;
    let end = start;

    if (char === '[') {
      end = this.skipCharacterClass(pattern, start);
      value = this.characterClassToken(pattern.slice(start, end + 1));
    } else if (char === '\\') {
      const escaped = pattern[start + 1];
      if (escaped === undefined) return null;
      if (
        escaped === 'x' &&
        /^[0-9A-Fa-f]{2}$/.test(pattern.slice(start + 2, start + 4))
      ) {
        end = start + 3;
        value = String.fromCharCode(
          Number.parseInt(pattern.slice(start + 2, start + 4), 16),
        );
      } else if (
        escaped === 'u' &&
        /^[0-9A-Fa-f]{4}$/.test(pattern.slice(start + 2, start + 6))
      ) {
        end = start + 5;
        value = String.fromCharCode(
          Number.parseInt(pattern.slice(start + 2, start + 6), 16),
        );
      } else {
        end = start + 1;
        value = this.escapedAtomToken(escaped);
      }
    } else if (char === '(') {
      return null;
    } else if (char === '.') {
      value = 'ANY';
    } else {
      value = char;
    }

    const quantifier = this.quantifierAt(pattern, end + 1);
    const repeatCount = quantifier?.fixedCount ?? 1;
    if (quantifier?.fixedCount !== undefined) {
      end = quantifier.end;
    }

    return { value, end, repeatCount };
  }

  private escapedAtomToken(escaped: string): string {
    if (escaped === 'd') return 'DIGIT';
    if (escaped === 'w') return 'WORD';
    if (escaped === 's') return 'SPACE';
    if (escaped === 'D') return 'NOT_DIGIT';
    if (escaped === 'W') return 'NOT_WORD';
    if (escaped === 'S') return 'NOT_SPACE';
    if (escaped === 'x') return '\\x';
    return escaped;
  }

  private characterClassToken(characterClass: string): string {
    if (characterClass === '[0-9]' || characterClass === '[\\d]') return 'DIGIT';
    if (characterClass === '[A-Za-z0-9_]' || characterClass === '[\\w]') {
      return 'WORD';
    }

    const singleton = characterClass.match(/^\[([^\\\]^-])\]$/);
    if (singleton) return singleton[1]!;

    const hexSingleton = characterClass.match(/^\[\\x([0-9A-Fa-f]{2})\]$/);
    if (hexSingleton) {
      return String.fromCharCode(Number.parseInt(hexSingleton[1]!, 16));
    }

    const unicodeSingleton = characterClass.match(/^\[\\u([0-9A-Fa-f]{4})\]$/);
    if (unicodeSingleton) {
      return String.fromCharCode(Number.parseInt(unicodeSingleton[1]!, 16));
    }

    const range = characterClass.match(/^\[([^\\\]])-([^\\\]])\]$/);
    if (range) return `RANGE:${range[1]!}-${range[2]!}`;

    return `CLASS:${characterClass}`;
  }

  private tokenPrefixOverlaps(left: string[], right: string[]): boolean {
    const limit = Math.min(left.length, right.length);
    for (let i = 0; i < limit; i += 1) {
      if (!this.regexTokensOverlap(left[i]!, right[i]!)) return false;
    }
    return true;
  }

  private regexTokensOverlap(left: string, right: string): boolean {
    if (left === right) return true;
    if (left === 'ANY' || right === 'ANY') return true;
    if (left.startsWith('ALT:')) return this.altTokenOverlaps(left, right);
    if (right.startsWith('ALT:')) return this.altTokenOverlaps(right, left);
    if (left === 'WORD') return this.wordTokenOverlaps(right);
    if (right === 'WORD') return this.wordTokenOverlaps(left);
    if (left === 'DIGIT') return this.digitTokenOverlaps(right);
    if (right === 'DIGIT') return this.digitTokenOverlaps(left);
    if (left === 'NOT_DIGIT') return !this.digitTokenOverlaps(right);
    if (right === 'NOT_DIGIT') return !this.digitTokenOverlaps(left);
    if (left === 'NOT_WORD') return !this.wordTokenOverlaps(right);
    if (right === 'NOT_WORD') return !this.wordTokenOverlaps(left);
    if (left === 'NOT_SPACE') return right !== 'SPACE';
    if (right === 'NOT_SPACE') return left !== 'SPACE';
    if (left.startsWith('RANGE:')) return this.rangeTokenOverlaps(left, right);
    if (right.startsWith('RANGE:')) return this.rangeTokenOverlaps(right, left);
    if (left.startsWith('CLASS:')) return this.classTokenOverlaps(left, right);
    if (right.startsWith('CLASS:')) return this.classTokenOverlaps(right, left);
    return false;
  }

  private altTokenOverlaps(altToken: string, token: string): boolean {
    return altToken
      .slice('ALT:'.length)
      .split(',')
      .some((alternativeToken) =>
        alternativeToken.length > 0
          ? this.regexTokensOverlap(alternativeToken, token)
          : false,
      );
  }

  private wordTokenOverlaps(token: string): boolean {
    return /^[A-Za-z0-9_]$/.test(token) || token === 'DIGIT';
  }

  private digitTokenOverlaps(token: string): boolean {
    return /^\d$/.test(token) || token === 'WORD';
  }

  private rangeTokenOverlaps(rangeToken: string, token: string): boolean {
    const [, start, end] = rangeToken.match(/^RANGE:(.)-(.)$/) ?? [];
    if (start === undefined || end === undefined) return false;
    if (token.length === 1) return token >= start && token <= end;
    if (token === 'WORD') return this.rangeContainsWordCharacter(start, end);
    if (token === 'DIGIT') return start <= '9' && end >= '0';
    if (token.startsWith('RANGE:')) {
      const [, otherStart, otherEnd] = token.match(/^RANGE:(.)-(.)$/) ?? [];
      return otherStart !== undefined && otherEnd !== undefined
        ? start <= otherEnd && otherStart <= end
        : false;
    }
    if (token.startsWith('CLASS:')) return this.classTokenOverlaps(token, rangeToken);
    return false;
  }

  private classTokenOverlaps(classToken: string, token: string): boolean {
    const characterClass = classToken.slice('CLASS:'.length);
    const body = characterClass.slice(1, -1);
    if (body.startsWith('^')) return true;

    for (let i = 0; i < body.length; i += 1) {
      const char = body[i]!;
      if (char === '\\') {
        const escaped = body[i + 1];
        if (escaped === undefined) continue;
        const escapedToken = this.escapedAtomToken(escaped);
        if (this.regexTokensOverlap(escapedToken, token)) return true;
        i += 1;
        continue;
      }

      if (body[i + 1] === '-' && body[i + 2] !== undefined) {
        if (this.rangeTokenOverlaps(`RANGE:${char}-${body[i + 2]!}`, token)) {
          return true;
        }
        i += 2;
        continue;
      }

      if (this.regexTokensOverlap(char, token)) return true;
    }

    return false;
  }

  private rangeContainsWordCharacter(start: string, end: string): boolean {
    return (
      (start <= 'z' && end >= 'a') ||
      (start <= 'Z' && end >= 'A') ||
      (start <= '9' && end >= '0') ||
      (start <= '_' && end >= '_')
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

    const inlineModifier = groupContent.match(/^\?([A-Za-z-]+):/);
    if (inlineModifier) {
      const content = groupContent.slice(inlineModifier[0].length);
      return inlineModifier[1]?.includes('i') ? content.toLowerCase() : content;
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
  ): {
    end: number;
    variable: boolean;
    repeatsGroup: boolean;
    fixedCount?: number;
  } | null {
    const char = pattern[start];
    if (char === '+' || char === '*') {
      return { end: start, variable: true, repeatsGroup: true };
    }
    if (char === '?') {
      return { end: start, variable: true, repeatsGroup: false };
    }
    if (char !== '{') return null;

    const close = pattern.indexOf('}', start + 1);
    if (close === -1) return null;

    const body = pattern.slice(start + 1, close);
    const match = body.match(/^(\d+)(?:,(\d*)?)?$/);
    if (!match) return null;

    const min = Number(match[1]!);
    const hasComma = body.includes(',');
    const max = !hasComma
      ? min
      : match[2] === undefined || match[2] === ''
        ? Infinity
        : Number(match[2]);
    const variable = min !== max;
    const repeatsGroup = variable && max > 1;

    if (variable) {
      return { end: close, variable, repeatsGroup };
    }

    return { end: close, variable, repeatsGroup: min > 1, fixedCount: min };
  }
}
