import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';
import type { GuardrailsPort } from '../types/contracts.js';

const MAX_SAFETY_PATTERN_LENGTH = 1_000;
const MAX_ALTERNATIVE_PREFIX_TOKENS = MAX_SAFETY_PATTERN_LENGTH;
const EMPTY_ALTERNATIVE_TOKEN = 'EMPTY_ALTERNATIVE';

interface RegexGroupState {
  startIndex: number;
  containsQuantifiedAtom: boolean;
  containsAmbiguousAlternation: boolean;
}

interface RegexPrefixExpansion {
  tokens: string[];
  truncated: boolean;
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
    return (
      this.hasBackreference(pattern) ||
      this.hasNestedQuantifiedExpression(pattern) ||
      (this.hasEnabledInlineModifier(pattern, 's') &&
        this.hasNestedQuantifiedExpression(this.expandDotAllLiterals(pattern)))
    );
  }

  private hasBackreference(pattern: string): boolean {
    const { captureCount, namedGroups } = this.collectCapturingGroups(pattern);

    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '[') {
        i = this.skipCharacterClass(pattern, i);
        continue;
      }
      if (char === '\\') {
        const numeric = pattern.slice(i + 1).match(/^[1-9]\d*/);
        if (numeric && Number(numeric[0]) <= captureCount) return true;
        const named = pattern.slice(i + 1).match(/^k<([^>]+)>/);
        if (named && namedGroups.has(named[1]!)) return true;
        i += 1;
      }
    }

    return false;
  }

  private collectCapturingGroups(pattern: string): {
    captureCount: number;
    namedGroups: Set<string>;
  } {
    const namedGroups = new Set<string>();
    let captureCount = 0;

    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '[') {
        i = this.skipCharacterClass(pattern, i);
        continue;
      }
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '(' && this.isCapturingGroup(pattern, i)) {
        captureCount += 1;
        const named = pattern.slice(i).match(/^\(\?<([^>]+)>/);
        if (named) namedGroups.add(named[1]!);
      }
    }

    return { captureCount, namedGroups };
  }

  private isCapturingGroup(pattern: string, start: number): boolean {
    if (pattern[start + 1] !== '?') return true;
    return (
      pattern[start + 2] === '<' &&
      pattern[start + 3] !== '=' &&
      pattern[start + 3] !== '!'
    );
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
          const groupContent = pattern.slice(group.startIndex + 1, i);
          if (
            !this.followingAtomDisambiguatesAlternation(
              groupContent,
              pattern,
              i + 1,
            )
          ) {
            stack.at(-1)!.containsAmbiguousAlternation = true;
          }
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
          this.tokenPrefixOverlaps(left, right),
      ),
    );
  }

  private hasDeterministicTopLevelAlternation(groupContent: string): boolean {
    const alternatives = this.splitTopLevelAlternatives(
      this.stripGroupPrefix(groupContent),
    );
    return alternatives.length > 1 && !this.hasOverlappingAlternation(groupContent);
  }

  private expandSimpleAlternativePrefix(
    alternative: string,
  ): RegexPrefixExpansion {
    const tokens: string[] = [];
    let truncated = false;

    for (let i = 0; i < alternative.length; i += 1) {
      if (alternative[i] === '(') {
        const close = this.findClosingGroup(alternative, i);
        if (close === -1) break;
        const groupedPrefixes = this.splitTopLevelAlternatives(
          this.stripGroupPrefix(alternative.slice(i + 1, close)),
        )
          .map((nestedAlternative) =>
            this.expandSimpleAlternativePrefix(nestedAlternative),
          );
        if (groupedPrefixes.length > 0) {
          truncated = truncated || groupedPrefixes.some((prefix) => prefix.truncated);
          if (groupedPrefixes.length === 1) {
            for (const token of groupedPrefixes[0]!.tokens) {
              if (tokens.length >= MAX_ALTERNATIVE_PREFIX_TOKENS) {
                truncated = true;
                break;
              }
              tokens.push(token);
            }
          } else {
            tokens.push(
              `ALT:${JSON.stringify(
                groupedPrefixes.map((prefix) =>
                  prefix.tokens.length > 0 ? prefix.tokens : [EMPTY_ALTERNATIVE_TOKEN],
                ),
              )}`,
            );
          }
        }
        if (tokens.length >= MAX_ALTERNATIVE_PREFIX_TOKENS) {
          truncated = true;
          break;
        }
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
      if (tokens.length >= MAX_ALTERNATIVE_PREFIX_TOKENS) {
        truncated = token.repeatCount > tokens.length || token.end < alternative.length - 1;
        break;
      }
      i = token.end;
    }

    return { tokens, truncated };
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

  private followingAtomDisambiguatesAlternation(
    groupContent: string,
    pattern: string,
    start: number,
  ): boolean {
    const followingToken = this.nextAtomTokenInCurrentAlternative(pattern, start);
    if (followingToken === null) return false;

    const alternatives = this.splitTopLevelAlternatives(
      this.stripGroupPrefix(groupContent),
    ).map((alternative) => {
      const expansion = this.expandSimpleAlternativePrefix(alternative);
      return {
        tokens: [...expansion.tokens, followingToken.value],
        truncated: expansion.truncated,
      };
    });

    return !alternatives.some((left, leftIndex) =>
      alternatives.some(
        (right, rightIndex) =>
          leftIndex !== rightIndex && this.tokenPrefixOverlaps(left, right),
      ),
    );
  }

  private nextAtomTokenInCurrentAlternative(
    pattern: string,
    start: number,
  ): { value: string } | null {
    let depth = 0;
    for (let i = start; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '\\') {
        const escaped = pattern[i + 1];
        if (escaped === 'b' || escaped === 'B') {
          i += 1;
          continue;
        }
      }
      if (char === '(' && depth === 0 && this.isZeroWidthAssertionGroup(pattern, i)) {
        const close = this.findClosingGroup(pattern, i);
        if (close === -1) return null;
        i = close;
        continue;
      }
      if (char === '(') {
        depth += 1;
        continue;
      }
      if (char === ')' && depth === 0) return null;
      if (char === '|' && depth === 0) return null;
      if (char === ')') {
        depth -= 1;
        continue;
      }
      if (depth === 0 && char !== '^' && char !== '$') {
        const token = this.regexAtomTokenAt(pattern, i);
        return token === null ? null : { value: token.value };
      }
    }
    return null;
  }

  private isZeroWidthAssertionGroup(pattern: string, start: number): boolean {
    return (
      pattern.startsWith('(?=', start) ||
      pattern.startsWith('(?!', start) ||
      pattern.startsWith('(?<=', start) ||
      pattern.startsWith('(?<!', start)
    );
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
      if (escaped === 'b' || escaped === 'B') return null;
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
      } else if (escaped === 'c' && /^[A-Za-z]$/.test(pattern[start + 2] ?? '')) {
        end = start + 2;
        value = String.fromCharCode(pattern.charCodeAt(start + 2) & 31);
      } else if (escaped === '0' && !/^\d$/.test(pattern[start + 2] ?? '')) {
        end = start + 1;
        value = '\0';
      } else {
        end = start + 1;
        value = this.escapedAtomToken(escaped);
      }
    } else if (char === '(') {
      return null;
    } else if (char === '.') {
      value = 'DOT';
    } else {
      value = char;
    }

    const quantifier = this.quantifierAt(pattern, end + 1);
    if (quantifier?.nullable) {
      value = `ALT:${JSON.stringify([[EMPTY_ALTERNATIVE_TOKEN], [value]])}`;
    }
    const repeatCount = quantifier?.fixedCount ?? 1;
    if (quantifier !== null) {
      end = quantifier.end;
    }

    return { value, end, repeatCount };
  }

  private escapedAtomToken(escaped: string): string {
    if (escaped === 'd') return 'DIGIT';
    if (escaped === 'w') return 'WORD';
    if (escaped === 's') return 'SPACE';
    if (escaped === 't') return '\t';
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 'f') return '\f';
    if (escaped === 'v') return '\v';
    if (escaped === 'D') return 'NOT_DIGIT';
    if (escaped === 'W') return 'NOT_WORD';
    if (escaped === 'S') return 'NOT_SPACE';
    if (escaped === 'x') return '\\x';
    return escaped;
  }

  private classEscapedTokenAt(
    body: string,
    start: number,
  ): { value: string; end: number } | null {
    const escaped = body[start + 1];
    if (escaped === undefined) return null;
    if (escaped === 'x' && /^[0-9A-Fa-f]{2}$/.test(body.slice(start + 2, start + 4))) {
      return {
        value: String.fromCharCode(Number.parseInt(body.slice(start + 2, start + 4), 16)),
        end: start + 3,
      };
    }
    if (escaped === 'u' && /^[0-9A-Fa-f]{4}$/.test(body.slice(start + 2, start + 6))) {
      return {
        value: String.fromCharCode(Number.parseInt(body.slice(start + 2, start + 6), 16)),
        end: start + 5,
      };
    }
    if (escaped === 'c' && /^[A-Za-z]$/.test(body[start + 2] ?? '')) {
      return { value: String.fromCharCode(body.charCodeAt(start + 2) & 31), end: start + 2 };
    }
    if (escaped === '0' && !/^\d$/.test(body[start + 2] ?? '')) {
      return { value: '\0', end: start + 1 };
    }
    if (escaped === 'b') return { value: '\b', end: start + 1 };
    if (escaped === 'B') return { value: 'NOT_BACKSPACE', end: start + 1 };
    return { value: this.escapedAtomToken(escaped), end: start + 1 };
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

  private tokenPrefixOverlaps(
    left: RegexPrefixExpansion,
    right: RegexPrefixExpansion,
  ): boolean {
    const limit = Math.min(left.tokens.length, right.tokens.length);
    for (let i = 0; i < limit; i += 1) {
      if (!this.regexTokensOverlap(left.tokens[i]!, right.tokens[i]!)) return false;
    }
    if (
      left.truncated &&
      right.truncated &&
      left.tokens.length === limit &&
      right.tokens.length === limit
    ) {
      return true;
    }
    return true;
  }

  private regexTokensOverlap(left: string, right: string): boolean {
    if (left === right) return true;
    if (left === 'DOT' || right === 'DOT') {
      return left === 'DOT'
        ? this.dotTokenOverlaps(right)
        : this.dotTokenOverlaps(left);
    }
    if (left.startsWith('ALT:')) return this.altTokenOverlaps(left, right);
    if (right.startsWith('ALT:')) return this.altTokenOverlaps(right, left);
    if (left.startsWith('NOT_')) return this.complementTokenOverlaps(left, right);
    if (right.startsWith('NOT_')) return this.complementTokenOverlaps(right, left);
    if (
      left === 'SPACE' ||
      right === 'SPACE'
    ) {
      return left === 'SPACE'
        ? this.spaceTokenOverlaps(right)
        : this.spaceTokenOverlaps(left);
    }
    if (left === 'WORD') return this.wordTokenOverlaps(right);
    if (right === 'WORD') return this.wordTokenOverlaps(left);
    if (left === 'DIGIT') return this.digitTokenOverlaps(right);
    if (right === 'DIGIT') return this.digitTokenOverlaps(left);
    if (left.startsWith('RANGE:')) return this.rangeTokenOverlaps(left, right);
    if (right.startsWith('RANGE:')) return this.rangeTokenOverlaps(right, left);
    if (left.startsWith('CLASS:')) return this.classTokenOverlaps(left, right);
    if (right.startsWith('CLASS:')) return this.classTokenOverlaps(right, left);
    return false;
  }

  private altTokenOverlaps(altToken: string, token: string): boolean {
    const alternatives = this.parseAltToken(altToken);
    const tokenAlternatives = token.startsWith('ALT:')
      ? this.parseAltToken(token)
      : [[token]];
    return alternatives.some((alternative) =>
      tokenAlternatives.some((tokenAlternative) =>
        alternative.includes(EMPTY_ALTERNATIVE_TOKEN) ||
        tokenAlternative.includes(EMPTY_ALTERNATIVE_TOKEN) ||
        alternative.some((nestedToken) =>
          tokenAlternative.some((otherToken) =>
            this.regexTokensOverlap(nestedToken, otherToken),
          ),
        ),
      ),
    );
  }

  private parseAltToken(altToken: string): string[][] {
    try {
      const parsed: unknown = JSON.parse(altToken.slice('ALT:'.length));
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (alternative) =>
            Array.isArray(alternative) &&
            alternative.every((token) => typeof token === 'string'),
        )
      ) {
        return parsed;
      }
    } catch {
      return [];
    }
    return [];
  }

  private wordTokenOverlaps(token: string): boolean {
    if (/^[A-Za-z0-9_]$/.test(token) || token === 'DIGIT') return true;
    if (token.startsWith('RANGE:')) {
      const [, start, end] = token.match(/^RANGE:(.)-(.)$/) ?? [];
      return start !== undefined && end !== undefined
        ? this.rangeContainsWordCharacter(start, end)
        : false;
    }
    if (token.startsWith('CLASS:')) return this.classTokenOverlaps(token, 'WORD');
    return false;
  }

  private digitTokenOverlaps(token: string): boolean {
    if (/^\d$/.test(token) || token === 'WORD') return true;
    if (token.startsWith('RANGE:')) {
      const [, start, end] = token.match(/^RANGE:(.)-(.)$/) ?? [];
      return start !== undefined && end !== undefined
        ? start <= '9' && end >= '0'
        : false;
    }
    if (token.startsWith('CLASS:')) return this.classTokenOverlaps(token, 'DIGIT');
    return false;
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
    if (classToken.startsWith('CLASS:[^')) {
      const body = classToken.slice('CLASS:[^'.length, -1);
      if (token.length === 1) return !this.positiveClassBodyOverlaps(body, token);
      return this.tokenMayMatchSample(classToken, token);
    }

    const characterClass = classToken.slice('CLASS:'.length);
    const body = characterClass.slice(1, -1);
    for (let i = 0; i < body.length; i += 1) {
      const char = body[i]!;
      if (char === '\\') {
        const escapedToken = this.classEscapedTokenAt(body, i);
        if (escapedToken === null) continue;
        if (this.regexTokensOverlap(escapedToken.value, token)) return true;
        i = escapedToken.end;
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

  private spaceTokenOverlaps(token: string): boolean {
    if (token === 'SPACE') return true;
    if (token.length === 1) return /^\s$/u.test(token);
    if (token.startsWith('CLASS:')) return this.classTokenOverlaps(token, 'SPACE');
    if (token.startsWith('RANGE:')) return !this.rangeContainsOnlyNonWhitespace(token);
    if (token === 'DOT' || token.startsWith('NOT_')) return true;
    return false;
  }

  private positiveClassBodyOverlaps(body: string, token: string): boolean {
    return this.classTokenOverlaps(`CLASS:[${body}]`, token);
  }

  private dotTokenOverlaps(token: string): boolean {
    if (token.length === 1) return token !== '\n' && token !== '\r' && token !== '\u2028' && token !== '\u2029';
    if (token === 'SPACE') return true;
    if (token === 'NOT_SPACE') return true;
    if (token === 'NOT_DIGIT' || token === 'NOT_WORD') return true;
    if (token === 'WORD' || token === 'DIGIT') return true;
    if (token.startsWith('RANGE:') || token.startsWith('CLASS:')) {
      return this.tokenMayMatchSample('DOT', token);
    }
    return false;
  }

  private complementTokenOverlaps(complementToken: string, token: string): boolean {
    if (token.length === 1) return this.tokenMatchesSample(complementToken, token);
    if (token.startsWith('NOT_')) return true;

    if (complementToken === 'NOT_DIGIT') {
      if (token === 'DIGIT') return false;
      if (token === 'WORD' || token === 'SPACE' || token === 'DOT') return true;
      if (token.startsWith('RANGE:')) return !this.rangeIsWithin(token, '0', '9');
      if (token.startsWith('CLASS:')) {
        return this.classBodyContainsOutsideToken(token, (char) => /^\d$/.test(char));
      }
    }

    if (complementToken === 'NOT_WORD') {
      if (token === 'WORD' || token === 'DIGIT') return false;
      if (token === 'SPACE' || token === 'DOT') return true;
      if (token.startsWith('RANGE:')) return !this.rangeContainsOnlyWordCharacters(token);
      if (token.startsWith('CLASS:')) {
        return this.classBodyContainsOutsideToken(token, (char) =>
          /^[A-Za-z0-9_]$/.test(char),
        );
      }
    }

    if (complementToken === 'NOT_SPACE') {
      if (token === 'SPACE') return false;
      if (token === 'WORD' || token === 'DIGIT' || token === 'DOT') return true;
      if (token.startsWith('RANGE:')) return !this.rangeContainsOnlyWhitespace(token);
      if (token.startsWith('CLASS:')) {
        return this.classBodyContainsOutsideToken(token, (char) =>
          /^\s$/u.test(char),
        );
      }
    }

    return this.tokenMayMatchSample(complementToken, token);
  }

  private rangeIsWithin(rangeToken: string, start: string, end: string): boolean {
    const [, rangeStart, rangeEnd] = rangeToken.match(/^RANGE:(.)-(.)$/) ?? [];
    return rangeStart !== undefined && rangeEnd !== undefined
      ? rangeStart >= start && rangeEnd <= end
      : false;
  }

  private rangeContainsOnlyWordCharacters(rangeToken: string): boolean {
    return (
      this.rangeIsWithin(rangeToken, 'a', 'z') ||
      this.rangeIsWithin(rangeToken, 'A', 'Z') ||
      this.rangeIsWithin(rangeToken, '0', '9') ||
      rangeToken === 'RANGE:_-_'
    );
  }

  private rangeContainsOnlyWhitespace(rangeToken: string): boolean {
    return rangeToken === 'RANGE:\t-\r' || rangeToken === 'RANGE: - ';
  }

  private rangeContainsOnlyNonWhitespace(rangeToken: string): boolean {
    const [, start, end] = rangeToken.match(/^RANGE:(.)-(.)$/) ?? [];
    return start !== undefined && end !== undefined
      ? !this.sampleRangeCharacters(start, end).some((char) => /^\s$/u.test(char))
      : false;
  }

  private classBodyContainsOutsideToken(
    classToken: string,
    contains: (char: string) => boolean,
  ): boolean {
    const characterClass = classToken.slice('CLASS:'.length);
    const body = characterClass.slice(1, -1);
    if (body.startsWith('^')) return true;

    for (let i = 0; i < body.length; i += 1) {
      const char = body[i]!;
      if (char === '\\') {
        const token = this.classEscapedTokenAt(body, i);
        if (token === null) continue;
        if (token.value.length === 1 && !contains(token.value)) return true;
        if (token.value.startsWith('NOT_')) return true;
        i = token.end;
        continue;
      }

      if (body[i + 1] === '-' && body[i + 2] !== undefined) {
        const start = char;
        const end = body[i + 2]!;
        if (!this.sampleRangeCharacters(start, end).every(contains)) return true;
        i += 2;
        continue;
      }

      if (!contains(char)) return true;
    }

    return false;
  }

  private sampleRangeCharacters(start: string, end: string): string[] {
    return [
      start,
      end,
      '0',
      '9',
      'A',
      'Z',
      '_',
      'a',
      'z',
      ' ',
      '\t',
      '\n',
      '\u1680',
      'é',
    ].filter((char) => char >= start && char <= end);
  }

  private tokenMayMatchSample(left: string, right: string): boolean {
    const samples = [
      'a',
      'b',
      'A',
      'Z',
      '0',
      '5',
      '9',
      '_',
      ' ',
      '\t',
      '\n',
      '\r',
      '!',
      '-',
      '.',
      '/',
      '\u00A0',
    ];
    return samples.some(
      (sample) =>
        this.tokenMatchesSample(left, sample) &&
        this.tokenMatchesSample(right, sample),
    );
  }

  private tokenMatchesSample(token: string, sample: string): boolean {
    if (token.length === 1) return token === sample;
    if (token === 'DOT') return sample !== '\n' && sample !== '\r';
    if (token === 'WORD') return /^[A-Za-z0-9_]$/.test(sample);
    if (token === 'DIGIT') return /^\d$/.test(sample);
    if (token === 'SPACE') return /^\s$/u.test(sample);
    if (token === 'NOT_DIGIT') return !/^\d$/.test(sample);
    if (token === 'NOT_WORD') return !/^[A-Za-z0-9_]$/.test(sample);
    if (token === 'NOT_SPACE') return !/^\s$/u.test(sample);
    if (token.startsWith('RANGE:')) {
      const [, start, end] = token.match(/^RANGE:(.)-(.)$/) ?? [];
      return start !== undefined && end !== undefined
        ? sample >= start && sample <= end
        : false;
    }
    if (token.startsWith('CLASS:')) {
      return this.classMatchesSample(token.slice('CLASS:'.length), sample);
    }
    return false;
  }

  private classMatchesSample(characterClass: string, sample: string): boolean {
    const body = characterClass.slice(1, -1);
    const negated = body.startsWith('^');
    const positiveBody = negated ? body.slice(1) : body;
    let matches = false;

    for (let i = 0; i < positiveBody.length; i += 1) {
      const char = positiveBody[i]!;
      if (char === '\\') {
        const token = this.classEscapedTokenAt(positiveBody, i);
        if (token !== null) {
          matches = this.tokenMatchesSample(token.value, sample);
          if (matches) break;
          i = token.end;
        }
        continue;
      }

      if (positiveBody[i + 1] === '-' && positiveBody[i + 2] !== undefined) {
        matches = sample >= char && sample <= positiveBody[i + 2]!;
        if (matches) break;
        i += 2;
        continue;
      }

      matches = char === sample;
      if (matches) break;
    }

    return negated ? !matches : matches;
  }

  private rangeContainsWordCharacter(start: string, end: string): boolean {
    return (
      (start <= 'z' && end >= 'a') ||
      (start <= 'Z' && end >= 'A') ||
      (start <= '9' && end >= '0') ||
      (start <= '_' && end >= '_')
    );
  }

  private caseFoldRegexLiterals(pattern: string): string {
    let result = '';
    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '\\') {
        if (
          pattern[i + 1] === 'x' &&
          /^[0-9A-Fa-f]{2}$/.test(pattern.slice(i + 2, i + 4))
        ) {
          result += String.fromCharCode(
            Number.parseInt(pattern.slice(i + 2, i + 4), 16),
          ).toLowerCase();
          i += 3;
          continue;
        }
        if (
          pattern[i + 1] === 'u' &&
          /^[0-9A-Fa-f]{4}$/.test(pattern.slice(i + 2, i + 6))
        ) {
          result += String.fromCharCode(
            Number.parseInt(pattern.slice(i + 2, i + 6), 16),
          ).toLowerCase();
          i += 5;
          continue;
        }
        result += `${char}${pattern[i + 1]?.toLowerCase() ?? ''}`;
        i += 1;
        continue;
      }
      result += char.toLowerCase();
    }
    return result;
  }

  private stripGroupPrefix(groupContent: string): string {
    if (groupContent.startsWith('?:')) return groupContent.slice(2);
    if (groupContent.startsWith('?=') || groupContent.startsWith('?!')) {
      return '';
    }
    if (groupContent.startsWith('?<=') || groupContent.startsWith('?<!')) {
      return '';
    }

    const inlineModifier = groupContent.match(/^\?([A-Za-z-]+):/);
    if (inlineModifier) {
      let content = groupContent.slice(inlineModifier[0].length);
      if (this.modifierTextEnables(inlineModifier[1] ?? '', 's')) {
        content = this.expandDotAllLiterals(content);
      }
      return this.modifierTextEnables(inlineModifier[1] ?? '', 'i')
        ? this.caseFoldRegexLiterals(content)
        : content;
    }

    const namedCapture = groupContent.match(/^\?<[^>]+>/);
    if (namedCapture) return groupContent.slice(namedCapture[0].length);

    return groupContent;
  }

  private hasEnabledInlineModifier(pattern: string, flag: string): boolean {
    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '[') {
        i = this.skipCharacterClass(pattern, i);
        continue;
      }
      if (char !== '(' || pattern[i + 1] !== '?') continue;
      const modifierMatch = pattern.slice(i + 2).match(/^([A-Za-z-]+):/);
      if (modifierMatch && this.modifierTextEnables(modifierMatch[1] ?? '', flag)) {
        return true;
      }
    }
    return false;
  }

  private modifierTextEnables(modifiers: string, flag: string): boolean {
    const [enabled = '', disabled = ''] = modifiers.split('-', 2);
    return enabled.includes(flag) && !disabled.includes(flag);
  }

  private expandDotAllLiterals(pattern: string): string {
    let result = '';
    for (let i = 0; i < pattern.length; i += 1) {
      const char = pattern[i]!;
      if (char === '\\') {
        result += pattern.slice(i, i + 2);
        i += 1;
        continue;
      }
      if (char === '[') {
        const end = this.skipCharacterClass(pattern, i);
        result += pattern.slice(i, end + 1);
        i = end;
        continue;
      }
      result += char === '.' ? '[\\s\\S]' : char;
    }
    return result;
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
    nullable: boolean;
    fixedCount?: number;
  } | null {
    const char = pattern[start];
    if (char === '+' || char === '*') {
      return {
        end: pattern[start + 1] === '?' ? start + 1 : start,
        variable: true,
        repeatsGroup: true,
        nullable: char === '*',
      };
    }
    if (char === '?') {
      return {
        end: pattern[start + 1] === '?' ? start + 1 : start,
        variable: true,
        repeatsGroup: false,
        nullable: true,
      };
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

    const end = pattern[close + 1] === '?' ? close + 1 : close;

    if (variable) {
      return { end, variable, repeatsGroup, nullable: min === 0 };
    }

    return { end, variable, repeatsGroup: min > 1, fixedCount: min, nullable: min === 0 };
  }
}
