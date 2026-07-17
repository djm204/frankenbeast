export type AgentRole = 'coding' | 'review' | 'docs' | 'triage' | 'doctor' | 'ticket-manager';

export interface ToolPolicyDenial {
  readonly role: AgentRole | string;
  readonly requestedTool: string;
  readonly reason: string;
}

export interface ToolPolicyValidationResult {
  readonly allowed: boolean;
  readonly role?: AgentRole | undefined;
  readonly rawRole?: string | undefined;
  readonly requestedTools: readonly string[];
  readonly denials: readonly ToolPolicyDenial[];
}

const ROLE_TOOL_MANIFESTS: Readonly<Record<AgentRole, ReadonlySet<string>>> = {
  coding: new Set([
    'read_file',
    'search_files',
    'write_file',
    'patch',
    'terminal',
    'terminal.background',
    'github.read',
    'github.comment',
    'github.pr',
    'kanban.comment',
  ]),
  review: new Set([
    'read_file',
    'search_files',
    'terminal',
    'github.read',
    'github.comment',
    'github.pr',
    'kanban.comment',
  ]),
  docs: new Set([
    'read_file',
    'search_files',
    'write_file',
    'github.read',
    'github.comment',
    'github.pr',
    'kanban.comment',
  ]),
  triage: new Set([
    'read_file',
    'search_files',
    'github.read',
    'github.comment',
    'kanban.comment',
  ]),
  doctor: new Set([
    'read_file',
    'search_files',
    'terminal',
    'github.read',
    'github.comment',
    'github.pr',
    'kanban.comment',
  ]),
  'ticket-manager': new Set([
    'read_file',
    'search_files',
    'github.read',
    'github.comment',
    'kanban.comment',
  ]),
};

export function roleToolManifests(): Readonly<Record<AgentRole, readonly string[]>> {
  return {
    coding: [...ROLE_TOOL_MANIFESTS.coding].sort(),
    review: [...ROLE_TOOL_MANIFESTS.review].sort(),
    docs: [...ROLE_TOOL_MANIFESTS.docs].sort(),
    triage: [...ROLE_TOOL_MANIFESTS.triage].sort(),
    doctor: [...ROLE_TOOL_MANIFESTS.doctor].sort(),
    'ticket-manager': [...ROLE_TOOL_MANIFESTS['ticket-manager']].sort(),
  };
}

function rawRoleFromConfig(config: Readonly<Record<string, unknown>>): string | undefined {
  const raw = config.agentRole ?? config.role ?? config.laneRole;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function normalizeRole(value: unknown): AgentRole | undefined {
  return typeof value === 'string' && Object.hasOwn(ROLE_TOOL_MANIFESTS, value) ? value as AgentRole : undefined;
}

function normalizeTool(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requestedToolsFromConfig(config: Readonly<Record<string, unknown>>): string[] {
  const toolAliases = [config.requestedTools, config.enabledTools, config.toolManifest, config.tools];
  return [...new Set(toolAliases
    .flatMap((alias) => Array.isArray(alias) ? alias : [])
    .map(normalizeTool)
    .filter((value): value is string => Boolean(value)))];
}

export function validateAgentRoleTools(initConfig: Readonly<Record<string, unknown>>): ToolPolicyValidationResult {
  const rawRole = rawRoleFromConfig(initConfig);
  const role = normalizeRole(rawRole);
  const requestedTools = requestedToolsFromConfig(initConfig);
  if (!role) {
    const denialRole = rawRole ?? '<missing-role>';
    const denials = requestedTools.length > 0
      ? requestedTools.map((requestedTool) => ({
        role: denialRole,
        requestedTool,
        reason: rawRole
          ? `role '${rawRole}' is not recognized by the least-privilege manifest`
          : 'tool requests must include a role recognized by the least-privilege manifest',
      }))
      : [];
    return { allowed: denials.length === 0, rawRole, requestedTools, denials };
  }
  if (requestedTools.length === 0) {
    return {
      allowed: false,
      role,
      rawRole,
      requestedTools,
      denials: [{
        role,
        requestedTool: '<missing-tool-manifest>',
        reason: `role '${role}' requests must include an explicit least-privilege tool manifest`,
      }],
    };
  }

  const allowedTools = ROLE_TOOL_MANIFESTS[role];
  const denials = requestedTools
    .filter((tool) => !allowedTools.has(tool))
    .map((requestedTool) => ({
      role,
      requestedTool,
      reason: `tool '${requestedTool}' is not allowed for role '${role}' by the least-privilege manifest`,
    }));

  return {
    allowed: denials.length === 0,
    role,
    rawRole,
    requestedTools,
    denials,
  };
}

export class AgentToolPolicyError extends Error {
  constructor(readonly validation: ToolPolicyValidationResult) {
    const denied = validation.denials
      .map((denial) => `${denial.role}:${denial.requestedTool}`)
      .join(', ');
    super(`Least-privilege tool manifest denied requested tools: ${denied}`);
    this.name = 'AgentToolPolicyError';
  }
}
