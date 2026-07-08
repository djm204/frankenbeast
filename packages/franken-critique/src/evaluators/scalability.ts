import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const HARDCODED_URL_PATTERN = /["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/g;
const HARDCODED_IP_PATTERN = /["'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']/g;
const PORT_IDENTIFIER_PATTERN = String.raw`(?:[Pp]ort(?:[A-Z_]\w*)?|PORT(?:_\w*)?|\w+(?<![Vv]iew)Port(?:[A-Z]\w*)?|\w+_PORT(?:_\w*)?|\w+_port(?:_\w*)?)`;
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
    const typeOnlyRanges = this.findTypeOnlyBraceRanges(content);

    for (const { pattern, suggestion, skipTypeOnly } of HARDCODED_PORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
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
    return /\b(?:type\s+\w+\s*=\s*|interface\s+\w+\s*|as\s*)$/s.test(prefix) ||
      /(?:^|[\n;])\s*(?:const|let|var)\s+\w+\s*:\s*$/s.test(prefix) ||
      /[(),]\s*\w+\s*:\s*$/s.test(prefix);
  }
}
