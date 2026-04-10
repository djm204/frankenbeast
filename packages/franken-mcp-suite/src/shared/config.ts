import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type FbeastServer =
  | 'memory'
  | 'planner'
  | 'critique'
  | 'firewall'
  | 'observer'
  | 'governor'
  | 'skills';

const ALL_SERVERS: FbeastServer[] = [
  'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
];

interface BeastModeConfig {
  enabled: boolean;
  provider: string;
  acknowledged_cli_risk: boolean;
}

interface ConfigData {
  mode: 'mcp' | 'beast';
  db: string;
  servers: FbeastServer[];
  hooks: boolean;
  beast: BeastModeConfig;
}

export class FbeastConfig {
  mode: ConfigData['mode'];
  servers: FbeastServer[];
  hooks: boolean;
  beast: BeastModeConfig;

  private readonly root: string;

  private constructor(root: string, data: ConfigData) {
    this.root = root;
    this.mode = data.mode;
    this.servers = data.servers;
    this.hooks = data.hooks;
    this.beast = data.beast;
  }

  get dbPath(): string {
    return join(this.root, '.fbeast', 'beast.db');
  }

  get configPath(): string {
    return join(this.root, '.fbeast', 'config.json');
  }

  get fbeastDir(): string {
    return join(this.root, '.fbeast');
  }

  save(): void {
    const data: ConfigData = {
      mode: this.mode,
      db: '.fbeast/beast.db',
      servers: this.servers,
      hooks: this.hooks,
      beast: this.beast,
    };
    writeFileSync(this.configPath, JSON.stringify(data, null, 2) + '\n');
  }

  static init(root: string, servers?: FbeastServer[]): FbeastConfig {
    const fbDir = join(root, '.fbeast');
    mkdirSync(fbDir, { recursive: true });

    const data: ConfigData = {
      mode: 'mcp',
      db: '.fbeast/beast.db',
      servers: servers ?? ALL_SERVERS,
      hooks: false,
      beast: {
        enabled: false,
        provider: 'anthropic-api',
        acknowledged_cli_risk: false,
      },
    };

    const cfg = new FbeastConfig(root, data);
    cfg.save();
    return cfg;
  }

  static load(root: string): FbeastConfig {
    const configPath = join(root, '.fbeast', 'config.json');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return new FbeastConfig(root, raw);
  }
}
