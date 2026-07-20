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
  readonly trustedSkillToolManifests?: TrustedSkillToolManifestSource | undefined;
}

export type TrustedSkillToolManifestSource =
  | Readonly<Record<string, readonly string[]>>
  | (() => Readonly<Record<string, readonly string[]>>);

export type CanonicalAgentToolPolicyConfig = Readonly<{
  agentRole?: AgentRole | undefined;
  requestedTools: readonly string[];
  skills?: readonly string[] | undefined;
}>;

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

interface RequestedToolsConfig {
  readonly explicit: boolean;
  readonly malformed: boolean;
  readonly tools: readonly string[];
}

function requestedToolsFromConfig(config: Readonly<Record<string, unknown>>): RequestedToolsConfig {
  const aliases = ['requestedTools', 'enabledTools', 'toolManifest', 'tools'] as const;
  const explicitAliases = aliases.filter(alias => Object.hasOwn(config, alias));
  return {
    explicit: explicitAliases.length > 0,
    malformed: explicitAliases.some((alias) => {
      const value = config[alias];
      return !Array.isArray(value)
        || value.some(tool => typeof tool !== 'string' || tool.trim().length === 0);
    }),
    tools: [...new Set(explicitAliases.flatMap(alias => arrayOfTools(config[alias])))],
  };
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
    malformed: explicit && (
      !Array.isArray(config.skills) || config.skills.some((skill) => typeof skill !== 'string')
    ),
    skills: [...new Set(arrayOfTools(config.skills))],
  };
}

function runtimeToolsFromConfig(
  config: Readonly<Record<string, unknown>>,
  context: ToolPolicyValidationContext,
): string[] {
  const tools: string[] = [];
  const workflow = context.initActionKind ?? context.definitionId;
  if (workflow === 'martin-loop') {
    tools.push(...ROLE_TOOL_MANIFESTS.coding);
  }
  const gitConfig = config.gitConfig;
  if (typeof gitConfig === 'object' && gitConfig !== null && !Array.isArray(gitConfig)) {
    const prCreation = (gitConfig as Readonly<Record<string, unknown>>).prCreation;
    if (prCreation === true || prCreation === 'auto' || prCreation === 'manual') {
      tools.push('github.pr');
    }
  }
  return tools;
}

