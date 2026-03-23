import type { BrainSnapshot, EpisodicEvent } from '@franken/types';

/** Rough char-to-token ratio (1 token ≈ 4 chars) */
const CHARS_PER_TOKEN = 4;

/**
 * Truncate a BrainSnapshot to fit within a token budget.
 * Removes episodic events (oldest first) and working memory entries
 * (largest values first) until the rendered size fits.
 * Returns a new snapshot — does not mutate the original.
 */
export function truncateSnapshot(
  snapshot: BrainSnapshot,
  maxTokens: number,
): BrainSnapshot {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Start with full snapshot, progressively trim
  let trimmed: BrainSnapshot = {
    ...snapshot,
    episodic: [...snapshot.episodic],
    working: { ...snapshot.working },
  };

  // Phase 1: trim episodic events (oldest first, keep most recent)
  while (
    trimmed.episodic.length > 0 &&
    estimateChars(trimmed) > maxChars
  ) {
    trimmed = {
      ...trimmed,
      episodic: trimmed.episodic.slice(1),
    };
  }

  // Phase 2: trim working memory (largest values first)
  if (estimateChars(trimmed) > maxChars) {
    const entries = Object.entries(trimmed.working as Record<string, unknown>);
    entries.sort(
      (a, b) =>
        JSON.stringify(b[1]).length - JSON.stringify(a[1]).length,
    );
    const working = { ...trimmed.working } as Record<string, unknown>;
    for (const [key] of entries) {
      if (estimateChars({ ...trimmed, working }) <= maxChars) break;
      delete working[key];
    }
    trimmed = { ...trimmed, working };
  }

  return trimmed;
}

function estimateChars(snapshot: BrainSnapshot): number {
  return formatHandoff(snapshot).length;
}

/**
 * Format a BrainSnapshot as human-readable text for provider handoff.
 * Shared across all adapters — each injects this via their own mechanism
 * (CLI flag, system prompt, GEMINI.md, etc.).
 */
export function formatHandoff(snapshot: BrainSnapshot): string {
  const lines = [
    '--- BRAIN STATE HANDOFF ---',
    `Previous provider: ${snapshot.metadata.lastProvider}`,
    `Switch reason: ${snapshot.metadata.switchReason}`,
    `Tokens used so far: ${snapshot.metadata.totalTokensUsed}`,
    '',
    'Working memory:',
    JSON.stringify(snapshot.working, null, 2),
    '',
    `Recent events (${snapshot.episodic.length}):`,
    ...snapshot.episodic.slice(-10).map(
      (e) => `  [${e.type}] ${e.summary}`,
    ),
  ];

  if (snapshot.checkpoint) {
    lines.push(
      '',
      `Last checkpoint: phase=${snapshot.checkpoint.phase}, step=${snapshot.checkpoint.step}`,
    );
  }

  lines.push('--- END HANDOFF ---');
  return lines.join('\n');
}
