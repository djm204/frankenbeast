import { ANSI } from '../logging/beast-logger.js';
import { wallClockNow } from '@franken/types';

const FRAMES = ['|', '/', '-', '\\'];
const SPINNER_INTERVAL_MS = 100;

export interface StreamProgressHandle {
  onLine: (line: string) => void;
  stop: () => void;
}

export type NormalizedProviderStreamEvent =
  | { type: 'reasoning' }
  | { type: 'tool'; name?: string; path?: string }
  | { type: 'text'; content: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: 'result'; durationMs?: number; costUsd?: number; turns?: number }
  | { type: 'retry' }
  | { type: 'error' }
  | { type: 'unknown'; sourceType: string };

export interface StreamProgressOptions {
  /** Emit redacted diagnostics for unrecognized provider frames. */
  verbose?: boolean;
  /** Receive provider-neutral, redacted events for terminal or persistent sinks. */
  onEvent?: (event: NormalizedProviderStreamEvent) => void;
}

/**
 * Creates a stream progress handler with an integrated spinner.
 * The spinner shows elapsed time from the start; progress lines
 * (thinking, tool use, chunk IDs) appear above the spinner line.
 * Call `stop()` after the LLM call resolves to clear the spinner.
 */
export function createStreamProgressWithSpinner(
  options: StreamProgressOptions & { write?: (text: string) => void; label?: string } = {},
): StreamProgressHandle {
  const write = options.write ?? ((t: string) => process.stderr.write(t));
  const label = options.label ?? 'LLM working...';

  let frameIdx = 0;
  const startMs = wallClockNow();

  const renderSpinner = (): void => {
    const frame = FRAMES[frameIdx % FRAMES.length]!;
    const secs = ((wallClockNow() - startMs) / 1000).toFixed(1);
    write(`\r\x1b[K${frame} ${label} (${secs}s)`);
    frameIdx++;
  };

  const interval = setInterval(renderSpinner, SPINNER_INTERVAL_MS);
  renderSpinner();

  const writeProgress = (text: string): void => {
    write('\r\x1b[K');
    write(text);
  };

  const handler = createStreamProgressHandler(writeProgress, options);

  return {
    onLine: handler,
    stop: () => {
      clearInterval(interval);
      write('\r\x1b[K');
    },
  };
}

/**
 * Normalizes one parsed Claude, Codex, or Gemini CLI stream frame. The
 * contract deliberately excludes raw reasoning and error text so consumers
 * can persist these events without exposing chain-of-thought or secrets.
 */
