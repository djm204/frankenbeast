import type { BeastDefinition, BeastExecutionMode } from '../types.js';
import type { BeastExecutors } from './beast-dispatch-service.js';

export interface DispatcherStartupIntegrityFinding {
  readonly code:
    | 'no_definitions'
    | 'duplicate_definition_id'
    | 'invalid_definition_id'
    | 'invalid_definition_version'
    | 'missing_definition_metadata'
    | 'invalid_execution_mode'
    | 'missing_executor'
    | 'invalid_executor_contract'
    | 'invalid_prompt_contract'
    | 'invalid_telemetry_labels'
    | 'invalid_process_spec_builder';
  readonly message: string;
  readonly definitionId?: string | undefined;
  readonly mode?: string | undefined;
}

export interface DispatcherStartupIntegrityReport {
  readonly ok: boolean;
  readonly definitionsChecked: number;
  readonly executorModes: readonly string[];
  readonly errors: readonly DispatcherStartupIntegrityFinding[];
  readonly operatorGuidance: string;
}

export class DispatcherStartupIntegrityError extends Error {
  constructor(readonly report: DispatcherStartupIntegrityReport) {
    super(formatDispatcherStartupIntegrityError(report));
    this.name = 'DispatcherStartupIntegrityError';
  }
}

const VALID_EXECUTION_MODES = new Set<BeastExecutionMode>(['process', 'container']);
const VALID_PROMPT_KINDS = new Set(['string', 'boolean', 'file', 'directory']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExecutorContract(value: unknown): boolean {
  return isRecord(value)
    && typeof value.start === 'function'
    && typeof value.stop === 'function'
    && typeof value.kill === 'function';
}

function availableExecutorModes(executors: Partial<BeastExecutors>): string[] {
  return (['process', 'container'] as const).filter((mode) => hasExecutorContract(executors[mode]));
}

function formatDispatcherStartupIntegrityError(report: DispatcherStartupIntegrityReport): string {
  const details = report.errors.map((finding) => {
    const target = finding.definitionId ? ` ${finding.definitionId}` : finding.mode ? ` ${finding.mode}` : '';
    return `${finding.code}${target}: ${finding.message}`;
  }).join('; ');
  return `Beast dispatcher startup integrity check failed: ${details}. ${report.operatorGuidance}`;
}

function validateExecutorContracts(executors: Partial<BeastExecutors>): DispatcherStartupIntegrityFinding[] {
  return (['process', 'container'] as const).flatMap((mode) => {
    return hasExecutorContract(executors[mode])
      ? []
      : [{
        code: 'invalid_executor_contract' as const,
        mode,
        message: `dispatcher executor '${mode}' must expose start, stop, and kill functions`,
      }];
  });
}

function validateDefinition(
  definition: BeastDefinition,
  seenIds: Map<string, BeastDefinition>,
  executors: Partial<BeastExecutors>,
): DispatcherStartupIntegrityFinding[] {
  const findings: DispatcherStartupIntegrityFinding[] = [];
  const definitionId = definition.id;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(definitionId)) {
    findings.push({
      code: 'invalid_definition_id',
      definitionId,
      message: 'definition id must be a non-empty lowercase kebab-case identifier',
    });
  }

  if (seenIds.has(definitionId)) {
    findings.push({
      code: 'duplicate_definition_id',
      definitionId,
      message: `definition id '${definitionId}' is registered more than once`,
    });
  } else {
    seenIds.set(definitionId, definition);
  }

  if (!Number.isInteger(definition.version) || definition.version < 1) {
    findings.push({
      code: 'invalid_definition_version',
      definitionId,
      message: 'definition version must be a positive integer',
    });
  }

  if (definition.label.trim().length === 0 || definition.description.trim().length === 0) {
    findings.push({
      code: 'missing_definition_metadata',
      definitionId,
      message: 'definition label and description must both be non-empty',
    });
  }

  if (!VALID_EXECUTION_MODES.has(definition.executionModeDefault)) {
    findings.push({
      code: 'invalid_execution_mode',
      definitionId,
      mode: String(definition.executionModeDefault),
      message: `definition default execution mode '${String(definition.executionModeDefault)}' is not supported`,
    });
  } else if (!hasExecutorContract(executors[definition.executionModeDefault])) {
    findings.push({
      code: 'missing_executor',
      definitionId,
      mode: definition.executionModeDefault,
      message: `definition default execution mode '${definition.executionModeDefault}' has no usable executor`,
    });
  }

  if (typeof definition.buildProcessSpec !== 'function') {
    findings.push({
      code: 'invalid_process_spec_builder',
      definitionId,
      message: 'definition must expose a process spec builder function',
    });
  }

  const shape = (definition.configSchema as { shape?: Record<string, unknown> }).shape;
  const promptKeys = new Set<string>();
  for (const prompt of definition.interviewPrompts) {
    const key = prompt.key.trim();
    if (key.length === 0 || prompt.prompt.trim().length === 0 || promptKeys.has(key) || !VALID_PROMPT_KINDS.has(prompt.kind) || (shape && !(key in shape))) {
      findings.push({
        code: 'invalid_prompt_contract',
        definitionId,
        message: `prompt '${prompt.key}' must have a unique non-empty key accepted by the config schema, non-empty prompt, and supported kind`,
      });
    }
    promptKeys.add(key);
  }

  if (!isRecord(definition.telemetryLabels)
    || Object.entries(definition.telemetryLabels).some(([key, value]) => key.trim().length === 0 || typeof value !== 'string' || value.trim().length === 0)) {
    findings.push({
      code: 'invalid_telemetry_labels',
      definitionId,
      message: 'telemetry labels must be a record of non-empty string keys and values',
    });
  }

  return findings;
}

export function checkDispatcherStartupIntegrity(input: {
  readonly definitions: readonly BeastDefinition[];
  readonly executors: Partial<BeastExecutors>;
}): DispatcherStartupIntegrityReport {
  const errors: DispatcherStartupIntegrityFinding[] = [];
  const seenIds = new Map<string, BeastDefinition>();

  if (input.definitions.length === 0) {
    errors.push({
      code: 'no_definitions',
      message: 'dispatcher catalog must register at least one Beast definition',
    });
  }

  errors.push(...validateExecutorContracts(input.executors));
  for (const definition of input.definitions) {
    errors.push(...validateDefinition(definition, seenIds, input.executors));
  }

  return {
    ok: errors.length === 0,
    definitionsChecked: input.definitions.length,
    executorModes: availableExecutorModes(input.executors),
    errors,
    operatorGuidance: errors.length === 0
      ? 'Dispatcher startup integrity checks passed; catalog definitions and executor contracts are ready for dispatch.'
      : 'Fix the dispatcher catalog or executor wiring before accepting Beast dispatch requests. Startup fails closed so operators are not left with silent drift.',
  };
}

export function assertDispatcherStartupIntegrity(input: {
  readonly definitions: readonly BeastDefinition[];
  readonly executors: Partial<BeastExecutors>;
}): DispatcherStartupIntegrityReport {
  const report = checkDispatcherStartupIntegrity(input);
  if (!report.ok) {
    throw new DispatcherStartupIntegrityError(report);
  }
  return report;
}
