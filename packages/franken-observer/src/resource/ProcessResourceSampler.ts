import { promisify } from 'node:util';
import { wallClockNow } from '@franken/types';

export const DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS = 5_000;
export const DEFAULT_IDLE_WATTS = 10;
export const DEFAULT_TDP_WATTS = 65;

export interface ProcessResourceSample {
  readonly agentId: string;
  readonly runId: string;
  readonly pid: number;
  readonly cpuPercent: number;
  readonly rssBytes: number;
  /** Best-effort model output, not a hardware power measurement. */
  readonly estimatedWatts: number;
  /** Estimated energy consumed since this sampler's previous sample. */
  readonly estimatedEnergyWh: number;
  readonly timestamp: number;
}

export interface ProcessResourceSampleQuery {
  readonly agentId?: string;
  readonly runId?: string;
  readonly since?: number;
  readonly before?: number;
  readonly limit?: number;
}

export interface ProcessResourceSampleAdapter {
  recordResourceSample(sample: ProcessResourceSample): Promise<void>;
}

export interface ProcessPowerModel {
  /** Host baseline power assigned to the process estimate. Default: 10 W. */
  readonly idleWatts?: number;
  /** Additional power at 100% process CPU utilization. Default: 65 W. */
  readonly tdpWatts?: number;
}

export interface ProcessResourceSamplerOptions extends ProcessPowerModel {
  readonly pid: number;
  readonly agentId: string;
  readonly runId: string;
  /** Sampling cadence in milliseconds. Default: 5000. */
  readonly intervalMs?: number;
  readonly adapter?: ProcessResourceSampleAdapter;
  readonly onSample?: (sample: ProcessResourceSample) => void | Promise<void>;
  readonly onError?: (error: Error) => void | Promise<void>;
}

