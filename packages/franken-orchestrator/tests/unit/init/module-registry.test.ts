import { describe, expect, it } from 'vitest';
import { listInitModules } from '../../../src/init/module-registry.js';

describe('init module registry', () => {
  it('includes the supported v1 modules', () => {
    expect(listInitModules().map((module) => module.id)).toEqual(['chat', 'dashboard', 'comms']);
  });
});
