export type GitHubTokenCapability = 'repo' | 'issues' | 'pullRequests' | 'contents';
export type GitHubCapabilityLevel = 'none' | 'read' | 'write';
export type GitHubRequiredCapabilities = Partial<Record<GitHubTokenCapability, Exclude<GitHubCapabilityLevel, 'none'>>>;

export type GitHubCapabilityExec = (command: string, args: readonly string[]) => string;

export interface GitHubCapabilityEvidenceItem {
  readonly available: boolean;
  readonly level: GitHubCapabilityLevel;
  readonly source: string;
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

const EMPTY_EVIDENCE: GitHubTokenCapabilityEvidence = {
  oauthScopes: [],
  repo: { available: false, level: 'none', source: 'unavailable' },
  issues: { available: false, level: 'none', source: 'unavailable' },
  pullRequests: { available: false, level: 'none', source: 'unavailable' },
  contents: { available: false, level: 'none', source: 'unavailable' },
};

const TOKEN_RE = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[opusr]_[A-Za-z0-9_.-]{12,})\b/g;

export function checkGitHubTokenCapabilities(options: GitHubTokenCapabilityCheckOptions): GitHubTokenCapabilityCheckResult {
  try {
    const scopes = readOauthScopes(options.exec);
    const repoPermissions = readRepositoryPermissions(options.exec, options.repo);
    const evidence = buildEvidence(scopes, repoPermissions);
    const missingIssues = collectMissingRequiredCapabilities(evidence, options.required ?? {});
    const excessiveIssues = collectExcessiveWriteCapabilities(evidence, options.lowRiskPolicy);
    const warnings = options.lowRiskPolicy?.mode === 'warn' ? excessiveIssues : [];
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
        message: `Unable to inspect GitHub token capabilities: ${message}`,
      }],
      warnings: [],
    };
  }
}

function readOauthScopes(exec: GitHubCapabilityExec): readonly string[] {
  const output = exec('gh', ['api', '-i', '/user']);
  const headers = output.split(/\r?\n\r?\n/, 1)[0] ?? '';
  for (const line of headers.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (name !== 'x-oauth-scopes') continue;
    return line
      .slice(separator + 1)
      .split(',')
      .map(scope => scope.trim())
      .filter(Boolean)
      .sort();
  }
  return [];
}

function readRepositoryPermissions(exec: GitHubCapabilityExec, repo: string): RepositoryPermissions {
  const output = exec('gh', ['api', `repos/${repo}`]);
  const parsed = JSON.parse(output) as { permissions?: RepositoryPermissions | undefined };
  return parsed.permissions ?? {};
}

function buildEvidence(scopes: readonly string[], permissions: RepositoryPermissions): GitHubTokenCapabilityEvidence {
  const hasWrite = permissions.admin === true || permissions.maintain === true || permissions.push === true;
  const hasRead = hasWrite || permissions.triage === true || permissions.pull === true;
  const hasRepoScope = scopes.includes('repo');
  const hasPublicRepoScope = scopes.includes('public_repo');
  const fallbackRead = hasRepoScope || hasPublicRepoScope;
  const fallbackWrite = hasRepoScope;

  return {
    oauthScopes: scopes,
    repo: buildItem(hasRead, hasWrite, fallbackRead, fallbackWrite, 'repository.permissions.pull', 'repository.permissions.push'),
    issues: buildItem(hasRead, hasWrite, fallbackRead, fallbackWrite, 'repository.permissions.pull', 'repository.permissions.push'),
    pullRequests: buildItem(hasRead, hasWrite, fallbackRead, fallbackWrite, 'repository.permissions.pull', 'repository.permissions.push'),
    contents: buildItem(hasRead, hasWrite, fallbackRead, fallbackWrite, 'repository.permissions.pull', 'repository.permissions.push'),
  };
}

function buildItem(
  permissionRead: boolean,
  permissionWrite: boolean,
  fallbackRead: boolean,
  fallbackWrite: boolean,
  readSource: string,
  writeSource: string,
): GitHubCapabilityEvidenceItem {
  if (permissionWrite) return { available: true, level: 'write', source: writeSource };
  if (permissionRead) return { available: true, level: 'read', source: readSource };
  if (fallbackWrite) return { available: true, level: 'write', source: 'x-oauth-scopes: repo' };
  if (fallbackRead) return { available: true, level: 'read', source: 'x-oauth-scopes: public_repo' };
  return { available: false, level: 'none', source: 'not exposed by GitHub API response' };
}

function collectMissingRequiredCapabilities(
  evidence: GitHubTokenCapabilityEvidence,
  required: GitHubRequiredCapabilities,
): readonly GitHubCapabilityIssue[] {
  return (Object.entries(required) as Array<[GitHubTokenCapability, Exclude<GitHubCapabilityLevel, 'none'>]>)
    .filter(([capability, level]) => !levelSatisfies(evidence[capability].level, level))
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
    .filter(capability => evidence[capability].level === 'write' && !allowed.has(capability))
    .map(capability => ({
      code: 'excessive-write-permission' as const,
      capability,
      actual: 'write' as const,
      message: `GitHub token exposes write capability for ${capability}, which this low-risk lane does not allow.`,
    }));
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