interface RawProcessUsage {
  readonly cpuPercent: number;
  readonly rssBytes: number;
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${name} must not be empty`);
  return normalized;
}

function requireNonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

/**
 * Estimates process-attributed power using a configurable linear host model.
 * This is intentionally a coarse estimate, not a sensor measurement. CPU above
 * 100% (possible for multi-threaded processes in `ps`) is capped for the model.
 */
export function estimateProcessPower(
  cpuPercent: number,
  model: ProcessPowerModel = {},
): number {
  const normalizedCpu = Math.min(100, requireNonNegativeFinite(cpuPercent, 'cpuPercent'));
  const idleWatts = requireNonNegativeFinite(model.idleWatts ?? DEFAULT_IDLE_WATTS, 'idleWatts');
  const tdpWatts = requireNonNegativeFinite(model.tdpWatts ?? DEFAULT_TDP_WATTS, 'tdpWatts');
  return idleWatts + ((normalizedCpu / 100) * tdpWatts);
}

/**
 * Samples one OS process. The current Node process uses built-in CPU/RSS APIs;
 * child PIDs use the widely available Unix `ps` command. The latter is a v1
 * portability tradeoff: Linux/macOS are supported without a native addon,
 * while Windows child-PID sampling fails with an explicit unsupported error.
 */
export class ProcessResourceSampler {
  readonly intervalMs: number;

  private readonly pid: number;
  private readonly agentId: string;
  private readonly runId: string;
  private readonly idleWatts: number;
  private readonly tdpWatts: number;
  private readonly adapter: ProcessResourceSampleAdapter | undefined;
  private readonly onSample: ((sample: ProcessResourceSample) => void | Promise<void>) | undefined;
  private readonly onError: ((error: Error) => void | Promise<void>) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private sampleQueue: Promise<void> = Promise.resolve();
  private previousSampleAt: bigint | undefined;
  private previousCpuUsage = process.cpuUsage();
  private previousCpuAt = process.hrtime.bigint();

  constructor(options: ProcessResourceSamplerOptions) {
    if (!Number.isSafeInteger(options.pid) || options.pid <= 0) {
      throw new RangeError('pid must be a positive safe integer');
    }
    const intervalMs = options.intervalMs ?? DEFAULT_RESOURCE_SAMPLE_INTERVAL_MS;
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 100) {
      throw new RangeError('intervalMs must be a safe integer of at least 100');
    }
    this.pid = options.pid;
    this.agentId = requireNonEmpty(options.agentId, 'agentId');
    this.runId = requireNonEmpty(options.runId, 'runId');
    this.intervalMs = intervalMs;
    this.idleWatts = requireNonNegativeFinite(options.idleWatts ?? DEFAULT_IDLE_WATTS, 'idleWatts');
    this.tdpWatts = requireNonNegativeFinite(options.tdpWatts ?? DEFAULT_TDP_WATTS, 'tdpWatts');
    this.adapter = options.adapter;
    this.onSample = options.onSample;
    this.onError = options.onError;
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  sample(): Promise<ProcessResourceSample> {
    const operation = this.sampleQueue.then(() => this.collectSample());
    this.sampleQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async collectSample(): Promise<ProcessResourceSample> {
    const usage = this.pid === process.pid
      ? this.sampleCurrentProcess()
      : await this.sampleChildProcess();
    const timestamp = wallClockNow();
    const sampledAt = process.hrtime.bigint();
    const estimatedWatts = estimateProcessPower(usage.cpuPercent, {
      idleWatts: this.idleWatts,
      tdpWatts: this.tdpWatts,
    });
    const elapsedHours = this.previousSampleAt === undefined
      ? 0
      : Number(sampledAt - this.previousSampleAt) / 3_600_000_000_000;
    const sample: ProcessResourceSample = {
      agentId: this.agentId,
      runId: this.runId,
      pid: this.pid,
      cpuPercent: usage.cpuPercent,
      rssBytes: usage.rssBytes,
      estimatedWatts,
      estimatedEnergyWh: estimatedWatts * elapsedHours,
      timestamp,
    };
    this.previousSampleAt = sampledAt;
    await this.adapter?.recordResourceSample(sample);
    await this.onSample?.(sample);
    return sample;
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await Promise.all([this.inFlight, this.sampleQueue]);
  }

  private async tick(): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    const operation = this.sample()
      .then(() => undefined)
      .catch(error => this.reportError(error instanceof Error ? error : new Error(String(error))));
    this.inFlight = operation;
    try {
      await operation;
    } finally {
      if (this.inFlight === operation) this.inFlight = undefined;
    }
  }

  private async reportError(error: Error): Promise<void> {
    try {
      await this.onError?.(error);
    } catch {
      // Error reporting must not turn a recoverable background failure into an
      // unhandled rejection. Callers can instrument the callback independently.
    }
  }

  private sampleCurrentProcess(): RawProcessUsage {
    const now = process.hrtime.bigint();
    const elapsedMicros = Number(now - this.previousCpuAt) / 1_000;
    const delta = process.cpuUsage(this.previousCpuUsage);
    this.previousCpuAt = now;
    this.previousCpuUsage = process.cpuUsage();
    return {
      cpuPercent: elapsedMicros <= 0 ? 0 : ((delta.user + delta.system) / elapsedMicros) * 100,
      rssBytes: process.memoryUsage().rss,
    };
  }

  private async sampleChildProcess(): Promise<RawProcessUsage> {
    if (process.platform === 'win32') {
      throw new Error('Child-process resource sampling is unsupported on Windows; sample the current process or use a host-specific collector');
    }
    // Keep this import lazy so consumers that mock child_process for their own
    // process execution do not need to provide execFile just to import observer.
    const { execFile } = await import('node:child_process');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('ps', [
      '-o',
      '%cpu=,rss=',
      '-p',
      String(this.pid),
    ], { encoding: 'utf8', maxBuffer: 16 * 1_024 });
    const fields = stdout.trim().split(/\s+/);
    if (fields.length < 2) {
      throw new Error(`Process ${this.pid} is not running or did not return resource data`);
    }
    const cpuPercent = Number(fields[0]);
    const rssKilobytes = Number(fields[1]);
    if (!Number.isFinite(cpuPercent) || !Number.isFinite(rssKilobytes)) {
      throw new Error(`Process ${this.pid} returned invalid resource data`);
    }
    return {
      cpuPercent: Math.max(0, cpuPercent),
      rssBytes: Math.max(0, rssKilobytes) * 1_024,
    };
  }
}
