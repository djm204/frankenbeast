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

export function normalizePath(path: string, env: ServerEnvironment): PathResult {
  if (!path) return { normalized: '', valid: false, error: 'Path is empty' };

  const hasBackslash = path.includes('\\');
  const windowsDrivePattern = /^[A-Za-z]:\\/;

  if (env.isWsl && windowsDrivePattern.test(path)) {
    const drive = path[0].toLowerCase();
    const rest = path.slice(3).replace(/\\/g, '/');
    return { normalized: `/mnt/${drive}/${rest}`, valid: true };
  }

  if (env.os === 'linux' && hasBackslash) {
    return { normalized: path, valid: false, error: 'Windows-style paths are not supported on Linux. Use forward slashes.' };
  }

  return { normalized: path, valid: true };
}
