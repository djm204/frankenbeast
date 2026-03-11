import { execFile as defaultExecFile } from 'node:child_process';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
export type ExecFileFn = (file: string, args: string[], callback: ExecCallback) => void;

export function parseGithubRepoFromRemoteUrl(remoteUrl: string): string {
  const trimmed = remoteUrl.trim();

  const sshMatch = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(trimmed);
  if (sshUrlMatch) {
    return `${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  const httpsMatch = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(trimmed);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  if (trimmed.includes('github.com')) {
    throw new Error(`Could not parse GitHub upstream remote URL: ${trimmed}`);
  }

  throw new Error(`--target-upstream only supports GitHub remotes. Received: ${trimmed}`);
}

export async function resolveUpstreamRepo(execFile: ExecFileFn = defaultExecFile): Promise<string> {
  const remoteUrl = await new Promise<string>((resolve, reject) => {
    execFile('git', ['remote', 'get-url', 'upstream'], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(
          '--target-upstream requires a configured GitHub upstream remote. Configure the "upstream" remote and try again.',
          { cause: stderr || error.message },
        ));
        return;
      }

      resolve(stdout);
    });
  });

  return parseGithubRepoFromRemoteUrl(remoteUrl);
}
