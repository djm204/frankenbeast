import { describe, it, expect } from 'vitest';
import { normalizePath, type ServerEnvironment } from './path-utils';

const linuxEnv: ServerEnvironment = { os: 'linux', platform: 'linux', isWsl: false, pathSeparator: '/' };
const wslEnv: ServerEnvironment = { os: 'linux', platform: 'linux', isWsl: true, pathSeparator: '/' };

describe('normalizePath', () => {
  it('passes through valid linux paths on linux', () => {
    expect(normalizePath('/home/user/file.txt', linuxEnv)).toEqual({
      normalized: '/home/user/file.txt', valid: true,
    });
  });

  it('converts Windows paths on WSL', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt', wslEnv)).toEqual({
      normalized: '/mnt/c/Users/test/file.txt', valid: true,
    });
  });

  it('rejects backslash paths on linux (non-WSL)', () => {
    const result = normalizePath('C:\\Users\\test', linuxEnv);
    expect(result.valid).toBe(false);
  });
});
