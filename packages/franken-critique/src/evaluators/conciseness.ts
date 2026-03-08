import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const COMMENT_LINE_PATTERN = /^\s*\/\//;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const TODO_PATTERN = /\/\/\s*(TODO|FIXME|HACK|XXX)\b/gi;
const MAX_COMMENT_RATIO = 0.5;

export class ConcisenessEvaluator implements Evaluator {
  readonly name = 'conciseness';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return { evaluatorName: this.name, verdict: 'pass', score: 1, findings: [] };
    }

    const findings: EvaluationFinding[] = [];

    this.checkCommentRatio(input.content, findings);
    this.checkTodoComments(input.content, findings);

    const score = Math.max(0, 1 - findings.length * 0.2);

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkCommentRatio(content: string, findings: EvaluationFinding[]): void {
    const lines = content.split('\n');
    const totalLines = lines.filter((l) => l.trim().length > 0).length;
    if (totalLines === 0) return;

    // Count single-line comments
    let commentLines = lines.filter((l) => COMMENT_LINE_PATTERN.test(l)).length;

    // Count block comment lines
    for (const match of content.matchAll(BLOCK_COMMENT_PATTERN)) {
      commentLines += match[0].split('\n').length;
    }

    const ratio = commentLines / totalLines;
    if (ratio > MAX_COMMENT_RATIO) {
      findings.push({
        message: `Excessive comment ratio: ${Math.round(ratio * 100)}% of lines are comments. Code should be self-documenting.`,
        severity: 'info',
        suggestion: 'Remove obvious comments and let clear naming convey intent',
      });
    }
  }

  private checkTodoComments(content: string, findings: EvaluationFinding[]): void {
    const matches = [...content.matchAll(TODO_PATTERN)];
    if (matches.length > 0) {
      const labels = matches.map((m) => m[1]).join(', ');
      findings.push({
        message: `Found ${matches.length} TODO/FIXME/HACK comment(s): ${labels}. Address or track these as issues.`,
        severity: 'info',
        suggestion: 'Resolve TODO items or convert them to tracked issues',
      });
    }
  }
}
