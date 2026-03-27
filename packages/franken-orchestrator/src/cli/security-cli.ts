import type { SecurityAction } from './args.js';
import { resolveSecurityConfig, type SecurityProfile } from '../middleware/security-profiles.js';

export interface SecurityCommandDeps {
  action?: SecurityAction;
  target?: string | undefined;
  currentProfile?: SecurityProfile;
  print(message: string): void;
}

export async function handleSecurityCommand(deps: SecurityCommandDeps): Promise<void> {
  const { action, target, currentProfile, print } = deps;

  switch (action) {
    case 'status': {
      const profile = currentProfile ?? 'standard';
      const config = resolveSecurityConfig(profile);
      print(`Security Profile: ${profile}`);
      print(`  Injection Detection: ${config.injectionDetection ? 'on' : 'off'}`);
      print(`  PII Masking: ${config.piiMasking ? 'on' : 'off'}`);
      print(`  Output Validation: ${config.outputValidation ? 'on' : 'off'}`);
      return;
    }
    case 'set': {
      if (!target) throw new Error('Usage: frankenbeast security set <strict|standard|permissive>');
      const valid = ['strict', 'standard', 'permissive'];
      if (!valid.includes(target)) {
        throw new Error(`Invalid security profile '${target}'. Valid: ${valid.join(', ')}`);
      }
      print(`Security profile set to '${target}'. Apply via run-config or restart.`);
      return;
    }
    default:
      throw new Error('Usage: frankenbeast security <status|set> [profile]');
  }
}
