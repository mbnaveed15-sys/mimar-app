/**
 * The MIMAR connector: a Model Context Protocol server on stdin/stdout, so AI agents (Claude Desktop,
 * Claude Code, any MCP client) can read, check, edit and export `.mimar` plans on this computer.
 * Built to `dist-mcp/mimar-mcp.mjs`; the installed app runs it with ELECTRON_RUN_AS_NODE=1, so no
 * separate Node.js is needed. Messages are one JSON-RPC object per line; nothing else goes to stdout.
 */
import { createInterface } from 'node:readline';
import { handle } from './protocol';

const out = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);

// Anything the app's code logs goes to stderr, never into the protocol's stream.
console.log = console.info = console.warn = console.debug = (...a: unknown[]) => console.error(...a);

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const reply = handle(line);
  if (reply) out(reply);
});
