import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_REGISTRY } from './tool-registry.js';

const readmePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'README.md');

function packageReadme(): string {
  return readFileSync(readmePath, 'utf-8');
}

function serverToolsFromReadme(serverName: string): string[] {
  const row = packageReadme().split('\n').find((line) => line.startsWith(`| \`${serverName}\``));
  expect(row, `${serverName} row is missing from README MCP server table`).toBeDefined();

  const toolsCell = row!.split('|')[2] ?? '';
  return [...toolsCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
}

describe('README MCP tool inventory', () => {
  it('documents every observer tool from the shared registry', () => {
    const registryObserverTools = [...TOOL_REGISTRY.values()]
      .filter((tool) => tool.server === 'observer')
      .map((tool) => tool.name);

    expect(serverToolsFromReadme('fbeast-observer')).toEqual(registryObserverTools);
    expect(serverToolsFromReadme('fbeast-observer')).toContain('fbeast_observer_verify');
  });

  it('keeps the combined server tool count aligned with the shared registry', () => {
    expect(packageReadme()).toContain(`fbeast-mcp\` runs all ${TOOL_REGISTRY.size} tools`);
  });
});
