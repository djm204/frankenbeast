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
}
