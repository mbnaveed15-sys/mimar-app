/** Help > Connect AI agents: how an agent's app starts MIMAR's connector (see src/mcp). */
export interface AgentSetup {
  /** The portable app: it runs from a temporary folder, so there is no lasting path to give. */
  portable?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface DesktopAgents {
  setup: () => Promise<AgentSetup>;
}

declare global {
  interface Window {
    mimarAgents?: DesktopAgents;
  }
}

/** The lines for an MCP client's settings file (Claude Desktop's claude_desktop_config.json, a .mcp.json). */
export function agentConfig(setup: AgentSetup): string {
  const { command, args, env } = setup;
  return JSON.stringify({ mcpServers: { mimar: { command, args, env } } }, null, 2);
}
