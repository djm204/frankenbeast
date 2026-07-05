export type ViteEnv = Record<string, string | undefined>;

export function assertNoBundledOperatorTokenEnv(env: ViteEnv): void {
  const token = env.VITE_BEAST_OPERATOR_TOKEN?.trim();
  if (!token) return;

  throw new Error(
    'Refusing to start franken-web with VITE_BEAST_OPERATOR_TOKEN set: '
    + 'VITE_* variables are bundled into browser code. Keep operator credentials '
    + 'server-side and proxy authenticated Beast control requests instead.',
  );
}
