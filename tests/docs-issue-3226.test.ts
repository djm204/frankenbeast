import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function requireMatch(source: string, pattern: RegExp, description: string): string {
  const match = source.match(pattern);
  expect(match, description).not.toBeNull();
  return match?.[1] ?? '';
}

describe('issue #3226 dashboard SSE endpoint contract', () => {
  it('keeps the dashboard client and daemon route on the same canonical stream path', () => {
    const daemonRoutes = readRepoFile(
      'packages/franken-orchestrator/src/http/routes/beast-sse-routes.ts',
    );
    const dashboardClient = readRepoFile('packages/franken-web/src/lib/beast-api.ts');

    const daemonPath = requireMatch(
      daemonRoutes,
      /app\.get\('([^']*\/events\/stream)'/u,
      'daemon SSE route should be declared',
    );
    const dashboardPath = requireMatch(
      dashboardClient,
      /`\$\{this\.baseUrl\}(\/[^?]*\/events\/stream)\?\$\{query\.toString\(\)\}`/u,
      'dashboard EventSource path should be declared',
    );

    expect(dashboardPath).toBe(daemonPath);
    expect(daemonPath).toBe('/v1/beasts/events/stream');
  });

  it('documents the canonical ticket and stream endpoints in ADR-030', () => {
    const adr = readRepoFile('docs/adr/030-sse-connection-tickets-auth.md');

    expect(adr).toContain('Ticket issuance: `POST /v1/beasts/events/ticket`');
    expect(adr).toContain(
      'Dashboard stream: `GET /v1/beasts/events/stream?ticket=<uuid>`',
    );
    expect(adr).not.toContain('`useBeastEventStream`');
  });
});
