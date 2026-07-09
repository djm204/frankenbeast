import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const HARDCODED_URL_PATTERN = /["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/g;
const HARDCODED_IP_PATTERN = /["'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']/g;
const PORT_IDENTIFIER_PATTERN = String.raw`(?![Vv]iew[Pp]ort\w*)(?!\w*(?:ViewPort|VIEW_PORT|view_port)\w*)(?:[Pp]ort(?:[A-Z0-9_]\w*)?|PORT(?:_\w*)?|\w+Port(?:[A-Z0-9]\w*)?|\w+_PORT(?:_\w*)?|\w+_port(?:_\w*)?)`;
const QUOTED_PORT_KEY_PATTERN = String.raw`["'](?!(?:[^"']*(?:[Vv]iew-[Pp]ort|view-port)[^"']*))(?:[A-Za-z0-9_]+-)*[Pp]ort(?:-[A-Za-z0-9_]+)*["']`;
const PORT_NUMBER_PATTERN = String.raw`(\d[\d_]{1,6})`;
const PORT_PROPERTY_GAP_PATTERN = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*(?:\n|$))*`;
const DECLARATION_PORT_SUGGESTION = 'Use process.env.PORT or a config object instead';
const CONFIG_PORT_SUGGESTION = 'Move port to environment variable or external configuration';
const HARDCODED_PORT_PATTERNS = [
  {
    pattern: new RegExp(
      String.raw`(?:export\s+)?(?:const|let|var)\s+${PORT_IDENTIFIER_PATTERN}(?:\s*:\s*[^=;,\n]+)?\s*=\s*${PORT_NUMBER_PATTERN}\b`,
      'g',
    ),
    suggestion: DECLARATION_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(
      String.raw`(?:^|[,{])${PORT_PROPERTY_GAP_PATTERN}(?:["']?${PORT_IDENTIFIER_PATTERN}["']?|${QUOTED_PORT_KEY_PATTERN}|\[\s*["']${PORT_IDENTIFIER_PATTERN}["']\s*\])${PORT_PROPERTY_GAP_PATTERN}:${PORT_PROPERTY_GAP_PATTERN}${PORT_NUMBER_PATTERN}\b`,
      'g',
    ),
    suggestion: CONFIG_PORT_SUGGESTION,
    skipTypeOnly: true,
  },
  {
    pattern: new RegExp(String.raw`\.\s*${PORT_IDENTIFIER_PATTERN}\s*=\s*${PORT_NUMBER_PATTERN}\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(String.raw`\[\s*["']${PORT_IDENTIFIER_PATTERN}["']\s*\]\s*=\s*${PORT_NUMBER_PATTERN}\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
];

export class ScalabilityEvaluator implements Evaluator {
  readonly name = 'scalability';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return { evaluatorName: this.name, verdict: 'pass', score: 1, findings: [] };
    }

    const findings: EvaluationFinding[] = [];

    this.checkHardcodedUrls(input.content, findings);
    this.checkHardcodedIPs(input.content, findings);
    this.checkHardcodedPorts(input.content, findings);

    const score = Math.max(0, 1 - findings.length * 0.25);

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkHardcodedUrls(content: string, findings: EvaluationFinding[]): void {
    for (const match of content.matchAll(HARDCODED_URL_PATTERN)) {
      findings.push({
        message: `Found hardcoded URL: "${match[1]}". Use environment variables or config.`,
        severity: 'warning',
        suggestion: 'Move URL to environment variable or configuration file',
      });
    }
  }

  private checkHardcodedIPs(content: string, findings: EvaluationFinding[]): void {
    for (const match of content.matchAll(HARDCODED_IP_PATTERN)) {
      findings.push({
        message: `Found hardcoded IP address: "${match[1]}". Use environment variables or config.`,
        severity: 'warning',
        suggestion: 'Move IP address to environment variable or DNS hostname',
      });
    }
  }

  private checkHardcodedPorts(content: string, findings: EvaluationFinding[]): void {
    const scanContent = this.maskCommentsAndStrings(content);
    const typeOnlyRanges = this.findTypeOnlyBraceRanges(scanContent);
    const ignoredRanges = this.findCommentAndStringRanges(content);

    for (const { pattern, suggestion, skipTypeOnly } of HARDCODED_PORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        if (this.isInTypeOnlyRange(ignoredRanges, match.index)) {
          continue;
        }

        const portNumberIndex = this.findPortNumberIndex(match);
        if (this.isInTypeOnlyRange(ignoredRanges, portNumberIndex)) {
          continue;
        }

        if (skipTypeOnly && (this.isInTypeOnlyRange(typeOnlyRanges, match.index) || this.isInTypeOnlySignature(scanContent, match.index))) {
          continue;
        }

        if (skipTypeOnly && this.isParameterLiteralType(content, match.index, portNumberIndex)) {
          continue;
        }

        if (skipTypeOnly && this.isClassFieldTypeAnnotation(content, portNumberIndex)) {
          continue;
        }

        findings.push({
          message: `Found hardcoded port number: ${match[1]}. Use environment variables or config.`,
          severity: 'warning',
          suggestion,
        });
      }
    }
  }

  private isInTypeOnlyRange(ranges: Array<[number, number]>, matchIndex: number): boolean {
    return ranges.some(([start, end]) => matchIndex >= start && matchIndex <= end);
  }

  private findPortNumberIndex(match: RegExpMatchArray): number {
    const matchIndex = match.index ?? 0;
    return matchIndex + match[0].lastIndexOf(match[1] ?? '');
  }

  private isParameterLiteralType(content: string, matchIndex: number, portNumberIndex: number): boolean {
    if (content[matchIndex] !== ',') {
      return false;
    }

    const suffix = content.slice(portNumberIndex).match(/^\d[\d_]*\s*[,)]/);
    if (!suffix) {
      return false;
    }

    const prefix = content.slice(Math.max(0, matchIndex - 300), matchIndex);
    const openParen = prefix.lastIndexOf('(');
    if (openParen === -1) {
      return false;
    }

    const beforeParen = prefix.slice(0, openParen);
    const beforeMatchInParams = prefix.slice(openParen + 1);
    return /(?:\bfunction\b|=>\s*$|=\s*$|\btype\s+\w+(?:<[^>{}]*>)?\s*=\s*$)/s.test(beforeParen) && /\b\w+\s*:\s*[^,]+$/s.test(beforeMatchInParams);
  }

  private isClassFieldTypeAnnotation(content: string, portNumberIndex: number): boolean {
    const suffix = content.slice(portNumberIndex).match(/^\d[\d_]*\s*(?:;|(?=[}\n]))/);
    if (!suffix) {
      return false;
    }

    const prefix = content.slice(Math.max(0, portNumberIndex - 300), portNumberIndex);
    const openBrace = prefix.lastIndexOf('{');
    if (openBrace === -1) {
      return false;
    }

    const beforeBrace = prefix.slice(0, openBrace);
    const afterBrace = prefix.slice(openBrace + 1);
    const classFieldPattern = new RegExp(String.raw`(?:^|[;\n])\s*${PORT_IDENTIFIER_PATTERN}\s*:\s*$`, 's');
    return /\bclass\s+\w+(?:\s+extends\s+[\w$.]+)?(?:\s+implements\s+[\w$.,<>\s]+)?\s*$/.test(beforeBrace) && classFieldPattern.test(afterBrace);
  }

  private findTypeOnlyBraceRanges(content: string): Array<[number, number]> {
    const stack: Array<{ index: number; typeOnly: boolean }> = [];
    const ranges: Array<[number, number]> = [];

    for (let index = 0; index < content.length; index += 1) {
      if (content[index] === '{') {
        stack.push({ index, typeOnly: this.startsTypeOnlyBrace(content, index) || stack.some((entry) => entry.typeOnly) });
      } else if (content[index] === '}') {
        const entry = stack.pop();
        if (entry?.typeOnly) {
          ranges.push([entry.index, index]);
        }
      }
    }

    return ranges;
  }

  private startsTypeOnlyBrace(content: string, openBraceIndex: number): boolean {
    const prefix = content.slice(Math.max(0, openBraceIndex - 200), openBraceIndex);
    const typeAliasContext = /(?:^|[\n;])\s*type\s+\w+[\s\S]*=[^;{}]*$/s.test(prefix);
    return /\b(?:type\s+\w+[\s\S]*=\s*|interface\s+\w+[\s\S]*|as\s*|satisfies\s*)$/s.test(prefix) ||
      /(?:^|[\n;])\s*(?:const|let|var)\s+\w+\s*:\s*$/s.test(prefix) ||
      /[(),]\s*\w+\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\)\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\bas\s+[\w$.]+\s*<\s*$/s.test(prefix) ||
      /(?:<|\bextends)\s*$/s.test(prefix) ||
      (typeAliasContext && /(?:=|&|\||<|,|\()\s*$/s.test(prefix));
  }

  private isInTypeOnlySignature(content: string, matchIndex: number): boolean {
    const prefix = content.slice(Math.max(0, matchIndex - 200), matchIndex);
    return /\btype\s+\w+(?:<[^>{}]*>)?\s*=[^;{}]*$/s.test(prefix);
  }

  private maskCommentsAndStrings(content: string): string {
    const ignoredRanges = this.findCommentAndStringRanges(content);
    let masked = '';
    let previous = 0;

    for (const [start, end] of ignoredRanges) {
      masked += content.slice(previous, start);
      masked += content.slice(start, end + 1).replace(/[^\n]/g, ' ');
      previous = end + 1;
    }

    return masked + content.slice(previous);
  }

  private findCommentAndStringRanges(content: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let index = 0;

    while (index < content.length) {
      const current = content[index];
      const next = content[index + 1];

      if (current === '/' && next === '/') {
        const end = content.indexOf('\n', index + 2);
        const stop = end === -1 ? content.length : end;
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '/' && next === '*') {
        const end = content.indexOf('*/', index + 2);
        const stop = end === -1 ? content.length : end + 2;
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '/' && this.startsRegexLiteral(content, index)) {
        const stop = this.findRegexLiteralEnd(content, index);
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '`') {
        index = this.collectTemplateLiteralRanges(content, index, ranges);
        continue;
      }

      if (current === '"' || current === "'") {
        const quote = current;
        let stop = index + 1;
        while (stop < content.length) {
          if (content[stop] === '\\') {
            stop += 2;
            continue;
          }
          if (content[stop] === quote) {
            stop += 1;
            break;
          }
          stop += 1;
        }
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      index += 1;
    }

    return ranges;
  }

  private collectTemplateLiteralRanges(content: string, templateStart: number, ranges: Array<[number, number]>): number {
    let index = templateStart + 1;
    let segmentStart = templateStart;

    while (index < content.length) {
      if (content[index] === '\\') {
        index += 2;
        continue;
      }

      if (content[index] === '$' && content[index + 1] === '{') {
        ranges.push([segmentStart, index]);
        const expressionStart = index + 2;
        const expressionEnd = this.findTemplateInterpolationEnd(content, expressionStart);
        for (const [start, end] of this.findCommentAndStringRanges(content.slice(expressionStart, expressionEnd))) {
          ranges.push([expressionStart + start, expressionStart + end]);
        }
        index = expressionEnd + 1;
        segmentStart = index;
        continue;
      }

      if (content[index] === '`') {
        ranges.push([segmentStart, index]);
        return index + 1;
      }

      index += 1;
    }

    ranges.push([segmentStart, content.length - 1]);
    return content.length;
  }

  private findTemplateInterpolationEnd(content: string, expressionStart: number): number {
    let index = expressionStart;
    let depth = 1;

    while (index < content.length) {
      const current = content[index];
      if (current === '\\') {
        index += 2;
        continue;
      }

      if (current === '/' && content[index + 1] === '/') {
        const lineEnd = content.indexOf('\n', index + 2);
        index = lineEnd === -1 ? content.length : lineEnd + 1;
        continue;
      }

      if (current === '/' && content[index + 1] === '*') {
        const commentEnd = content.indexOf('*/', index + 2);
        index = commentEnd === -1 ? content.length : commentEnd + 2;
        continue;
      }

      if (current === '"' || current === "'" || current === '`') {
        index = this.findQuotedRangeEnd(content, index);
        continue;
      }

      if (current === '{') {
        depth += 1;
      } else if (current === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }

      index += 1;
    }

    return content.length - 1;
  }

  private findQuotedRangeEnd(content: string, quoteStart: number): number {
    const quote = content[quoteStart];
    let index = quoteStart + 1;

    while (index < content.length) {
      if (content[index] === '\\') {
        index += 2;
        continue;
      }
      if (content[index] === quote) {
        return index + 1;
      }
      index += 1;
    }

    return content.length;
  }

  private startsRegexLiteral(content: string, slashIndex: number): boolean {
    let previous = slashIndex - 1;
    while (previous >= 0 && /\s/.test(content.charAt(previous))) {
      previous -= 1;
    }

    const prefix = content.slice(Math.max(0, slashIndex - 40), slashIndex);
    return previous < 0 || /[=(:,\[{};!&|?]/.test(content.charAt(previous)) || /(?:^|[\s;{}])(?:case|return|throw|yield)\s*$|=>\s*$/.test(prefix) || /\b(?:if|while|for|with)\s*\([^)]*\)\s*$/.test(prefix);
  }

  private findRegexLiteralEnd(content: string, slashIndex: number): number {
    let index = slashIndex + 1;
    let inCharacterClass = false;

    while (index < content.length) {
      const current = content[index];
      if (current === '\\') {
        index += 2;
        continue;
      }
      if (current === '[') {
        inCharacterClass = true;
      } else if (current === ']') {
        inCharacterClass = false;
      } else if (current === '/' && !inCharacterClass) {
        index += 1;
        while (index < content.length && /[a-z]/i.test(content.charAt(index))) {
          index += 1;
        }
        return index;
      }
      index += 1;
    }

    return slashIndex + 1;
  }
}
