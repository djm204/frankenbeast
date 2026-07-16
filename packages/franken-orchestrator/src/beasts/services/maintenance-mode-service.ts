import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { wallClockNow } from '@franken/types';

export interface MaintenanceModeState {
  readonly enabled: boolean;
  readonly reason?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly allowedCommands: readonly string[];
}

export interface MaintenanceModeActivation {
  readonly reason?: string | undefined;
  readonly startedAt?: string | undefined;
}

const DEFAULT_ALLOWED_COMMANDS = [
  'beasts list',
  'beasts status <run-id>',
  'beasts logs <run-id>',
  'beasts stop <run-id>',
  'beasts kill <run-id>',
  'beasts maintenance off',
] as const;

export class MaintenanceModeError extends Error {
  constructor(readonly state: MaintenanceModeState) {
    const reason = state.reason ? ` Reason: ${state.reason}` : '';
    super(`Maintenance mode is active; new Beast dispatch is paused.${reason}`);
    this.name = 'MaintenanceModeError';
  }
}

export class MaintenanceModeService {
  constructor(private readonly stateFile: string) {}

  static forProjectRoot(projectRoot: string): MaintenanceModeService {
    return new MaintenanceModeService(join(projectRoot, '.fbeast', 'maintenance-mode.json'));
  }

  getState(): MaintenanceModeState {
    const parsed = this.readStateFile();
    if (!parsed?.enabled) {
      return this.disabledState();
    }
    return {
      enabled: true,
      ...(typeof parsed.reason === 'string' && parsed.reason.trim().length > 0 ? { reason: parsed.reason } : {}),
      ...(typeof parsed.startedAt === 'string' && parsed.startedAt.trim().length > 0 ? { startedAt: parsed.startedAt } : {}),
      allowedCommands: DEFAULT_ALLOWED_COMMANDS,
    };
  }

  activate(input: MaintenanceModeActivation = {}): MaintenanceModeState {
    const state: MaintenanceModeState = {
      enabled: true,
      ...(input.reason && input.reason.trim().length > 0 ? { reason: input.reason.trim() } : {}),
      startedAt: input.startedAt ?? new Date(wallClockNow()).toISOString(),
      allowedCommands: DEFAULT_ALLOWED_COMMANDS,
    };
    mkdirSync(dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    return state;
  }

  deactivate(): MaintenanceModeState {
    rmSync(this.stateFile, { force: true });
    return this.disabledState();
  }

  assertDispatchAllowed(): void {
    const state = this.getState();
    if (state.enabled) {
      throw new MaintenanceModeError(state);
    }
  }

  private disabledState(): MaintenanceModeState {
    return {
      enabled: false,
      allowedCommands: DEFAULT_ALLOWED_COMMANDS,
    };
  }

  private readStateFile(): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(readFileSync(this.stateFile, 'utf8')) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : this.unreadableState();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return undefined;
      }
      return this.unreadableState();
    }
  }

  private unreadableState(): Record<string, unknown> {
    return {
      enabled: true,
      reason: `Maintenance state is unreadable; dispatch is paused until ${this.stateFile} is repaired or removed.`,
    };
  }
}
