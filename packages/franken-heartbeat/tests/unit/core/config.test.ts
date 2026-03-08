import { describe, it, expect } from 'vitest';
import { HeartbeatConfigSchema, type HeartbeatConfig } from '../../../src/core/config.js';

describe('HeartbeatConfig', () => {
  const validConfig = {
    deepReviewHour: 2,
    tokenSpendAlertThreshold: 5.0,
    heartbeatFilePath: './HEARTBEAT.md',
    maxReflectionTokens: 4096,
  };

  it('validates a complete config', () => {
    const result = HeartbeatConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deepReviewHour).toBe(2);
    }
  });

  it('applies default values', () => {
    const result = HeartbeatConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deepReviewHour).toBe(2);
      expect(result.data.tokenSpendAlertThreshold).toBe(5.0);
      expect(result.data.heartbeatFilePath).toBe('./HEARTBEAT.md');
      expect(result.data.maxReflectionTokens).toBe(4096);
    }
  });

  it('rejects deepReviewHour outside 0-23', () => {
    const tooHigh = HeartbeatConfigSchema.safeParse({ ...validConfig, deepReviewHour: 24 });
    expect(tooHigh.success).toBe(false);

    const negative = HeartbeatConfigSchema.safeParse({ ...validConfig, deepReviewHour: -1 });
    expect(negative.success).toBe(false);
  });

  it('rejects negative token threshold', () => {
    const result = HeartbeatConfigSchema.safeParse({
      ...validConfig,
      tokenSpendAlertThreshold: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative maxReflectionTokens', () => {
    const result = HeartbeatConfigSchema.safeParse({
      ...validConfig,
      maxReflectionTokens: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty heartbeatFilePath', () => {
    const result = HeartbeatConfigSchema.safeParse({
      ...validConfig,
      heartbeatFilePath: '',
    });
    expect(result.success).toBe(false);
  });
});
