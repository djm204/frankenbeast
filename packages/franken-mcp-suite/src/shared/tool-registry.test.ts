import { describe, it, expect } from 'vitest';
import { TOOL_STUBS, TOOL_REGISTRY, searchTools } from './tool-registry.js';

const EXPECTED_COUNT = 20;

describe('TOOL_STUBS', () => {
  it('contains exactly 20 tools', () => {
    expect(TOOL_STUBS).toHaveLength(EXPECTED_COUNT);
  });

  it('all stub descriptions are ≤ 15 words', () => {
    for (const stub of TOOL_STUBS) {
      const wordCount = stub.description.trim().split(/\s+/).length;
      expect(wordCount, `${stub.name} description has ${wordCount} words`).toBeLessThanOrEqual(15);
    }
  });
});

describe('TOOL_REGISTRY', () => {
  it('contains exactly 20 tools', () => {
    expect(TOOL_REGISTRY.size).toBe(EXPECTED_COUNT);
  });

  it('all tools have an inputSchema object', () => {
    for (const [name, tool] of TOOL_REGISTRY) {
      expect(tool.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(typeof tool.inputSchema, `${name} inputSchema is not an object`).toBe('object');
    }
  });

  it('all tools have a makeHandler function', () => {
    for (const [name, tool] of TOOL_REGISTRY) {
      expect(typeof tool.makeHandler, `${name} makeHandler is not a function`).toBe('function');
    }
  });

  it('TOOL_STUBS and TOOL_REGISTRY contain the same 20 tool names', () => {
    const stubNames = new Set(TOOL_STUBS.map((s) => s.name));
    const registryNames = new Set(TOOL_REGISTRY.keys());
    expect(stubNames).toEqual(registryNames);
    expect(stubNames.size).toBe(EXPECTED_COUNT);
  });
});

describe('searchTools', () => {
  it('returns all 20 tools when called with no query', () => {
    expect(searchTools()).toHaveLength(EXPECTED_COUNT);
    expect(searchTools(undefined)).toHaveLength(EXPECTED_COUNT);
  });

  it('returns exactly 4 tools for query "memory"', () => {
    const results = searchTools('memory');
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.server).toBe('memory');
    }
  });

  it('returns exactly 3 tools for query "plan"', () => {
    const results = searchTools('plan');
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.server).toBe('planner');
    }
  });
});
