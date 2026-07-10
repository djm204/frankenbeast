# Audit documents

This directory is the canonical home for retained human-readable audit records.
Audit notes kept here must use repository-relative paths, identify their freshness,
and point actionable findings to canonical GitHub issues when they are still live.

Do not commit transient scanner output or raw generated reports at the repository root.
Generated files such as `audit.json`, `eval_findings.json`, `npm-audit*.json`,
`*_audit_findings*.md`, or package-specific one-off audit reports should either be
reproduced on demand, attached to the relevant issue/PR, or converted into a
reviewed document in this directory with historical/non-actionable findings marked
explicitly.

Current retained audit records:

- `agent-systems-audit-2026-04-28.md` — historical system audit with dated addenda
  that identify resolved, partially fixed, and residual findings.
- `test-suite-audit.md` — historical test-suite audit; actions should be validated
  against current code before filing or fixing follow-up issues.
