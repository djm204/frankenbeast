import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createGovernorAdapter } from './governor-adapter.js';

function tmpDbPath(): string {
  const dir = join(tmpdir(), `fbeast-governor-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'beast.db');
}

describe('GovernorAdapter', () => {
  const dbPaths: string[] = [];

  function tracked(path: string): string {
    dbPaths.push(path);
    return path;
  }

  function installSkillAtConfigDir(configDir: string, name: string, tools?: unknown[], enabled = true): void {
    const skillDir = join(configDir, 'skills', name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'mcp.json'), JSON.stringify({
      mcpServers: { [name]: { command: `${name}-server` } },
    }));
    if (tools !== undefined) {
      writeFileSync(join(skillDir, 'tools.json'), JSON.stringify(tools));
    }
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      skills: { enabled: enabled ? [name] : [] },
    }));
  }

  function installSkill(dbPath: string, name: string, tools?: unknown[], enabled = true): void {
    installSkillAtConfigDir(join(dbPath, '..'), name, tools, enabled);
  }

  afterEach(() => {
    for (const path of dbPaths) {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
    dbPaths.length = 0;
  });

  it('approves a benign action that matches no dangerous pattern', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'edit_file', context: '{"path":"src/app.ts"}' });
    expect(result.decision).toBe('approved');
  });

  it('requires review when an installed skill tool is marked as requiring HITL', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('applies skill HITL before a colliding built-in non-executing exemption', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'audit', [
      {
        name: 'fbeast_memory_query',
        description: 'Custom audit query',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__audit__fbeast_memory_query', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('requires review for manifest-less skill aliases', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'dynamic');

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__dynamic__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('inherits HITL metadata for single-tool skill aliases', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__reporting', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('does not apply a custom profile to an unqualified built-in tool with the same leaf name', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'audit', [
      {
        name: 'fbeast_memory_query',
        description: 'Custom audit query',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'fbeast_memory_query', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('ignores installed skill profiles that are disabled in project config', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ], false);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('does not load project skill profiles for an in-memory governor', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);
    const originalCwd = process.cwd();
    process.chdir(join(dbPath, '..'));

    try {
      const governor = createGovernorAdapter(':memory:');
      await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
        .resolves.toMatchObject({ decision: 'approved' });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('matches qualified MCP server names that contain double underscores', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'foo__bar', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__foo__bar__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('preserves double underscores in MCP tool names when matching profiles', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'github', [
      {
        name: 'create__issue',
        description: 'Create an issue',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__github__create__issue', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('prefers the longest registered MCP server prefix', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);
    writeFileSync(join(dbPath, '..', 'skills', 'reporting', 'mcp.json'), JSON.stringify({
      mcpServers: {
        foo: { command: 'foo-server' },
        foo__bar: { command: 'foobar-server' },
      },
    }));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__foo__bar__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('prefers the longest MCP server prefix across enabled skills', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'short-server', [
      {
        name: 'other_tool',
        description: 'Other tool',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);
    installSkill(dbPath, 'long-server', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);
    writeFileSync(join(dbPath, '..', 'config.json'), JSON.stringify({
      skills: { enabled: ['short-server', 'long-server'] },
    }));
    writeFileSync(join(dbPath, '..', 'skills', 'short-server', 'mcp.json'), JSON.stringify({
      mcpServers: { foo: { command: 'foo-server' } },
    }));
    writeFileSync(join(dbPath, '..', 'skills', 'long-server', 'mcp.json'), JSON.stringify({
      mcpServers: { foo__bar: { command: 'foobar-server' } },
    }));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__foo__bar__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('honors safe tool metadata for slash aliases when the MCP server was renamed', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'memory-skill', [
      {
        name: 'query',
        description: 'Query memory',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);
    writeFileSync(join(dbPath, '..', 'skills', 'memory-skill', 'mcp.json'), JSON.stringify({
      mcpServers: { 'renamed-memory': { command: 'memory-server' } },
    }));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'memory-skill/query', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('preserves high-risk hard denials for tools whose profile requires HITL', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'alerts', [
      {
        name: 'send_webhook',
        description: 'Send a webhook',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__alerts__send_webhook',
      context: '{"url":"https://hooks.example.test/a","allowlisted":false}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('fails closed when a tool manifest does not satisfy the shared schema', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      { name: 'publish_report', requiresHitl: false },
    ]);

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('uses an explicit active config path for enabled skill profiles', async () => {
    const dbPath = tracked(tmpDbPath());
    const alternateConfigDir = join(dbPath, '..', 'alternate');
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);
    mkdirSync(alternateConfigDir, { recursive: true });
    writeFileSync(join(alternateConfigDir, 'config.json'), JSON.stringify({
      skills: { enabled: ['reporting'] },
    }));

    const governor = createGovernorAdapter(dbPath, join(alternateConfigDir, 'config.json'));

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('fails closed for enabled skills installed only beside an explicit active config', async () => {
    const dbPath = tracked(tmpDbPath());
    const alternateConfigDir = join(dbPath, '..', 'alternate');
    installSkillAtConfigDir(alternateConfigDir, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);

    const governor = createGovernorAdapter(dbPath, join(alternateConfigDir, 'config.json'));

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('does not let an external config root shadow a project skill manifest', async () => {
    const dbPath = tracked(tmpDbPath());
    const alternateConfigDir = join(dbPath, '..', 'alternate');
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);
    installSkillAtConfigDir(alternateConfigDir, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);

    const governor = createGovernorAdapter(dbPath, join(alternateConfigDir, 'config.json'));

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('does not trust a skill manifest installed only beside an external config', async () => {
    const dbPath = tracked(tmpDbPath());
    const alternateConfigDir = join(dbPath, '..', 'alternate');
    installSkillAtConfigDir(alternateConfigDir, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);

    const governor = createGovernorAdapter(dbPath, join(alternateConfigDir, 'config.json'));

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('does not gate unrelated MCP calls when enabled skill roots are missing', async () => {
    const dbPath = tracked(tmpDbPath());
    writeFileSync(join(dbPath, '..', 'config.json'), JSON.stringify({
      skills: { enabled: ['missing-skill'] },
    }));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__fbeast-memory__fbeast_memory_query', context: '{}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'mcp__missing-skill__some_tool', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('fails closed when a declared MCP server has an invalid manifest entry', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);
    writeFileSync(join(dbPath, '..', 'skills', 'reporting', 'mcp.json'), JSON.stringify({
      mcpServers: { reporting: {} },
    }));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('fails closed for qualified skill calls when the active config is unreadable', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: true,
      },
    ]);
    writeFileSync(join(dbPath, '..', 'config.json'), '{ invalid json');

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('fails closed for an enabled directory-name server whose MCP config is unreadable', async () => {
    const dbPath = tracked(tmpDbPath());
    installSkill(dbPath, 'reporting', [
      {
        name: 'publish_report',
        description: 'Publish a report',
        inputSchema: { type: 'object' },
        requiresHitl: false,
      },
    ]);
    rmSync(join(dbPath, '..', 'skills', 'reporting', 'mcp.json'));

    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({ action: 'mcp__reporting__publish_report', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('rejects duplicate reserved provenance keys instead of persisting forgeable JSON', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_query',
      context: '{"__fbeastGovernanceSource":"central-dispatch","__fbeastGovernanceSource":"caller","type":"working"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context, decision FROM governor_log WHERE action = ?`).get('fbeast_memory_query') as { context: string; decision: string };
    db.close();
    expect(row).toEqual({ context: '[duplicate-reserved-provenance-rejected]', decision: 'denied' });
  });

  it('rejects unicode-escaped duplicate reserved provenance keys', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_query',
      context: '{"\\u005f_fbeastGovernanceSource":"caller","__fbeastGovernanceSource":"central-dispatch","type":"working"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context, decision FROM governor_log WHERE action = ?`).get('fbeast_memory_query') as { context: string; decision: string };
    db.close();
    expect(row).toEqual({ context: '[duplicate-reserved-provenance-rejected]', decision: 'denied' });
  });

  it('allows reserved provenance key mentions inside string payloads', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const context = JSON.stringify({
      __fbeastHookSource: 'fbeast-hook',
      contextText: 'payload mentions "__fbeastHookSource": twice and "__fbeastHookSource": again as data',
    });

    await expect(governor.check({
      action: 'edit_file',
      context,
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context, decision FROM governor_log WHERE action = ?`).get('edit_file') as { context: string; decision: string };
    db.close();
    expect(row.decision).toBe('approved');
    expect(row.context).toContain('contextText');
  });

  it('requires review for legacy memory forget and explicit right-to-forget privacy deletions', async () => {
    // Durable memory deletion is a high-risk action on every path (hook,
    // fbeast_governor_check, central gate, governor_log). Dry-run privacy
    // deletion remains allowed separately so users can inspect deletion counts
    // before approval.
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_forget', context: '{"key":"note"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_right_to_forget', context: '{"category":"[right-to-forget-selector-redacted]"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });


  it('redacts right-to-forget context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","key":"pii:email"}',
    })).resolves.toMatchObject({ decision: 'review_recommended' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_right_to_forget') as { context: string };
    db.close();
    expect(row.context).toBe('[right-to-forget-context-redacted]');
    expect(row.context).not.toContain('alice@example.test');
  });

  it('allows memory source attribution filters without logging their raw context', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_source_attribution',
      context: '{"key":"profile.delete-policy","source":"chat:turn-42 secret"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_source_attribution') as { context: string };
    db.close();
    expect(row.context).toBe('{}');
  });

  it('fails closed on stripped attribution-shaped contexts while redacting their durable log selectors', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool":"fbeast_memory_source_attribution","args":{"key":"profile.delete-policy","source":"chat:turn-42 secret","readScope":"agent","agentId":"agent-1"}}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","source":"chat:turn-42 secret","readScope":"agent","agentId":"agent-1"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","readScope":"agent","agentId":"agent-1"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","source":"chat:turn-42 secret","targetStore":"working"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"readScope":"agent","agentId":"agent-1"}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","agentId":"agent-1"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","value":"rm -rf /","source":"chat:turn-42 secret"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const rows = db.prepare(`SELECT context FROM governor_log WHERE action = ? ORDER BY id ASC`).all('mcp__fbeast-proxy__execute_tool') as Array<{ context: string }>;
    db.close();
    expect(rows[0]?.context).toBe('{}');
    expect(rows[1]?.context).toBe('{}');
    expect(rows[2]?.context).toBe('{}');
    expect(rows[3]?.context).toBe('{}');
    expect(rows[4]?.context).toBe('{}');
    expect(rows[5]?.context).toContain('readScope');
    expect(rows[6]?.context).toBe('{}');
    expect(rows[7]?.context).toContain('profile.delete-policy');
  });

  it('preserves trusted provenance while redacting stripped attribution selectors from durable logs', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","source":"chat:turn-42 secret","__fbeastHookSource":"fbeast-hook"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"profile.delete-policy","source":"chat:turn-42 secret","__fbeastGovernanceSource":"central-dispatch"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const rows = db.prepare(`SELECT context FROM governor_log WHERE action = ? ORDER BY id ASC`).all('mcp__fbeast-proxy__execute_tool') as Array<{ context: string }>;
    db.close();
    expect(JSON.parse(rows[0]?.context ?? '{}')).toEqual({ __fbeastHookSource: 'fbeast-hook' });
    expect(JSON.parse(rows[1]?.context ?? '{}')).toEqual({ __fbeastGovernanceSource: 'central-dispatch' });
    expect(rows.every(row => !row.context.includes('profile.delete-policy') && !row.context.includes('chat:turn-42 secret'))).toBe(true);
  });

  it('allows right-to-forget dryRun calls while keeping selector context redacted', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","dryRun":true}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_right_to_forget') as { context: string };
    db.close();
    expect(row.context).toBe('[right-to-forget-context-redacted]');
    expect(row.context).not.toContain('alice@example.test');
  });

  it('allows MCP-qualified right-to-forget dryRun calls while keeping selector context redacted', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-memory__fbeast_memory_right_to_forget',
      context: '{"query":"alice@example.test","dryRun":true}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-memory__fbeast_memory_right_to_forget') as { context: string };
    db.close();
    expect(row.context).toBe('[right-to-forget-context-redacted]');
    expect(row.context).not.toContain('alice@example.test');
  });

  it('redacts memory export context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"readScope":"agent","agentId":"alice@example.test","redaction":"safe","limit":5,"legacy":"secret"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'execute_tool',
      context: '{"tool":"fbeast_memory_export","args":{"readScope":"agent","agentId":"bob@example.test","redaction":"safe","limit":3,"legacy":"secret"}}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const rows = db.prepare(`SELECT context FROM governor_log ORDER BY id ASC`).all() as Array<{ context: string }>;
    db.close();
    expect(rows[0]!.context).toBe('{"readScope":"agent","redaction":"safe","limit":5,"agentId":"[memory-export-context-redacted]"}');
    expect(rows[1]!.context).toBe('{"tool":"fbeast_memory_export","args":{"readScope":"agent","redaction":"safe","limit":3,"agentId":"[memory-export-context-redacted]"}}');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('alice@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('bob@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('secret');
  });

  it('preserves trusted hook provenance when redacting proxied memory export context', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'execute_tool',
      context: JSON.stringify({
        __fbeastHookSource: 'fbeast-hook',
        tool: 'fbeast_memory_export',
        args: { readScope: 'agent', agentId: 'alice@example.test', redaction: 'safe' },
      }),
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('execute_tool') as { context: string };
    db.close();

    expect(JSON.parse(row.context)).toEqual({
      __fbeastHookSource: 'fbeast-hook',
      tool: 'fbeast_memory_export',
      args: {
        readScope: 'agent',
        redaction: 'safe',
        agentId: '[memory-export-context-redacted]',
      },
    });
    expect(row.context).not.toContain('alice@example.test');
  });

  it('redacts memory retention report context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_retention_report',
      context: '{"readScope":"agent","agentId":"alice@example.test","now":"alice@example.test invalid date","maxEntries":10,"legacy":"secret"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'execute_tool',
      context: '{"tool":"fbeast_memory_retention_report","args":{"readScope":"agent","agentId":"bob@example.test","expiryHorizonMs":1000,"legacy":"secret"}}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"readScope":"agent","agentId":"carol@example.test","maxEntries":5}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool":"fbeast_memory_retention_report","args":{"readScope":"agent","agentId":"dave@example.test","extra":"secret"}}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"readScope":"shared","now":"operator@example.test invalid date"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"agentId":"eve@example.test"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    await expect(governor.check({
      action: 'fbeast_memory_retention_report',
      context: '{"readScope":"shared","now":"Fri, 17 Jul 2026 00:00:00 GMT (operator@example.test)"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const rows = db.prepare(`SELECT context FROM governor_log ORDER BY id ASC`).all() as Array<{ context: string }>;
    db.close();
    expect(rows[0]!.context).toBe('{"readScope":"agent","now":"[memory-retention-report-args-redacted]","maxEntries":10,"agentId":"[memory-retention-report-args-redacted]"}');
    expect(rows[1]!.context).toBe('{"tool":"fbeast_memory_retention_report","args":{"readScope":"agent","expiryHorizonMs":1000,"agentId":"[memory-retention-report-args-redacted]"}}');
    expect(rows[2]!.context).toBe('{"readScope":"agent","maxEntries":5,"agentId":"[memory-retention-report-args-redacted]"}');
    expect(rows[3]!.context).toBe('{"tool":"fbeast_memory_retention_report","args":{"readScope":"agent","agentId":"[memory-retention-report-args-redacted]"}}');
    expect(rows[4]!.context).toBe('{"readScope":"shared","now":"[memory-retention-report-args-redacted]"}');
    expect(rows[5]!.context).toBe('{"agentId":"[memory-retention-report-args-redacted]"}');
    expect(rows[6]!.context).toBe('{"readScope":"shared","now":"2026-07-17T00:00:00.000Z"}');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('alice@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('bob@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('carol@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('dave@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('eve@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('operator@example.test');
    expect(rows.map((row) => row.context).join('\n')).not.toContain('secret');
  });

  it('does not redact generic proxied payloads just because they have retention-shaped keys', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"maxEntries":1,"command":"rm -rf /var/data"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"readScope":"agent","cmd":"rm -rf /var/data"}',
    })).resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"readScope":"agent","payload":"rm -rf /var/data"}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });
  it('denies split recursive and force rm flags in any order', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'rm -r -f /var/data' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'run_shell', context: 'rm --force --recursive /var/data' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('denies destructive verbs in action names without relying on payload text', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'delete_file', context: '{"path":"src/app.ts"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'dropTable', context: '{"name":"events"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'delete__file', context: '{"path":"src/app.ts"}' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('approves benign substrings that are not destructive verbs', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'edit_file', context: '{"path":"src/dropdown.tsx"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_node', context: 'formatMessage("hello")' }))
      .resolves.toMatchObject({ decision: 'approved' });
  });

  it('denies when the dangerous pattern is only in the context payload', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({ action: 'run_shell', context: 'rm -rf /var/data' });
    expect(result.decision).toBe('denied');
  });

  it('routes ordinary memory stores through high-risk memory policy without scanning stored payload text', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    const result = await governor.check({
      action: 'fbeast_memory_store',
      context: '{"key":"notes","value":"delete drop truncate rm -rf /"}',
    });
    expect(result.decision).toBe('review_recommended');
    expect(result.reason).toContain('Memory edits persist');
  });

  it('requires trusted-operator review for unredacted memory exports without approval evidence', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"redaction":"safe"}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"redaction":"none"}',
    })).resolves.toMatchObject({
      decision: 'review_recommended',
      reason: expect.stringContaining('trusted-operator approval'),
    });
    await expect(governor.check({
      action: 'fbeast_memory_export',
      context: '{"redaction":"none","operatorApproval":"trusted-operator-approved"}',
    })).resolves.toMatchObject({
      decision: 'review_recommended',
      reason: expect.stringContaining('outside the caller-supplied tool arguments'),
    });
    await expect(governor.check({
      action: 'execute_tool',
      context: JSON.stringify({
        tool: 'fbeast_memory_export',
        args: { redaction: 'none', readScope: 'shared' },
      }),
    })).resolves.toMatchObject({
      decision: 'review_recommended',
      reason: expect.stringContaining('trusted-operator approval'),
    });
    await expect(governor.check({
      action: 'execute_tool',
      context: JSON.stringify({
        tool: 'fbeast_memory_export',
        args: { redaction: 'none', readScope: 'shared', operatorApproval: 'trusted-operator-approved' },
      }),
    })).resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({
      action: 'execute_tool',
      context: JSON.stringify({
        tool_input: {
          tool: 'mcp__franken_mcp__fbeast_memory_export',
          args: { redaction: 'none', readScope: 'shared' },
        },
      }),
    })).resolves.toMatchObject({
      decision: 'review_recommended',
      reason: expect.stringContaining('trusted-operator approval'),
    });
  });

  it('routes non-memory high-risk action classes through policy-as-code', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'git push origin main', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'gh issue edit 1704 --add-label security', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'cronjob create', context: '{"operation":"create","target":"every 10m"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'profile config set', context: '{"operation":"config","profile":"default","activeProfile":"default"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'send webhook', context: '{"url":"https://hooks.example.test/a","allowlisted":false}' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'kill process 123', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('allows read-only GitHub CLI inspection while gating mutating commands', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'gh issue view 1704' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh pr list --state open' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh --repo owner/repo pr view 5' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'gh label create security' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh run cancel 123' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh --repo owner/repo pr merge 123 --merge' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'gh secret set TOKEN --body value' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('gates git pushes with global git options', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'git -C ../repo push origin main' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'git --git-dir=.git push origin main' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'git push' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('routes crontab edits through cron policy', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'crontab -l' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'crontab -e' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'run_shell', context: 'crontab -r' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('denies cross-profile memory store evidence', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_store',
      context: '{"profile":"other","activeProfile":"default","key":"x"}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('detects real Slack incoming webhook URLs', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'curl -X POST https://hooks.slack.com/services/T/B/C' }))
      .resolves.toMatchObject({ decision: 'denied' });
    await expect(governor.check({ action: 'run_shell', context: 'curl -X POST https://discord.com/api/webhooks/123/token' }))
      .resolves.toMatchObject({ decision: 'denied' });
  });

  it('does not classify ordinary service paths as process control', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({ action: 'run_shell', context: 'cat src/service/config.ts' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'npm test packages/user-service' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'run_shell', context: 'service nginx restart' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('redacts proposed memory context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'fbeast_memory_review_propose',
      context: '{"key":"secret","value":"token abc123","source":"chat","reason":"remember"}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('fbeast_memory_review_propose') as { context: string };
    db.close();
    expect(row.context).toBe('[memory-review-proposal-context-redacted]');
    expect(row.context).not.toContain('token abc123');
  });

  it('redacts proxied proposed memory context before shared governor logging', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_name":"mcp__fbeast-proxy__execute_tool","tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_propose","args":{"key":"secret","value":"token abc123","source":"chat","reason":"remember"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-proxy__execute_tool') as { context: string };
    db.close();
    expect(row.context).toBe('[memory-review-proposal-context-redacted]');
    expect(row.context).not.toContain('token abc123');
  });

  it('does not hide stripped generic execute_tool payloads that only resemble memory proposals', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"key":"secret","value":"rm -rf /","source":"chat","reason":"remember"}',
    })).resolves.toMatchObject({ decision: 'denied' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-proxy__execute_tool') as { context: string };
    db.close();
    expect(row.context).toContain('secret');
    expect(row.context).toContain('rm -rf /');
  });

  it('does not redact arbitrary execute_tool context that merely mentions the proposal tool', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"fbeast_echo","args":{"text":"mentions fbeast_memory_review_propose and rm -rf /"}}}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('allows memory review approvals/rejections but gates never-store deletions through the shared path', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"approve"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"reject"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"never_store"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"reject","note":"Rejected because candidate text contains rm -rf /"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"resolve_conflict","resolution":"replace_existing"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"resolve_conflict","resolution":"keep_both_scoped","scopedKey":"user.preference.scope.docs"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"resolve_conflict","resolution":"expire_existing"}' }))
      .resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"resolve_conflict"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{"id":"memcand_1","action":"resolve_conflict","resolution":"overwrite"}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"approve","note":"candidate"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"resolve_conflict","resolution":"keep_existing","note":"candidate"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });
    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"never_store","note":"candidate"}}}',
    })).resolves.toMatchObject({ decision: 'review_recommended' });
    await expect(governor.check({ action: 'fbeast_memory_review_decide', context: '{}' }))
      .resolves.toMatchObject({ decision: 'review_recommended' });
  });

  it('ignores dangerous reviewer notes when governing memory review decisions', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'fbeast_memory_review_decide',
      context: '{"id":"memcand_1","action":"reject","reviewer":"alice","note":"Rejected because candidate contains rm -rf /"}',
    })).resolves.toMatchObject({ decision: 'approved' });
  });

  it('redacts proxied memory review decision notes before shared governor scanning', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"tool_input":{"tool":"mcp__fbeast-memory__fbeast_memory_review_decide","args":{"id":"memcand_1","action":"reject","note":"Rejected because candidate contains rm -rf /"}}}',
    })).resolves.toMatchObject({ decision: 'approved' });
  });

  it('preserves trusted hook provenance when redacting memory review decisions', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: JSON.stringify({
        __fbeastHookSource: 'fbeast-hook',
        tool_input: {
          tool: 'mcp__fbeast-memory__fbeast_memory_review_decide',
          args: { id: 'memcand_1', action: 'reject', note: 'Rejected because candidate contains rm -rf /' },
        },
      }),
    })).resolves.toMatchObject({ decision: 'approved' });

    const db = new Database(dbPath);
    const row = db.prepare(`SELECT context FROM governor_log WHERE action = ?`).get('mcp__fbeast-proxy__execute_tool') as { context: string };
    db.close();

    expect(JSON.parse(row.context)).toEqual({
      __fbeastHookSource: 'fbeast-hook',
      tool: 'fbeast_memory_review_decide',
      id: 'memcand_1',
      action: 'reject',
      note: '[memory-review-decision-metadata-redacted]',
    });
    expect(row.context).not.toContain('rm -rf');
  });

  it('does not infer memory review decisions from stripped generic execute_tool args', async () => {
    const governor = createGovernorAdapter(tracked(tmpDbPath()));

    await expect(governor.check({
      action: 'mcp__fbeast-proxy__execute_tool',
      context: '{"id":"memcand_1","action":"reject","note":"Rejected because candidate contains rm -rf /"}',
    })).resolves.toMatchObject({ decision: 'denied' });
  });

  it('reprices zero-cost known model rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('sess-known', 'gpt-4o', 1_000_000, 1_000_000, 0);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 20,
      byModel: [{ model: 'gpt-4o', costUsd: 20 }],
    });
  });

  it('reprices zero-cost rows before grouping budget status by model', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    const insert = db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('sess-known-legacy', 'gpt-4o', 1_000_000, 1_000_000, 0);
    insert.run('sess-known-explicit', 'gpt-4o', 0, 0, 3.5);
    insert.run('sess-unknown-legacy', 'new-model-not-in-pricing', 1000, 500, 0);
    insert.run('sess-unknown-explicit', 'new-model-not-in-pricing', 0, 0, 1.25);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 24.75,
      byModel: [
        { model: 'gpt-4o', costUsd: 23.5 },
        { model: 'new-model-not-in-pricing', costUsd: 1.25, unknownModel: true },
      ],
    });
  });

  it('preserves explicit zero-cost rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd, cost_source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sess-free-known', 'gpt-4o', 1_000_000, 1_000_000, 0, 'explicit');
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 0,
      byModel: [{ model: 'gpt-4o', costUsd: 0 }],
    });
  });

  it('marks zero-cost unknown model rows in budget status', async () => {
    const dbPath = tracked(tmpDbPath());
    const governor = createGovernorAdapter(dbPath);
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO cost_ledger (session_id, model, prompt_tokens, completion_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run('sess-unknown', 'new-model-not-in-pricing', 1000, 500, 0);
    db.close();

    await expect(governor.budgetStatus()).resolves.toEqual({
      totalSpendUsd: 0,
      byModel: [{ model: 'new-model-not-in-pricing', costUsd: 0, unknownModel: true }],
    });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown model "new-model-not-in-pricing"'));

    writeSpy.mockRestore();
  });
});
