import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecurityAction } from './args.js';
import { resolveSecurityConfig, type SecurityProfile } from '../middleware/security-profiles.js';

export interface SecurityCommandDeps {
  action?: SecurityAction;
  target?: string | undefined;
  currentProfile?: SecurityProfile;
  configPath?: string | undefined;
  print(message: string): void;
}

const VALID_SECURITY_PROFILES = ['strict', 'standard', 'permissive'] as const;

function isSecurityProfile(value: string): value is SecurityProfile {
  return (VALID_SECURITY_PROFILES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readConfigFile(configPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Config file must contain a JSON object: ${configPath}`);
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function persistSecurityProfile(configPath: string, profile: SecurityProfile): Promise<void> {
  const config = await readConfigFile(configPath);
  const currentSecurity = config.security;
  config.security = {
    ...(isRecord(currentSecurity) ? currentSecurity : {}),
    profile,
  };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export async function handleSecurityCommand(deps: SecurityCommandDeps): Promise<void> {
  const { action, target, currentProfile, configPath, print } = deps;

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
      if (!isSecurityProfile(target)) {
        throw new Error(`Invalid security profile '${target}'. Valid: ${VALID_SECURITY_PROFILES.join(', ')}`);
      }
      if (!configPath) {
        throw new Error('Cannot persist security profile: missing config path');
      }
      await persistSecurityProfile(configPath, target);
      print(`Security profile set to '${target}' in ${configPath}.`);
      return;
    }
    default:
      throw new Error('Usage: frankenbeast security <status|set> [profile]');
  }
}
