import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
  version: string;
};

type CopyStatus = 'idle' | 'copied' | 'manual' | 'failed';

type AppErrorBoundaryState = {
  hasError: boolean;
  error: unknown;
  errorInfo: ErrorInfo | null;
  copyStatus: CopyStatus;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copyStatus: 'idle',
  };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  private getErrorMessage(): string {
    const { error } = this.state;

    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    return 'Unknown app-shell error';
  }

  private safelySerializeThrownValue(value: unknown): unknown {
    if (value instanceof Error) {
      return undefined;
    }

    if (value === undefined) {
      return null;
    }

    const seen = new WeakSet<object>();

    try {
      const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
        if (typeof nestedValue === 'bigint') {
          return `${nestedValue.toString()}n`;
        }

        if (typeof nestedValue === 'symbol' || typeof nestedValue === 'function') {
          return String(nestedValue);
        }

        if (nestedValue && typeof nestedValue === 'object') {
          if (seen.has(nestedValue)) {
            return '[Circular]';
          }

          seen.add(nestedValue);
        }

        return nestedValue;
      });

      return serialized === undefined ? String(value) : JSON.parse(serialized);
    } catch {
      try {
        return String(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
  }

  private buildDiagnostics(): string {
    const { error, errorInfo } = this.state;
    return JSON.stringify(
      {
        message: this.getErrorMessage(),
        stack: error instanceof Error ? error.stack ?? null : null,
        thrownValue: this.safelySerializeThrownValue(error),
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

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      this.setState({ copyStatus: 'manual' });
      return;
    }

    try {
      await navigator.clipboard.writeText(diagnostics);
      this.setState({ copyStatus: 'copied' });
    } catch {
      this.setState({ copyStatus: 'failed' });
    }
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, copyStatus } = this.state;
    const errorMessage = this.getErrorMessage();

    if (!hasError) {
      return this.props.children;
    }

    return (
      <div className="dashboard-shell app-shell-error" role="alert" aria-live="assertive">
        <aside className="sidebar app-shell-error__sidebar sidebar--open" aria-label="Frankenbeast recovery shell">
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
                <dd>{errorMessage}</dd>
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
                {copyStatus === 'copied'
                  ? 'Diagnostics copied'
                  : copyStatus === 'manual'
                    ? 'Copy manually below'
                    : copyStatus === 'failed'
                      ? 'Copy failed — view below'
                      : 'Copy diagnostics'}
              </button>
              <a className="secondary-action" href="https://github.com/djm204/frankenbeast/issues" target="_blank" rel="noreferrer">
                Open support issues
              </a>
            </div>

            <details className="app-shell-error__diagnostics" open={copyStatus === 'manual' || copyStatus === 'failed'}>
              <summary>View diagnostics</summary>
              <pre>{this.buildDiagnostics()}</pre>
            </details>
          </section>
        </main>
      </div>
    );
  }
}
