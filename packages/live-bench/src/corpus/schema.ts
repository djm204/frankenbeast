import { z } from 'zod';

function assertNoConflictingAlias(record: Record<string, unknown>, camelKey: string, snakeKey: string): void {
  if (record[camelKey] !== undefined && record[snakeKey] !== undefined && record[camelKey] !== record[snakeKey]) {
    throw new Error(`Conflicting benchmark aliases: ${camelKey} and ${snakeKey}`);
  }
}

const BenchmarkCheckSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  assertNoConflictingAlias(record, 'requiredParams', 'required_params');
  if (record.type === 'tool-call' && record.required_params !== undefined && record.requiredParams === undefined) {
    const normalized: Record<string, unknown> = { ...record, requiredParams: record.required_params };
    delete normalized.required_params;
    return normalized;
  }
  return value;
}, z.discriminatedUnion('type', [
  z.object({ type: z.literal('file-exists'), path: z.string().min(1) }).strict(),
  z.object({ type: z.literal('file-contains'), path: z.string().min(1), text: z.string() }).strict(),
  z.object({ type: z.literal('exit-code'), code: z.number().int() }).strict(),
  z.object({
    type: z.literal('tool-call'),
    tool: z.string().min(1),
    requiredParams: z.array(z.string().min(1)),
  }).strict(),
]));

const BenchmarkTaskShape = z.object({
  taskId: z.string().min(1),
  tier: z.enum(['core', 'candidate', 'stress']),
  taskClass: z.enum(['tool-critical', 'workflow-critical', 'artifact-critical']),
  projectFixture: z.string().min(1),
  prompt: z.string().min(1),
  expectedArtifacts: z.array(z.string().min(1)),
  requiredChecks: z.array(BenchmarkCheckSchema),
  timeoutMs: z.number().int().positive(),
  allowedNondeterminism: z.array(z.string()),
  baselineSupported: z.boolean(),
  notes: z.string().optional(),
}).strict();

export const BenchmarkTaskSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const [camelKey, snakeKey] of [
    ['taskId', 'task_id'],
    ['taskClass', 'task_class'],
    ['projectFixture', 'project_fixture'],
    ['expectedArtifacts', 'expected_artifacts'],
    ['requiredChecks', 'required_checks'],
    ['timeoutMs', 'timeout_ms'],
    ['allowedNondeterminism', 'allowed_nondeterminism'],
    ['baselineSupported', 'baseline_supported'],
  ] as const) {
    assertNoConflictingAlias(record, camelKey, snakeKey);
  }
  const normalized: Record<string, unknown> = {
    ...record,
    taskId: record.taskId ?? record.task_id,
    taskClass: record.taskClass ?? record.task_class,
    projectFixture: record.projectFixture ?? record.project_fixture,
    expectedArtifacts: record.expectedArtifacts ?? record.expected_artifacts,
    requiredChecks: record.requiredChecks ?? record.required_checks,
    timeoutMs: record.timeoutMs ?? record.timeout_ms,
    allowedNondeterminism: record.allowedNondeterminism ?? record.allowed_nondeterminism,
    baselineSupported: record.baselineSupported ?? record.baseline_supported,
  };
  delete normalized.task_id;
  delete normalized.task_class;
  delete normalized.project_fixture;
  delete normalized.expected_artifacts;
  delete normalized.required_checks;
  delete normalized.timeout_ms;
  delete normalized.allowed_nondeterminism;
  delete normalized.baseline_supported;
  return normalized;
}, BenchmarkTaskShape).refine((task) => task.tier !== 'core' || task.baselineSupported, {
  message: 'core tasks must be baselineSupported for fair A/B gating',
});
