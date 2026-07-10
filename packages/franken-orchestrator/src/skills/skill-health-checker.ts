import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { McpConfig } from '@franken/types';

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

const HEALTH_CHECK_TIMEOUT_MS = 2000;
const MCP_INITIALIZE_ID = 1;

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
    const serverStatuses = await Promise.all(
      Object.entries(mcpConfig.mcpServers).map(
        async ([serverName, config]) => {
          if (!options.trustMcpServerCommands) {
            return {
              serverName,
              status: 'unknown' as const,
              error: UNTRUSTED_HEALTH_CHECK_MESSAGE,
            };
          }

          try {
            const status = await this.checkServer(
              config.command,
              config.args ?? [],
            );
            return { serverName, status };
          } catch (err) {
            return {
              serverName,
              status: 'error' as const,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      ),
    );

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
  ): Promise<McpHealthStatus> {
    return new Promise((resolve) => {
      let proc: ChildProcessWithoutNullStreams;
      let settled = false;
      let stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let timer: NodeJS.Timeout;

      const settle = (status: McpHealthStatus) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (status !== 'error' && proc.exitCode === null && !proc.killed) {
          proc.kill();
        }
        resolve(status);
      };

      try {
        proc = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });

        timer = setTimeout(() => {
          // Timeout without MCP readiness signal — cannot confirm connectivity.
          settle('unknown');
        }, HEALTH_CHECK_TIMEOUT_MS);

        proc.on('error', () => {
          settle('error');
        });

        proc.on('close', (code) => {
          settle(code === 0 ? 'connected' : 'error');
        });

        proc.stdin.on('error', () => {
          // Defer to the process error/close/timeout paths. Some commands exit
          // successfully before reading the initialize probe; in that case the
          // stdin stream can emit EPIPE before close(0), and the clean-exit
          // fallback should remain connected.
        });

        proc.stdout.on('data', (chunk: Buffer | string) => {
          stdoutBuffer = Buffer.concat([
            stdoutBuffer,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'),
          ]);
          const messages = readMcpMessages(stdoutBuffer);
          stdoutBuffer = messages.remaining;
          if (messages.messages.some(isFailedInitializeResponse)) {
            settle('error');
          } else if (messages.messages.some(isSuccessfulInitializeResponse)) {
            settle('connected');
          }
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
      } catch {
        resolve('error');
      }
    });
  }
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
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
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
