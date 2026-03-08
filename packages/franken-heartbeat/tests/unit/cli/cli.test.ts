import { describe, it, expect } from 'vitest';
import { parseArgs, type CliArgs } from '../../../src/cli/args.js';

describe('parseArgs', () => {
  it('parses --config flag', () => {
    const args = parseArgs(['--config', './custom-config.json']);
    expect(args.configPath).toBe('./custom-config.json');
  });

  it('parses --heartbeat-file flag', () => {
    const args = parseArgs(['--heartbeat-file', './custom/HEARTBEAT.md']);
    expect(args.heartbeatFilePath).toBe('./custom/HEARTBEAT.md');
  });

  it('parses --dry-run flag', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
  });

  it('parses --project-id flag', () => {
    const args = parseArgs(['--project-id', 'my-project']);
    expect(args.projectId).toBe('my-project');
  });

  it('uses defaults when no flags provided', () => {
    const args = parseArgs([]);
    expect(args.configPath).toBeUndefined();
    expect(args.heartbeatFilePath).toBeUndefined();
    expect(args.dryRun).toBe(false);
    expect(args.projectId).toBe('default');
  });

  it('handles combined flags', () => {
    const args = parseArgs([
      '--config', './config.json',
      '--heartbeat-file', './HB.md',
      '--dry-run',
      '--project-id', 'proj-1',
    ]);
    expect(args.configPath).toBe('./config.json');
    expect(args.heartbeatFilePath).toBe('./HB.md');
    expect(args.dryRun).toBe(true);
    expect(args.projectId).toBe('proj-1');
  });
});
