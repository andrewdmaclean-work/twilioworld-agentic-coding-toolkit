// lib/agent-wiring.ts — add Twilio Skills + live Docs to coding agents.
//
// Every step here is global (the agent knows Twilio in any project, not just
// this repo), idempotent (re-running changes nothing that's already set),
// and verified against each CLI's documented interface:
//
//   Skills  ~/.agents/skills is read by Codex, Cursor, Copilot CLI, and
//           OpenCode. Claude Code gets Twilio's developer-kit plugin.
//   Docs    Claude:   claude mcp add --scope user --transport http …
//           Codex:    codex mcp add … --url …        (~/.codex/config.toml)
//           Copilot:  copilot mcp add --transport http …
//           Cursor:   merge into ~/.cursor/mcp.json  (shared by editor + CLI)
//           OpenCode: merge into ~/.config/opencode/opencode.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { dirname, join } from "path";
import { capture, have, runStreaming, type LogFn } from "./exec.ts";
import { DOCS_MCP_URL, SKILLS_DIR } from "./constants.ts";
import { installTwilioSkills } from "./skills.ts";

function ok(msg: string, onLog: LogFn) { onLog(`✓ ${msg}`, "stdout"); }
function warn(msg: string, onLog: LogFn) { onLog(`⚠ ${msg}`, "stderr"); }
function err(msg: string, onLog: LogFn) { onLog(`✗ ${msg}`, "stderr"); }
function say(msg: string, onLog: LogFn) { onLog(msg, "stdout"); }

export const DOCS_SERVER = "twilio-docs";
export const AGENT_SKILLS_DIR = join(homedir(), ".agents", "skills");
export const CURSOR_MCP_JSON = join(homedir(), ".cursor", "mcp.json");
export const OPENCODE_GLOBAL_JSON = join(homedir(), ".config", "opencode", "opencode.json");
const COPILOT_MCP_JSON = join(process.env.COPILOT_HOME ?? join(homedir(), ".copilot"), "mcp-config.json");

const tilde = (path: string) => path.replace(homedir(), "~");

// ── Detection ────────────────────────────────────────────────────────

/** VS Code's Copilot Chat puts a `copilot` stub on PATH that only offers to
 *  install the real CLI. A real Copilot CLI prints a version number. */
export function copilotVersionIsReal(output: string): boolean {
  return /\d+\.\d+/.test(output) && !/cannot find|install github copilot cli/i.test(output);
}

export function copilotCliInstalled(): boolean {
  if (!have("copilot")) return false;
  return copilotVersionIsReal(capture("copilot", ["--version"], undefined, { timeoutMs: 5000 }));
}

/** The Cursor editor and CLI share ~/.cursor/mcp.json, so either counts. */
export function cursorInstalled(): boolean {
  return have("cursor-agent") || existsSync(join(homedir(), ".cursor")) || existsSync("/Applications/Cursor.app");
}

// ── Config-file merges (pure, so they're testable) ──────────────────

export type MergeResult = { content: string; changed: boolean } | { error: string };

function parseObject(existing: string | null, label: string): Record<string, unknown> | { error: string } {
  if (existing === null || !existing.trim()) return {};
  try {
    const parsed = JSON.parse(existing);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { error: `${label} is not a JSON object` };
  } catch {
    return { error: `${label} isn't plain JSON (comments?), so it was left untouched` };
  }
}

/** Add twilio-docs to Cursor's mcp.json, keeping every other server. */
export function mergeCursorMcp(existing: string | null, url = DOCS_MCP_URL): MergeResult {
  const config = parseObject(existing, "~/.cursor/mcp.json");
  if ("error" in config) return config as { error: string };
  const servers = (config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {}) as Record<string, unknown>;
  const current = servers[DOCS_SERVER] as { url?: string } | undefined;
  if (current?.url === url) return { content: existing ?? "", changed: false };
  const next = { ...config, mcpServers: { ...servers, [DOCS_SERVER]: { url } } };
  return { content: `${JSON.stringify(next, null, 2)}\n`, changed: true };
}

