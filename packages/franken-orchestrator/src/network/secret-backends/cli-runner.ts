import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface CliProcessError {
  code?: unknown;
  stdout?: string;
  stderr?: string;
}

function toCliProcessError(error: unknown): CliProcessError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const record = error as Record<string, unknown>;
  return {
    ...('code' in record ? { code: record.code } : {}),
    ...(typeof record.stdout === 'string' ? { stdout: record.stdout } : {}),
    ...(typeof record.stderr === 'string' ? { stderr: record.stderr } : {}),
  };
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCli(
  command: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<CliResult> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = toCliProcessError(error);
    if (execError && typeof execError.code === 'number') {
      return {
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? '',
        exitCode: execError.code,
      };
    }
    throw error;
  }
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = await runCli(whichCmd, [command]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runCliWithStdin(
  command: string,
  args: string[],
  stdin: string,
  env?: Record<string, string>,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : undefined,
    }, (error, stdout, stderr) => {
      const execError = toCliProcessError(error);
      if (error && typeof execError?.code !== 'number') {
        reject(error);
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: typeof execError?.code === 'number' ? execError.code : 0,
      });
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}
