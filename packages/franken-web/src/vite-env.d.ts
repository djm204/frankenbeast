/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: '' | boolean | undefined;
  }
}

declare global {
  const __FRANKENBEAST_VERSION__: string;
}
