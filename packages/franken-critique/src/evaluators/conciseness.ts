import type {
  Evaluator,
  EvaluationInput,
  EvaluationResult,
  EvaluationFinding,
} from './evaluator.js';

const COMMENT_LINE_PATTERN = /^\s*\/\//;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const UNRESOLVED_COMMENT_MARKERS = [
  ['TO', 'DO'].join(''),
  ['FIX', 'ME'].join(''),
  ['HA', 'CK'].join(''),
  ['X', 'XX'].join(''),
] as const;
const UNRESOLVED_COMMENT_PATTERN = new RegExp(
  `//\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'gi',
);
const UNRESOLVED_MARKER_PATTERN = new RegExp(
  `\\b(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'gi',
);
const UNRESOLVED_COMMENT_LINE_PATTERN = new RegExp(
  `//\\s*(${UNRESOLVED_COMMENT_MARKERS.join('|')})\\b`,
  'i',
);
const MAX_COMMENT_RATIO = 0.5;

function skipQuotedLiteral(content: string, start: number): number {
  const quote = content[start];
  let index = start + 1;

  while (index < content.length) {
    const current = content[index];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (current === quote) {
      return index + 1;
    }
    index += 1;
  }

  return index;
}

function extractMarkerLabels(pattern: RegExp, comment: string): string[] {
  return [...comment.matchAll(pattern)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function collectUnresolvedCommentMarkerLabels(content: string): string[] {
  const labels: string[] = [];
  let index = 0;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];

    if (current === '"' || current === "'" || current === '`') {
      index = skipQuotedLiteral(content, index);
      continue;
    }

    if (current === '/' && next === '/') {
      const end = content.indexOf('\n', index + 2);
      const commentEnd = end === -1 ? content.length : end;
      const comment = content.slice(index, commentEnd);
      labels.push(...extractMarkerLabels(UNRESOLVED_COMMENT_PATTERN, comment));
      index = commentEnd;
      continue;
    }

    if (current === '/' && next === '*') {
      const end = content.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? content.length : end + 2;
      const comment = content.slice(index, commentEnd);
      labels.push(...extractMarkerLabels(UNRESOLVED_MARKER_PATTERN, comment));
      index = commentEnd;
      continue;
    }

    index += 1;
  }

  return labels;
}

export class ConcisenessEvaluator implements Evaluator {
  readonly name = 'conciseness';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return {
        evaluatorName: this.name,
        verdict: 'pass',
        score: 1,
        findings: [],
      };
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

  private checkCommentRatio(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    const lines = content.split('\n');
    const totalLines = lines.filter((l) => l.trim().length > 0).length;
    if (totalLines === 0) return;

    // Count single-line comments and inline unresolved comment markers.
    let commentLines = lines.filter(
      (l) =>
        COMMENT_LINE_PATTERN.test(l) || UNRESOLVED_COMMENT_LINE_PATTERN.test(l),
    ).length;

    // Count block comment lines
    for (const match of content.matchAll(BLOCK_COMMENT_PATTERN)) {
      commentLines += match[0].split('\n').length;
    }

    const ratio = commentLines / totalLines;
    if (ratio > MAX_COMMENT_RATIO) {
      findings.push({
        message: `Excessive comment ratio: ${Math.round(ratio * 100)}% of lines are comments. Code should be self-documenting.`,
        severity: 'info',
        suggestion:
          'Remove obvious comments and let clear naming convey intent',
      });
    }
  }

  private checkTodoComments(
    content: string,
    findings: EvaluationFinding[],
  ): void {
    const labels = collectUnresolvedCommentMarkerLabels(content);
    if (labels.length > 0) {
      findings.push({
        message: `Found ${labels.length} unresolved marker comment(s): ${labels.join(', ')}. Address or track these as issues.`,
        severity: 'info',
        suggestion:
          'Resolve deferred-work items or convert them to tracked issues',
      });
    }
  }
}
