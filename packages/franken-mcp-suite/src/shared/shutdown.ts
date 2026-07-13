export interface StartupFailureRuntime {
  readonly stderr: Pick<NodeJS.WriteStream, 'write'>;
  readonly process: Pick<NodeJS.Process, 'exitCode'>;
}

export function describeStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

export function handleStartupFailure(
  serviceName: string,
  error: unknown,
  runtime: StartupFailureRuntime = { stderr: process.stderr, process },
): void {
  runtime.stderr.write(`${serviceName} failed to start: ${describeStartupError(error)}\n`);
  runtime.process.exitCode = 1;
}