export function normalizeProviderStreamEvent(
  obj: Record<string, unknown>,
): NormalizedProviderStreamEvent[] {
  if ('hookSpecificOutput' in obj) return [];

  const type = stringValue(obj['type']);
  if (!type) return [{ type: 'unknown', sourceType: 'missing-type' }];

  if (type === 'assistant') {
    const message = asRecord(obj['message']);
    const events: NormalizedProviderStreamEvent[] = [];
    const usage = normalizeUsage(message?.['usage']);
    if (usage) events.push(usage);

    const content = message?.['content'] ?? obj['content'];
    if (Array.isArray(content)) {
      for (const value of content) {
        const block = asRecord(value);
        if (!block) continue;
        const blockType = stringValue(block['type']);
        if (blockType === 'thinking' || blockType === 'reasoning') {
          events.push({ type: 'reasoning' });
        } else if (blockType === 'tool_use' || blockType === 'tool_call') {
          const name = stringValue(block['name']);
          const path = extractToolPath(block['input']);
          events.push({ type: 'tool', ...(name ? { name } : {}), ...(path ? { path } : {}) });
        } else if (blockType === 'text') {
          const text = stringValue(block['text']);
          if (text !== undefined) events.push({ type: 'text', content: text });
        }
      }
    } else {
      const text = extractText(content);
      if (text !== undefined) events.push({ type: 'text', content: text });
    }
    return events;
  }

  if (type === 'content_block_start') {
    const block = asRecord(obj['content_block']);
    const blockType = stringValue(block?.['type']);
    if (blockType === 'thinking' || blockType === 'reasoning') return [{ type: 'reasoning' }];
    if (blockType === 'tool_use' || blockType === 'tool_call') {
      const name = stringValue(block?.['name']);
      const path = extractToolPath(block?.['input']);
      return [{ type: 'tool', ...(name ? { name } : {}), ...(path ? { path } : {}) }];
    }
    return [];
  }

  if (type === 'content_block_delta') {
    const delta = asRecord(obj['delta']);
    const deltaType = stringValue(delta?.['type']);
    if (deltaType === 'text_delta' || (deltaType === undefined && typeof delta?.['text'] === 'string')) {
      const text = stringValue(delta?.['text']);
      return text === undefined ? [] : [{ type: 'text', content: text }];
    }
    if (deltaType === 'thinking_delta') return [{ type: 'reasoning' }];
    if (deltaType === 'input_json_delta') return [];
    return [];
  }

  if (type === 'item.started' || type === 'item.completed' || type === 'item.updated') {
    const item = asRecord(obj['item']);
    const itemType = stringValue(item?.['type']);
    if (itemType === 'reasoning') return [{ type: 'reasoning' }];
    if (itemType === 'agent_message' || itemType === 'message') {
      const text = extractText(item?.['text'] ?? item?.['content']);
      return text === undefined ? [] : [{ type: 'text', content: text }];
    }
    if (itemType === 'command_execution') {
      return [{ type: 'tool', name: 'Bash' }];
    }
    if (itemType === 'mcp_tool_call') {
      const server = stringValue(item?.['server']);
      const tool = stringValue(item?.['tool']) ?? stringValue(item?.['name']);
      const name = [server, tool].filter(Boolean).join('.') || 'MCP tool';
      const path = extractToolPath(item?.['arguments']);
      return [{ type: 'tool', name, ...(path ? { path } : {}) }];
    }
    if (itemType === 'web_search') return [{ type: 'tool', name: 'Search' }];
    return [{ type: 'unknown', sourceType: `${type}:${itemType ?? 'missing-item-type'}` }];
  }

  if (type === 'message' || type === 'content') {
    const message = asRecord(obj['message']);
    const role = message?.['role'] ?? obj['role'];
    if (role === 'user') return [];
    const text = extractText(message?.['content'] ?? obj['content'] ?? obj['parts'] ?? obj['text']);
    return text === undefined ? [] : [{ type: 'text', content: text }];
  }

  if (type === 'tool_use' || type === 'tool_call' || type === 'function_call') {
    const name = stringValue(obj['tool_name']) ?? stringValue(obj['name']);
    const input = obj['parameters'] ?? obj['arguments'] ?? obj['input'] ?? {};
    const path = extractToolPath(input);
    return [{ type: 'tool', ...(name ? { name } : {}), ...(path ? { path } : {}) }];
  }

  if (type === 'message_start' || type === 'message_delta') {
    const message = asRecord(obj['message']);
    const delta = asRecord(obj['delta']);
    const usage = normalizeUsage(message?.['usage'] ?? obj['usage'] ?? delta?.['usage']);
    return usage ? [usage] : [];
  }

  if (type === 'turn.completed') {
    const events: NormalizedProviderStreamEvent[] = [];
    const usage = normalizeUsage(obj['usage']);
    if (usage) events.push(usage);
    events.push({ type: 'result' });
    return events;
  }

  if (type === 'usage') {
    const usage = normalizeUsage(obj['usage'] ?? obj);
    return usage ? [usage] : [];
  }

  if (type === 'result' || type === 'done') {
    const stats = asRecord(obj['stats']);
    const events: NormalizedProviderStreamEvent[] = [];
    const usage = normalizeUsage(stats ?? obj['usage'] ?? obj);
    if (usage) events.push(usage);
    const message = asRecord(obj['message']);
    const text = extractText(obj['result'] ?? message?.['content'] ?? obj['content'] ?? obj['text']);
    if (text !== undefined) events.push({ type: 'text', content: text });
    const durationMs = numberValue(stats?.['duration_ms']) ?? numberValue(obj['duration_ms']);
    const costUsd = numberValue(obj['cost_usd']);
    const turns = numberValue(obj['num_turns']);
    events.push({
      type: 'result',
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(turns !== undefined ? { turns } : {}),
    });
    return events;
  }

  if (type === 'retry' || type === 'rate_limit' || type === 'rate_limit_event') return [{ type: 'retry' }];
  if (type === 'error' || type === 'turn.failed') return [{ type: 'error' }];

  if (KNOWN_IGNORED_TYPES.has(type)) return [];
  return [{ type: 'unknown', sourceType: type }];
}

const KNOWN_IGNORED_TYPES = new Set([
  'init',
  'system',
  'user',
  'thread.started',
  'turn.started',
  'content_block_stop',
  'message_stop',
  'tool_result',
]);

