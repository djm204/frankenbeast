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

export function redactAbsoluteHostPathValues(value: unknown): unknown {
  if (typeof value === 'string') {
    return isAbsoluteHostPath(value) ? '[REDACTED_HOST_PATH]' : value;
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
