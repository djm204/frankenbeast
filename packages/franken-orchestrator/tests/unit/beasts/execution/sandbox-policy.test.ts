import { statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BEAST_ENV_ALLOWLIST,
  nonRootUserForWorkspace,
} from '../../../../src/beasts/execution/sandbox-policy.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: vi.fn(),
  };
});

const mockedStatSync = vi.mocked(statSync);

describe('nonRootUserForWorkspace', () => {
  beforeEach(() => {
    mockedStatSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockedStatSync.mockReset();
  });

  it('uses the current non-root process uid and gid without inspecting the workspace', () => {
    vi.spyOn(process, 'getuid').mockReturnValue(1234);
    vi.spyOn(process, 'getgid').mockReturnValue(1235);

    expect(nonRootUserForWorkspace('/workspace')).toBe('1234:1235');
    expect(mockedStatSync).not.toHaveBeenCalled();
  });

  it('uses workspace ownership when the current process is root', () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    vi.spyOn(process, 'getgid').mockReturnValue(0);
    mockedStatSync.mockReturnValue({ uid: 4242, gid: 4243 } as ReturnType<typeof statSync>);

    expect(nonRootUserForWorkspace('/owned-workspace')).toBe('4242:4243');
    expect(mockedStatSync).toHaveBeenCalledWith('/owned-workspace');
  });

  it('falls back to the image non-root user when root cannot inspect a non-root workspace owner', () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    vi.spyOn(process, 'getgid').mockReturnValue(0);
    mockedStatSync.mockImplementation(() => {
      throw new Error('missing workspace');
    });

    expect(nonRootUserForWorkspace('/missing-workspace')).toBe('10001:10001');
  });

  it('falls back when the workspace itself is owned by root', () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    vi.spyOn(process, 'getgid').mockReturnValue(0);
    mockedStatSync.mockReturnValue({ uid: 0, gid: 0 } as ReturnType<typeof statSync>);

    expect(nonRootUserForWorkspace('/root-owned-workspace')).toBe('10001:10001');
  });
});

describe('DEFAULT_BEAST_ENV_ALLOWLIST', () => {
  it('preserves the runtime config integrity bypass for sandboxed spawned CLIs', () => {
    expect(DEFAULT_BEAST_ENV_ALLOWLIST).toContain('FRANKENBEAST_RUN_CONFIG_INTEGRITY_BYPASS');
  });
});
