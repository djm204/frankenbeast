const HOST_PATH_KEYS = new Set([
  'projectRoot',
  'workspaceHostPath',
  'worktreePath',
  'worktreeExecutionCwd',
  'worktreeProjectRoot',
  'command',
  'args',
  'dockerCommand',
  'dockerArgs',
]);

function isAbsoluteHostPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\');
}

const EMBEDDED_HOST_PATH_RE = /(^|\s)(\/(?:[^\s"']+\/?)+|[A-Za-z]:[\\/](?:[^\s"']+)|\\\\(?:[^\s"']+))/gu;

function redactEmbeddedAbsoluteHostPaths(value: string): string {
  return value.replace(
    EMBEDDED_HOST_PATH_RE,
    (_match, prefix: string) => `${prefix}[REDACTED_HOST_PATH]`,
  );
}

export function redactAbsoluteHostPathValues(value: unknown): unknown {
  if (typeof value === 'string') {
    return isAbsoluteHostPath(value) ? '[REDACTED_HOST_PATH]' : redactEmbeddedAbsoluteHostPaths(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactAbsoluteHostPathValues);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'projectRoot')
      .map(([key, nested]) => [key, redactAbsoluteHostPathValues(nested)]),
  );
}

export function redactHostExecutionData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactHostExecutionData);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !HOST_PATH_KEYS.has(key))
      .map(([key, nested]) => [key, redactHostExecutionData(nested)]),
  );
}
