export interface ServerEnvironment {
  os: 'linux' | 'darwin' | 'win32';
  platform: string;
  isWsl: boolean;
  pathSeparator: '/' | '\\';
}

interface PathResult {
  normalized: string;
  valid: boolean;
  error?: string;
}

export interface NormalizePathOptions {
  /**
   * Explicit override for trusted operator-supplied paths that intentionally
   * contain `..` segments. Keep the default false for untrusted UI/API text.
   */
  allowParentTraversal?: boolean;
}

const TRAVERSAL_ERROR =
  'Path traversal is not allowed. Use allowParentTraversal only for trusted operator-supplied paths.';

function normalizeForwardSlashPath(path: string): string {
  const absolute = path.startsWith('/');
  const segments = path.split('/').filter(segment => segment.length > 0 && segment !== '.');
  const normalized = segments.join('/');

  if (absolute) {
    return `/${normalized}`;
  }

  return normalized;
}

function hasParentTraversal(path: string): boolean {
  return path.split('/').some(segment => segment === '..');
}

export function normalizePath(path: string, env: ServerEnvironment, options: NormalizePathOptions = {}): PathResult {
  if (!path) return { normalized: '', valid: false, error: 'Path is empty' };
  if (path.includes('\0')) return { normalized: '', valid: false, error: 'Path contains a NUL byte' };

  const hasBackslash = path.includes('\\');
  const windowsDrivePattern = /^[A-Za-z]:[\\/]/;

  let candidatePath = path;

  if (env.isWsl && windowsDrivePattern.test(path)) {
    const drive = path[0]!.toLowerCase();
    const rest = path.slice(3).replace(/\\/g, '/');
    candidatePath = `/mnt/${drive}/${rest}`;
  } else if (env.os === 'linux' && hasBackslash) {
    return { normalized: path, valid: false, error: 'Windows-style paths are not supported on Linux. Use forward slashes.' };
  }

  const slashNormalizedPath = candidatePath.replace(/\\/g, '/');
  if (!options.allowParentTraversal && hasParentTraversal(slashNormalizedPath)) {
    return { normalized: '', valid: false, error: TRAVERSAL_ERROR };
  }

  return { normalized: normalizeForwardSlashPath(slashNormalizedPath), valid: true };
}
