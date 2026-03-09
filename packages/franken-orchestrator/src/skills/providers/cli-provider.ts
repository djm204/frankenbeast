/**
 * Pluggable CLI provider interface and registry.
 *
 * ICliProvider abstracts CLI agent differences (claude, codex, etc.)
 * so the Martin-loop can work with any provider without hardcoding.
 *
 * ProviderRegistry holds named providers and validates on lookup.
 */

import { ClaudeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { AiderProvider } from './aider-provider.js';

export interface ProviderOpts {
  readonly maxTurns?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly workingDir?: string | undefined;
  readonly model?: string | undefined;
  readonly extraArgs?: readonly string[] | undefined;
  readonly commandOverride?: string | undefined;
  /** When true, omit tool/permission flags — used for conversational chat. */
  readonly chatMode?: boolean | undefined;
  /** When true, ask the provider to resume its native CLI session if supported. */
  readonly sessionContinue?: boolean | undefined;
}

export interface ICliProvider {
  readonly name: string;
  readonly command: string;
  /** Cheap model for conversational/chat use. Each provider defines its own. */
  readonly chatModel: string;
  buildArgs(opts: ProviderOpts): string[];
  normalizeOutput(raw: string): string;
  estimateTokens(text: string): number;
  isRateLimited(stderr: string): boolean;
  parseRetryAfter(stderr: string): number | undefined;
  filterEnv(env: Record<string, string>): Record<string, string>;
  supportsStreamJson(): boolean;
  supportsNativeSessionResume(): boolean;
  defaultContextWindowTokens(): number;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ICliProvider>();

  register(provider: ICliProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ICliProvider {
    const provider = this.providers.get(name);
    if (provider !== undefined) return provider;

    const available = this.names();
    if (available.length === 0) {
      throw new Error(
        `Unknown provider "${name}": no providers registered`,
      );
    }
    throw new Error(
      `Unknown provider "${name}". Available: ${available.join(', ')}`,
    );
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new ClaudeProvider());
  registry.register(new CodexProvider());
  registry.register(new GeminiProvider());
  registry.register(new AiderProvider());
  return registry;
}
