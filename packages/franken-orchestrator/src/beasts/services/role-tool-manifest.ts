export type AgentRole = 'coding' | 'review' | 'docs' | 'triage' | 'doctor' | 'ticket-manager';

export interface ToolPolicyDenial {
  readonly role: AgentRole | string;
  readonly requestedTool: string;
  readonly reason: string;
}

export interface ToolPolicyValidationContext {
  readonly definitionId?: string | undefined;
  readonly initActionKind?: string | undefined;
  readonly initActionConfig?: Readonly<Record<string, unknown>> | undefined;
  readonly trustedSkillToolManifests?: Readonly<Record<string, readonly string[]>> | undefined;
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

function rawRoleFromConfig(
  config: Readonly<Record<string, unknown>>,
  _context: ToolPolicyValidationContext,
): string | undefined {
  const raw = config.agentRole ?? config.role ?? config.laneRole;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function normalizeRole(value: unknown): AgentRole | undefined {
  return typeof value === 'string' && Object.hasOwn(ROLE_TOOL_MANIFESTS, value) ? value as AgentRole : undefined;
}

function normalizeTool(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function arrayOfTools(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(normalizeTool).filter((tool): tool is string => Boolean(tool))
    : [];
}

function requestedToolsFromConfig(config: Readonly<Record<string, unknown>>): string[] {
  const toolAliases = [config.requestedTools, config.enabledTools, config.toolManifest, config.tools];
  return [...new Set(toolAliases.flatMap(arrayOfTools))];
}

interface SelectedSkillsConfig {
  readonly explicit: boolean;
  readonly malformed: boolean;
  readonly skills: readonly string[];
}

function selectedSkillsFromConfig(config: Readonly<Record<string, unknown>>): SelectedSkillsConfig {
  const explicit = Object.hasOwn(config, 'skills');
  return {
    explicit,
    malformed: explicit && !Array.isArray(config.skills),
    skills: [...new Set(arrayOfTools(config.skills))],
  };
}

function runtimeToolsFromConfig(config: Readonly<Record<string, unknown>>): string[] {
  const tools: string[] = [];
  const gitConfig = config.gitConfig;
  if (typeof gitConfig === 'object' && gitConfig !== null && !Array.isArray(gitConfig)) {
    const prCreation = (gitConfig as Readonly<Record<string, unknown>>).prCreation;
    if (prCreation === 'auto' || prCreation === 'required') {
      tools.push('github.pr');
    }
  }
  return tools;
}

function workflowRequiredTools(context: ToolPolicyValidationContext): string[] {
  const workflow = context.definitionId ?? context.initActionKind;
  switch (workflow) {
    case 'martin-loop':
      return ['read_file', 'search_files', 'write_file', 'patch', 'terminal'];
    case 'chunk-plan':
      return ['read_file', 'search_files', 'write_file'];
    case 'design-interview':
      return ['read_file', 'write_file'];
    default:
      return [];
  }
}

function trustedSkillToolManifestFor(context: ToolPolicyValidationContext, skill: string): string[] | undefined {
  if (!context.trustedSkillToolManifests || !Object.hasOwn(context.trustedSkillToolManifests, skill)) {
    return undefined;
  }
  const raw = context.trustedSkillToolManifests?.[skill];
  return arrayOfTools(raw);
}

export function defaultAgentToolPolicyConfig(
  definitionId: string,
  initActionKind?: string | undefined,
): Readonly<Record<string, unknown>> {
  return {
    agentRole: 'coding',
    requestedTools: workflowRequiredTools({ definitionId, initActionKind }),
    skills: [],
  };
}

function skillToolDenials(
  role: AgentRole | string,
  skills: readonly string[],
  context: ToolPolicyValidationContext,
): ToolPolicyDenial[] {
  return skills.flatMap((skill) => {
    const tools = trustedSkillToolManifestFor(context, skill);
    if (!tools) {
      return [{
        role,
        requestedTool: `skill:${skill}`,
        reason: `selected skill '${skill}' cannot be validated without a trusted installed tool manifest`,
      }];
    }
    return tools.map((requestedTool) => ({
      role,
      requestedTool,
      reason: `selected skill '${skill}' exposes installed runtime tool '${requestedTool}'`,
    }));
  });
}

export function validateAgentRoleTools(
  initConfig: Readonly<Record<string, unknown>>,
  context: ToolPolicyValidationContext = {},
): ToolPolicyValidationResult {
  const policyConfig = { ...context.initActionConfig, ...initConfig };
  const rawRole = rawRoleFromConfig(policyConfig, context);
  const role = normalizeRole(rawRole);
  const explicitTools = requestedToolsFromConfig(policyConfig);
  const runtimeTools = runtimeToolsFromConfig(policyConfig);
  const workflowTools = workflowRequiredTools(context);
  const selectedSkills = selectedSkillsFromConfig(policyConfig);
  const skillDenials = skillToolDenials(role ?? rawRole ?? '<missing-role>', selectedSkills.skills, context);
  const malformedSkillsDenial = selectedSkills.malformed
    ? [{
      role: role ?? rawRole ?? '<missing-role>',
      requestedTool: '<malformed-skills-allowlist>',
      reason: 'agent creation skills allowlist must be an explicit array; use an empty skills array to disable installed skill tools',
    }]
    : [];
  const implicitSkillsDenial = selectedSkills.explicit
    ? []
    : [{
      role: role ?? rawRole ?? '<missing-role>',
      requestedTool: '<implicit-enabled-skills>',
      reason: 'agent creation must include an explicit skills allowlist; use an empty skills array to disable installed skill tools',
    }];
  const requestedTools = [...new Set([
    ...explicitTools,
    ...runtimeTools,
    ...workflowTools,
    ...skillDenials.map((denial) => denial.requestedTool),
  ])];
  if (!role) {
    const denialRole = rawRole ?? '<missing-role>';
    const missingManifestDenial = explicitTools.length === 0
      ? [{
        role: denialRole,
        requestedTool: '<missing-tool-manifest>',
        reason: 'agent creation must include a role and an explicit least-privilege tool manifest',
      }]
      : [];
    const denials = [
      ...missingManifestDenial,
      ...malformedSkillsDenial,
      ...implicitSkillsDenial,
      ...explicitTools.map((requestedTool) => ({
        role: denialRole,
        requestedTool,
        reason: rawRole
          ? `role '${rawRole}' is not recognized by the least-privilege manifest`
          : 'tool requests must include a role recognized by the least-privilege manifest',
      })),
      ...skillDenials,
    ];
    return { allowed: false, rawRole, requestedTools, denials };
  }

  const effectiveTools = [...new Set([...explicitTools, ...runtimeTools, ...workflowTools, ...skillDenials
    .filter((denial) => !denial.requestedTool.startsWith('skill:'))
    .map((denial) => denial.requestedTool)])];
  if (explicitTools.length === 0) {
    return {
      allowed: false,
      role,
      rawRole,
      requestedTools,
      denials: [...malformedSkillsDenial, {
        role,
        requestedTool: '<missing-tool-manifest>',
        reason: `role '${role}' requests must include an explicit least-privilege tool manifest`,
      }, ...implicitSkillsDenial],
    };
  }

  const allowedTools = ROLE_TOOL_MANIFESTS[role];
  const denials = [
    ...malformedSkillsDenial,
    ...implicitSkillsDenial,
    ...skillDenials.filter((denial) => denial.requestedTool.startsWith('skill:')),
    ...effectiveTools
      .filter((tool) => !allowedTools.has(tool))
      .map((requestedTool) => ({
        role,
        requestedTool,
        reason: `tool '${requestedTool}' is not allowed for role '${role}' by the least-privilege manifest`,
      })),
  ];

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
