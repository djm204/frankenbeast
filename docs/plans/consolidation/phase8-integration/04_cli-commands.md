# Chunk 8.4: CLI Command Design

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunk 8.1 (dep-factory), Phase 4 (security profiles), Phase 5 (skill manager)
**Estimated size:** Medium (~250 lines + tests)

---

## Purpose

Add CLI commands for skill management, provider management, security configuration, and dashboard launch. The CLI must be intuitive — no manual reading required for common tasks.

## Design Principles

- **Verb-noun pattern**: `frankenbeast <noun> <verb>` (e.g., `skill add`, `provider list`)
- **Smart defaults**: `frankenbeast run "task"` works with zero config if any provider CLI is logged in
- **Progressive disclosure**: basic path needs no flags; power users get `--provider`, `--skills`, `--security`
- **Helpful errors**: if no provider is configured, don't just fail — show `Run 'frankenbeast provider add claude' to get started`

## Implementation

### Skill Commands

```typescript
// packages/franken-orchestrator/src/cli/commands/skill.ts

import { Command } from 'commander';
import { SkillManager } from '../../skills/skill-manager.js';

export function registerSkillCommands(program: Command): void {
  const skill = program.command('skill').description('Manage skills (MCP tools)');

  skill
    .command('list')
    .description('Show installed skills with enabled/disabled status')
    .action(async () => {
      const manager = new SkillManager(getSkillsDir());
      const skills = manager.listInstalled();
      if (skills.length === 0) {
        console.log('No skills installed. Run `frankenbeast skill catalog` to browse available skills.');
        return;
      }
      for (const s of skills) {
        const status = s.enabled ? '✓' : '✗';
        const provider = s.provider ? ` (${s.provider})` : '';
        console.log(`  ${status} ${s.name}${provider}`);
      }
    });

  skill
    .command('catalog [provider]')
    .description('Browse marketplace skills (optionally filter by provider)')
    .action(async (provider?: string) => {
      const registry = await buildProviderRegistry();
      if (provider) {
        const skills = await registry.getProvider(provider).discoverSkills?.() ?? [];
        printCatalog(provider, skills);
      } else {
        // Browse all providers
        for (const p of registry.getProviders()) {
          const skills = await p.discoverSkills?.() ?? [];
          if (skills.length > 0) printCatalog(p.name, skills);
        }
      }
    });

  skill
    .command('add <name>')
    .description('Install skill from marketplace (auto-detects provider)')
    .option('--custom', 'Create custom MCP skill (interactive)')
    .action(async (name: string, opts) => {
      const manager = new SkillManager(getSkillsDir());
      if (opts.custom) {
        // Interactive: prompt for command, args, env vars
        const command = await prompt('Server command:');
        const args = await prompt('Arguments (comma-separated):');
        const envVars = await promptKeyValues('Environment variables (KEY=VALUE, blank to finish):');
        await manager.installCustom(name, { command, args: args.split(','), env: envVars });
      } else {
        // Auto-detect provider and install from marketplace
        const registry = await buildProviderRegistry();
        const { provider, entry } = await findSkillInCatalogs(registry, name);
        await manager.install(provider, entry);
      }
      console.log(`Skill '${name}' installed and enabled.`);
    });

  skill
    .command('enable <name>')
    .description('Enable an installed skill')
    .action(async (name: string) => {
      const manager = new SkillManager(getSkillsDir());
      manager.enable(name);
      console.log(`Skill '${name}' enabled.`);
    });

  skill
    .command('disable <name>')
    .description('Disable an installed skill')
    .action(async (name: string) => {
      const manager = new SkillManager(getSkillsDir());
      manager.disable(name);
      console.log(`Skill '${name}' disabled.`);
    });

  skill
    .command('remove <name>')
    .description('Remove skill directory')
    .action(async (name: string) => {
      const manager = new SkillManager(getSkillsDir());
      manager.remove(name);
      console.log(`Skill '${name}' removed.`);
    });
}
```

### Provider Commands

