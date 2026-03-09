const FRAMES = ['|', '/', '-', '\\'];
const INTERVAL_MS = 100;
const LABEL_ROTATE_MS = 5_000;

/** Quirky phrases for the chat spinner. Rotates every 5 seconds. */
export const QUIRKY_PHRASES: string[] = [
  'fetching the biscuits',
  'spinning the knobs',
  'levering the levers',
  'greasing the doorknobs',
  'consulting the oracle',
  'warming up the hamsters',
  'polishing the pixels',
  'untangling the spaghetti',
  'bribing the electrons',
  'asking the magic 8-ball',
  'herding the semicolons',
  'defrosting the cache',
  'tickling the server',
  'reticulating splines',
  'waking up the gnomes',
  'shaking the magic tree',
  'buttering the toast',
  'folding the internet',
  'dusting off the bits',
  'charming the compiler',
];

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
  private labels: string[] = [];
  private startMs = 0;

  constructor(options: SpinnerOptions = {}) {
    this.write = options.write ?? ((text: string) => process.stderr.write(text));
    this.silent = options.silent ?? false;
  }

  start(label: string | string[]): void {
    if (this.silent) return;
    if (Array.isArray(label)) {
      this.labels = label;
      this.label = label[0] ?? '';
    } else {
      this.labels = [];
      this.label = label;
    }
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
    // Rotate through labels every 5 seconds
    if (this.labels.length > 0) {
      const idx = Math.floor((Date.now() - this.startMs) / LABEL_ROTATE_MS) % this.labels.length;
      this.label = this.labels[idx]!;
    }
    const frame = FRAMES[this.frameIdx % FRAMES.length];
    const secs = ((Date.now() - this.startMs) / 1000).toFixed(1);
    this.write(`\r\x1b[K${frame} ${this.label} (${secs}s)`);
    this.frameIdx++;
  }
}

/**
 * Wraps an async operation with a spinner.
 * Starts spinner before calling fn, stops when fn resolves/rejects.
 * Pass a string[] for rotating labels (cycles every 5 seconds).
 */
export async function withSpinner<T>(
  label: string | string[],
  fn: () => Promise<T>,
  options: SpinnerOptions = {},
): Promise<T> {
  const spinner = new Spinner(options);
  spinner.start(label);
  try {
    return await fn();
  } finally {
    spinner.stop();
  }
}
