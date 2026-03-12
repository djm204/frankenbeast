import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ISecretStore, SecretStoreDetection, SecretStoreOptions } from '../secret-store.js';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

interface SecretsMeta {
  salt: string; // hex
  version: 1;
}

export class LocalEncryptedStore implements ISecretStore {
  readonly id = 'local-encrypted';
  private readonly projectRoot: string;
  private readonly passphrase: string;
  private derivedKey: Buffer | undefined;

  constructor(options: SecretStoreOptions & { passphrase: string }) {
    this.projectRoot = options.projectRoot;
    this.passphrase = options.passphrase;
  }

  async detect(): Promise<SecretStoreDetection> {
    return { available: true };
  }

  async store(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    secrets[key] = value;
    await this.saveSecrets(secrets);
  }

  async resolve(key: string): Promise<string | undefined> {
    const secrets = await this.loadSecrets();
    return secrets[key];
  }

  async delete(key: string): Promise<void> {
    const secrets = await this.loadSecrets();
    delete secrets[key];
    await this.saveSecrets(secrets);
  }

  async keys(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    return Object.keys(secrets);
  }

  private get secretsDir(): string {
    return join(this.projectRoot, '.frankenbeast');
  }

  private get encPath(): string {
    return join(this.secretsDir, 'secrets.enc');
  }

  private get metaPath(): string {
    return join(this.secretsDir, 'secrets.meta.json');
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.secretsDir, { recursive: true });
  }

  private async getDerivedKey(): Promise<Buffer> {
    if (this.derivedKey) {
      return this.derivedKey;
    }

    let meta: SecretsMeta;
    try {
      const raw = await readFile(this.metaPath, 'utf-8');
      meta = JSON.parse(raw) as SecretsMeta;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const salt = randomBytes(SALT_LENGTH).toString('hex');
        meta = { salt, version: 1 };
        await this.ensureDir();
        await writeFile(this.metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
      } else {
        throw error;
      }
    }

    this.derivedKey = pbkdf2Sync(
      this.passphrase,
      Buffer.from(meta.salt, 'hex'),
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
    return this.derivedKey;
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    let ciphertext: Buffer;
    try {
      ciphertext = await readFile(this.encPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }

    const key = await this.getDerivedKey();
    const iv = ciphertext.subarray(0, IV_LENGTH);
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
  }

  private async saveSecrets(secrets: Record<string, string>): Promise<void> {
    await this.ensureDir();
    const key = await this.getDerivedKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(secrets), 'utf-8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    await writeFile(this.encPath, combined);
  }
}
