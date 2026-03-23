import type { BrainSnapshot } from '@franken/types';

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
