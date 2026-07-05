import { describe, expect, it } from 'vitest';
import { assertNoBundledOperatorTokenEnv } from '../vite-env';

describe('assertNoBundledOperatorTokenEnv', () => {
  it('allows non-browser operator token env because it is not VITE-prefixed', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'server-side-token',
    })).not.toThrow();
  });

  it('rejects VITE_BEAST_OPERATOR_TOKEN because Vite bundles VITE-prefixed env', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      VITE_BEAST_OPERATOR_TOKEN: 'browser-token',
    })).toThrow(/VITE_\* variables are bundled into browser code/);
  });

  it('ignores empty VITE_BEAST_OPERATOR_TOKEN values', () => {
    expect(() => assertNoBundledOperatorTokenEnv({
      VITE_BEAST_OPERATOR_TOKEN: '   ',
    })).not.toThrow();
  });
});
