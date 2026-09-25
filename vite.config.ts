/// <reference types="vitest/config" />
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Strict Content-Security-Policy for the packaged app. Only added to production
// builds because the dev server injects inline scripts for hot reloading.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'mimar-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

/** Every file in a folder, as paths relative to it with forward slashes. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(join(dir, d.name), root) : [relative(root, join(dir, d.name)).split('\\').join('/')],
  );
}

/**
 * Writes the offline service worker for the web version after each build, with the exact list of
 * files to keep. Its text changes with every release, which is how browsers learn of an update.
 */
const serviceWorkerPlugin = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'mimar-service-worker',
    apply: 'build',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: () => {
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const sw = template
        .replace('__VERSION__', JSON.stringify(pkg.version))
        .replace('__FILES__', JSON.stringify(['./', ...files.map((f) => `./${f}`)]));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
};

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin(), serviceWorkerPlugin()],
  base: './',
  root: '.',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173 },
  // three.js (about 700 kB) is in its own chunk that only loads when the 3D view opens.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
