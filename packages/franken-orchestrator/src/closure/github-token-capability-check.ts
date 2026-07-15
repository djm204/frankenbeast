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

interface OAuthScopeReadResult {
  readonly scopes: readonly string[];
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
    const repoPermissions = readRepositoryPermissions(options.exec, options.repo);
    const evidence = buildEvidence(scopeRead.scopes, repoPermissions);
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
    return {
      scopes: [],
      warning: {
        code: 'github-api-unavailable',
        message: `OAuth scope headers were unavailable from /user; continuing with repository capability evidence only. ${sanitizeErrorMessage(error)}`,
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

function readRepositoryPermissions(exec: GitHubCapabilityExec, repo: string): RepositoryPermissions {
  const output = exec('gh', ['api', `repos/${repo}`]);
  const parsed = JSON.parse(output) as { permissions?: RepositoryPermissions | undefined };
  return parsed.permissions ?? {};
}

function buildEvidence(scopes: readonly string[], permissions: RepositoryPermissions): GitHubTokenCapabilityEvidence {
  const hasClassicRepoScope = scopes.includes('repo');
  const hasClassicPublicRepoScope = scopes.includes('public_repo');
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
      scopeWrite: hasClassicRepoScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope || repoRoleRead,
      scopesObserved,
      roleLevel: repoRoleLevel,
      source: repoRoleRead ? 'repository access check' : 'not exposed by GitHub API response',
    }),
    issues: tokenAwareItem({
      scopeWrite: hasClassicRepoScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
    pullRequests: tokenAwareItem({
      scopeWrite: hasClassicRepoScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
    contents: tokenAwareItem({
      scopeWrite: hasClassicRepoScope,
      scopeRead: hasClassicRepoScope || hasClassicPublicRepoScope,
      scopesObserved,
      roleLevel: repoRoleLevel,
      source: repoRoleRead ? 'repository.permissions (actor role; not token-specific)' : 'not exposed by GitHub API response',
    }),
  };
}

function tokenAwareItem(options: {
  readonly scopeWrite: boolean;
  readonly scopeRead: boolean;
  readonly scopesObserved: boolean;
  readonly roleLevel: GitHubCapabilityLevel;
  readonly source: string;
}): GitHubCapabilityEvidenceItem {
  if (options.scopeWrite) {
    return { available: true, level: 'write', source: 'x-oauth-scopes: repo', tokenSpecific: true };
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
    return { available: true, level: options.roleLevel, source: options.source, tokenSpecific: false };
  }
  return { available: false, level: 'none', source: options.source, tokenSpecific: false };
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
  if (levelSatisfies(evidence.level, required)) return false;
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
