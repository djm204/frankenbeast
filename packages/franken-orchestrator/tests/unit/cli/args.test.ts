import { describe, it, expect, vi } from 'vitest';
import { parseArgs, printUsage } from '../../../src/cli/args.js';

describe('parseArgs', () => {
  it('returns defaults with no args', () => {
    const args = parseArgs([]);
    expect(args.subcommand).toBeUndefined();
    expect(args.budget).toBe(10);
    expect(args.provider).toBe('claude');
    expect(args.noPr).toBe(false);
    expect(args.verbose).toBe(false);
    expect(args.reset).toBe(false);
    expect(args.resume).toBe(false);
    expect(args.help).toBe(false);
  });

  it('parses interview subcommand', () => {
    const args = parseArgs(['interview']);
    expect(args.subcommand).toBe('interview');
  });

  it('parses plan subcommand with design-doc', () => {
    const args = parseArgs(['plan', '--design-doc', '/path/to/design.md']);
    expect(args.subcommand).toBe('plan');
    expect(args.designDoc).toBe('/path/to/design.md');
  });

  it('parses run subcommand with resume', () => {
    const args = parseArgs(['run', '--resume']);
    expect(args.subcommand).toBe('run');
    expect(args.resume).toBe(true);
  });

  it('parses chat-server subcommand with local defaults', () => {
    const args = parseArgs(['chat-server']);
    expect(args.subcommand).toBe('chat-server');
    expect(args.host).toBe('127.0.0.1');
    expect(args.port).toBe(3000);
    expect(args.allowOrigin).toBeUndefined();
  });

  it('parses chat-server host, port, and origin overrides', () => {
    const args = parseArgs([
      'chat-server',
      '--host', '0.0.0.0',
      '--port', '4242',
      '--allow-origin', 'http://localhost:5173',
    ]);

    expect(args.subcommand).toBe('chat-server');
    expect(args.host).toBe('0.0.0.0');
    expect(args.port).toBe(4242);
    expect(args.allowOrigin).toBe('http://localhost:5173');
  });

  it('parses bare network subcommand', () => {
    const args = parseArgs(['network']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBeUndefined();
    expect(args.networkDetached).toBe(false);
  });

  it('parses network up', () => {
    const args = parseArgs(['network', 'up']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('up');
  });

  it('parses network up -d', () => {
    const args = parseArgs(['network', 'up', '-d']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('up');
    expect(args.networkDetached).toBe(true);
  });

  it('parses network down', () => {
    const args = parseArgs(['network', 'down']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('down');
  });

  it('parses network status', () => {
    const args = parseArgs(['network', 'status']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('status');
  });

  it('parses network start with target service', () => {
    const args = parseArgs(['network', 'start', 'chat-server']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('start');
    expect(args.networkTarget).toBe('chat-server');
  });

  it('parses network stop with target service', () => {
    const args = parseArgs(['network', 'stop', 'dashboard-web']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('stop');
    expect(args.networkTarget).toBe('dashboard-web');
  });

  it('parses network restart with target service', () => {
    const args = parseArgs(['network', 'restart', 'all']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('restart');
    expect(args.networkTarget).toBe('all');
  });

  it('parses network logs with target service', () => {
    const args = parseArgs(['network', 'logs', 'comms-gateway']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('logs');
    expect(args.networkTarget).toBe('comms-gateway');
  });

  it('parses network config', () => {
    const args = parseArgs(['network', 'config']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('config');
  });

  it('parses network config --set', () => {
    const args = parseArgs(['network', 'config', '--set', 'chat.model=claude-sonnet-4-6']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('config');
    expect(args.networkSet).toEqual(['chat.model=claude-sonnet-4-6']);
  });

  it('parses network help as an action', () => {
    const args = parseArgs(['network', 'help']);
    expect(args.subcommand).toBe('network');
    expect(args.networkAction).toBe('help');
  });

  it('parses global flags without subcommand', () => {
    const args = parseArgs([
      '--base-dir', '/my/project',
      '--base-branch', 'develop',
      '--budget', '25',
      '--provider', 'codex',
      '--no-pr',
      '--verbose',
      '--reset',
    ]);
    expect(args.subcommand).toBeUndefined();
    expect(args.baseDir).toBe('/my/project');
    expect(args.baseBranch).toBe('develop');
    expect(args.budget).toBe(25);
    expect(args.provider).toBe('codex');
    expect(args.noPr).toBe(true);
    expect(args.verbose).toBe(true);
    expect(args.reset).toBe(true);
  });

  it('accepts any string as provider (no longer restricted to union)', () => {
    const args = parseArgs(['--provider', 'unknown']);
    expect(args.provider).toBe('unknown');
  });

  it('parses --design-doc without subcommand', () => {
    const args = parseArgs(['--design-doc', 'plan.md']);
    expect(args.subcommand).toBeUndefined();
    expect(args.designDoc).toBe('plan.md');
  });

  it('parses --plan-dir without subcommand', () => {
    const args = parseArgs(['--plan-dir', './chunks']);
    expect(args.subcommand).toBeUndefined();
    expect(args.planDir).toBe('./chunks');
  });

  it('parses --help', () => {
    const args = parseArgs(['--help']);
    expect(args.help).toBe(true);
  });

  it('prints usage text including network and chat-server', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printUsage();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('chat-server'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('network'));
    logSpy.mockRestore();
  });

  it('parses --config', () => {
    const args = parseArgs(['--config', 'frankenbeast.json']);
    expect(args.config).toBe('frankenbeast.json');
  });

  it('parses --cleanup', () => {
    const args = parseArgs(['--cleanup']);
    expect(args.cleanup).toBe(true);
  });

  describe('issues subcommand', () => {
    it('parses issues subcommand', () => {
      const args = parseArgs(['issues']);
      expect(args.subcommand).toBe('issues');
    });

    it('defaults issueLimit to 30 for issues subcommand', () => {
      const args = parseArgs(['issues']);
      expect(args.issueLimit).toBe(30);
    });

    it('does not default issueLimit for other subcommands', () => {
      const args = parseArgs(['run']);
      expect(args.issueLimit).toBeUndefined();
    });

    it('parses --label with comma-separated values', () => {
      const args = parseArgs(['issues', '--label', 'critical,high']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueLabel).toEqual(['critical', 'high']);
    });

    it('parses --label with single value', () => {
      const args = parseArgs(['issues', '--label', 'bug']);
      expect(args.issueLabel).toEqual(['bug']);
    });

    it('parses --milestone', () => {
      const args = parseArgs(['issues', '--milestone', 'v1.0']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueMilestone).toBe('v1.0');
    });

    it('parses --search', () => {
      const args = parseArgs(['issues', '--search', 'auth bug']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueSearch).toBe('auth bug');
    });

    it('parses --assignee', () => {
      const args = parseArgs(['issues', '--assignee', 'djm204']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueAssignee).toBe('djm204');
    });

    it('parses --limit as integer', () => {
      const args = parseArgs(['issues', '--limit', '50']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueLimit).toBe(50);
    });

    it('parses --repo', () => {
      const args = parseArgs(['issues', '--repo', 'djm204/frankenbeast']);
      expect(args.subcommand).toBe('issues');
      expect(args.issueRepo).toBe('djm204/frankenbeast');
    });

    it('parses --target-upstream', () => {
      const args = parseArgs(['issues', '--target-upstream']);
      expect(args.subcommand).toBe('issues');
      expect(args.targetUpstream).toBe(true);
    });

    it('rejects --repo with --target-upstream', () => {
      expect(() => parseArgs([
        'issues',
        '--repo', 'djm204/frankenbeast',
        '--target-upstream',
      ])).toThrow(/--repo.*--target-upstream|--target-upstream.*--repo/i);
    });

    it('parses --dry-run', () => {
      const args = parseArgs(['issues', '--dry-run']);
      expect(args.subcommand).toBe('issues');
      expect(args.dryRun).toBe(true);
    });

    it('parses --dry-run globally (without issues subcommand)', () => {
      const args = parseArgs(['--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    it('parses all issue flags together', () => {
      const args = parseArgs([
        'issues',
        '--label', 'critical,high',
        '--milestone', 'v2.0',
        '--search', 'login',
        '--assignee', 'djm204',
        '--limit', '10',
        '--repo', 'djm204/frankenbeast',
        '--dry-run',
      ]);
      expect(args.subcommand).toBe('issues');
      expect(args.issueLabel).toEqual(['critical', 'high']);
      expect(args.issueMilestone).toBe('v2.0');
      expect(args.issueSearch).toBe('login');
      expect(args.issueAssignee).toBe('djm204');
      expect(args.issueLimit).toBe(10);
      expect(args.issueRepo).toBe('djm204/frankenbeast');
      expect(args.dryRun).toBe(true);
    });

    it('warns but does not crash when --design-doc used with issues', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const args = parseArgs(['issues', '--design-doc', 'doc.md']);
      expect(args.subcommand).toBe('issues');
      expect(args.designDoc).toBe('doc.md');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--design-doc'),
      );
      warnSpy.mockRestore();
    });
  });
});
