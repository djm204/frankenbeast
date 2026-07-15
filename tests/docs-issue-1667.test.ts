import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const threatModelPath = 'docs/agent-tool-execution-threat-model.md';

const REQUIRED_SECTIONS = [
  '## Assets',
  '## Actors',
  '## Trust boundaries',
  '## Data-flow and control map',
  '## Attack paths and mitigations',
  '## Mitigation ownership',
  '## Follow-up control gaps',
  '## Code path anchors',
];

const REQUIRED_SURFACES = [
  'Terminal and subprocess execution',
  'File reads, file writes',
  'browser/computer-use actions',
  'GitHub automation',
  'Profile-scoped memory, skills, plugins, cron',
  'MCP tool dispatch',
  'PM-swarm orchestration',
  'approval-cop',
];

const REQUIRED_ATTACKS = [
  'Retrieved-content prompt injection',
  'Shell side-effect escalation',
  'Approval bypass',
  'Memory poisoning',
  'Cross-profile write',
  'Tool wrapper confusion',
  'Workspace escape',
  'Stale GitHub state',
  'Cron drift',
];

describe('issue #1667 agent tool execution threat model', () => {
  it('documents the required threat-model sections and surfaces', () => {
    const threatModel = readText(threatModelPath);

    for (const section of REQUIRED_SECTIONS) {
      expect(threatModel).toContain(section);
    }

    for (const surface of REQUIRED_SURFACES) {
      expect(threatModel).toContain(surface);
    }

    for (const attack of REQUIRED_ATTACKS) {
      expect(threatModel).toContain(attack);
    }
  });

  it('maps data flows to controls and records follow-up issue links', () => {
    const threatModel = readText(threatModelPath);

    expect(threatModel).toContain('| Flow | Untrusted inputs | Primary risk | Required controls | Code vs policy |');
    expect(threatModel).toContain('Prompt assembly');
    expect(threatModel).toContain('MCP proxy `execute_tool`');
    expect(threatModel).toContain('PM-swarm approval-cop');
    expect(threatModel).toContain('Runtime artifact classification');

    for (const issueNumber of [1668, 1669, 1670, 1671, 1672]) {
      expect(threatModel).toContain(`#${issueNumber}`);
    }
  });

  it('keeps security-sensitive execution docs and code paths anchored to the threat model', () => {
    const readme = readText('README.md');
    const retrievedContentDoc = readText('docs/untrusted-retrieved-content.md');
    const proxy = readText('packages/franken-mcp-suite/src/servers/proxy.ts');
    const governanceGate = readText('packages/franken-mcp-suite/src/shared/governance-gate.ts');

    for (const text of [readme, retrievedContentDoc, proxy, governanceGate]) {
      expect(text).toContain(threatModelPath);
    }
  });
});