function workflowRequiredTools(context: ToolPolicyValidationContext): string[] {
  const workflow = context.initActionKind ?? context.definitionId;
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

function skillToolCapability(skill: string, tool: string): string {
  const normalizedSkill = skill.toLowerCase();
  const normalizedTool = tool.toLowerCase().replaceAll('-', '_');
  const isGitHubTool = normalizedSkill.includes('github')
    || normalizedTool.startsWith('github.')
    || normalizedTool.startsWith('github_')
    || normalizedTool.startsWith('mcp__github__');
  if (!isGitHubTool) return tool;

  if (/^(?:mcp__github__|github[._])?(?:get|list|read|search|view|check)_/u.test(normalizedTool)) {
    return 'github.read';
  }
  if (normalizedTool.includes('comment') || normalizedTool.includes('review')) {
    return 'github.comment';
  }
  if (normalizedTool.includes('pull_request') || /(^|[._])pr([._]|$)/u.test(normalizedTool)) {
    return 'github.pr';
  }
  return tool;
}

function trustedSkillToolManifestFor(context: ToolPolicyValidationContext, skill: string): string[] | undefined {
  const manifests = typeof context.trustedSkillToolManifests === 'function'
    ? context.trustedSkillToolManifests()
    : context.trustedSkillToolManifests;
  if (!manifests) return undefined;

  const separator = skill.indexOf('/');
  if (separator > 0) {
    const parentSkill = skill.slice(0, separator);
    const toolId = skill.slice(separator + 1);
    const parentTools = Object.hasOwn(manifests, parentSkill)
      ? arrayOfTools(manifests[parentSkill])
      : [];
    return parentTools.includes(toolId) ? [skillToolCapability(parentSkill, toolId)] : undefined;
  }

  const exactManifest = Object.hasOwn(manifests, skill)
    ? arrayOfTools(manifests[skill])
    : undefined;
  const descriptorParents = Object.entries(manifests)
    .filter(([, tools]) => arrayOfTools(tools).includes(skill))
    .map(([parentSkill]) => parentSkill);
  if (!exactManifest && descriptorParents.length === 0) return undefined;

  return [...new Set([
    ...(exactManifest ?? []).map((tool) => skillToolCapability(skill, tool)),
    ...descriptorParents.map((parentSkill) => skillToolCapability(parentSkill, skill)),
  ])];
}

export function defaultAgentToolPolicyConfig(
  definitionId: string,
  initActionKind?: string | undefined,
  config: Readonly<Record<string, unknown>> = {},
  trustedSkillToolManifests?: TrustedSkillToolManifestSource | undefined,
): Readonly<Record<string, unknown>> {
  const context = { definitionId, initActionKind, trustedSkillToolManifests };
  const agentRole = defaultAgentRoleForWorkflow(definitionId, initActionKind);
  const selectedSkills = selectedSkillsFromConfig(config).skills;
  const trustedSkillTools = skillToolDenials(agentRole, selectedSkills, context)
    .map(denial => denial.requestedTool)
    .filter(tool => !tool.startsWith('skill:'));
  return {
    agentRole,
    requestedTools: [...new Set([
      ...workflowRequiredTools(context),
      ...runtimeToolsFromConfig(config, context),
      ...trustedSkillTools,
    ])],
    skills: [],
  };
}

function defaultAgentRoleForWorkflow(
  definitionId: string,
  initActionKind?: string | undefined,
): AgentRole {
  const workflow = definitionId === 'martin-loop'
    ? initActionKind ?? definitionId
    : definitionId;
  switch (workflow) {
    case 'chunk-plan':
    case 'design-interview':
      return 'docs';
    default:
      return 'coding';
  }
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
  const requestedToolsConfig = requestedToolsFromConfig(policyConfig);
  const explicitTools = requestedToolsConfig.tools;
  const runtimeTools = runtimeToolsFromConfig(policyConfig, context);
  const workflowTools = workflowRequiredTools(context);
  const selectedSkills = selectedSkillsFromConfig(policyConfig);
  const skillDenials = skillToolDenials(role ?? rawRole ?? '<missing-role>', selectedSkills.skills, context);
  const malformedSkillsDenial = selectedSkills.malformed
    ? [{
      role: role ?? rawRole ?? '<missing-role>',
      requestedTool: '<malformed-skills-allowlist>',
      reason: 'agent creation skills allowlist must be an explicit array of strings; use an empty skills array to disable installed skill tools',
    }]
    : [];
  const malformedToolsDenial = requestedToolsConfig.malformed
    ? [{
      role: role ?? rawRole ?? '<missing-role>',
      requestedTool: '<malformed-tool-manifest>',
      reason: 'agent creation tool manifest fields must be explicit arrays of non-empty strings',
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
      ...malformedToolsDenial,
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
  if (!requestedToolsConfig.explicit || explicitTools.length === 0) {
    return {
      allowed: false,
      role,
      rawRole,
      requestedTools,
      denials: [...malformedToolsDenial, ...malformedSkillsDenial, {
        role,
        requestedTool: '<missing-tool-manifest>',
        reason: `role '${role}' requests must include an explicit least-privilege tool manifest`,
      }, ...implicitSkillsDenial],
    };
  }

  const allowedTools = ROLE_TOOL_MANIFESTS[role];
  const undeclaredImplicitTools = effectiveTools.filter(
    (tool) => allowedTools.has(tool) && !explicitTools.includes(tool),
  );
  const denials = [
    ...malformedToolsDenial,
    ...malformedSkillsDenial,
    ...implicitSkillsDenial,
    ...skillDenials.filter((denial) => denial.requestedTool.startsWith('skill:')),
    ...undeclaredImplicitTools.map((requestedTool) => ({
      role,
      requestedTool,
      reason: `implicitly enabled tool '${requestedTool}' must be declared in the explicit least-privilege tool manifest`,
    })),
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
