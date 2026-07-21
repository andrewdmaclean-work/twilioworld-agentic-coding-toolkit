import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { have } from "./exec.ts";
import { PI_AGENT_DIR, ROOT } from "./constants.ts";

export interface AgentDefinition {
  name: string;
  value: string;
  bin?: string;
  configFiles: string[];
}

export interface AgentState {
  installed: boolean;
  configured: boolean;
  auth: "checked on launch" | "not applicable";
}

const home = homedir();

export const AGENTS: AgentDefinition[] = [
  { name: "Claude Code", value: "Claude Code", bin: "claude", configFiles: [join(home, ".claude.json"), join(home, ".claude", "settings.json")] },
  { name: "Codex", value: "Codex", bin: "codex", configFiles: [join(home, ".codex", "config.toml")] },
  { name: "Cursor", value: "Cursor", bin: "cursor-agent", configFiles: [join(home, ".cursor", "mcp.json")] },
  { name: "OpenCode", value: "OpenCode", bin: "opencode", configFiles: [join(ROOT, "opencode.json")] },
  { name: "GitHub Copilot", value: "GitHub Copilot", bin: "copilot", configFiles: [join(home, ".copilot", "mcp-config.json")] },
  { name: "Pi", value: "Pi (lightweight TUI)", bin: "pi", configFiles: [join(PI_AGENT_DIR, "mcp.json")] },
  { name: "Other / Bring my own", value: "Other / Bring my own", configFiles: [] },
];

function containsTwilioConfig(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const content = readFileSync(path, "utf8").toLowerCase();
    return content.includes("twilio-docs") || content.includes("mcp.twilio.com");
  } catch {
    return false;
  }
}

export function readAgentState(agent: AgentDefinition): AgentState {
  if (!agent.bin) return { installed: false, configured: false, auth: "not applicable" };
  return {
    installed: have(agent.bin),
    configured: agent.configFiles.some(containsTwilioConfig),
    auth: "checked on launch",
  };
}

export function agentPickerOptions(): Array<{ name: string; description: string; value: string }> {
  return AGENTS.map((agent) => {
    if (!agent.bin) return { name: agent.name, value: agent.value, description: "manual Skills and MCP wiring instructions" };
    const state = readAgentState(agent);
    const installed = state.installed ? "installed" : "not installed";
    const configured = state.configured ? "Twilio configured" : "not configured";
    return { name: agent.name, value: agent.value, description: `${installed} · ${configured} · sign-in ${state.auth}` };
  });
}
