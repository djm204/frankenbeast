import type { HeartbeatReport } from '../core/types.js';

export function buildMorningBrief(report: HeartbeatReport): string {
  const lines: string[] = [];

  lines.push(`# Heartbeat Morning Brief`);
  lines.push(`**Date:** ${report.timestamp.slice(0, 10)}`);
  lines.push(`**Status:** ${report.pulseResult.status}`);
  lines.push('');

  if (report.pulseResult.status === 'FLAGS_FOUND' && report.pulseResult.flags.length > 0) {
    lines.push('## Flags');
    for (const flag of report.pulseResult.flags) {
      lines.push(`- [${flag.severity}] **${flag.source}**: ${flag.description}`);
    }
    lines.push('');
  }

  if (report.reflection) {
    if (report.reflection.patterns.length > 0) {
      lines.push('## Patterns');
      for (const pattern of report.reflection.patterns) {
        lines.push(`- ${pattern}`);
      }
      lines.push('');
    }

    if (report.reflection.improvements.length > 0) {
      lines.push('## Improvements');
      for (const imp of report.reflection.improvements) {
        lines.push(`- [${imp.priority}] **${imp.target}**: ${imp.description}`);
      }
      lines.push('');
    }

    if (report.reflection.techDebt.length > 0) {
      lines.push('## Tech Debt');
      for (const debt of report.reflection.techDebt) {
        lines.push(`- [${debt.effort}] **${debt.location}**: ${debt.description}`);
      }
      lines.push('');
    }
  }

  if (report.actions.length > 0) {
    lines.push(`## Actions Taken`);
    for (const action of report.actions) {
      lines.push(`- ${action.type}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
