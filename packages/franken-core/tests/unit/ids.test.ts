import { describe, it, expect } from 'vitest';
import {
  createTaskId,
  createProjectId,
  createSessionId,
  createRequestId,
  createSpanId,
  createTraceId,
} from '../../src/ids.js';
import type { TaskId, ProjectId, SessionId } from '../../src/ids.js';

describe('Branded ID factories', () => {
  it('createTaskId returns a string at runtime', () => {
    const id = createTaskId('task-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('task-001');
  });

  it('createProjectId returns a string at runtime', () => {
    const id = createProjectId('proj-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('proj-001');
  });

  it('createSessionId returns a string at runtime', () => {
    const id = createSessionId('sess-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('sess-001');
  });

  it('createRequestId returns a string at runtime', () => {
    const id = createRequestId('req-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('req-001');
  });

  it('createSpanId returns a string at runtime', () => {
    const id = createSpanId('span-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('span-001');
  });

  it('createTraceId returns a string at runtime', () => {
    const id = createTraceId('trace-001');
    expect(typeof id).toBe('string');
    expect(id).toBe('trace-001');
  });

  it('branded IDs are assignable to string', () => {
    const taskId: TaskId = createTaskId('task-001');
    const str: string = taskId; // branded types are subtypes of string
    expect(str).toBe('task-001');
  });

  it('different ID types are distinct at compile-time', () => {
    // This test documents the compile-time constraint.
    // At runtime, all IDs are just strings.
    const taskId = createTaskId('id-001');
    const projectId = createProjectId('id-001');
    // Same runtime value, but TypeScript won't let you assign one to the other
    expect(taskId).toBe(projectId as unknown as string);
  });
});
