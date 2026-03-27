export interface DashboardCommandDeps {
  startServer: () => Promise<{ url: string }>;
  print(message: string): void;
}

export async function handleDashboardCommand(deps: DashboardCommandDeps): Promise<void> {
  const { startServer, print } = deps;
  print('Starting dashboard...');
  const { url } = await startServer();
  print(`Dashboard available at ${url}`);
}
