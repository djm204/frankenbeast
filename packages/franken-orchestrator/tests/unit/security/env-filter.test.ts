import { describe, it, expect } from 'vitest';
import {
  filterSecretEnvVars,
  isSecretEnvVarName,
  isSecretEnvVarValue,
} from '../../../src/security/env-filter.js';

describe('isSecretEnvVarName', () => {
  it('flags common secret-shaped env var names', () => {
    const secretNames = [
      'SOME_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'NPM_TOKEN',
      'DATABASE_PASSWORD',
      'DB_PASSWD',
      'MY_APP_SECRET',
      'CLIENT_SECRET',
      'PRIVATE_KEY',
      'ENCRYPTION_KEY',
      'BASIC_AUTH',
      'SESSION_COOKIE',
      'TLS_CERTIFICATE',
      'SLACK_WEBHOOK_URL',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'PGPASSWORD',
      'MYSQL_PWD',
    ];
    for (const name of secretNames) {
      expect(isSecretEnvVarName(name), `expected ${name} to be flagged as secret`).toBe(true);
    }
  });

  it('flags secret-manager session tokens (BW_SESSION, OP_SESSION_<account>)', () => {
    expect(isSecretEnvVarName('BW_SESSION')).toBe(true);
    expect(isSecretEnvVarName('bw_session')).toBe(true);
    expect(isSecretEnvVarName('OP_SESSION_my_account')).toBe(true);
    expect(isSecretEnvVarName('OP_SESSION_ABC123')).toBe(true);
  });

  it('does not flag ordinary desktop/X11 session env vars', () => {
    const desktopSessionNames = [
      'XDG_SESSION_ID',
      'XDG_SESSION_TYPE',
      'DESKTOP_SESSION',
      'SESSION_MANAGER',
      'DBUS_SESSION_BUS_ADDRESS',
      'GDMSESSION',
    ];
    for (const name of desktopSessionNames) {
      expect(isSecretEnvVarName(name), `expected ${name} to NOT be flagged as secret`).toBe(false);
    }
  });

  it('does not flag ordinary CLI/runtime env var names', () => {
    const safeNames = [
      'PATH',
      'HOME',
      'SHELL',
      'LANG',
      'LC_ALL',
      'TERM',
      'PWD',
      'TMPDIR',
      'USER',
      'EDITOR',
      'CI',
      'NODE_ENV',
      'NO_COLOR',
      'FORCE_COLOR',
      'npm_config_registry',
      'KEYBOARD_LAYOUT',
      'XDG_CONFIG_HOME',
      'SSH_AUTH_SOCK',
      'SSH_AGENT_PID',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'NODE_EXTRA_CA_CERTS',
      'DOCKER_CERT_PATH',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
      'GIT_CONFIG_KEY_12',
    ];
    for (const name of safeNames) {
      expect(isSecretEnvVarName(name), `expected ${name} to NOT be flagged as secret`).toBe(false);
    }
  });
});

describe('isSecretEnvVarValue', () => {
  it('flags database connection strings with embedded credentials', () => {
    expect(isSecretEnvVarValue('postgres://user:hunter2@db.example.com:5432/app')).toBe(true);
    expect(isSecretEnvVarValue('postgresql://user:hunter2@db.example.com/app')).toBe(true);
    expect(isSecretEnvVarValue('mysql://root:pw@localhost/db')).toBe(true);
    expect(isSecretEnvVarValue('mariadb://root:pw@localhost/db')).toBe(true);
    expect(isSecretEnvVarValue('mongodb://user:pw@cluster0.mongodb.net/app')).toBe(true);
    expect(isSecretEnvVarValue('mongodb+srv://user:pw@cluster0.mongodb.net/app')).toBe(true);
    expect(isSecretEnvVarValue('redis://user:pw@localhost:6379')).toBe(true);
    expect(isSecretEnvVarValue('rediss://user:pw@localhost:6379')).toBe(true);
  });

  it('does not flag connection strings without embedded credentials or ordinary values', () => {
    expect(isSecretEnvVarValue('postgres://db.example.com:5432/app')).toBe(false);
    expect(isSecretEnvVarValue('/usr/bin:/bin')).toBe(false);
    expect(isSecretEnvVarValue('en_US.UTF-8')).toBe(false);
    expect(isSecretEnvVarValue('https://api.example.com')).toBe(false);
    expect(isSecretEnvVarValue('')).toBe(false);
  });
});

describe('filterSecretEnvVars', () => {
  it('removes secret-shaped keys and preserves the rest', () => {
    const input = {
      PATH: '/usr/bin',
      HOME: '/home/test',
      SOME_API_KEY: 'sk-secret',
      DATABASE_PASSWORD: 'hunter2',
    };
    expect(filterSecretEnvVars(input)).toEqual({ PATH: '/usr/bin', HOME: '/home/test' });
  });

  it('removes vars whose value looks like a credential connection string, even with a non-secret-shaped name', () => {
    const input = {
      PATH: '/usr/bin',
      DATABASE_URL: 'postgres://user:hunter2@db.example.com:5432/app',
      REDIS_URL: 'redis://user:pw@localhost:6379',
      PUBLIC_API_URL: 'https://api.example.com',
    };
    expect(filterSecretEnvVars(input)).toEqual({
      PATH: '/usr/bin',
      PUBLIC_API_URL: 'https://api.example.com',
    });
  });

  it('removes secret-manager session tokens', () => {
    const input = {
      PATH: '/usr/bin',
      BW_SESSION: 'live-vault-session-token',
      OP_SESSION_my_account: 'live-1password-session-token',
      XDG_SESSION_ID: '3',
    };
    expect(filterSecretEnvVars(input)).toEqual({ PATH: '/usr/bin', XDG_SESSION_ID: '3' });
  });

  it('preserves keys listed in exemptNames despite looking secret-shaped', () => {
    const input = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      OPENAI_API_KEY: 'openai-secret',
    };
    expect(filterSecretEnvVars(input, ['ANTHROPIC_API_KEY'])).toEqual({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'anthropic-secret',
    });
  });

  it('exemptNames bypasses the value-based check too (trusted by name)', () => {
    const input = {
      TRUSTED_DB_URL: 'postgres://user:hunter2@db.example.com/app',
    };
    expect(filterSecretEnvVars(input, ['TRUSTED_DB_URL'])).toEqual(input);
  });
});
