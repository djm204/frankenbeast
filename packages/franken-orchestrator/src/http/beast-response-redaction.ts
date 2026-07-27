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

const EMBEDDED_HOST_PATH_RE = /(^|[\s=:\[({,;|!?])(\/(?:home|Users|private|var|tmp|srv|opt|etc|root|mnt|workspace|workspaces)\/(?:[^\s"']+\/?)+|[A-Za-z]:[\\/](?:[^\s"']+)|\\\\(?:[^\s"']+))/gu;
const EMBEDDED_POSIX_PATH_RE = /(^|[\s=:\[({,;|!?])(\/(?:[^/\s"']+\/)*[^/\s"']+)/gu;
const QUOTED_POSIX_HOST_PATH_RE = /(['"])(\/(?:[^/'"\s]+\/)+[^'"\s]+)(?=\1)/gu;
const FILE_URL_RE = /\bfile:\/\/[^\s"']+/giu;
const API_ROUTE_RE = /^\/(?:api|v\d+|comms|webhooks)(?:\/|$)/u;
const API_ROUTE_KEYS = new Set(['route', 'endpoint', 'requestPath', 'pathname']);
const SLASH_COMMANDS = new Set([
  '/plan', '/run', '/status', '/diff', '/approve', '/reject', '/session', '/quit',
]);

function isApplicationPath(value: string, allowApiRoute: boolean): boolean {
  const command = value.match(/^(\/[^\s]+)(?:\s|$)/u)?.[1];
  return (allowApiRoute && API_ROUTE_RE.test(value))
    || (API_ROUTE_RE.test(value) && /[?#]/u.test(value))
    || (command !== undefined && SLASH_COMMANDS.has(command));
}

function hasApplicationRouteContext(
  value: string,
  path: string,
  offset: number,
  prefix: string,
  allowApiRoute: boolean,
): boolean {
  if (SLASH_COMMANDS.has(path)) return true;
  if (!API_ROUTE_RE.test(path)) return false;
  if (allowApiRoute || (offset === 0 && /[?#]/u.test(path))) return true;
  const context = value.slice(0, offset + prefix.length);
  return /(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Call|Check|and)\s+["']?$/iu.test(context);
}

function redactEmbeddedAbsoluteHostPaths(value: string, allowApiRoute: boolean): string {
  return value.replace(FILE_URL_RE, 'file://[REDACTED_HOST_PATH]').replace(
    EMBEDDED_HOST_PATH_RE,
    (_match, prefix: string) => `${prefix}[REDACTED_HOST_PATH]`,
  ).replace(
    EMBEDDED_POSIX_PATH_RE,
    (_match, prefix: string, path: string, offset: number, source: string) => (
      hasApplicationRouteContext(source, path, offset, prefix, allowApiRoute)
        ? `${prefix}${path}`
        : `${prefix}[REDACTED_HOST_PATH]`
    ),
  ).replace(
    QUOTED_POSIX_HOST_PATH_RE,
    (_match, quote: string, path: string, offset: number, source: string) => (
      hasApplicationRouteContext(source, path, offset, quote, allowApiRoute)
        ? `${quote}${path}`
        : `${quote}[REDACTED_HOST_PATH]`
    ),
  );
}

function redactAbsoluteHostPathValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const allowApiRoute = key !== undefined && API_ROUTE_KEYS.has(key);
    return isApplicationPath(value, allowApiRoute)
      ? redactEmbeddedAbsoluteHostPaths(value, allowApiRoute)
      : isAbsoluteHostPath(value) ? '[REDACTED_HOST_PATH]' : redactEmbeddedAbsoluteHostPaths(value, allowApiRoute);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactAbsoluteHostPathValue(entry, key));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'projectRoot')
      .map(([nestedKey, nested]) => [nestedKey, redactAbsoluteHostPathValue(nested, nestedKey)]),
  );
}

export function redactAbsoluteHostPathValues(value: unknown): unknown {
  return redactAbsoluteHostPathValue(value);
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
