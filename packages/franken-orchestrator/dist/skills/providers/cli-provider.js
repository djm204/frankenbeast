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
export class ProviderRegistry {
    providers = new Map();
    register(provider) {
        this.providers.set(provider.name, provider);
    }
    get(name) {
        const provider = this.providers.get(name);
        if (provider !== undefined)
            return provider;
        const available = this.names();
        if (available.length === 0) {
            throw new Error(`Unknown provider "${name}": no providers registered`);
        }
        throw new Error(`Unknown provider "${name}". Available: ${available.join(', ')}`);
    }
    has(name) {
        return this.providers.has(name);
    }
    names() {
        return [...this.providers.keys()];
    }
}
export function createDefaultRegistry() {
    const registry = new ProviderRegistry();
    registry.register(new ClaudeProvider());
    registry.register(new CodexProvider());
    registry.register(new GeminiProvider());
    registry.register(new AiderProvider());
    return registry;
}
//# sourceMappingURL=cli-provider.js.map