import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { McpConfig } from '@franken/types';
import { redactSensitiveText } from '../logging/redaction.js';

export type McpHealthStatus = 'connected' | 'error' | 'unknown';

export interface SkillHealthResult {
  name: string;
  status: McpHealthStatus;
  serverStatuses: Array<{
    serverName: string;
    status: McpHealthStatus;
    error?: string;
  }>;
}

export interface SkillHealthOptions {
  /**
   * Passive skill listing/status paths must not execute commands from skill
   * manifests. Set this only after the caller has explicitly established trust
   * in the skill MCP server command it is about to spawn.
   */
  trustMcpServerCommands?: boolean;
}

const UNTRUSTED_HEALTH_CHECK_MESSAGE =
  'MCP health check command was not executed because the skill is not trusted';
const SKIPPED_HEALTH_CHECK_MESSAGE =
  'MCP health probe skipped because the per-check limit of 20 servers was exceeded';
const INCOMPLETE_HANDSHAKE_MESSAGE =
  'MCP initialize handshake was not completed before the command exited';
const HEALTH_CHECK_TIMEOUT_MESSAGE =
  'MCP initialize handshake timed out';

const HEALTH_CHECK_TIMEOUT_MS = 2000;
const HEALTH_CHECK_TERMINATION_GRACE_MS = 250;
/** Maximum retained prefix for each child-process output stream. */
const MAX_HEALTH_DIAGNOSTIC_BYTES = 4096;
/** Bound incomplete protocol data while allowing normal MCP initialize responses. */
const MAX_MCP_PROTOCOL_BUFFER_BYTES = 1024 * 1024;
/** Maximum number of MCP child-process health probes running at once. */
const MAX_CONCURRENT_MCP_HEALTH_PROBES = 4;
/** Maximum number of child processes spawned by one trusted status check. */
const MAX_MCP_HEALTH_PROBES_PER_CHECK = 20;
const MCP_INITIALIZE_ID = 1;

class AsyncSemaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.available = limit;
  }

  async run<Result>(operation: () => Promise<Result>): Promise<Result> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.available += 1;
    }
  }
}

const MCP_HEALTH_PROBE_SEMAPHORE = new AsyncSemaphore(
  MAX_CONCURRENT_MCP_HEALTH_PROBES,
);

interface HealthCheckMcpServerConfig {
  command: string;
  args?: string[] | undefined;
}

interface HealthCheckOutcome {
  status: McpHealthStatus;
  error?: string;
}

/**
 * Check health of MCP servers in a skill's mcp.json.
 * Command-based checks are passive/non-executing unless the caller explicitly
 * opts in after establishing trust for the skill MCP server commands.
 */
