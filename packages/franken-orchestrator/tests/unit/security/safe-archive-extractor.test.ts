import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SAFE_ARCHIVE_LIMITS,
  SafeArchiveExtractionError,
  extractZipArchive,
} from '../../../src/security/safe-archive-extractor.js';

const tempDirs: string[] = [];
const CRC32_TABLE = makeCrc32Table();

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'franken-safe-archive-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface ZipEntryFixture {
  readonly name: string;
  readonly body: Buffer;
  readonly method?: 0 | 8;
}

function createZip(entries: readonly ZipEntryFixture[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 8;
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = method === 8 ? deflateRawSync(entry.body) : entry.body;
    const entryCrc32 = crc32(entry.body);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(entryCrc32, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(entryCrc32, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

describe('safe archive extraction', () => {
  it('extracts a small zip inside the destination', async () => {
    const destination = await tempDir();
    const archive = createZip([
      { name: 'nested/', body: Buffer.alloc(0), method: 0 },
      { name: 'nested/readme.txt', body: Buffer.from('hello') },
    ]);

    const result = await extractZipArchive(archive, destination);

    await expect(readFile(join(destination, 'nested/readme.txt'), 'utf8')).resolves.toBe('hello');
    expect(result.files).toEqual([{ path: 'nested/readme.txt', compressedBytes: expect.any(Number), uncompressedBytes: 5 }]);
  });

  it('extracts empty deflated files without relaxing output bounds', async () => {
    const destination = await tempDir();

    const result = await extractZipArchive(createZip([{ name: 'empty.txt', body: Buffer.alloc(0), method: 8 }]), destination, {
      maxFileBytes: 0,
    });

    await expect(readFile(join(destination, 'empty.txt'))).resolves.toHaveLength(0);
    expect(result.files).toEqual([{ path: 'empty.txt', compressedBytes: expect.any(Number), uncompressedBytes: 0 }]);
  });

  it('rejects archives that exceed the compressed byte limit before writing', async () => {
    const destination = await tempDir();
    const archive = createZip([{ name: 'safe.txt', body: Buffer.from('content'), method: 0 }]);

    await expect(extractZipArchive(archive, destination, { maxArchiveBytes: 1 })).rejects.toThrow(
      SafeArchiveExtractionError,
    );
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('rejects zip bombs, per-file overflows, and path-count exhaustion before writing', async () => {
    const zipBomb = createZip([{ name: 'bomb.txt', body: Buffer.alloc(1024, 'a') }]);
    const tooManyFiles = createZip([
      { name: 'one.txt', body: Buffer.from('1') },
      { name: 'two.txt', body: Buffer.from('2') },
    ]);
    const perFileOverflow = createZip([{ name: 'large.txt', body: Buffer.from('large') }]);

    const bombDestination = await tempDir();
    await expect(extractZipArchive(zipBomb, bombDestination, { maxTotalUncompressedBytes: 32 })).rejects.toThrow(
      /uncompressed/i,
    );
    await expect(readdir(bombDestination)).resolves.toEqual([]);

    const countDestination = await tempDir();
    await expect(extractZipArchive(tooManyFiles, countDestination, { maxFileCount: 1 })).rejects.toThrow(/file count/i);
    await expect(readdir(countDestination)).resolves.toEqual([]);

    const perFileDestination = await tempDir();
    await expect(extractZipArchive(perFileOverflow, perFileDestination, { maxFileBytes: 4 })).rejects.toThrow(
      /per-file/i,
    );
    await expect(readdir(perFileDestination)).resolves.toEqual([]);
  });

  it('rejects nested archives and path traversal entries before writing', async () => {
    const traversalArchive = createZip([{ name: '../outside.txt', body: Buffer.from('owned') }]);

    for (const archiveName of ['nested.zip', 'lib.jar', 'plugin.war', 'android.apk', 'package.whl', 'bundle.7z']) {
      const nestedDestination = await tempDir();
      await expect(
        extractZipArchive(createZip([{ name: archiveName, body: Buffer.from('x') }]), nestedDestination, {
          maxNestingDepth: 0,
        }),
      ).rejects.toThrow(/nested archive/i);
      await expect(readdir(nestedDestination)).resolves.toEqual([]);
    }

    const traversalDestination = await tempDir();
    await expect(extractZipArchive(traversalArchive, traversalDestination)).rejects.toThrow(/path traversal/i);
    await expect(stat(join(traversalDestination, '..', 'outside.txt'))).rejects.toThrow();
  });

  it('rejects symlinked destination components before writing outside the extraction root', async () => {
    const destination = await tempDir();
    const outside = await tempDir();
    await symlink(outside, join(destination, 'link'));

    await expect(
      extractZipArchive(createZip([{ name: 'link/file.txt', body: Buffer.from('owned') }]), destination),
    ).rejects.toThrow(/symlink/i);
    await expect(stat(join(outside, 'file.txt'))).rejects.toThrow();
  });

  it('rejects Windows-special path segments before writing', async () => {
    for (const name of ['docs/victim.txt:payload', 'docs/NUL', 'docs/COM¹', 'docs/name. ', 'docs/trailing.']) {
      const destination = await tempDir();
      await expect(extractZipArchive(createZip([{ name, body: Buffer.from('x') }]), destination)).rejects.toThrow(
        /Windows-special/i,
      );
      await expect(readdir(destination)).resolves.toEqual([]);
    }
  });

  it('rejects colliding normalized paths before partial writes', async () => {
    const duplicateDestination = await tempDir();
    await expect(
      extractZipArchive(
        createZip([
          { name: 'duplicate.txt', body: Buffer.from('first') },
          { name: 'duplicate.txt', body: Buffer.from('second') },
        ]),
        duplicateDestination,
      ),
    ).rejects.toThrow(/collision/i);
    await expect(readdir(duplicateDestination)).resolves.toEqual([]);

    const prefixDestination = await tempDir();
    await expect(
      extractZipArchive(
        createZip([
          { name: 'a', body: Buffer.from('file') },
          { name: 'a/b', body: Buffer.from('child') },
        ]),
        prefixDestination,
      ),
    ).rejects.toThrow(/collision/i);
    await expect(readdir(prefixDestination)).resolves.toEqual([]);

    const caseInsensitiveDestination = await tempDir();
    await expect(
      extractZipArchive(
        createZip([
          { name: 'Readme.txt', body: Buffer.from('first') },
          { name: 'README.txt', body: Buffer.from('second') },
        ]),
        caseInsensitiveDestination,
      ),
    ).rejects.toThrow(/collision/i);
    await expect(readdir(caseInsensitiveDestination)).resolves.toEqual([]);
  });

  it('rejects symlinked destination ancestors before creating the extraction root', async () => {
    const parent = await tempDir();
    const outside = await tempDir();
    await mkdir(join(parent, 'staging'));
    await symlink(outside, join(parent, 'staging', 'link'));

    await expect(
      extractZipArchive(createZip([{ name: 'safe.txt', body: Buffer.from('owned') }]), join(parent, 'staging', 'link', 'run')),
    ).rejects.toThrow(/symlink/i);
    await expect(stat(join(outside, 'run', 'safe.txt'))).rejects.toThrow();
  });

  it('rejects excessive path component counts before collision checks', async () => {
    const destination = await tempDir();
    const longPath = `${Array.from({ length: 257 }, (_, index) => `p${index}`).join('/')}/file.txt`;

    await expect(extractZipArchive(createZip([{ name: longPath, body: Buffer.from('x') }]), destination)).rejects.toThrow(
      /segments/i,
    );
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('wraps corrupt deflate payloads as safe archive errors', async () => {
    const destination = await tempDir();
    const originalPayload = Buffer.from('valid deflate data');
    const archive = Buffer.from(createZip([{ name: 'bad.txt', body: originalPayload }]));
    const corruptIndex = archive.indexOf(deflateRawSync(originalPayload));
    expect(corruptIndex).toBeGreaterThanOrEqual(0);
    archive[corruptIndex] = 0xff;

    await expect(extractZipArchive(archive, destination)).rejects.toThrow(SafeArchiveExtractionError);
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('rejects entries whose payload does not match the central directory CRC', async () => {
    const destination = await tempDir();
    const archive = Buffer.from(createZip([{ name: 'stored.txt', body: Buffer.from('abc'), method: 0 }]));
    const payloadOffset = archive.indexOf(Buffer.from('abc'));
    expect(payloadOffset).toBeGreaterThanOrEqual(0);
    archive[payloadOffset] = 'z'.charCodeAt(0);

    await expect(extractZipArchive(archive, destination)).rejects.toThrow(/CRC/i);
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('validates all payloads before writing any files', async () => {
    const destination = await tempDir();
    const archive = Buffer.from(
      createZip([
        { name: 'valid-first.txt', body: Buffer.from('safe') },
        { name: 'corrupt-second.txt', body: Buffer.from('bad') },
      ]),
    );
    const corruptIndex = archive.indexOf(deflateRawSync(Buffer.from('bad')));
    expect(corruptIndex).toBeGreaterThanOrEqual(0);
    archive[corruptIndex] = 0xff;

    await expect(extractZipArchive(archive, destination)).rejects.toThrow(SafeArchiveExtractionError);
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('documents conservative default limits for consumers and operators', () => {
    expect(DEFAULT_SAFE_ARCHIVE_LIMITS).toMatchObject({
      maxArchiveBytes: 50 * 1024 * 1024,
      maxTotalUncompressedBytes: 250 * 1024 * 1024,
      maxFileBytes: 25 * 1024 * 1024,
      maxFileCount: 10_000,
      maxNestingDepth: 0,
    });
  });
});
