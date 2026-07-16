import { Buffer } from 'node:buffer';
import type { ApprovalRequest, ApprovalResponse } from '../core/types.js';
import type { HighRiskActionClass } from './high-risk-action-policy.js';
import { isHighRiskActionClass } from './high-risk-action-policy.js';

export interface ApprovalAnomalyDetectorConfig {
  readonly enabled?: boolean;
  readonly windowMs?: number;
  readonly retryWindowMs?: number;
  readonly maxApprovalsPerWindow?: number;
  readonly maxUniqueWorkdirsPerWindow?: number;
  readonly maxRepeatedDestructiveCommands?: number;
  readonly maxRapidRetries?: number;
}

export type ApprovalAnomalyRuleId =
  | 'approval-volume'
  | 'repeated-destructive-command'
  | 'many-unique-workdirs'
  | 'rapid-retry-loop';

export interface ApprovalAnomalyFinding {
  readonly ruleId: ApprovalAnomalyRuleId;
  readonly severity: 'medium' | 'high';
  readonly reason: string;
  readonly evidence: {
    readonly count?: number;
    readonly workerId?: string;
    readonly workdir?: string;
    readonly uniqueWorkdirs?: readonly string[];
    readonly commandClass?: string;
    readonly commandFingerprint?: string;
    readonly windowMs: number;
    readonly requestIds: readonly string[];
  };
}

export interface ApprovalAnomalyDecision {
  readonly flagged: boolean;
  readonly acknowledgementToken: string;
  readonly findings: readonly ApprovalAnomalyFinding[];
  readonly evidence: ApprovalTrafficEvidence;
}

export interface ApprovalTrafficEvidence {
  readonly requestId: string;
  readonly workerId: string;
  readonly workdir: string;
  readonly commandClass: string;
  readonly commandFingerprint: string;
  readonly timestampMs: number;
}

interface ApprovalTrafficRecord extends ApprovalTrafficEvidence {
  readonly destructive: boolean;
}

export const DEFAULT_APPROVAL_ANOMALY_CONFIG: Required<ApprovalAnomalyDetectorConfig> = {
  enabled: true,
  windowMs: 5 * 60_000,
  retryWindowMs: 60_000,
  maxApprovalsPerWindow: 12,
  maxUniqueWorkdirsPerWindow: 4,
  maxRepeatedDestructiveCommands: 3,
  maxRapidRetries: 4,
};

const DESTRUCTIVE_COMMAND_CLASSES = new Set<HighRiskActionClass>([
  'git-remote-write',
  'github-mutation',
  'cron',
  'memory',
  'profile-write',
  'webhook',
  'shell-process-control',
]);

const ACKNOWLEDGEMENT_TOKEN_EDGE = '[\\s,;|()\\[\\]{}<>"\'`]';

export class ApprovalAnomalyDetector {
  private readonly config: Required<ApprovalAnomalyDetectorConfig>;
  private records: ApprovalTrafficRecord[] = [];

  constructor(config: ApprovalAnomalyDetectorConfig = {}) {
    this.config = normalizeApprovalAnomalyDetectorConfig(config);
  }

  record(request: ApprovalRequest, receiptTimestampMs = Date.now()): ApprovalAnomalyDecision {
    const evidence = extractApprovalTrafficEvidence(request, receiptTimestampMs);
    const record: ApprovalTrafficRecord = {
      ...evidence,
      destructive: isDestructiveApprovalRequest(request, evidence.commandClass),
    };

    this.records = [...this.records, record].filter(
      (candidate) => isWithinLookbackWindow(candidate, evidence.timestampMs, this.config.windowMs),
    );

    if (!this.config.enabled) {
      return {
        flagged: false,
        acknowledgementToken: formatApprovalAnomalyAcknowledgementToken(evidence),
        findings: [],
        evidence,
      };
    }

    const findings = this.evaluate(record);
    return {
      flagged: findings.length > 0,
      acknowledgementToken: formatApprovalAnomalyAcknowledgementToken(evidence),
      findings,
      evidence,
    };
  }

