import { spawn } from 'node:child_process';
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
      try {
        const proc = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });

        const timer = setTimeout(() => {
          // Timeout without MCP readiness signal — cannot confirm connectivity
          proc.kill();
          resolve('unknown');
        }, 2000);

        proc.on('error', () => {
          clearTimeout(timer);
          resolve('error');
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0 ? 'connected' : 'error');
        });
      } catch {
        resolve('error');
      }
    });
  }
}
