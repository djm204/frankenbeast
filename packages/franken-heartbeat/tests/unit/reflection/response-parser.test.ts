import { describe, it, expect } from 'vitest';
import { parseReflectionResponse } from '../../../src/reflection/response-parser.js';

describe('parseReflectionResponse', () => {
  it('parses a valid JSON response into ReflectionResult', () => {
    const json = JSON.stringify({
      patterns: ['repeated mock failures'],
      improvements: [{ target: 'skills', description: 'add API error handler', priority: 'high' }],
      techDebt: [{ location: '/src/services', description: 'TODO comments', effort: 'small' }],
    });

    const result = parseReflectionResponse(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.patterns).toHaveLength(1);
      expect(result.value.improvements).toHaveLength(1);
      expect(result.value.techDebt).toHaveLength(1);
    }
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseReflectionResponse('not valid json {{{');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('parse');
    }
  });

  it('handles JSON that does not match schema', () => {
    const result = parseReflectionResponse(JSON.stringify({ wrong: 'shape' }));
    expect(result.ok).toBe(false);
  });

  it('extracts JSON from markdown code block', () => {
    const response = '```json\n{"patterns":["test"],"improvements":[],"techDebt":[]}\n```';
    const result = parseReflectionResponse(response);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.patterns).toEqual(['test']);
    }
  });
});
