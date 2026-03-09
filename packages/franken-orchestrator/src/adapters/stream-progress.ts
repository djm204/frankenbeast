import { ANSI } from '../logging/beast-logger.js';

/**
 * Parses stream-json lines from the Claude CLI and renders
 * meaningful progress to the terminal (thinking, tool use, etc.).
 */
export function createStreamProgressHandler(
  write: (text: string) => void = (t) => process.stderr.write(t),
): (line: string) => void {
  let lastToolName = '';
  let showedThinking = false;

  return (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return; // Not JSON — skip
    }

    // Skip hook output
    if ('hookSpecificOutput' in obj) return;

    const type = obj['type'] as string | undefined;

    // content_block_start: detect thinking or tool_use blocks
    if (type === 'content_block_start') {
      const block = obj['content_block'] as Record<string, unknown> | undefined;
      if (!block) return;

      if (block['type'] === 'thinking' && !showedThinking) {
        showedThinking = true;
        write(`  ${ANSI.dim}Thinking...${ANSI.reset}\n`);
      }

      if (block['type'] === 'tool_use') {
        const name = block['name'] as string;
        lastToolName = name;
      }
    }

    // content_block_delta with tool input: show tool activity
    if (type === 'content_block_delta') {
      const delta = obj['delta'] as Record<string, unknown> | undefined;
      if (!delta) return;

      if (delta['type'] === 'input_json_delta' && lastToolName) {
        const partial = delta['partial_json'] as string | undefined;
        if (partial && lastToolName) {
          // Try to extract file_path from partial JSON for Write/Read/Edit tools
          const pathMatch = partial.match(/"file_path"\s*:\s*"([^"]+)"/);
          if (pathMatch?.[1]) {
            const action = toolAction(lastToolName);
            const shortPath = shortenPath(pathMatch[1]);
            write(`  ${ANSI.dim}${action} ${shortPath}${ANSI.reset}\n`);
            lastToolName = ''; // Only show once per tool use
          }
        }
      }
    }

    // result event: show completion stats
    if (type === 'result') {
      const cost = obj['cost_usd'] as number | undefined;
      const duration = obj['duration_ms'] as number | undefined;
      if (cost !== undefined && duration !== undefined) {
        const secs = (duration / 1000).toFixed(1);
        write(`  ${ANSI.dim}Completed (${secs}s, $${cost.toFixed(4)})${ANSI.reset}\n`);
      }
    }
  };
}

function toolAction(name: string): string {
  switch (name) {
    case 'Write': return 'Writing';
    case 'Read': return 'Reading';
    case 'Edit': return 'Editing';
    case 'Glob': return 'Searching';
    case 'Grep': return 'Searching';
    case 'Bash': return 'Running';
    default: return `Using ${name}:`;
  }
}

function shortenPath(fullPath: string): string {
  // Show last 3 segments of the path
  const parts = fullPath.split('/');
  if (parts.length <= 3) return fullPath;
  return '.../' + parts.slice(-3).join('/');
}
