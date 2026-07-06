export type BenchClient = 'codex-cli' | 'gemini-cli';
export type BenchMode = 'baseline' | 'fbeast';
export type FbeastTopology = 'none' | 'proxy' | 'split';
export type CorpusTier = 'core' | 'candidate' | 'stress';
export type TaskClass = 'tool-critical' | 'workflow-critical' | 'artifact-critical';

export interface BenchmarkTask {
  readonly taskId: string;
  readonly tier: CorpusTier;
  readonly taskClass: TaskClass;
  readonly projectFixture: string;
  readonly prompt: string;
  readonly expectedArtifacts: readonly string[];
  readonly requiredChecks: readonly BenchmarkCheck[];
  readonly timeoutMs: number;
  readonly allowedNondeterminism: readonly string[];
  readonly baselineSupported: boolean;
  readonly notes?: string;
}

export type BenchmarkCheck =
  | { readonly type: 'file-exists'; readonly path: string }
  | { readonly type: 'file-contains'; readonly path: string; readonly text: string }
  | { readonly type: 'exit-code'; readonly code: number }
  | { readonly type: 'tool-call'; readonly tool: string; readonly requiredParams: readonly string[] };

export const LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT = 'tool-calls.json';

// Tool-call checks are declarative until the scorer consumes normalized evidence.
// Keep this explicit so benchmark authors do not assume stdout/stderr scraping is supported.
export const UNSUPPORTED_BENCHMARK_CHECK_TYPES = ['tool-call'] as const satisfies readonly BenchmarkCheck['type'][];

export type ToolCallEvidenceSource = 'client' | 'mcp-proxy' | 'fbeast-proxy' | 'adapter';

export interface ToolCallEvidence {
  readonly id: string;
  readonly tool: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly source: ToolCallEvidenceSource;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

export interface BenchmarkMatrixRow {
  readonly runId: string;
  readonly taskId: string;
  readonly client: BenchClient;
  readonly mode: BenchMode;
  readonly fbeastTopology: FbeastTopology;
  readonly model: string;
  readonly clientVersion: string;
  readonly commitSha: string;
  readonly hostClass: string;
  readonly runTimestamp: string;
}

export interface ClientRunResult {
  readonly row: BenchmarkMatrixRow;
  readonly workspaceDir: string;
  readonly evidenceDir: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly wallClockMs: number;
  readonly artifacts: readonly string[];
  readonly toolCallEvidenceArtifact: typeof LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT;
  readonly toolCallEvidence: readonly ToolCallEvidence[];
}
