import type { ProviderAction } from './args.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';

export interface ProviderCommandDeps {
  registry: ProviderRegistry;
  action?: ProviderAction;
  target?: string | undefined;
  print(message: string): void;
}

export async function handleProviderCommand(deps: ProviderCommandDeps): Promise<void> {
  const { registry, action, target, print } = deps;

  switch (action) {
    case 'list': {
      const providers = registry.getProviders();
      if (providers.length === 0) {
        print('No providers configured.');
        return;
      }
      for (const p of providers) {
        print(`  ${p.name}`);
      }
      return;
    }
    case 'test': {
      const providers = target
        ? registry.getProviders().filter((p) => p.name === target)
        : [...registry.getProviders()];
      for (const p of providers) {
        const available = await p.isAvailable();
        print(`  ${available ? '[ok]' : '[fail]'} ${p.name}`);
      }
      return;
    }
    case 'add':
      print('Provider configuration is managed via run-config. Add providers to your .frankenbeast/config.json file.');
      return;
    case 'remove':
      print('Provider configuration is managed via run-config. Remove providers from your .frankenbeast/config.json file.');
      return;
    default:
      throw new Error('Usage: frankenbeast provider <list|add|remove|test> [name]');
  }
}
