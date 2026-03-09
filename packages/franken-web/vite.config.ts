import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __FRANKENBEAST_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  build: {
    outDir: 'dist',
  },
});