/** Render normalized provider events as safe, low-volume planning progress. */
export function createStreamProgressHandler(
  write: (text: string) => void = (t) => process.stderr.write(t),
  options: StreamProgressOptions = {},
): (line: string) => void {
  let lastToolName = '';
  let showedThinking = false;
  let textAccumulator = '';
  let toolInputAccumulator = '';
  const seenChunkIds = new Set<string>();

  return (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      if (options.verbose) writeUnknown('non-json', write, options);
      return;
    }

    if ('hookSpecificOutput' in obj) return;

    const rawType = stringValue(obj['type']);
    const isPartialToolStart = rawType === 'content_block_start';
    if (rawType === 'content_block_start') {
      const blockType = stringValue(asRecord(obj['content_block'])?.['type']);
      if (blockType === 'text') textAccumulator = '';
      if (blockType !== 'tool_use' && blockType !== 'tool_call') {
        lastToolName = '';
        toolInputAccumulator = '';
      }
    }

    if (rawType === 'content_block_delta' && lastToolName) {
      const delta = asRecord(obj['delta']);
      if (stringValue(delta?.['type']) === 'input_json_delta') {
        const partialInput = stringValue(delta?.['partial_json']);
        if (partialInput) {
          toolInputAccumulator += partialInput;
          const path = extractToolPathFromPartialJson(toolInputAccumulator);
          if (path) {
            renderTool(lastToolName, path, write);
            lastToolName = '';
            toolInputAccumulator = '';
          }
        }
      }
    }

    for (const event of normalizeProviderStreamEvent(obj)) {
      options.onEvent?.(event);

      if (event.type === 'reasoning') {
        if (!showedThinking) {
          showedThinking = true;
          write(`  ${ANSI.dim}Reasoning...${ANSI.reset}\n`);
        }
      } else if (event.type === 'tool') {
        if (event.name) {
          lastToolName = event.name;
          toolInputAccumulator = '';
          if (!isPartialToolStart) renderTool(event.name, event.path, write);
        }
      } else if (event.type === 'text') {
        textAccumulator += event.content;
        detectChunkIds(textAccumulator, seenChunkIds, write);
      } else if (event.type === 'result') {
        const parts: string[] = [];
        if (event.durationMs !== undefined) parts.push(`${(event.durationMs / 1000).toFixed(1)}s`);
        if (event.costUsd !== undefined) parts.push(`$${event.costUsd.toFixed(4)}`);
        if (event.turns !== undefined && event.turns > 1) parts.push(`${event.turns} turns`);
        write(`  ${ANSI.dim}LLM done${parts.length > 0 ? ` (${parts.join(', ')})` : ''}${ANSI.reset}\n`);
      } else if (event.type === 'retry') {
        write(`  ${ANSI.dim}Provider retrying...${ANSI.reset}\n`);
      } else if (event.type === 'error') {
        write(`  ${ANSI.dim}Provider stream error${ANSI.reset}\n`);
      } else if (event.type === 'unknown' && options.verbose) {
        writeUnknown(event.sourceType, write, options, false);
      }
    }
  };
}

function writeUnknown(
  sourceType: string,
  write: (text: string) => void,
  options: StreamProgressOptions,
  notify = true,
): void {
  const event: NormalizedProviderStreamEvent = { type: 'unknown', sourceType };
  if (notify) options.onEvent?.(event);
  write(`  ${ANSI.dim}Unknown provider stream event: ${sanitizeEventType(sourceType)}${ANSI.reset}\n`);
}

function renderTool(name: string, path: string | undefined, write: (text: string) => void): void {
  const action = toolAction(name);
  const suffix = path ? ` ${shortenPath(path)}` : '';
  write(`  ${ANSI.dim}${action}${suffix}${ANSI.reset}\n`);
}

function extractToolPath(input: unknown): string | undefined {
  let record = asRecord(input);
  if (!record && typeof input === 'string') {
    try {
      record = asRecord(JSON.parse(input));
    } catch {
      return undefined;
    }
  }
  return stringValue(record?.['file_path'])
    ?? stringValue(record?.['path'])
    ?? stringValue(record?.['absolute_path']);
}

function extractToolPathFromPartialJson(input: string): string | undefined {
  return input.match(/"(?:file_path|path|absolute_path)"\s*:\s*"([^"]+)"/)?.[1];
}

function normalizeUsage(value: unknown): NormalizedProviderStreamEvent | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const inputTokens = numberValue(usage['input_tokens']) ?? numberValue(usage['inputTokens'])
    ?? numberValue(usage['total_input_tokens']) ?? numberValue(usage['promptTokenCount']);
  const outputTokens = numberValue(usage['output_tokens']) ?? numberValue(usage['outputTokens'])
    ?? numberValue(usage['total_output_tokens']) ?? numberValue(usage['candidatesTokenCount']);
  const totalTokens = numberValue(usage['total_tokens']) ?? numberValue(usage['totalTokens'])
    ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return {
    type: 'usage',
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function extractText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const parts: string[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const text = stringValue(record?.['text']) ?? stringValue(record?.['content']);
    if (text !== undefined) parts.push(text);
  }
  return parts.length > 0 ? parts.join('') : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeEventType(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '?').slice(0, 120);
}

/** Scan accumulated text for JSON chunk `"id": "..."` patterns. */
function detectChunkIds(
  text: string,
  seen: Set<string>,
  write: (text: string) => void,
): void {
  const pattern = /"id"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      write(`  ${ANSI.dim}Planned chunk:${ANSI.reset} ${id}\n`);
    }
  }
}

function toolAction(name: string): string {
  switch (name) {
    case 'Write': return 'Writing';
    case 'Read': return 'Reading';
    case 'Edit': return 'Editing';
    case 'Glob': return 'Searching';
    case 'Grep': return 'Searching';
    case 'Search': return 'Searching';
    case 'Bash': return 'Running';
    default: return `Using ${name}:`;
  }
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.split('/');
  if (parts.length <= 3) return fullPath;
  return '.../' + parts.slice(-3).join('/');
}
