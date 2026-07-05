import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { AppErrorBoundary } from './components/app-error-boundary';
import './styles/tailwind.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary version={__FRANKENBEAST_VERSION__}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
