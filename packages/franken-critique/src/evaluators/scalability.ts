import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const HARDCODED_URL_PATTERN = /["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/g;
const HARDCODED_IP_PATTERN = /["'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']/g;
const PORT_IDENTIFIER_PATTERN = String.raw`(?:[Pp]ort(?:[A-Z_]\w*)?|PORT(?:_\w*)?|(?!(?:[Vv]iew[Pp]ort)\w*)\w+Port(?:[A-Z]\w*)?|\w+_PORT(?:_\w*)?|\w+_port(?:_\w*)?)`;
const DECLARATION_PORT_SUGGESTION = 'Use process.env.PORT or a config object instead';
const CONFIG_PORT_SUGGESTION = 'Move port to environment variable or external configuration';
const HARDCODED_PORT_PATTERNS = [
  {
    pattern: new RegExp(
      String.raw`(?:export\s+)?(?:const|let|var)\s+${PORT_IDENTIFIER_PATTERN}(?:\s*:\s*[^=;,\n]+)?\s*=\s*(\d{2,5})\b`,
      'g',
    ),
    suggestion: DECLARATION_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(String.raw`(?:^|[,{])\s*["']?${PORT_IDENTIFIER_PATTERN}["']?\s*:\s*(\d{2,5})\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
    skipTypeOnly: true,
  },
  {
    pattern: new RegExp(String.raw`\.\s*${PORT_IDENTIFIER_PATTERN}\s*=\s*(\d{2,5})\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(String.raw`\[\s*["']${PORT_IDENTIFIER_PATTERN}["']\s*\]\s*=\s*(\d{2,5})\b`, 'g'),
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

        if (skipTypeOnly && this.isInTypeOnlyRange(typeOnlyRanges, match.index)) {
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
    const typeAliasContext = /\btype\s+\w+\s*=[^;{}]*$/s.test(prefix);
    return /\b(?:type\s+\w+\s*=\s*|interface\s+\w+\s*|as\s*)$/s.test(prefix) ||
      /(?:^|[\n;])\s*(?:const|let|var)\s+\w+\s*:\s*$/s.test(prefix) ||
      /[(),]\s*\w+\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\bas\s+[\w$.]+\s*<\s*$/s.test(prefix) ||
      (typeAliasContext && /(?:=|&|\||<|,|\()\s*$/s.test(prefix));
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

      if (current === '"' || current === "'" || current === '`') {
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
}