export class SkillHealthChecker {
  async getStatus(
    skillName: string,
    mcpConfig: McpConfig,
    options: SkillHealthOptions = {},
  ): Promise<SkillHealthResult> {
    const mcpServers = mcpConfig.mcpServers as Record<string, HealthCheckMcpServerConfig>;
    const entries = Object.entries(mcpServers);
    const entriesToCheck = options.trustMcpServerCommands
      ? entries.slice(0, MAX_MCP_HEALTH_PROBES_PER_CHECK)
      : entries;
    const serverStatuses = await mapWithConcurrency(
      entriesToCheck,
      MAX_CONCURRENT_MCP_HEALTH_PROBES,
      async ([serverName, config]: [string, HealthCheckMcpServerConfig]) => {
        if (!options.trustMcpServerCommands) {
          return {
            serverName,
            status: 'unknown' as const,
            error: UNTRUSTED_HEALTH_CHECK_MESSAGE,
          };
        }

        try {
          const outcome = await MCP_HEALTH_PROBE_SEMAPHORE.run(() =>
            this.checkServer(config.command, config.args ?? []),
          );
          return { serverName, ...outcome };
        } catch (err) {
          return {
            serverName,
            status: 'error' as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );

    if (options.trustMcpServerCommands) {
      serverStatuses.push(
        ...entries.slice(MAX_MCP_HEALTH_PROBES_PER_CHECK).map(([serverName]) => ({
          serverName,
          status: 'unknown' as const,
          error: SKIPPED_HEALTH_CHECK_MESSAGE,
        })),
      );
    }

    const allConnected = serverStatuses.every(
      (s) => s.status === 'connected',
    );
    const anyError = serverStatuses.some((s) => s.status === 'error');

    return {
      name: skillName,
      status: allConnected ? 'connected' : anyError ? 'error' : 'unknown',
      serverStatuses,
    };
  }

  private checkServer(
    command: string,
    args: string[],
  ): Promise<HealthCheckOutcome> {
    return new Promise((resolve) => {
      let proc: ChildProcessWithoutNullStreams;
      let settled = false;
      let stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stdoutDiagnosticTail: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderrDiagnosticTail: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let timer: NodeJS.Timeout;

      const settle = (
        status: McpHealthStatus,
        {
          killRunningProcess = true,
          error,
        }: { killRunningProcess?: boolean; error?: string } = {},
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        const outcome = { status, ...(error === undefined ? {} : { error }) };

        if (killRunningProcess && proc.exitCode === null) {
          let forceKillTimer: NodeJS.Timeout | undefined = undefined;
          let terminated = false;
          const finishAfterTermination = () => {
            if (terminated) {
              return;
            }
            terminated = true;
            if (forceKillTimer) {
              clearTimeout(forceKillTimer);
            }
            proc.off('exit', finishAfterTermination);
            proc.off('close', finishAfterTermination);
            resolve(outcome);
          };

          proc.once('exit', finishAfterTermination);
          proc.once('close', finishAfterTermination);
          try {
            if (!proc.kill()) {
              finishAfterTermination();
              return;
            }
          } catch {
            finishAfterTermination();
            return;
          }
          if (terminated) {
            return;
          }
          forceKillTimer = setTimeout(() => {
            if (proc.exitCode === null) {
              try {
                if (!proc.kill('SIGKILL')) {
                  finishAfterTermination();
                }
              } catch {
                finishAfterTermination();
              }
            }
          }, HEALTH_CHECK_TERMINATION_GRACE_MS);
          return;
        }

        resolve(outcome);
      };

      try {
        proc = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });

        timer = setTimeout(() => {
          // Timeout without MCP readiness signal — cannot confirm connectivity.
          settle('unknown', {
            error: formatHealthDiagnostic(
              HEALTH_CHECK_TIMEOUT_MESSAGE,
              stderrDiagnosticTail,
              stdoutDiagnosticTail,
            ),
          });
        }, HEALTH_CHECK_TIMEOUT_MS);

        proc.on('error', (error: Error) => {
          settle('error', {
            killRunningProcess: false,
            error: formatHealthDiagnostic(
              `Failed to start MCP server: ${error.message}`,
              stderrDiagnosticTail,
              stdoutDiagnosticTail,
            ),
          });
        });

        proc.on('close', (code) => {
          settle(code === 0 ? 'unknown' : 'error', {
            killRunningProcess: false,
            error: formatHealthDiagnostic(
              code === 0
                ? INCOMPLETE_HANDSHAKE_MESSAGE
                : `MCP server exited with code ${code ?? 'unknown'}`,
              stderrDiagnosticTail,
              stdoutDiagnosticTail,
            ),
          });
        });

        proc.stdin.on('error', () => {
          // Defer to the process error/close/timeout paths. Some commands exit
          // successfully before reading the initialize probe; in that case the
          // stdin stream can emit EPIPE before close(0), which remains unknown
          // because no MCP handshake completed.
        });

        proc.stdout.on('data', (chunk: Buffer | string) => {
          const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
          stdoutDiagnosticTail = appendBoundedDiagnostic(stdoutDiagnosticTail, chunkBuffer);
          stdoutBuffer = Buffer.concat([
            stdoutBuffer,
            chunkBuffer,
          ]);
          const messages = readMcpMessages(stdoutBuffer);
          stdoutBuffer = messages.remaining;
          if (stdoutBuffer.byteLength > MAX_MCP_PROTOCOL_BUFFER_BYTES) {
            stdoutBuffer = stdoutBuffer.subarray(-MAX_MCP_PROTOCOL_BUFFER_BYTES);
          }
          if (messages.messages.some(isFailedInitializeResponse)) {
            settle('error', {
              error: formatHealthDiagnostic(
                'MCP initialize request failed',
                stderrDiagnosticTail,
                stdoutDiagnosticTail,
              ),
            });
          } else if (messages.messages.some(isSuccessfulInitializeResponse)) {
            settle('connected');
          }
        });

        proc.stderr.on('data', (chunk: Buffer | string) => {
          stderrDiagnosticTail = appendBoundedDiagnostic(
            stderrDiagnosticTail,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'),
          );
        });

        proc.stdin.write(formatMcpMessage({
          jsonrpc: '2.0',
          id: MCP_INITIALIZE_ID,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'frankenbeast-skill-health-checker',
              version: '0.0.0',
            },
          },
        }));
      } catch (error) {
        resolve({
          status: 'error',
          error: formatHealthDiagnostic(
            `Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`,
            stderrDiagnosticTail,
            stdoutDiagnosticTail,
          ),
        });
      }
    });
  }
}