  private evaluate(current: ApprovalTrafficRecord): ApprovalAnomalyFinding[] {
    const windowRecords = this.records.filter(
      (record) => isWithinLookbackWindow(record, current.timestampMs, this.config.windowMs),
    );
    const workerRecords = windowRecords.filter((record) => record.workerId === current.workerId);
    const retryRecords = workerRecords.filter(
      (record) => isWithinLookbackWindow(record, current.timestampMs, this.config.retryWindowMs),
    );
    const findings: ApprovalAnomalyFinding[] = [];

    if (workerRecords.length > this.config.maxApprovalsPerWindow) {
      findings.push({
        ruleId: 'approval-volume',
        severity: 'medium',
        reason: `Worker ${current.workerId} requested ${workerRecords.length} approvals inside ${this.config.windowMs}ms.`,
        evidence: {
          count: workerRecords.length,
          workerId: current.workerId,
          windowMs: this.config.windowMs,
          requestIds: workerRecords.map((record) => record.requestId),
        },
      });
    }

    const uniqueWorkdirs = [...new Set(workerRecords.map((record) => record.workdir))].filter(Boolean);
    if (uniqueWorkdirs.length > this.config.maxUniqueWorkdirsPerWindow) {
      findings.push({
        ruleId: 'many-unique-workdirs',
        severity: 'high',
        reason: `Worker ${current.workerId} requested approvals from ${uniqueWorkdirs.length} unique workdirs in one window.`,
        evidence: {
          count: uniqueWorkdirs.length,
          workerId: current.workerId,
          uniqueWorkdirs,
          windowMs: this.config.windowMs,
          requestIds: workerRecords.map((record) => record.requestId),
        },
      });
    }

    const destructiveRepeats = workerRecords.filter(
      (record) => record.destructive
        && record.commandClass === current.commandClass
        && record.commandFingerprint === current.commandFingerprint,
    );
    if (current.destructive && destructiveRepeats.length >= this.config.maxRepeatedDestructiveCommands) {
      findings.push({
        ruleId: 'repeated-destructive-command',
        severity: 'high',
        reason: `Repeated destructive ${current.commandClass} approvals match the same command fingerprint.`,
        evidence: {
          count: destructiveRepeats.length,
          workerId: current.workerId,
          workdir: current.workdir,
          commandClass: current.commandClass,
          commandFingerprint: current.commandFingerprint,
          windowMs: this.config.windowMs,
          requestIds: destructiveRepeats.map((record) => record.requestId),
        },
      });
    }

    const rapidRetries = retryRecords.filter(
      (record) => record.commandClass === current.commandClass
        && record.commandFingerprint === current.commandFingerprint,
    );
    if (rapidRetries.length >= this.config.maxRapidRetries) {
      findings.push({
        ruleId: 'rapid-retry-loop',
        severity: 'high',
        reason: `Rapid retry loop detected for ${current.commandClass} approvals from worker ${current.workerId}.`,
        evidence: {
          count: rapidRetries.length,
          workerId: current.workerId,
          workdir: current.workdir,
          commandClass: current.commandClass,
          commandFingerprint: current.commandFingerprint,
          windowMs: this.config.retryWindowMs,
          requestIds: rapidRetries.map((record) => record.requestId),
        },
      });
    }

    return findings;
  }
}

export function normalizeApprovalAnomalyDetectorConfig(
  config: ApprovalAnomalyDetectorConfig = {},
): Required<ApprovalAnomalyDetectorConfig> {
  const merged = {
    ...DEFAULT_APPROVAL_ANOMALY_CONFIG,
    ...config,
  };
  if (typeof merged.enabled !== 'boolean') {
    throw new Error('Invalid approval anomaly detector config: enabled must be a boolean');
  }
  for (const [key, value] of Object.entries(merged)) {
    if (key === 'enabled') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new Error(`Invalid approval anomaly detector config: ${key} must be a positive integer`);
    }
  }
  return {
    enabled: merged.enabled,
    windowMs: merged.windowMs,
    retryWindowMs: merged.retryWindowMs,
    maxApprovalsPerWindow: merged.maxApprovalsPerWindow,
    maxUniqueWorkdirsPerWindow: merged.maxUniqueWorkdirsPerWindow,
    maxRepeatedDestructiveCommands: merged.maxRepeatedDestructiveCommands,
    maxRapidRetries: merged.maxRapidRetries,
  };
}