```typescript
// packages/franken-orchestrator/src/cli/commands/provider.ts

export function registerProviderCommands(program: Command): void {
  const provider = program.command('provider').description('Manage LLM providers');

  provider
    .command('list')
    .description('Show configured providers with auth status')
    .action(async () => {
      const registry = await buildProviderRegistry();
      for (const p of registry.getProviders()) {
        const available = await p.isAvailable();
        const status = available ? 'authenticated' : 'not configured';
        const indicator = available ? '●' : '○';
        console.log(`  ${indicator} ${p.name} — ${status}`);
      }
    });

  provider
    .command('add <name>')
    .description('Add a provider (interactive: API key or CLI login)')
    .action(async (name: string) => {
      // Detect if CLI is installed for CLI-based providers
      const isCliProvider = ['claude', 'codex', 'gemini'].includes(name);
      if (isCliProvider) {
        const cliAvailable = await checkCliInstalled(name);
        if (cliAvailable) {
          const useCliLogin = await confirm(`${name} CLI detected. Use CLI login? (Y/n)`);
          if (useCliLogin) {
            // No additional config needed — CLI auth is already in place
            await saveProviderConfig(name, { type: `${name}-cli`, auth: 'cli-login' });
            console.log(`Provider '${name}' added (using CLI login).`);
            return;
          }
        }
      }
      // API key path
      const apiKey = await promptSecret(`Enter API key for ${name}:`);
      await saveProviderConfig(name, { type: `${name}-api`, apiKey });
      console.log(`Provider '${name}' added.`);
    });

  provider
    .command('order <providers...>')
    .description('Set failover priority (first = primary)')
    .action(async (providers: string[]) => {
      await saveProviderOrder(providers);
      console.log(`Provider order set: ${providers.join(' → ')}`);
    });
}
```

### Security Commands

```typescript
// packages/franken-orchestrator/src/cli/commands/security.ts

export function registerSecurityCommands(program: Command): void {
  const security = program.command('security').description('Security configuration');

  security
    .command('status')
    .description('Show current security profile and settings')
    .action(async () => {
      const config = await loadSecurityConfig();
      console.log(`Profile: ${config.profile}`);
      console.log(`  Injection detection: ${config.injectionDetection ? 'on' : 'off'}`);
      console.log(`  PII masking: ${config.piiMasking ? 'on' : 'off'}`);
      console.log(`  Output validation: ${config.outputValidation ? 'on' : 'off'}`);
      if (config.tokenBudget) console.log(`  Token budget: ${config.tokenBudget}`);
      if (config.allowedDomains?.length) console.log(`  Allowed domains: ${config.allowedDomains.join(', ')}`);
    });

  security
    .command('set <profile-or-setting>')
    .description('Switch profile or override individual setting')
    .option('--pii-masking <on|off>', 'Override PII masking')
    .option('--injection-detection <on|off>', 'Override injection detection')
    .option('--output-validation <on|off>', 'Override output validation')
    .action(async (profileOrSetting: string, opts) => {
      if (['strict', 'standard', 'permissive'].includes(profileOrSetting)) {
        await saveSecurityConfig({ profile: profileOrSetting as SecurityProfile });
        console.log(`Security profile set to '${profileOrSetting}'.`);
      }
      // Apply individual overrides
      const overrides: Partial<SecurityConfig> = {};
      if (opts.piiMasking) overrides.piiMasking = opts.piiMasking === 'on';
      if (opts.injectionDetection) overrides.injectionDetection = opts.injectionDetection === 'on';
      if (opts.outputValidation) overrides.outputValidation = opts.outputValidation === 'on';
      if (Object.keys(overrides).length > 0) {
        await saveSecurityConfig(overrides);
        console.log('Security settings updated.');
      }
    });
}
```

### Dashboard Command

```typescript
// packages/franken-orchestrator/src/cli/commands/dashboard.ts

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Start the dashboard (opens browser)')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--no-open', 'Don\'t open browser')
    .action(async (opts) => {
      const { startDashboard } = await import('@frankenbeast/web');
      const url = await startDashboard({ port: parseInt(opts.port) });
      console.log(`Dashboard running at ${url}`);
      if (opts.open !== false) {
        const open = await import('open');
        await open.default(url);
      }
    });
}
```

### Run Command Enhancement

