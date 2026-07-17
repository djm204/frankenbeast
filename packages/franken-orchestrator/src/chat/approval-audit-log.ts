import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, readFile, open, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isoNow } from '@franken/types';

export type ApprovalAuditDecision = 'approved' | 'denied' | 'executed' | 'failed' | 'replayed' | 'skipped';

export interface ApprovalAuditDefaults {
  readonly workerId?: string | undefined;
  readonly workdir?: string | undefined;
  readonly requester?: string | undefined;
}

export interface ApprovalAuditEntry {
  readonly entryId: string;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly token?: string | undefined;
  readonly workerId: string;
  readonly workdir: string;
  readonly requester: string;
  readonly decisionSource: string;
  readonly decision: ApprovalAuditDecision;
  readonly commandHash: string;
  readonly commandBody: string;
  readonly reason?: string | undefined;
  readonly exitCode?: number;
  readonly outputTail?: string | undefined;
}

export interface ApprovalDecisionInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly token?: string | undefined;
  readonly workerId?: string | undefined;
  readonly workdir?: string | undefined;
  readonly requester?: string | undefined;
  readonly command: string;
  readonly decision: Extract<ApprovalAuditDecision, 'approved' | 'denied' | 'skipped'>;
  readonly decisionSource: string;
  readonly reason?: string | undefined;
}

export interface ApprovalExecutionInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly token?: string | undefined;
  readonly workerId?: string | undefined;
  readonly workdir?: string | undefined;
  readonly requester?: string | undefined;
  readonly command: string;
  readonly exitCode: number;
  readonly output?: string | undefined;
}

export interface ApprovalReplayInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly token?: string | undefined;
  readonly workerId?: string | undefined;
  readonly workdir?: string | undefined;
  readonly requester?: string | undefined;
  readonly command: string;
  readonly reason: string;
}

export interface ConsumedApprovalLookup {
  readonly sessionId: string;
  readonly projectId: string;
  readonly token?: string | undefined;
  readonly commandHash: string;
}

export interface ApprovalAuditLog {
  readonly path: string;
  recordDecision(input: ApprovalDecisionInput): Promise<void>;
  recordExecution(input: ApprovalExecutionInput): Promise<void>;
  recordReplay(input: ApprovalReplayInput): Promise<void>;
  hasConsumedApproval(input: ConsumedApprovalLookup): Promise<boolean>;
}

const DEFAULT_OUTPUT_TAIL_BYTES = 4096;

export function commandSha256(command: string): string {
  return createHash('sha256').update(command, 'utf8').digest('hex');
}

export function defaultApprovalAuditLogPath(root = process.cwd()): string {
  return join(root, '.fbeast', 'audit', 'hitl-approval-audit.jsonl');
}

export class FileApprovalAuditLog implements ApprovalAuditLog {
  readonly path: string;
  private readonly defaults: ApprovalAuditDefaults;

  constructor(path = defaultApprovalAuditLogPath(), defaults: ApprovalAuditDefaults = {}) {
    this.path = path;
    this.defaults = defaults;
  }

  async recordDecision(input: ApprovalDecisionInput): Promise<void> {
    await this.append({
      ...this.baseEntry(input),
      decision: input.decision,
      decisionSource: input.decisionSource,
      ...(input.reason ? { reason: input.reason } : {}),
    });
  }

  async recordExecution(input: ApprovalExecutionInput): Promise<void> {
    await this.append({
      ...this.baseEntry(input),
      decision: input.exitCode === 0 ? 'executed' : 'failed',
      decisionSource: 'runtime',
      exitCode: input.exitCode,
      ...(input.output !== undefined ? { outputTail: tail(input.output) } : {}),
    });
  }

  async recordReplay(input: ApprovalReplayInput): Promise<void> {
    await this.append({
      ...this.baseEntry(input),
      decision: 'replayed',
      decisionSource: 'audit-log',
      reason: input.reason,
    });
  }

  async hasConsumedApproval(input: ConsumedApprovalLookup): Promise<boolean> {
    const entries = await this.readEntries();
    return entries.some((entry) => entry.sessionId === input.sessionId
      && entry.projectId === input.projectId
      && entry.commandHash === input.commandHash
      && (input.token === undefined || entry.token === input.token)
      && (entry.decision === 'approved' || entry.decision === 'executed' || entry.decision === 'failed'));
  }

  private baseEntry(input: {
    readonly sessionId: string;
    readonly projectId: string;
    readonly token?: string | undefined;
    readonly workerId?: string | undefined;
    readonly workdir?: string | undefined;
    readonly requester?: string | undefined;
    readonly command: string;
  }): Omit<ApprovalAuditEntry, 'decision' | 'decisionSource'> {
    return {
      entryId: randomUUID(),
      timestamp: isoNow(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      ...(input.token ? { token: input.token } : {}),
      workerId: input.workerId ?? this.defaults.workerId ?? 'unknown-worker',
      workdir: input.workdir ?? this.defaults.workdir ?? process.cwd(),
      requester: input.requester ?? this.defaults.requester ?? 'unknown-requester',
      commandHash: commandSha256(input.command),
      commandBody: input.command,
    };
  }

  private async append(entry: ApprovalAuditEntry): Promise<void> {
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await chmod(dir, 0o700);
    } catch {
      // Best-effort hardening for already-created audit directories.
    }
    const file = await open(
      this.path,
      constants.O_CREAT | constants.O_APPEND | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.chmod(0o600);
      try {
        const existing = await file.readFile({ encoding: 'utf8' });
        if (existing.length > 0 && !existing.endsWith('\n')) {
          await file.appendFile('\n', { encoding: 'utf8' });
        }
      } catch {
        // Missing/unreadable files are handled by the append below. If an older
        // tail is corrupt, separating it with a newline prevents the next valid
        // audit entry from being merged into that corrupt line.
      }
      await file.appendFile(`${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    } finally {
      await file.close();
    }
  }

  private async readEntries(): Promise<ApprovalAuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch {
      return [];
    }

    const entries: ApprovalAuditEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as Partial<ApprovalAuditEntry>;
        if (typeof parsed.sessionId === 'string'
          && typeof parsed.projectId === 'string'
          && typeof parsed.commandHash === 'string'
          && typeof parsed.decision === 'string') {
          entries.push(parsed as ApprovalAuditEntry);
        }
      } catch {
        // Ignore corrupt partial lines. The log is append-only, so older valid
        // lines still provide replay protection after a crash during append.
      }
    }
    return entries;
  }
}

function tail(value: string): string {
  return Buffer.byteLength(value, 'utf8') <= DEFAULT_OUTPUT_TAIL_BYTES
    ? value
    : value.slice(-DEFAULT_OUTPUT_TAIL_BYTES);
}
