import type { ExecutionResult } from './turn-runner.js';

const MAX_SUMMARY_LENGTH = 500;

export class TurnSummarizer {
  static summarize(result: ExecutionResult): string {
    const parts: string[] = [];

    parts.push(`[${result.status}]`);
    parts.push(result.summary);
    parts.push(`| ${result.filesChanged.length} file(s) changed`);
    parts.push(`| ${result.testsRun} test(s) run`);

    if (result.errors.length > 0) {
      parts.push(`| Errors: ${result.errors.join('; ')}`);
    }

    const full = parts.join(' ');

    if (full.length <= MAX_SUMMARY_LENGTH) {
      return full;
    }

    // Truncate the summary portion to fit within the limit
    const withoutSummary = parts.slice();
    withoutSummary[1] = '';
    const shellLength = withoutSummary.join(' ').length;
    const availableForSummary = MAX_SUMMARY_LENGTH - shellLength - 3; // 3 for '...'

    if (availableForSummary > 0) {
      withoutSummary[1] = result.summary.slice(0, availableForSummary) + '...';
    } else {
      withoutSummary[1] = '...';
    }

    return withoutSummary.join(' ').slice(0, MAX_SUMMARY_LENGTH);
  }
}