```typescript
// Modify existing run command to support new flags

program
  .command('run <objective>')
  .description('Run an agent')
  .option('--provider <name>', 'Use specific provider (default: first available)')
  .option('--skills <names>', 'Comma-separated skill overrides')
  .option('--security <profile>', 'Security profile override (strict/standard/permissive)')
  .action(async (objective: string, opts) => {
    const config = await loadRunConfig();

    if (opts.provider) config.providers = [findProvider(opts.provider)];
    if (opts.skills) config.skills = opts.skills.split(',');
    if (opts.security) config.security = { profile: opts.security };

    const deps = createBeastDependencies(config);
    await runBeastLoop(deps, objective);
  });
```

### Helpful Error Messages

```typescript
// packages/franken-orchestrator/src/cli/error-messages.ts

export const HELPFUL_ERRORS = {
  noProviders: `No providers configured.

  Get started:
    frankenbeast provider add claude     # if you have Claude CLI installed
    frankenbeast provider add openai     # if you have an OpenAI API key

  Then run:
    frankenbeast run "your task here"`,

  noSkills: `No skills installed. Agents work without skills, but they're more powerful with them.

  Browse available skills:
    frankenbeast skill catalog

  Or install a popular one:
    frankenbeast skill add github`,

  providerAuthFailed: (name: string) => `Provider '${name}' authentication failed.

  Options:
    frankenbeast provider add ${name}    # reconfigure
    frankenbeast provider list           # check status`,
};
```

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/cli/commands/skill.test.ts
describe('skill commands', () => {
  it('skill list shows installed skills with status', async () => { ... });
  it('skill list shows helpful message when empty', async () => { ... });
  it('skill catalog browses all providers', async () => { ... });
  it('skill catalog <provider> filters to one provider', async () => { ... });
  it('skill add installs from marketplace', async () => { ... });
  it('skill add --custom prompts interactively', async () => { ... });
  it('skill enable/disable toggles skill state', async () => { ... });
  it('skill remove deletes skill directory', async () => { ... });
});

// packages/franken-orchestrator/tests/unit/cli/commands/provider.test.ts
describe('provider commands', () => {
  it('provider list shows auth status', async () => { ... });
  it('provider add detects CLI and offers CLI login', async () => { ... });
  it('provider add falls back to API key', async () => { ... });
  it('provider order sets failover priority', async () => { ... });
});

// packages/franken-orchestrator/tests/unit/cli/commands/security.test.ts
describe('security commands', () => {
  it('security status shows current config', async () => { ... });
  it('security set <profile> switches profile', async () => { ... });
  it('security set with --pii-masking overrides individual setting', async () => { ... });
});

// packages/franken-orchestrator/tests/unit/cli/commands/dashboard.test.ts
describe('dashboard command', () => {
  it('starts dashboard on specified port', async () => { ... });
  it('opens browser by default', async () => { ... });
  it('--no-open skips browser launch', async () => { ... });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/cli/commands/skill.ts`
- **Add:** `packages/franken-orchestrator/src/cli/commands/provider.ts`
- **Add:** `packages/franken-orchestrator/src/cli/commands/security.ts`
- **Add:** `packages/franken-orchestrator/src/cli/commands/dashboard.ts`
- **Add:** `packages/franken-orchestrator/src/cli/error-messages.ts`
- **Modify:** `packages/franken-orchestrator/src/cli/index.ts` — register all new commands
- **Modify:** `packages/franken-orchestrator/src/cli/commands/run.ts` — add `--provider`, `--skills`, `--security` flags
- **Add:** `packages/franken-orchestrator/tests/unit/cli/commands/skill.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/cli/commands/provider.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/cli/commands/security.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/cli/commands/dashboard.test.ts`

## Exit Criteria

- All five command groups work: `run`, `skill`, `provider`, `security`, `dashboard`
- `frankenbeast run "task"` works with zero config if any CLI provider is logged in
- `skill catalog` browses marketplace, `skill add` installs, `skill enable/disable` toggles
- `provider list` shows auth status, `provider add` supports both CLI login and API key
- `security status` shows config, `security set` switches profiles and overrides settings
- `dashboard` starts web server and opens browser
- Helpful error messages guide users when providers/skills aren't configured
- All tests pass
