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

export function shouldAttachOperatorAuth(headers: Record<string, string | string[] | undefined>): boolean {
  const secFetchSite = Array.isArray(headers['sec-fetch-site'])
    ? headers['sec-fetch-site'][0]
    : headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') return false;

  const origin = Array.isArray(headers.origin) ? headers.origin[0] : headers.origin;
  if (!origin) return true;

  const host = Array.isArray(headers.host) ? headers.host[0] : headers.host;
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
