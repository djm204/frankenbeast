#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createFirewallAdapter, type FirewallAdapter } from '../adapters/firewall-adapter.js';
import { parseArgs } from 'node:util';

export interface FirewallServerDeps {
  firewall: FirewallAdapter;
}

export function createFirewallServer(deps: FirewallServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const { firewall } = deps;
  const tools: ToolDef[] = [
    {
      name: 'fbeast_firewall_scan',
      description: 'Scan text input for prompt injection patterns. Returns clean or flagged with matched patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Text to scan for injection patterns' },
        },
        required: ['input'],
      },
      async handler(args) {
        const input = String(args['input']);
        const result = await firewall.scanText(input);

        if (result.verdict === 'clean') {
          return { content: [{ type: 'text', text: 'Scan result: clean. No injection patterns detected.' }] };
        }
        return {
          content: [{
            type: 'text',
            text: `Scan result: flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis input may contain prompt injection. Review before processing.`,
          }],
        };
      },
    },
    {
      name: 'fbeast_firewall_scan_file',
      description: 'Read a file and scan its contents for prompt injection patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to scan' },
        },
        required: ['path'],
      },
      async handler(args) {
        const filePath = String(args['path']);
        try {
          const result = await firewall.scanFile(filePath);

          if (result.verdict === 'clean') {
            return { content: [{ type: 'text', text: `File scan (${filePath}): clean. No injection patterns detected.` }] };
          }
          return {
            content: [{
              type: 'text',
              text: `File scan (${filePath}): flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis file may contain prompt injection. Review before processing.`,
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error reading file: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    },
  ];

  return createMcpServer('fbeast-firewall', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      db: { type: 'string', default: '.fbeast/beast.db' },
      tier: { type: 'string', default: 'standard' },
    },
  });
  const tier = values['tier'] === 'strict' ? 'strict' : 'standard';
  const firewall = createFirewallAdapter(values['db']!, tier, {
    root: process.env['FBEAST_ROOT'] ?? process.cwd(),
  });
  const server = createFirewallServer({ firewall }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-firewall failed to start:', err);
    process.exit(1);
  });
}
