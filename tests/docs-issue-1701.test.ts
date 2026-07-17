import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const matrixPath = 'docs/onboarding/setup-troubleshooting-matrix.md';

function readDoc(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('issue #1701 setup troubleshooting matrix docs', () => {
  it('defines a diagnostic matrix with the required columns and at least eight common failures', () => {
    const matrix = readDoc(matrixPath);

    expect(matrix).toContain('| Symptom | Likely cause | Diagnostic command | Remediation | Verification command |');

    const dataRows = matrix
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.includes('---') && !line.includes('Symptom |'));
    expect(dataRows.length).toBeGreaterThanOrEqual(8);

    for (const requiredText of [
      'engine error',
      'package-manager mismatch',
      'corepack: command not found',
      'gh auth status',
      'EADDRINUSE',
      'dirty worktree',
      '.fbeast/*.lock',
      'new-worker:preflight',
      'docker compose ps',
      'network.secureBackend',
    ]) {
      expect(matrix).toContain(requiredText);
    }

    expect(matrix).toContain('5173 3737');
    expect(matrix).toContain('failed=0; for port in');
    expect(matrix).toContain('docker compose logs --tail=80 chromadb grafana tempo');
    expect(matrix).toContain('targeted probes');
    expect(matrix).toContain('${CHROMA_URL:-http://localhost:8000}/api/v2/heartbeat');
    expect(matrix).toContain('detectCheckpointLock(checkpointPath)');
    expect(matrix).toContain('safeToRemove');
    expect(matrix).toContain('frankenbeast network credentials');
    expect(matrix).toContain('run `init --repair` only when you intentionally want an interactive repair');
  });

  it('documents safe remediation and handoff evidence instead of destructive cleanup', () => {
    const matrix = readDoc(matrixPath);

    expect(matrix).toContain('Avoid destructive cleanup while diagnosing.');
    expect(matrix).toContain('backup/quarantine');
    expect(matrix).toContain('timestamped quarantine path');
    expect(matrix).toContain('the exact failed command and full error text');
  });

  it('links the troubleshooting matrix from README and ONBOARDING entrypoints', () => {
    const readme = readDoc('README.md');
    const onboarding = readDoc('ONBOARDING.md');

    expect(readme).toContain(matrixPath);
    expect(onboarding).toContain(matrixPath);
    expect(onboarding).toContain('Start with the [setup troubleshooting matrix]');
  });
});
