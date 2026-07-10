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
      let stdoutBuffer = '';
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

        proc.stdout.on('data', (chunk: Buffer | string) => {
          stdoutBuffer += chunk.toString('utf8');
          const messages = readMcpMessages(stdoutBuffer);
          stdoutBuffer = messages.remaining;
          if (messages.messages.some(isSuccessfulInitializeResponse)) {
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
  remaining: string;
}

function formatMcpMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function readMcpMessages(input: string): ReadMessagesResult {
  const messages: JsonRpcMessage[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = remaining.slice(0, headerEnd);
      const lengthMatch = /^content-length:\s*(\d+)$/im.exec(headers);
      if (!lengthMatch) {
        remaining = remaining.slice(headerEnd + 4);
        continue;
      }

      const bodyLength = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + bodyLength;
      if (remaining.length < bodyEnd) {
        break;
      }

      const parsed = tryParseJsonRpcMessage(remaining.slice(bodyStart, bodyEnd));
      if (parsed) {
        messages.push(parsed);
      }
      remaining = remaining.slice(bodyEnd);
      continue;
    }

    const newlineIndex = remaining.indexOf('\n');
    if (newlineIndex === -1) {
      break;
    }

    const parsed = tryParseJsonRpcMessage(remaining.slice(0, newlineIndex).trim());
    if (parsed) {
      messages.push(parsed);
    }
    remaining = remaining.slice(newlineIndex + 1);
  }

  return { messages, remaining };
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
