import { describe, it, expect } from 'vitest';
import { normalizePath, type ServerEnvironment } from './path-utils';

const linuxEnv: ServerEnvironment = { os: 'linux', platform: 'linux', isWsl: false, pathSeparator: '/' };
const wslEnv: ServerEnvironment = { os: 'linux', platform: 'linux', isWsl: true, pathSeparator: '/' };
const windowsEnv: ServerEnvironment = { os: 'win32', platform: 'win32', isWsl: false, pathSeparator: '\\' };

describe('normalizePath', () => {
  it('passes through valid linux paths on linux', () => {
    expect(normalizePath('/home/user/file.txt', linuxEnv)).toEqual({
      normalized: '/home/user/file.txt', valid: true,
    });
  });

  it('normalizes duplicate separators and dot segments without allowing traversal', () => {
    expect(normalizePath('/home//user/./file.txt', linuxEnv)).toEqual({
      normalized: '/home/user/file.txt', valid: true,
    });
    expect(normalizePath('.', linuxEnv)).toEqual({ normalized: '.', valid: true });
    expect(normalizePath('./', linuxEnv)).toEqual({ normalized: '.', valid: true });
  });

  it('converts Windows paths on WSL', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt', wslEnv)).toEqual({
      normalized: '/mnt/c/Users/test/file.txt', valid: true,
    });
  });

  it('preserves UNC roots when normalizing Windows server paths', () => {
    expect(normalizePath('\\\\server\\share\\chunks', windowsEnv)).toEqual({
      normalized: '//server/share/chunks', valid: true,
    });
  });

  it('rejects backslash paths on linux (non-WSL)', () => {
    const result = normalizePath('C:\\Users\\test', linuxEnv);
    expect(result.valid).toBe(false);
  });

  it('rejects parent traversal segments by default without echoing the unsafe path', () => {
    const result = normalizePath('/home/user/../secret.txt', linuxEnv);

    expect(result).toEqual({
      normalized: '',
      valid: false,
      error: 'Path traversal is not allowed. Use allowParentTraversal only for trusted operator-supplied paths.',
    });
    expect(result.error).not.toContain('secret.txt');
  });

  it('rejects traversal after WSL path conversion', () => {
    const result = normalizePath('C:\\Users\\test\\..\\secret.txt', wslEnv);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Path traversal is not allowed/);
  });

  it('allows explicit trusted operator override for parent traversal segments', () => {
    expect(normalizePath('../trusted/./file.txt', linuxEnv, { allowParentTraversal: true })).toEqual({
      normalized: '../trusted/file.txt',
      valid: true,
    });
  });

  it('rejects NUL bytes in paths', () => {
    expect(normalizePath('/home/user/\0secret.txt', linuxEnv)).toEqual({
      normalized: '',
      valid: false,
      error: 'Path contains a NUL byte',
    });
  });
});
