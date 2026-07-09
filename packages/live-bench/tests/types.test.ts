import { describe, expect, it } from 'vitest';
import type { BenchmarkMatrixRow, BenchmarkTask, ClientRunResult, ToolCallEvidence } from '../src/types.js';
import { LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT, UNSUPPORTED_BENCHMARK_CHECK_TYPES } from '../src/types.js';

describe('live-bench types', () => {
  it('represents a core artifact-critical task', () => {
    const task: BenchmarkTask = {
      taskId: 'write-readme',
      tier: 'core',
      taskClass: 'artifact-critical',
      projectFixture: 'tiny-node',
      prompt: 'Create README.md with project summary.',
      expectedArtifacts: ['README.md'],
      requiredChecks: [{ type: 'file-exists', path: 'README.md' }],
      timeoutMs: 120_000,
      allowedNondeterminism: [],
      baselineSupported: true,
    };

    expect(task.taskId).toBe('write-readme');
  });

  it('requires normalized tool-call evidence on client run results', () => {
    const row: BenchmarkMatrixRow = {
      runId: 'run-123',
      taskId: 'write-readme',
      client: 'codex-cli',
      mode: 'fbeast',
      fbeastTopology: 'proxy',
      model: 'gpt-test',
      clientVersion: '1.2.3',
      commitSha: 'abc123',
      hostClass: 'ci-linux',
      runTimestamp: '2026-01-02T03:04:05.000Z',
    };
    const toolCall: ToolCallEvidence = {
      id: 'call-1',
      tool: 'write_file',
      params: { path: 'README.md', content: 'hello' },
      source: 'mcp-proxy',
      startedAt: '2026-01-02T03:04:06.000Z',
      completedAt: '2026-01-02T03:04:07.000Z',
      ok: true,
    };
    const result: ClientRunResult = {
      row,
      workspaceDir: '/tmp/workspace',
      evidenceDir: '/tmp/evidence',
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      wallClockMs: 1000,
      artifacts: [LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT],
      toolCallEvidenceArtifact: LIVE_BENCH_TOOL_CALL_EVIDENCE_ARTIFACT,
      toolCallEvidence: [toolCall],
    };

    expect(result.toolCallEvidence[0]?.params).toMatchObject({ path: 'README.md' });
    expect(result.artifacts).toContain(result.toolCallEvidenceArtifact);
  });

  it('marks tool-call checks unsupported until an evaluator consumes evidence', () => {
    expect(UNSUPPORTED_BENCHMARK_CHECK_TYPES).toContain('tool-call');
  });
});
