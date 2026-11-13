/** The few Model Context Protocol messages the MIMAR connector answers (JSON-RPC 2.0). Pure. */
import { TOOLS, ToolError } from './tools';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Works on MIMAR house and building plans (.mimar files) on this computer. Start with mimar_describe_plan, ' +
  'or mimar_new_plan for a new one. Points and lengths in tool arguments are millimetres (1 ft = 304.8 mm); ' +
  'raw item JSON from mimar_get_items is in plan units of 10 mm. If the plan is open in MIMAR, reopen it there ' +
  'to see changes made here.';

type Id = string | number | null;
interface Request {
  jsonrpc?: string;
  id?: Id;
  method?: string;
  params?: Record<string, unknown>;
}

const ok = (id: Id, result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** The answer to one line from the client, or null for a notification. */
export function handle(line: string): unknown {
  let req: Request;
  try {
    req = JSON.parse(line) as Request;
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  if (!req || typeof req !== 'object' || typeof req.method !== 'string') return fail(null, -32600, 'Invalid request');
  // Notifications (no id) get no answer.
  if (req.id === undefined) return null;
  const id = req.id;
  switch (req.method) {
    case 'initialize': {
      const asked = req.params?.protocolVersion;
      return ok(id, {
        protocolVersion: typeof asked === 'string' && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'mimar', title: 'MIMAR', version: __APP_VERSION__ },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case 'tools/call': {
      const name = req.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(name)}`);
      const args = req.params?.arguments;
      try {
        const result = tool.run(args && typeof args === 'object' ? (args as Record<string, unknown>) : {});
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] });
      } catch (e) {
        // Mistakes in the arguments and the app's own refusals go back to the agent to fix.
        const text = e instanceof ToolError ? e.message : `MIMAR could not do that: ${String(e)}`;
        return ok(id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${req.method}`);
  }
}
