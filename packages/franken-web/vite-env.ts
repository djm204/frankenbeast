export type ViteEnv = Record<string, string | undefined>;
export type EnvLoader = (mode: string, dir: string, prefix: string) => ViteEnv;

export function assertNoBundledOperatorTokenEnv(env: ViteEnv): void {
  const token = env.VITE_BEAST_OPERATOR_TOKEN?.trim();
  if (!token) return;

  throw new Error(
    'Refusing to start franken-web with VITE_BEAST_OPERATOR_TOKEN set: '
    + 'VITE_* variables are bundled into browser code. Keep operator credentials '
    + 'server-side and proxy authenticated Beast control requests instead.',
  );
}

export function loadServerSideOperatorToken(
  load: EnvLoader,
  mode: string,
  rootDir: string,
  packageDir: string,
): string {
  const rootEnv = load(mode, rootDir, '');
  const packageEnv = load(mode, packageDir, '');
  return packageEnv.FRANKENBEAST_BEAST_OPERATOR_TOKEN?.trim()
    || rootEnv.FRANKENBEAST_BEAST_OPERATOR_TOKEN?.trim()
    || '';
}
