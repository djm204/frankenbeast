/**
 * Aider CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Aider uses LiteLLM which handles rate-limit retries internally,
 * so isRateLimited() always returns false.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export class AiderProvider implements ICliProvider {
  readonly name = 'aider';
  readonly command = 'aider';
  readonly chatModel = 'sonnet';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = ['--message', '--yes-always', '--no-stream', '--no-auto-commits'];
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    return raw.replace(ANSI_PATTERN, '');
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  isRateLimited(_stderr: string): boolean {
    return false;
  }

  parseRetryAfter(_stderr: string): number | undefined {
    return undefined;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = { ...env };
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('AIDER')) {
        delete filtered[key];
      }
    }
    return filtered;
  }

  supportsStreamJson(): boolean {
    return false;
  }
}