function appendBoundedDiagnostic(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
): Buffer<ArrayBufferLike> {
  const remainingBytes = MAX_HEALTH_DIAGNOSTIC_BYTES - current.byteLength;
  if (remainingBytes <= 0) {
    return current;
  }
  return Buffer.concat([current, chunk.subarray(0, remainingBytes)]);
}

function formatHealthDiagnostic(
  summary: string,
  stderr: Buffer<ArrayBufferLike>,
  stdout: Buffer<ArrayBufferLike>,
): string {
  const details = [
    summary,
    ...(stderr.byteLength > 0 ? [`stderr: ${stderr.toString('utf8').trim()}`] : []),
    ...(stdout.byteLength > 0 ? [`stdout: ${stdout.toString('utf8').trim()}`] : []),
  ].join('\n');
  const sanitized = details
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '');
  return redactSensitiveText(sanitized);
}

async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  concurrency: number,
  mapper: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as Item, index);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: unknown;
}

interface ReadMessagesResult {
  messages: JsonRpcMessage[];
  remaining: Buffer<ArrayBufferLike>;
}

function formatMcpMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `${body}\n`;
}

function readMcpMessages(input: Buffer<ArrayBufferLike>): ReadMessagesResult {
  const messages: JsonRpcMessage[] = [];
  let remaining = input;

  while (remaining.byteLength > 0) {
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = remaining.subarray(0, headerEnd).toString('ascii');
      const lengthMatch = /^content-length:\s*(\d+)$/im.exec(headers);
      if (!lengthMatch) {
        remaining = remaining.subarray(headerEnd + 4);
        continue;
      }

      const bodyLength = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + bodyLength;
      if (remaining.byteLength < bodyEnd) {
        break;
      }

      const parsed = tryParseJsonRpcMessage(
        remaining.subarray(bodyStart, bodyEnd).toString('utf8'),
      );
      if (parsed) {
        messages.push(parsed);
      }
      remaining = remaining.subarray(bodyEnd);
      continue;
    }

    if (looksLikePartialContentLengthHeader(remaining)) {
      break;
    }

    const newlineIndex = remaining.indexOf('\n');
    if (newlineIndex === -1) {
      break;
    }

    const parsed = tryParseJsonRpcMessage(
      remaining.subarray(0, newlineIndex).toString('utf8').trim(),
    );
    if (parsed) {
      messages.push(parsed);
    }
    remaining = remaining.subarray(newlineIndex + 1);
  }

  return { messages, remaining };
}

function looksLikePartialContentLengthHeader(input: Buffer<ArrayBufferLike>): boolean {
  return /^content-length\s*:/i.test(input.toString('ascii'));
}

function tryParseJsonRpcMessage(raw: string): JsonRpcMessage | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as JsonRpcMessage;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isSuccessfulInitializeResponse(message: JsonRpcMessage): boolean {
  return message.jsonrpc === '2.0'
    && message.id === MCP_INITIALIZE_ID
    && message.result !== undefined
    && message.error === undefined;
}

function isFailedInitializeResponse(message: JsonRpcMessage): boolean {
  return message.jsonrpc === '2.0'
    && message.id === MCP_INITIALIZE_ID
    && message.error !== undefined;
}
