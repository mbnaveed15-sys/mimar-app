import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * The MIMAR connector for AI agents (src/mcp): one self-contained file for Node, with the app's own
 * code inside it, so the installed app can run it with nothing else beside it.
 */
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'src/mcp/server.ts',
    outDir: 'dist-mcp',
    target: 'node20',
    rolldownOptions: { output: { entryFileNames: 'mimar-mcp.mjs', codeSplitting: false } },
  },
});
