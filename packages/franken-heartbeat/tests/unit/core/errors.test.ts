import { describe, it, expect } from 'vitest';
import {
  HeartbeatError,
  ChecklistParseError,
  ReflectionError,
} from '../../../src/core/errors.js';

describe('HeartbeatError', () => {
  it('is an instance of Error', () => {
    const error = new HeartbeatError('test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HeartbeatError);
  });

  it('preserves the message', () => {
    const error = new HeartbeatError('something broke');
    expect(error.message).toBe('something broke');
  });

  it('has the correct name', () => {
    const error = new HeartbeatError('test');
    expect(error.name).toBe('HeartbeatError');
  });
});

describe('ChecklistParseError', () => {
  it('is an instance of HeartbeatError', () => {
    const error = new ChecklistParseError('bad format', './HEARTBEAT.md');
    expect(error).toBeInstanceOf(HeartbeatError);
    expect(error).toBeInstanceOf(ChecklistParseError);
  });

  it('carries the source file path', () => {
    const error = new ChecklistParseError('bad format', './HEARTBEAT.md');
    expect(error.filePath).toBe('./HEARTBEAT.md');
  });

  it('has the correct name', () => {
    const error = new ChecklistParseError('bad format', './path');
    expect(error.name).toBe('ChecklistParseError');
  });
});

describe('ReflectionError', () => {
  it('is an instance of HeartbeatError', () => {
    const cause = new Error('LLM timeout');
    const error = new ReflectionError('reflection failed', cause);
    expect(error).toBeInstanceOf(HeartbeatError);
    expect(error).toBeInstanceOf(ReflectionError);
  });

  it('carries the original cause', () => {
    const cause = new Error('LLM timeout');
    const error = new ReflectionError('reflection failed', cause);
    expect(error.cause).toBe(cause);
  });

  it('has the correct name', () => {
    const cause = new Error('LLM timeout');
    const error = new ReflectionError('reflection failed', cause);
    expect(error.name).toBe('ReflectionError');
  });
});
