import { ANSI } from '../logging/beast-logger.js';

export interface DesignSummary {
  title: string;
  sectionCount: number;
  blurb: string;
}

export interface DesignCardOptions extends DesignSummary {
  filePath: string;
}

const DEFAULT_SUMMARY: DesignSummary = {
  title: 'Untitled',
  sectionCount: 0,
  blurb: '',
};

export function extractDesignSummary(markdown: string): DesignSummary {
  try {
    const text = typeof markdown === 'string' ? markdown : '';
    if (!text) {
      return { ...DEFAULT_SUMMARY };
    }

    const lines = text.split(/\r?\n/);
    const titleLine = lines.find((line) => /^# /.test(line.trim()));
    const parsedTitle = titleLine ? titleLine.trim().replace(/^# /, '').trim() : '';
    const title = parsedTitle || DEFAULT_SUMMARY.title;
    const sectionCount = lines.filter((line) => /^## /.test(line.trim())).length;

    let blurb = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        continue;
      }
      blurb = trimmed;
      break;
    }

    if (blurb.length > 200) {
      blurb = `${blurb.slice(0, 200)}...`;
    }

    return { title, sectionCount, blurb };
  } catch {
    return { ...DEFAULT_SUMMARY };
  }
}

export function formatDesignCard(opts: DesignCardOptions): string {
  const line = `${ANSI.cyan}${'─'.repeat(50)}${ANSI.reset}`;
  const parts = [
    `\n${line}`,
    `${ANSI.cyan}│${ANSI.reset} ${ANSI.bold}Design Document${ANSI.reset}`,
    line,
    `  ${ANSI.dim}Title:${ANSI.reset}    ${opts.title}`,
    `  ${ANSI.dim}Sections:${ANSI.reset} ${opts.sectionCount}`,
    `  ${ANSI.dim}Saved to:${ANSI.reset} ${opts.filePath}`,
  ];

  if (opts.blurb) {
    parts.push('');
    parts.push(`  ${ANSI.dim}${opts.blurb}${ANSI.reset}`);
  }

  parts.push(line);
  return parts.join('\n');
}
