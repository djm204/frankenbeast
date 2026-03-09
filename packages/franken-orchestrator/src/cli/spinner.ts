const FRAMES = ['|', '/', '-', '\\'];
const INTERVAL_MS = 100;

export interface SpinnerOptions {
  write?: (text: string) => void;
  silent?: boolean;
}

export class Spinner {
  private readonly write: (text: string) => void;
  private readonly silent: boolean;
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private label = '';
  private startMs = 0;

  constructor(options: SpinnerOptions = {}) {
    this.write = options.write ?? ((text: string) => process.stderr.write(text));
    this.silent = options.silent ?? false;
  }

  start(label: string): void {
    if (this.silent) return;
    this.label = label;
    this.startMs = Date.now();
    this.frameIdx = 0;
    this.render();
    this.interval = setInterval(() => this.render(), INTERVAL_MS);
  }

  stop(finalMessage?: string): void {
    if (this.silent) return;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.write('\r\x1b[K');
    if (finalMessage) {
      this.write(`${finalMessage}\n`);
    }
  }

  elapsed(): number {
    return Date.now() - this.startMs;
  }

  private render(): void {
    const frame = FRAMES[this.frameIdx % FRAMES.length];
    const secs = ((Date.now() - this.startMs) / 1000).toFixed(1);
    this.write(`\r\x1b[K${frame} ${this.label} (${secs}s)`);
    this.frameIdx++;
  }
}

/**
 * Wraps an async operation with a spinner.
 * Starts spinner before calling fn, stops when fn resolves/rejects.
 */
export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  options: SpinnerOptions = {},
): Promise<T> {
  const spinner = new Spinner(options);
  spinner.start(label);
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}
