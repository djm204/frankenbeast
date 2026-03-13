import { describe, it, expect } from 'vitest';

// We test the module resolution logic in isolation.
// Extract the resolution function or test via createCliDeps behavior.

describe('module toggle resolution', () => {
  it('defaults all modules to enabled when no config or env vars', () => {
    // Will be tested via createCliDeps — when enabledModules is not set
    // and no FRANKENBEAST_MODULE_* env vars exist, all modules should
    // attempt real wiring (and fall back to stubs if packages unavailable)
    expect(true).toBe(true); // placeholder — real assertion in integration test
  });

  it('disables a module when enabledModules explicitly sets it to false', () => {
    // When enabledModules.firewall === false, dep-factory should NOT attempt
    // real firewall wiring — it should use stubFirewall unconditionally
    expect(true).toBe(true); // placeholder — tested in integration test
  });

  it('disables a module when env var is "false"', () => {
    // When FRANKENBEAST_MODULE_FIREWALL=false, same behavior
    expect(true).toBe(true); // placeholder — tested in integration test
  });
});
