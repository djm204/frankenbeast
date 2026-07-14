#!/usr/bin/env npx tsx

import { existsSync, readFileSync } from 'node:fs';

function printLine(...args: unknown[]): void {
  console.info(...args);
}

function parseEnvFile(path: string): Map<string, string> {
  const env = new Map<string, string>();

  if (!existsSync(path)) {
    return env;
  }

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim().replace(/^(?:"|')|(?:"|')$/gu, '');
    env.set(key, value);
  }

  return env;
}

/**
 * Seed script: populates ChromaDB with example project data
 * for local development and testing.
 *
 * Usage: npm run local:seed
 */

const envFile = parseEnvFile('.env');
const CHROMA_URL = process.env['CHROMA_URL'] ?? envFile.get('CHROMA_URL') ?? 'http://localhost:8000';
const CHROMA_TENANT = process.env['CHROMA_TENANT'] ?? envFile.get('CHROMA_TENANT') ?? 'default_tenant';
const CHROMA_DATABASE = process.env['CHROMA_DATABASE'] ?? envFile.get('CHROMA_DATABASE') ?? 'default_database';

export {};

interface ChromaCollection {
  name: string;
  metadata?: Record<string, string>;
}

async function createCollection(name: string, metadata?: Record<string, string>): Promise<void> {
  const tenant = encodeURIComponent(CHROMA_TENANT);
  const database = encodeURIComponent(CHROMA_DATABASE);
  const res = await fetch(`${CHROMA_URL}/api/v2/tenants/${tenant}/databases/${database}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata, get_or_create: true }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create collection ${name}: ${res.status} ${await res.text()}`);
  }

  printLine(`  Collection "${name}" ready`);
}

async function main(): Promise<void> {
  printLine(`Seeding ChromaDB at ${CHROMA_URL}...`);

  // Check connectivity
  try {
    const heartbeat = await fetch(`${CHROMA_URL}/api/v2/heartbeat`);
    if (!heartbeat.ok) throw new Error(`Status ${heartbeat.status}`);
  } catch (error) {
    console.error(`Cannot reach ChromaDB at ${CHROMA_URL}. Is it running?`);
    console.error('Run: docker compose up chromadb');
    process.exit(1);
  }

  // Create collections for each module that uses vector storage
  await createCollection('episodic-memory', { module: '@franken/brain' });
  await createCollection('project-adrs', { module: '@franken/brain' });
  await createCollection('known-errors', { module: '@franken/brain' });
  printLine('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
