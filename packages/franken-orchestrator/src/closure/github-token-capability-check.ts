export type GitHubTokenCapability = 'repo' | 'issues' | 'pullRequests' | 'contents';
export type GitHubCapabilityLevel = 'none' | 'read' | 'write';
export type GitHubRequiredCapabilities = Partial<Record<GitHubTokenCapability, Exclude<GitHubCapabilityLevel, 'none'>>>;

export type GitHubCapabilityExec = (command: string, args: readonly string[]) => string;

export interface GitHubCapabilityEvidenceItem {
  readonly available: boolean;
  readonly level: GitHubCapabilityLevel;
  readonly source: string;
  /** True only when evidence comes from token-specific OAuth scope data. */
  readonly tokenSpecific: boolean;
}

export interface GitHubTokenCapabilityEvidence {
  readonly oauthScopes: readonly string[];
  readonly repo: GitHubCapabilityEvidenceItem;
  readonly issues: GitHubCapabilityEvidenceItem;
  readonly pullRequests: GitHubCapabilityEvidenceItem;
  readonly contents: GitHubCapabilityEvidenceItem;
}

export type GitHubCapabilityIssueCode =
  | 'github-api-unavailable'
  | 'missing-capability'
  | 'excessive-write-permission';

export interface GitHubCapabilityIssue {
  readonly code: GitHubCapabilityIssueCode;
  readonly message: string;
  readonly capability?: GitHubTokenCapability | undefined;
  readonly required?: GitHubCapabilityLevel | undefined;
  readonly actual?: GitHubCapabilityLevel | undefined;
}

export interface GitHubLowRiskCapabilityPolicy {
  readonly mode: 'warn' | 'fail';
  readonly allowedWriteCapabilities: readonly GitHubTokenCapability[];
}

export interface GitHubTokenCapabilityCheckOptions {
  readonly repo: string;
  readonly exec: GitHubCapabilityExec;
  readonly required?: GitHubRequiredCapabilities | undefined;
  readonly lowRiskPolicy?: GitHubLowRiskCapabilityPolicy | undefined;
}

export interface GitHubTokenCapabilityCheckResult {
  readonly ok: boolean;
  readonly evidence: GitHubTokenCapabilityEvidence;
  readonly issues: readonly GitHubCapabilityIssue[];
  readonly warnings: readonly GitHubCapabilityIssue[];
}

interface RepositoryPermissions {
  readonly pull?: boolean | undefined;
  readonly triage?: boolean | undefined;
  readonly push?: boolean | undefined;
  readonly maintain?: boolean | undefined;
  readonly admin?: boolean | undefined;
}

interface RepositoryInfo {
  readonly nodeId?: string | undefined;
  readonly isPrivate?: boolean | undefined;
  readonly permissions: RepositoryPermissions;
}

interface OAuthScopeReadResult {
  readonly scopes: readonly string[];
  readonly repositoryPermissionsTokenSpecific?: boolean | undefined;
  readonly warning?: GitHubCapabilityIssue | undefined;
}

const UNAVAILABLE_ITEM: GitHubCapabilityEvidenceItem = {
  available: false,
  level: 'none',
  source: 'unavailable',
  tokenSpecific: false,
};

const EMPTY_EVIDENCE: GitHubTokenCapabilityEvidence = {
  oauthScopes: [],
  repo: UNAVAILABLE_ITEM,
  issues: UNAVAILABLE_ITEM,
  pullRequests: UNAVAILABLE_ITEM,
  contents: UNAVAILABLE_ITEM,
};

const TOKEN_RE = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[opusr]_[A-Za-z0-9_.-]{12,})\b/g;

