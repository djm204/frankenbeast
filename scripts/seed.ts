#!/usr/bin/env npx tsx
/**
 * Seed script: populates ChromaDB with example project data
 * for local development and testing.
 *
 * Usage: npx tsx scripts/seed.ts
 */

const CHROMA_URL = process.env['CHROMA_URL'] ?? 'http://localhost:8000';

interface ChromaCollection {
  name: string;
  metadata?: Record<string, string>;
}

async function createCollection(name: string, metadata?: Record<string, string>): Promise<void> {
  const res = await fetch(`${CHROMA_URL}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, metadata, get_or_create: true }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create collection ${name}: ${res.status} ${await res.text()}`);
  }

  console.log(`  Collection "${name}" ready`);
}

async function main(): Promise<void> {
  console.log(`Seeding ChromaDB at ${CHROMA_URL}...`);

  // Check connectivity
  try {
    const heartbeat = await fetch(`${CHROMA_URL}/api/v1/heartbeat`);
    if (!heartbeat.ok) throw new Error(`Status ${heartbeat.status}`);
  } catch (error) {
    console.error(`Cannot reach ChromaDB at ${CHROMA_URL}. Is it running?`);
    console.error('Run: docker compose up chromadb');
    process.exit(1);
  }

  // Create collections for each module that uses vector storage
  await createCollection('episodic-memory', { module: 'franken-brain' });
  await createCollection('project-adrs', { module: 'franken-brain' });
  await createCollection('known-errors', { module: 'franken-brain' });
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