export function extractApprovalTrafficEvidence(
  request: ApprovalRequest,
  receiptTimestampMs = Date.now(),
): ApprovalTrafficEvidence {
  const metadata = request.metadata ?? {};
  const timestampMs = Number.isFinite(receiptTimestampMs)
    ? receiptTimestampMs
    : Date.now();

  return {
    requestId: request.requestId,
    workerId: readMetadataString(metadata, 'workerId')
      ?? readMetadataString(metadata, 'worker_id')
      ?? request.taskId,
    workdir: readMetadataString(metadata, 'workdir')
      ?? readMetadataString(metadata, 'workspace')
      ?? readMetadataString(metadata, 'cwd')
      ?? 'unknown-workdir',
    commandClass: readMetadataString(metadata, 'commandClass')
      ?? readMetadataString(metadata, 'command_class')
      ?? readMetadataString(metadata, 'actionClass')
      ?? 'unknown',
    commandFingerprint: fingerprintCommand(
      readMetadataString(metadata, 'command')
        ?? readMetadataString(metadata, 'operation')
        ?? request.planDiff
        ?? request.summary,
    ),
    timestampMs,
  };
}

export function formatApprovalAnomalyAcknowledgementToken(evidence: ApprovalTrafficEvidence): string {
  const encodedRequestId = Buffer.from(evidence.requestId, 'utf8').toString('base64url') || 'empty';
  return `ACK-APPROVAL-ANOMALY-${encodedRequestId}`;
}

export function formatApprovalAnomalySummary(decision: ApprovalAnomalyDecision): string {
  const findingText = decision.findings
    .map((finding) => `${finding.ruleId}: ${finding.reason}`)
    .join(' | ');
  return [
    'Approval anomaly detected before execution.',
    findingText,
    `To approve anyway, respond with ${decision.acknowledgementToken} in approval feedback.`,
  ].join(' ');
}

export function hasApprovalAnomalyAcknowledgement(
  _request: ApprovalRequest,
  response: ApprovalResponse,
  decision: ApprovalAnomalyDecision,
): boolean {
  if (!response.feedback) return false;
  const escapedToken = decision.acknowledgementToken.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(^|${ACKNOWLEDGEMENT_TOKEN_EDGE})${escapedToken}($|${ACKNOWLEDGEMENT_TOKEN_EDGE})`, 'u')
    .test(response.feedback);
}

function isWithinLookbackWindow(
  record: ApprovalTrafficRecord,
  currentTimestampMs: number,
  windowMs: number,
): boolean {
  const ageMs = currentTimestampMs - record.timestampMs;
  return ageMs >= 0 && ageMs <= windowMs;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isDestructiveApprovalRequest(request: ApprovalRequest, commandClass: string): boolean {
  const metadata = request.metadata ?? {};
  if (metadata.destructive === true || metadata.force === true) {
    return true;
  }
  if (isHighRiskActionClass(commandClass) && DESTRUCTIVE_COMMAND_CLASSES.has(commandClass)) {
    return true;
  }
  const destructiveText = /(^|\s)(force-push|--force-with-lease|rm\s+-rf|delete|destroy|drop|kill|terminate)(\s|$)/iu.test(
    `${request.summary}\n${request.planDiff ?? ''}\n${readMetadataString(metadata, 'command') ?? ''}\n${readMetadataString(metadata, 'commandText') ?? ''}`,
  );
  if (destructiveText) {
    return true;
  }
  return false;
}

function fingerprintCommand(command: string): string {
  return command.trim().replace(/\s+/gu, ' ').slice(0, 160);
}