/** Add twilio-docs to OpenCode's global config, keeping everything else. */
export function mergeOpencodeGlobal(existing: string | null, url = DOCS_MCP_URL): MergeResult {
  const config = parseObject(existing, "~/.config/opencode/opencode.json");
  if ("error" in config) return config as { error: string };
  const mcp = (config.mcp && typeof config.mcp === "object" ? config.mcp : {}) as Record<string, unknown>;
  const current = mcp[DOCS_SERVER] as { url?: string; enabled?: boolean } | undefined;
  if (current?.url === url && current.enabled !== false) return { content: existing ?? "", changed: false };
  const next = {
    $schema: "https://opencode.ai/config.json",
    ...config,
    mcp: { ...mcp, [DOCS_SERVER]: { type: "remote", url, enabled: true } },
  };
  return { content: `${JSON.stringify(next, null, 2)}\n`, changed: true };
}

function applyMerge(path: string, merge: (existing: string | null) => MergeResult, label: string, onLog: LogFn): boolean {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  const result = merge(existing);
  if ("error" in result) {
    warn(`${label}: ${result.error}. Add this server yourself: ${DOCS_SERVER} → ${DOCS_MCP_URL}`, onLog);
    return false;
  }
  if (!result.changed) { ok(`${label} Docs already configured (${tilde(path)})`, onLog); return true; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, result.content);
  ok(`${label} Docs added to ${tilde(path)}`, onLog);
  return true;
}

// ── Per-agent steps ──────────────────────────────────────────────────

/** Copy Twilio Skills into ~/.agents/skills (only the twilio and sendgrid
 *  groups are replaced; other skills there are left alone). */
export function installAgentSkills(onLog: LogFn): boolean {
  if (!existsSync(SKILLS_DIR)) {
    err("Twilio Skills are missing. Run Settings → Check & repair, then retry.", onLog);
    return false;
  }
  try {
    installTwilioSkills(AGENT_SKILLS_DIR);
  } catch (error) {
    err(`Could not install Twilio Skills in ${tilde(AGENT_SKILLS_DIR)}: ${(error as Error).message}`, onLog);
    return false;
  }
  ok(`Twilio Skills installed in ${tilde(AGENT_SKILLS_DIR)}`, onLog);
  return true;
}

/** "No MCP server named …" means missing. Run outside the repo so a
 *  repo-local entry doesn't count as configured everywhere. */
function mcpServerListed(bin: string): boolean {
  const out = capture(bin, ["mcp", "get", DOCS_SERVER], undefined, { cwd: tmpdir(), timeoutMs: 15000 });
  return Boolean(out) && !/no mcp server named/i.test(out);
}

async function run(bin: string, args: string[], onLog: LogFn): Promise<boolean> {
  const res = await runStreaming(bin, args, { cwd: tmpdir(), onLog });
  if (!res.ok) warn(`"${bin} ${args.join(" ")}" failed. You can run it yourself later.`, onLog);
  return res.ok;
}

export async function claudeSkills(onLog: LogFn): Promise<boolean> {
  if (capture("claude", ["plugin", "list"], undefined, { timeoutMs: 15000 }).includes("twilio-developer-kit@twilio")) {
    ok("Claude Code: Twilio developer kit plugin already installed", onLog);
    return true;
  }
  say("  Claude Code: installing the Twilio developer kit plugin…", onLog);
  if (!capture("claude", ["plugin", "marketplace", "list"], undefined, { timeoutMs: 15000 }).match(/^\s*❯?\s*twilio\s*$/m)) {
    // If the marketplace turns out to be registered already, the install below still works.
    await run("claude", ["plugin", "marketplace", "add", "https://github.com/twilio/ai"], onLog);
  }
  const installed = await run("claude", ["plugin", "install", "twilio-developer-kit@twilio"], onLog);
  if (installed) ok("Claude Code: Twilio developer kit plugin installed", onLog);
  return installed;
}

export async function claudeDocs(onLog: LogFn): Promise<boolean> {
  if (mcpServerListed("claude")) { ok("Claude Code Docs already configured", onLog); return true; }
  const added = await run("claude", ["mcp", "add", "--scope", "user", "--transport", "http", DOCS_SERVER, DOCS_MCP_URL], onLog);
  if (added) ok("Claude Code Docs added (user scope — every project)", onLog);
  return added;
}

export async function codexDocs(onLog: LogFn): Promise<boolean> {
  if (mcpServerListed("codex")) { ok("Codex Docs already configured", onLog); return true; }
  const added = await run("codex", ["mcp", "add", DOCS_SERVER, "--url", DOCS_MCP_URL], onLog);
  if (added) ok("Codex Docs added to ~/.codex/config.toml", onLog);
  return added;
}