export function checkGitHubTokenCapabilities(options: GitHubTokenCapabilityCheckOptions): GitHubTokenCapabilityCheckResult {
  try {
    const scopeRead = readOauthScopes(options.exec);
    const repoInfo = readRepositoryInfo(options.exec, options.repo);
    const evidence = maybeProbeRequiredCapabilities(
      buildEvidence(scopeRead.scopes, repoInfo, scopeRead.repositoryPermissionsTokenSpecific === true),
      options,
      repoInfo,
    );
    const missingIssues = collectMissingRequiredCapabilities(evidence, options.required ?? {});
    const excessiveIssues = collectExcessiveWriteCapabilities(evidence, options.lowRiskPolicy);
    const warnings = [
      ...(scopeRead.warning ? [scopeRead.warning] : []),
      ...(options.lowRiskPolicy?.mode === 'warn' ? excessiveIssues : []),
    ];
    const failures = options.lowRiskPolicy?.mode === 'fail'
      ? [...missingIssues, ...excessiveIssues]
      : missingIssues;

    return {
      ok: failures.length === 0,
      evidence,
      issues: failures,
      warnings,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    return {
      ok: false,
      evidence: EMPTY_EVIDENCE,
      issues: [{
        code: 'github-api-unavailable',
        message: `Unable to inspect GitHub repository capabilities: ${message}`,
      }],
      warnings: [],
    };
  }
}

function readOauthScopes(exec: GitHubCapabilityExec): OAuthScopeReadResult {
  let output: string;
  try {
    output = exec('gh', ['api', '-i', '/user']);
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    return {
      scopes: [],
      repositoryPermissionsTokenSpecific: /resource not accessible by integration|GH_TOKEN|GitHub Actions/i.test(message),
      warning: {
        code: 'github-api-unavailable',
        message: `OAuth scope headers were unavailable from /user; continuing with repository capability evidence only. ${message}`,
      },
    };
  }

  const headers = output.split(/\r?\n\r?\n/, 1)[0] ?? '';
  for (const line of headers.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (name !== 'x-oauth-scopes') continue;
    return {
      scopes: line
        .slice(separator + 1)
        .split(',')
        .map(scope => scope.trim())
        .filter(Boolean)
        .sort(),
    };
  }
  return { scopes: [] };
}

function readRepositoryInfo(exec: GitHubCapabilityExec, repo: string): RepositoryInfo {
  const output = exec('gh', ['api', `repos/${repo}`]);
  const parsed = JSON.parse(output) as {
    node_id?: string | undefined;
    private?: boolean | undefined;
    permissions?: RepositoryPermissions | undefined;
  };
  return { nodeId: parsed.node_id, isPrivate: parsed.private, permissions: parsed.permissions ?? {} };
}

function buildEvidence(
  scopes: readonly string[],
  repoInfo: RepositoryInfo,
  repositoryPermissionsTokenSpecific = false,
): GitHubTokenCapabilityEvidence {
  const { permissions } = repoInfo;
  const hasClassicRepoScope = scopes.includes('repo');
  const hasClassicPublicRepoScope = scopes.includes('public_repo');
  const hasClassicPublicRepoWriteScope = hasClassicPublicRepoScope && repoInfo.isPrivate !== true;
  const scopesObserved = scopes.length > 0;
  const repoRoleRead = permissions.admin === true
    || permissions.maintain === true
    || permissions.push === true
    || permissions.triage === true
    || permissions.pull === true;
  const repoRoleWrite = permissions.admin === true || permissions.maintain === true || permissions.push === true;
  const repoRoleLevel: GitHubCapabilityLevel = repoRoleWrite ? 'write' : repoRoleRead ? 'read' : 'none';

  return {
    oauthScopes: scopes,
    repo: tokenAwareItem({
      scopeWrite: hasClassicRepoScope || hasClassicPublicRepoWriteScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope || repoRoleRead,
      scopesObserved,
      roleLevel: repoRoleLevel,
      roleTokenSpecific: repositoryPermissionsTokenSpecific,
      source: repoRoleRead ? 'repository access check' : 'not exposed by GitHub API response',
    }),
    issues: tokenAwareItem({
      scopeWrite: hasClassicRepoScope || hasClassicPublicRepoWriteScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      roleTokenSpecific: repositoryPermissionsTokenSpecific,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
    pullRequests: tokenAwareItem({
      scopeWrite: hasClassicRepoScope || hasClassicPublicRepoWriteScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      roleTokenSpecific: repositoryPermissionsTokenSpecific,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
    contents: tokenAwareItem({
      scopeWrite: hasClassicRepoScope || hasClassicPublicRepoWriteScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      roleTokenSpecific: repositoryPermissionsTokenSpecific,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
  };
}

function tokenAwareItem(options: {
  readonly scopeWrite: boolean;
  readonly scopeRead: boolean;
  readonly scopesObserved: boolean;
  readonly roleLevel: GitHubCapabilityLevel;
  readonly roleTokenSpecific?: boolean | undefined;
  readonly source: string;
}): GitHubCapabilityEvidenceItem {
  if (options.scopeWrite) {
    if (options.roleLevel === 'write') {
      return { available: true, level: 'write', source: 'x-oauth-scopes: repo/public_repo + repository write access', tokenSpecific: true };
    }
    return { available: true, level: options.roleLevel === 'read' ? 'read' : 'none', source: 'x-oauth-scopes: repo without repository write access', tokenSpecific: true };
  }
  if (options.scopeRead) {
    return {
      available: true,
      level: options.roleLevel === 'write' ? 'write' : 'read',
      source: options.source,
      tokenSpecific: false,
    };
  }
  if (options.scopesObserved) {
    return {
      available: false,
      level: 'none',
      source: 'x-oauth-scopes lacks repo/public_repo',
      tokenSpecific: true,
    };
  }
  if (options.roleLevel !== 'none') {
    return { available: true, level: options.roleLevel, source: options.source, tokenSpecific: options.roleTokenSpecific === true };
  }
  return { available: false, level: 'none', source: options.source, tokenSpecific: false };
}

function maybeProbeRequiredCapabilities(
  evidence: GitHubTokenCapabilityEvidence,
  options: GitHubTokenCapabilityCheckOptions,
  repoInfo: RepositoryInfo,
): GitHubTokenCapabilityEvidence {
  if (options.required?.pullRequests !== 'write' || evidence.pullRequests.tokenSpecific) {
    return evidence;
  }
  const probe = probePullRequestWrite(options.exec, repoInfo.nodeId);
  return {
    ...evidence,
    pullRequests: probe
      ? { available: true, level: 'write', source: 'GraphQL createPullRequest validation probe', tokenSpecific: true }
      : { available: false, level: 'none', source: 'GraphQL createPullRequest permission probe failed', tokenSpecific: true },
  };
}

function probePullRequestWrite(exec: GitHubCapabilityExec, repositoryId?: string): boolean {
  if (!repositoryId) return false;
  const query = 'mutation($repositoryId:ID!){createPullRequest(input:{repositoryId:$repositoryId,baseRefName:"__franken_capability_preflight_base..invalid__",headRefName:"__franken_capability_preflight_head..invalid__",title:"franken capability preflight",body:"preflight"}){pullRequest{id}}}';
  try {
    exec('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `repositoryId=${repositoryId}`]);
    return true;
  } catch (error) {
    const message = sanitizeErrorMessage(error).toLowerCase();
    if (message.includes('resource not accessible')
      || message.includes('not permitted')
      || message.includes('permission')
      || message.includes('forbidden')) {
      return false;
    }
    return message.includes('could not resolve')
      || message.includes('not exist')
      || message.includes('validation')
      || message.includes('base')
      || message.includes('head');
  }
}

function collectMissingRequiredCapabilities(
  evidence: GitHubTokenCapabilityEvidence,
  required: GitHubRequiredCapabilities,
): readonly GitHubCapabilityIssue[] {
  return (Object.entries(required) as Array<[GitHubTokenCapability, Exclude<GitHubCapabilityLevel, 'none'>]>)
    .filter(([capability, level]) => isDefinitivelyMissing(evidence[capability], level))
    .map(([capability, level]) => ({
      code: 'missing-capability' as const,
      capability,
      required: level,
      actual: evidence[capability].level,
      message: `GitHub token is missing ${level} capability for ${capability}.`,
    }));
}

function collectExcessiveWriteCapabilities(
  evidence: GitHubTokenCapabilityEvidence,
  policy?: GitHubLowRiskCapabilityPolicy,
): readonly GitHubCapabilityIssue[] {
  if (!policy) return [];
  const allowed = new Set(policy.allowedWriteCapabilities);
  const capabilities: readonly GitHubTokenCapability[] = ['repo', 'issues', 'pullRequests', 'contents'];
  return capabilities
    .filter(capability => evidence[capability].tokenSpecific && evidence[capability].level === 'write' && !allowed.has(capability))
    .map(capability => ({
      code: 'excessive-write-permission' as const,
      capability,
      actual: 'write' as const,
      message: `GitHub token exposes write capability for ${capability}, which this low-risk lane does not allow.`,
    }));
}

function isDefinitivelyMissing(
  evidence: GitHubCapabilityEvidenceItem,
  required: Exclude<GitHubCapabilityLevel, 'none'>,
): boolean {
  if (levelSatisfies(evidence.level, required) && (required !== 'write' || evidence.tokenSpecific)) return false;
  if (required === 'write' && (evidence.level === 'read' || !evidence.tokenSpecific)) return true;
  return evidence.tokenSpecific || evidence.level === 'none';
}

function levelSatisfies(actual: GitHubCapabilityLevel, required: Exclude<GitHubCapabilityLevel, 'none'>): boolean {
  if (required === 'read') return actual === 'read' || actual === 'write';
  return actual === 'write';
}

function sanitizeErrorMessage(error: unknown): string {
  const err = error as { message?: unknown; stderr?: unknown };
  const raw = typeof err.stderr === 'string'
    ? err.stderr
    : typeof err.message === 'string'
      ? err.message
      : String(error);
  return raw.replace(TOKEN_RE, '<redacted>');
}
