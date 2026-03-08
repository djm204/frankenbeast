import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const HARDCODED_URL_PATTERN = /["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/g;
const HARDCODED_IP_PATTERN = /["'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']/g;
const HARDCODED_PORT_PATTERN = /(?:const|let|var)\s+\w*[Pp]ort\w*\s*=\s*(\d{2,5})\s*;/g;

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
    for (const match of content.matchAll(HARDCODED_PORT_PATTERN)) {
      findings.push({
        message: `Found hardcoded port number: ${match[1]}. Use environment variables or config.`,
        severity: 'warning',
        suggestion: 'Use process.env.PORT or a config object instead',
      });
    }
  }
}
