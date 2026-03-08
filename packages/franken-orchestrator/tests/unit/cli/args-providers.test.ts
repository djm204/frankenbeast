import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../src/cli/args.js';

describe('parseArgs --provider as string', () => {
  it('accepts any string provider value', () => {
    const args = parseArgs(['--provider', 'gemini']);
    expect(args.provider).toBe('gemini');
  });

  it('normalizes provider to lowercase', () => {
    const args = parseArgs(['--provider', 'CLAUDE']);
    expect(args.provider).toBe('claude');
  });

  it('normalizes mixed-case provider to lowercase', () => {
    const args = parseArgs(['--provider', 'Aider']);
    expect(args.provider).toBe('aider');
  });

  it('defaults provider to claude when not specified', () => {
    const args = parseArgs([]);
    expect(args.provider).toBe('claude');
  });

  it('still accepts codex as provider', () => {
    const args = parseArgs(['--provider', 'codex']);
    expect(args.provider).toBe('codex');
  });
});

describe('parseArgs --providers flag', () => {
  it('parses comma-separated providers into array', () => {
    const args = parseArgs(['--providers', 'claude,gemini,aider']);
    expect(args.providers).toEqual(['claude', 'gemini', 'aider']);
  });

  it('returns undefined when --providers not specified', () => {
    const args = parseArgs([]);
    expect(args.providers).toBeUndefined();
  });

  it('parses single provider into single-element array', () => {
    const args = parseArgs(['--providers', 'claude']);
    expect(args.providers).toEqual(['claude']);
  });

  it('trims whitespace around provider names', () => {
    const args = parseArgs(['--providers', 'claude , gemini , aider']);
    expect(args.providers).toEqual(['claude', 'gemini', 'aider']);
  });

  it('normalizes providers to lowercase', () => {
    const args = parseArgs(['--providers', 'Claude,GEMINI,Aider']);
    expect(args.providers).toEqual(['claude', 'gemini', 'aider']);
  });

  it('works alongside --provider flag', () => {
    const args = parseArgs(['--provider', 'gemini', '--providers', 'claude,gemini']);
    expect(args.provider).toBe('gemini');
    expect(args.providers).toEqual(['claude', 'gemini']);
  });
});
