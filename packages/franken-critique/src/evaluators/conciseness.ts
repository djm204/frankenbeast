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

function previousSignificantCharacter(content: string, index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const current = content[cursor] ?? '';
    if (!/\s/.test(current)) {
      return current;
    }
  }
  return '';
}

function previousSignificantToken(content: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }

  const end = cursor + 1;
  while (cursor >= 0 && /[$\w]/.test(content[cursor] ?? '')) {
    cursor -= 1;
  }

  return content.slice(cursor + 1, end);
}

function canStartRegexLiteral(content: string, index: number): boolean {
  const previous = previousSignificantCharacter(content, index);
  const previousToken = previousSignificantToken(content, index);
  return (
    [
      'return',
      'throw',
      'case',
      'yield',
      'await',
      'typeof',
      'void',
      'delete',
    ].includes(previousToken) ||
    previous === '' ||
    '([{=,:;!&|?+-*~^>'.includes(previous)
  );
}

function skipRegexLiteral(content: string, start: number): number {
  let index = start + 1;
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
      while (/[$\w]/.test(content[index] ?? '')) {
        index += 1;
      }
      return index;
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

function collectLineCommentLabels(
  content: string,
  start: number,
): [string[], number] {
  const end = content.indexOf('\n', start + 2);
  const commentEnd = end === -1 ? content.length : end;
  const comment = content.slice(start, commentEnd);
  return [extractMarkerLabels(UNRESOLVED_COMMENT_PATTERN, comment), commentEnd];
}

function collectBlockCommentLabels(
  content: string,
  start: number,
): [string[], number] {
  const end = content.indexOf('*/', start + 2);
  const commentEnd = end === -1 ? content.length : end + 2;
  const comment = content.slice(start, commentEnd);
  return [extractMarkerLabels(UNRESOLVED_MARKER_PATTERN, comment), commentEnd];
}

function collectTemplateLiteralLabels(
  content: string,
  start: number,
): [string[], number] {
  const labels: string[] = [];
  let index = start + 1;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (current === '`') {
      return [labels, index + 1];
    }
    if (current === '$' && next === '{') {
      const [expressionLabels, expressionEnd] = collectCodeLabels(
        content,
        index + 2,
        '}',
      );
      labels.push(...expressionLabels);
      index = expressionEnd;
      continue;
    }
    index += 1;
  }

  return [labels, index];
}

function collectCodeLabels(
  content: string,
  start = 0,
  endCharacter?: string,
): [string[], number] {
  const labels: string[] = [];
  let index = start;
  let braceDepth = endCharacter === '}' ? 1 : 0;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];

    if (endCharacter === '}' && current === '{') {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (endCharacter === '}' && current === '}') {
      braceDepth -= 1;
      index += 1;
      if (braceDepth === 0) {
        return [labels, index];
      }
      continue;
    }

    if (endCharacter && endCharacter !== '}' && current === endCharacter) {
      return [labels, index + 1];
    }

    if (current === '"' || current === "'") {
      index = skipQuotedLiteral(content, index);
      continue;
    }

    if (current === '`' && next === '`' && content[index + 2] === '`') {
      index += 3;
      continue;
    }

    if (current === '`') {
      const [templateLabels, templateEnd] = collectTemplateLiteralLabels(
        content,
        index,
      );
      labels.push(...templateLabels);
      index = templateEnd;
      continue;
    }

    if (current === '/' && next === '/') {
      const [commentLabels, commentEnd] = collectLineCommentLabels(
        content,
        index,
      );
      labels.push(...commentLabels);
      index = commentEnd;
      continue;
    }

    if (current === '/' && next === '*') {
      const [commentLabels, commentEnd] = collectBlockCommentLabels(
        content,
        index,
      );
      labels.push(...commentLabels);
      index = commentEnd;
      continue;
    }

    if (current === '/' && canStartRegexLiteral(content, index)) {
      index = skipRegexLiteral(content, index);
      continue;
    }

    index += 1;
  }

  return [labels, index];
}

function collectUnresolvedCommentMarkerLabels(content: string): string[] {
  return collectCodeLabels(content)[0];
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