export async function copilotDocs(onLog: LogFn): Promise<boolean> {
  try {
    if (existsSync(COPILOT_MCP_JSON) && readFileSync(COPILOT_MCP_JSON, "utf8").includes(`"${DOCS_SERVER}"`)) {
      ok("Copilot CLI Docs already configured", onLog);
      return true;
    }
  } catch { /* fall through to add */ }
  const added = await run("copilot", ["mcp", "add", "--transport", "http", DOCS_SERVER, DOCS_MCP_URL], onLog);
  if (added) ok(`Copilot CLI Docs added to ${tilde(COPILOT_MCP_JSON)}`, onLog);
  return added;
}

export async function cursorDocs(onLog: LogFn): Promise<boolean> {
  const merged = applyMerge(CURSOR_MCP_JSON, (existing) => mergeCursorMcp(existing), "Cursor", onLog);
  // The CLI asks before using a new server; approving it here is best-effort.
  if (merged && have("cursor-agent")) {
    capture("cursor-agent", ["mcp", "enable", DOCS_SERVER], undefined, { timeoutMs: 15000 });
  }
  return merged;
}

export async function opencodeDocs(onLog: LogFn): Promise<boolean> {
  return applyMerge(OPENCODE_GLOBAL_JSON, (existing) => mergeOpencodeGlobal(existing), "OpenCode", onLog);
}

// ── All agents ───────────────────────────────────────────────────────

export interface AgentPlan {
  name: string;
  /** What will be written, for the review screen. */
  summary: string;
  wire: (capabilities: { skills: boolean; docs: boolean }, onLog: LogFn) => Promise<boolean>;
}

const viaSharedSkills = "Skills via ~/.agents/skills";

/** Agents on this computer and what "add Twilio" will do for each. */
export function detectAgentPlans(): AgentPlan[] {
  const plans: AgentPlan[] = [];
  if (have("claude")) plans.push({
    name: "Claude Code",
    summary: "Twilio plugin + Docs (user scope)",
    wire: async (c, l) => (!c.skills || await claudeSkills(l)) && (!c.docs || await claudeDocs(l)),
  });
  if (have("codex")) plans.push({
    name: "Codex",
    summary: `${viaSharedSkills} + Docs in ~/.codex/config.toml`,
    wire: async (c, l) => !c.docs || codexDocs(l),
  });
  if (cursorInstalled()) plans.push({
    name: "Cursor",
    summary: `${viaSharedSkills} + Docs in ~/.cursor/mcp.json`,
    wire: async (c, l) => !c.docs || cursorDocs(l),
  });
  if (have("opencode")) plans.push({
    name: "OpenCode",
    summary: `${viaSharedSkills} + Docs in ~/.config/opencode/opencode.json`,
    wire: async (c, l) => !c.docs || opencodeDocs(l),
  });
  if (copilotCliInstalled()) plans.push({
    name: "Copilot CLI",
    summary: `${viaSharedSkills} + Docs via copilot mcp add`,
    wire: async (c, l) => !c.docs || copilotDocs(l),
  });
  return plans;
}

/** Add Twilio Skills + Docs to every detected agent. Installs no agents and
 *  opens none; each failure is reported with the command to run yourself. */
export async function addTwilioToAllAgents(opts: {
  plans: AgentPlan[];
  capabilities: { skills: boolean; docs: boolean };
  onLog: LogFn;
  onDone: (ok: boolean) => void;
}): Promise<void> {
  const { plans, capabilities, onLog, onDone } = opts;
  let allOk = true;
  if (capabilities.skills) {
    onLog("\n▶ Twilio Skills", "stdout");
    allOk = installAgentSkills(onLog) && allOk;
  }
  for (const plan of plans) {
    onLog(`\n▶ ${plan.name}`, "stdout");
    try {
      allOk = (await plan.wire(capabilities, onLog)) && allOk;
    } catch (error) {
      err(`${plan.name}: ${(error as Error).message}`, onLog);
      allOk = false;
    }
  }
  say("", onLog);
  if (allOk) ok(`Twilio added to ${plans.map((p) => p.name).join(", ")}. Open your agent the way you usually do.`, onLog);
  else warn("Some steps need attention (see above). Everything else is set up.", onLog);
  onDone(allOk);
}

