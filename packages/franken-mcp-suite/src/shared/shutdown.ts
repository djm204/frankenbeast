import { inspect } from 'node:util';

export interface StartupFailureRuntime {
  readonly stderr: Pick<NodeJS.WriteStream, 'write'>;
  readonly process: Pick<NodeJS.Process, 'exitCode'>;
}

export function describeStartupError(error: unknown): string {
  return inspect(error, { depth: 4 });
}

export function handleStartupFailure(
  serviceName: string,
  error: unknown,
  runtime: StartupFailureRuntime = { stderr: process.stderr, process },
): void {
  runtime.stderr.write(`${serviceName} failed to start: ${describeStartupError(error)}\n`);
  runtime.process.exitCode = 1;
}
