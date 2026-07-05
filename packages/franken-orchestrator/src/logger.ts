import type { ILogger } from './deps.js';


function printLine(...args: unknown[]): void {
  console.info(...args);
}
function formatLine(prefix: string, msg: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} ${prefix} ${msg}`;
}

function formatDebug(prefix: string, msg: string, data?: unknown): string {
  const base = formatLine(prefix, msg);
  if (data === undefined) {
    return base;
  }
  return `${base} ${JSON.stringify(data)}`;
}

export class ConsoleLogger implements ILogger {
  private readonly verbose: boolean;

  constructor(options: { verbose: boolean }) {
    this.verbose = options.verbose;
  }

  info(msg: string, _data?: unknown): void {
    printLine(formatLine('[beast]', msg));
  }

  debug(msg: string, data?: unknown): void {
    if (!this.verbose) {
      return;
    }
    printLine(formatDebug('[beast:debug]', msg, data));
  }

  warn(msg: string, _data?: unknown): void {
    console.warn(formatLine('[beast:warn]', msg));
  }

  error(msg: string, _data?: unknown): void {
    console.error(formatLine('[beast:error]', msg));
  }
}

export class NullLogger implements ILogger {
  info(_msg: string, _data?: unknown): void {}

  debug(_msg: string, _data?: unknown): void {}

  warn(_msg: string, _data?: unknown): void {}

  error(_msg: string, _data?: unknown): void {}
}
