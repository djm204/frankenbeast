import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const guidePath = 'docs/onboarding/persona-quickstart-tracks.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function packageScripts(): Record<string, string> {
  const manifest = JSON.parse(readText('package.json')) as { scripts: Record<string, string> };
  return manifest.scripts;
}

function shellCommandsFrom(markdown: string): string[] {
  return [...markdown.matchAll(/```bash\n(?<body>[\s\S]*?)\n```/g)]
    .flatMap((match) => match.groups?.body.split('\n') ?? [])
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function npmScriptName(command: string): string | undefined {
  if (command === 'npm test') return 'test';
  const match = command.match(/^npm(?:\s+--silent)?\s+run\s+([^\s]+)/);
  return match?.[1];
}

describe('issue #1663 persona quickstart tracks', () => {
  it('links the persona chooser from onboarding entrypoints', () => {
    const readme = readText('README.md');
    const onboarding = readText('ONBOARDING.md');
    const quickstart = readText('docs/guides/quickstart.md');

    expect(readme).toContain('[persona quickstart track](docs/onboarding/persona-quickstart-tracks.md)');
    expect(readme).toContain('[persona quickstart tracks](docs/onboarding/persona-quickstart-tracks.md)');
    expect(onboarding).toContain('[persona quickstart tracks](docs/onboarding/persona-quickstart-tracks.md)');
    expect(quickstart).toContain('[persona quickstart track](../onboarding/persona-quickstart-tracks.md)');
  });

  it('defines operator, contributor, and agent-developer tracks with first-success criteria', () => {
    const guide = readText(guidePath);

    for (const requiredText of [
      '# Persona quickstart tracks',
      '## Persona chooser',
      '## Operator track',
      '## Contributor track',
      '## Agent-developer track',
      '### Prerequisites',
      '### Setup commands',
      '### Validation commands',
      '### Expected success output',
      '[onboarding:6/6:done] complete - onboarding bootstrap reached 6/6 steps',
      'new-worker:preflight -- --json',
      'ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"',
      'ISSUE_TITLE="${ISSUE_TITLE:?set the assigned issue title}"',
      'issue:worktree -- --dry-run',
      'tests/docs-issue-1663.test.ts',
    ]) {
      expect(guide).toContain(requiredText);
    }

    for (const persona of ['Operator', 'Contributor', 'Agent-developer']) {
      expect(guide).toMatch(new RegExp(`\\| ${persona} \\|[^\\n]+\\|[^\\n]+\\|`));
    }
  });

  it('keeps persona-track npm commands aligned with root package scripts', () => {
    const guide = readText(guidePath);
    const scripts = packageScripts();
    const commands = shellCommandsFrom(guide);
    const referencedScripts = commands.map(npmScriptName).filter((script): script is string => Boolean(script));

    expect(referencedScripts).toEqual(expect.arrayContaining([
      'bootstrap',
      'bootstrap:dry-run',
      'local:verify-setup',
      'first-run:checklist',
      'workspace:tour',
      'build',
      'typecheck',
      'test',
      'new-worker:preflight',
      'issue:worktree',
      'test:root',
    ]));

    for (const script of referencedScripts) {
      expect(scripts, `Missing package.json script referenced by ${guidePath}: ${script}`).toHaveProperty(script);
    }
  });

  it('includes the persona chooser in generated first-run checklist metadata', () => {
    for (const persona of ['operator', 'contributor', 'coding-agent']) {
      const result = spawnSync(process.execPath, ['scripts/first-run-checklist.mjs', '--json', '--persona', persona], {
        cwd: ROOT,
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      const checklist = JSON.parse(result.stdout) as { persona: string; docs: string[] };
      expect(checklist.persona).toBe(persona);
      expect(checklist.docs).toContain(guidePath);
    }
  });
});
