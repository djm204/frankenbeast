import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
  version: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  private buildDiagnostics(): string {
    const { error, errorInfo } = this.state;
    return JSON.stringify(
      {
        message: error?.message ?? 'Unknown app-shell error',
        stack: error?.stack ?? null,
        componentStack: errorInfo?.componentStack ?? null,
        version: this.props.version,
        location: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  private copyDiagnostics = async () => {
    const diagnostics = this.buildDiagnostics();

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(diagnostics);
      this.setState({ copied: true });
      return;
    }

    this.setState({ copied: true });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    const { error, copied } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="dashboard-shell app-shell-error" role="alert" aria-live="assertive">
        <aside className="sidebar app-shell-error__sidebar" aria-label="Frankenbeast recovery shell">
          <div className="sidebar__brand">
            <span className="eyebrow">Frankenbeast dashboard</span>
            <h1>Control plane recovery</h1>
            <p className="sidebar__tagline">
              The app shell stayed online after a dashboard render failure.
            </p>
          </div>
          <div className="sidebar__footer">
            <span className="version-chip">v{this.props.version}</span>
            <span>Safe mode</span>
          </div>
        </aside>

        <main className="app-shell-error__main">
          <section className="app-shell-error__panel" aria-labelledby="app-shell-error-title">
            <p className="eyebrow">Recoverable app-shell error</p>
            <h2 id="app-shell-error-title">The dashboard hit a rendering problem.</h2>
            <p>
              Reload the app to try again, or copy diagnostics and include them with the browser console
              logs when asking for support. The page is not blank, so operators can recover without
              guessing whether Frankenbeast is still running.
            </p>

            <dl className="app-shell-error__details">
              <div>
                <dt>Error</dt>
                <dd>{error.message || 'Unknown error'}</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>v{this.props.version}</dd>
              </div>
            </dl>

            <div className="app-shell-error__actions">
              <button type="button" className="primary-action" onClick={this.reload}>
                Reload dashboard
              </button>
              <button type="button" className="secondary-action" onClick={this.copyDiagnostics}>
                {copied ? 'Diagnostics copied' : 'Copy diagnostics'}
              </button>
              <a className="secondary-action" href="https://github.com/djm204/frankenbeast/issues" target="_blank" rel="noreferrer">
                Open support issues
              </a>
            </div>

            <details className="app-shell-error__diagnostics">
              <summary>View diagnostics</summary>
              <pre>{this.buildDiagnostics()}</pre>
            </details>
          </section>
        </main>
      </div>
    );
  }
}
