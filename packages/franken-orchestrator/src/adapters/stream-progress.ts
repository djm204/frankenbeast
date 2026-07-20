import { ANSI, isPlainOutput, stripAnsi } from '../logging/beast-logger.js';
import { wallClockNow } from '@franken/types';
import type { PlanningProgressEvent } from '../planning/planning-progress.js';
import { PLANNING_STAGE_LABELS } from '../planning/planning-progress.js';

const FRAMES = ['|', '/', '-', '\\'];
const SPINNER_INTERVAL_MS = 100;

export interface StreamProgressHandle {
  onLine: (line: string) => void;
  update: (event: PlanningProgressEvent) => void;
  currentStage: () => PlanningProgressEvent | undefined;
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

export type StreamProgressEvent =
  | { type: 'heartbeat'; elapsedMs: number }
  | { type: 'reasoning' }
  | { type: 'chunk-detected'; count: number }
  | { type: 'complete'; durationMs?: number; costUsd?: number; turns?: number };

export interface StreamProgressOptions {
  /** Emit redacted diagnostics for unrecognized provider frames. */
  verbose?: boolean;
  /** Receive provider-neutral normalized events for terminal-only consumers. */
  onEvent?: (event: NormalizedProviderStreamEvent) => void;
  write?: (text: string) => void;
  label?: string;
  /** Receives derived metadata only; raw provider output is never forwarded. */
  onProgressEvent?: (event: StreamProgressEvent) => void;
  heartbeatIntervalMs?: number;
  /** Supply stage context for provider result and retry messages. */
  operationLabel?: () => string;
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/** Combines sanitized persistent progress with stage-aware terminal status. */
export function createStreamProgressWithSpinner(
  options: StreamProgressOptions = {},
): StreamProgressHandle {
  const write = options.write ?? ((text: string) => process.stderr.write(text));
  const fallbackLabel = options.label ?? 'Planning';
  const totalStartedAt = wallClockNow();
  let stageStartedAt = totalStartedAt;
  let frameIndex = 0;
  let stopped = false;
  let activeEvent: PlanningProgressEvent | undefined;
  const plain = isPlainOutput();
  let lastPlainStatus = '';
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  let lastHeartbeatMs = 0;

  const renderSpinner = (): void => {
    if (stopped) return;
    const now = wallClockNow();
    const frame = FRAMES[frameIndex % FRAMES.length]!;
    const label = activeEvent?.message ?? fallbackLabel;
    const position = activeEvent ? ` [${activeEvent.position}/${activeEvent.total}]` : '';
    if (plain) {
      const status = `${label}${position}`;
      if (status !== lastPlainStatus) {
        write(`${stripAnsi(status)}\n`);
        lastPlainStatus = status;
      }
    } else {
      write(`\r\x1b[K${frame} ${label}${position} ${ANSI.dim}(stage ${formatDuration(now - stageStartedAt)} · total ${formatDuration(now - totalStartedAt)})${ANSI.reset}`);
    }
    frameIndex++;
    const elapsedMs = now - totalStartedAt;
    if (heartbeatIntervalMs > 0 && elapsedMs - lastHeartbeatMs >= heartbeatIntervalMs) {
      lastHeartbeatMs = elapsedMs;
      options.onProgressEvent?.({ type: 'heartbeat', elapsedMs });
      if (activeEvent?.status === 'started') {
        const heartbeat = `Still ${activeEvent.message.toLowerCase()} — ${formatDuration(now - stageStartedAt)} in stage, ${formatDuration(elapsedMs)} total`;
        write(plain ? `${stripAnsi(heartbeat)}\n` : `\r\x1b[K${ANSI.dim}${heartbeat}${ANSI.reset}\n`);
      }
    }
  };

  const interval = setInterval(renderSpinner, SPINNER_INTERVAL_MS);
  interval.unref?.();
  renderSpinner();

  const writeProgress = (text: string): void => {
    if (!plain) write('\r\x1b[K');
    write(plain ? stripAnsi(text) : text);
  };

  const operationLabel = (): string => activeEvent
    ? PLANNING_STAGE_LABELS[activeEvent.stage]
    : (options.operationLabel?.() ?? '');
  const handler = createStreamProgressHandler(writeProgress, { ...options, operationLabel });

  return {
    onLine: handler,
    update: (event): void => {
      if (stopped) return;
      const now = wallClockNow();
      if (event.status === 'started') {
        activeEvent = event;
        stageStartedAt = now;
        renderSpinner();
        return;
      }
      const next = event.nextStage ? ` Next: ${event.nextStage}.` : '';
      writeProgress(`  ${ANSI.dim}${event.status === 'skipped' ? '↷' : '✓'} ${event.message} (stage ${formatDuration(now - stageStartedAt)} · total ${formatDuration(now - totalStartedAt)}).${next}${ANSI.reset}\n`);
      activeEvent = event;
    },
    currentStage: () => activeEvent,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      if (!plain) write('\r\x1b[K');
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

  if (type === 'message' || type === 'content' || type === 'event') {
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
    const subtype = stringValue(obj['subtype']);
    const status = stringValue(obj['status']);
    if (obj['is_error'] === true || subtype === 'error' || status === 'error' || status === 'failed') {
      events.push({ type: 'error' });
      return events;
    }
    const message = asRecord(obj['message']);
    const text = extractText(obj['result'] ?? message?.['content'] ?? obj['content'] ?? obj['text']);
    if (text !== undefined) events.push({ type: 'text', content: text });
    const durationMs = numberValue(stats?.['duration_ms']) ?? numberValue(obj['duration_ms']);
    const costUsd = numberValue(obj['cost_usd']) ?? numberValue(obj['total_cost_usd']);
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
    const rawStatus = stringValue(obj['status']);
    if (rawType === 'franken_progress') {
      let message: string | undefined;
      if (rawStatus === 'fallback') {
        message = `Provider ${String(obj['provider'] ?? 'unknown')} unavailable; falling back to ${String(obj['nextProvider'] ?? 'next provider')}`;
      } else if (rawStatus === 'rate_limit_wait') {
        message = `Providers rate-limited; retrying in ${formatDuration(Number(obj['retryAfterMs'] ?? 0))}`;
      } else if (rawStatus === 'timeout') {
        message = 'Provider timed out; checking fallback options';
      } else if (rawStatus === 'retry') {
        message = `Retrying provider ${String(obj['provider'] ?? '')}`.trim();
      }
      if (message) write(`  ${ANSI.dim}↻ ${message}${ANSI.reset}\n`);
      return;
    }
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
          options.onProgressEvent?.({ type: 'reasoning' });
        }
      } else if (event.type === 'tool') {
        if (event.name) {
          lastToolName = event.name;
          toolInputAccumulator = '';
          if (!isPartialToolStart) renderTool(event.name, event.path, write);
        }
      } else if (event.type === 'text') {
        textAccumulator += event.content;
        detectChunkIds(textAccumulator, seenChunkIds, write, options.onProgressEvent);
      } else if (event.type === 'result') {
        const parts: string[] = [];
        if (event.durationMs !== undefined) parts.push(`${(event.durationMs / 1000).toFixed(1)}s`);
        if (event.costUsd !== undefined) parts.push(`$${event.costUsd.toFixed(4)}`);
        if (event.turns !== undefined && event.turns > 1) parts.push(`${event.turns} turns`);
        const operation = options.operationLabel?.() || 'LLM';
        write(`  ${ANSI.dim}${operation} provider call complete${parts.length > 0 ? ` (${parts.join(', ')})` : ''}${ANSI.reset}\n`);
        options.onProgressEvent?.({
          type: 'complete',
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
          ...(event.costUsd !== undefined ? { costUsd: event.costUsd } : {}),
          ...(event.turns !== undefined ? { turns: event.turns } : {}),
        });
      } else if (event.type === 'retry') {
        const operation = options.operationLabel?.() || 'LLM';
        write(`  ${ANSI.dim}${operation} provider retrying...${ANSI.reset}\n`);
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
  onEvent?: (event: StreamProgressEvent) => void,
): void {
  const pattern = /"id"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      write(`  ${ANSI.dim}Planned chunk:${ANSI.reset} ${id}\n`);
      onEvent?.({ type: 'chunk-detected', count: seen.size });
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
