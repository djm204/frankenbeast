import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DOCS_AUDITS_README = resolve(ROOT, 'docs', 'audits', 'README.md');

const staleRootAuditArtifacts = new Set([
  'audit.json',
  'eval_findings.json',
  'npm-audit.json',
  'npm-audit-report.json',
  'npm-audit-full.json',
  'packages_audit_findings.md',
  'packages_governor_mcp_audit.md',
  'packages_security_audit.md',
  'security_audit_findings.md',
]);

const adHocRootAuditPattern = /(?:^|_)(?:audit_findings|audit)(?:_|\.|$)|^npm-audit.*\.json$/u;
const allowedRootDocs = new Set(['SECURITY.md']);

describe('repository audit artifact hygiene', () => {
  it('keeps known stale generated audit artifacts out of the repository root', () => {
    const rootEntries = readdirSync(ROOT);

    expect(rootEntries.filter((entry) => staleRootAuditArtifacts.has(entry))).toEqual([]);
  });

  it('does not add new ad hoc audit output files at the repository root', () => {
    const unexpectedRootArtifacts = readdirSync(ROOT)
      .filter((entry) => adHocRootAuditPattern.test(entry))
      .filter((entry) => !allowedRootDocs.has(entry));

    expect(unexpectedRootArtifacts).toEqual([]);
  });

  it('documents the canonical location and freshness rules for retained audits', () => {
    const readme = readFileSync(DOCS_AUDITS_README, 'utf8');

    expect(readme).toContain('canonical home for retained human-readable audit records');
    expect(readme).toContain('repository-relative paths');
    expect(readme).toContain('historical/non-actionable findings');
  });
});
