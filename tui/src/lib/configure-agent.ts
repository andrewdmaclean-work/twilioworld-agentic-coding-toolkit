// lib/configure-agent.ts — agent-specific setup.
// Drives agent-specific setup. The chosen agent string is passed in;
// everything runs via runStreaming.

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { capture, have, openInNewWindow, runStreaming, type LogFn } from "./exec.ts";
import { DOCS_MCP_URL, MODEL_SERVER_BASE_URL, PI_AGENT_PKG, ROOT, SKILLS_DIR } from "./constants.ts";
import { launchPi, localModelAvailable } from "./pi.ts";
import { pathNodeVersion, supportsPiNode } from "./node-version.ts";
import { readConfig, writeConfig } from "./config.ts";
import { installLocalModel } from "./model-install.ts";
import { getSelectedModel } from "./local-models.ts";
import { installTwilioSkills } from "./skills.ts";

function ok(msg: string, onLog: LogFn) { onLog(`✓ ${msg}`, "stdout"); }
function warn(msg: string, onLog: LogFn) { onLog(`⚠  ${msg}`, "stderr"); }
function err(msg: string, onLog: LogFn) { onLog(`✗ ${msg}`, "stderr"); }
function say(msg: string, onLog: LogFn) { onLog(msg, "stdout"); }

/** Try package-manager installers in order. Remote script installers are
 * intentionally excluded: configuration should not execute unreviewed code. */
async function installVia(opts: {
  brew?: string[];
  npm?: string[];
  onLog: LogFn;
}): Promise<boolean> {
  const { brew, npm, onLog } = opts;
  if (brew && have("brew")) {
    const res = await runStreaming("brew", brew, { cwd: ROOT, onLog });
    if (res.ok) return true;
    warn("brew install failed — trying the next method…", onLog);
  }
  if (npm && have("npm")) {
    const res = await runStreaming("npm", npm, { cwd: ROOT, onLog });
    if (res.ok) return true;
    warn("npm install failed — trying the next method…", onLog);
  }
  return false;
}

/** Best-effort `<cmd> mcp add ...` — logged but never fatal: an agent's MCP
 *  subcommand syntax can shift between versions, and failing to wire an MCP
 *  server shouldn't block install + launch. */
async function tryMcpAdd(command: string, args: string[], onLog: LogFn): Promise<void> {
  const res = await runStreaming(command, args, { cwd: ROOT, onLog });
  if (!res.ok) warn(`Could not run "${command} ${args.join(" ")}" — you can run it yourself later.`, onLog);
}

// ── Unified agent wiring ─────────────────────────────────────────────────
// Every non-Pi agent (Claude Code, Codex, Cursor, OpenCode, GitHub Copilot)
// follows the exact same shape, so the flow is identical no matter which
// one you pick:
//
//   1. install the CLI (installVia brew→npm), abort on failure
//   2. wire Twilio Skills
//   3. wire the Docs MCP
//   4. launch the CLI in a new terminal window
//
// The only per-agent differences are DATA, captured in AgentSpec below:
// the binary name, install sources, docs URL, and the exact MCP-wiring /
// Skills steps (each CLI genuinely has different syntax — Claude has
// plugins + `mcp add`, Codex has `mcp add` with `--url`, Cursor/Copilot
// wire MCP interactively, etc). Pi is intentionally NOT in this table: it's
// a local agent that needs the model and launches via launchPi().

interface AgentSpec {
  /** Display name used in log messages. */
  label: string;
  /** Binary probed with have() and launched with openInNewWindow(). */
  bin: string;
  /** Install sources for installVia() (brew→npm, first that works). */
  install: { brew?: string[]; npm?: string[] };
  /** Docs link shown if every install method fails. */
  docsUrl: string;
  /** First-run note appended to the successful-launch message (e.g. sign in / login). */
  firstRunHint: string;
  /** Wire Twilio Skills into this agent (best-effort; may just print steps). */
  wireSkills?: (onLog: LogFn) => Promise<void> | void;
  /** Wire the Docs MCP (best-effort; may just print steps). */
  wireDocsMcp?: (onLog: LogFn) => Promise<void> | void;
  /** Synchronize configuration that combines multiple capabilities. */
  syncCapabilities?: (capabilities: AgentCapabilities, onLog: LogFn) => Promise<void> | void;
}

interface AgentCapabilities {
  skills: boolean;
  docs: boolean;
}

export function selectedAgentCapabilities(addons: Record<string, boolean>): AgentCapabilities {
  return { skills: addons.twilioSkills === true, docs: addons.docsMcp === true };
}

function ensureAgentSkills(onLog: LogFn): boolean {
  if (!existsSync(SKILLS_DIR)) {
    err("Twilio Skills are missing. Run git submodule update --init --recursive, then retry.", onLog);
    return false;
  }
  const destination = join(homedir(), ".agents", "skills");
  try {
    installTwilioSkills(destination);
  } catch (error) {
    err(`Could not install Twilio Skills for this coding agent: ${(error as Error).message}`, onLog);
    return false;
  }
  ok("Twilio Skills installed for coding agents", onLog);
  return true;
}

/** Runs the identical install → wire → launch sequence for any AgentSpec. */
async function configureStandardAgent(
  spec: AgentSpec,
  capabilities: AgentCapabilities,
  onLog: LogFn,
  onDone: (ok: boolean) => void,
): Promise<void> {
  // 1. Install (skip if already present, abort on failure).
  if (have(spec.bin)) {
    ok(`${spec.label} already installed  ${capture(spec.bin, ["--version"])}`, onLog);
  } else {
    warn(`${spec.label} not found — installing…`, onLog);
    const installed = await installVia({ ...spec.install, onLog });
    if (installed) ok(`${spec.label} installed`, onLog);
    else { err(`Could not install ${spec.label} — see ${spec.docsUrl}`, onLog); onDone(false); return; }
  }

  // 2–3. Honor the toolkit configuration even though Skills and Docs MCP
  // are enabled by default. This also handles older/custom config files.
  if (capabilities.skills) {
    if (!ensureAgentSkills(onLog)) { onDone(false); return; }
    await spec.wireSkills?.(onLog);
  }
  else say("   Twilio Skills are disabled; skipping.", onLog);
  if (spec.syncCapabilities) await spec.syncCapabilities(capabilities, onLog);
  else if (capabilities.docs) await spec.wireDocsMcp?.(onLog);
  else say("   Live Docs search is disabled; skipping.", onLog);

  // 5. Launch in a new terminal window.
  say("", onLog);
  const launch = openInNewWindow(spec.bin, [], { cwd: ROOT });
  if (launch.ok) ok(`${spec.label} opened in a new terminal window — ${spec.firstRunHint}`, onLog);
  else { err(launch.error ?? "Could not open a new terminal window.", onLog); say(`   Run it yourself: cd ${ROOT} && ${spec.bin}`, onLog); }

  onDone(launch.ok);
}


// opencode.json is a tracked file, committed with sensible static defaults
// (twilio-docs on, matching the toolkit's own defaults). This never writes
// to it; if the user's add-on choices
// differ from those committed defaults, it prints an OPENCODE_CONFIG_CONTENT
// override instead — the officially supported "final local-scope merge"
// env var — so local machine state never lands in a tracked file.
function configureOpencodeMcpSelection(docsEnabled: boolean, onLog: LogFn) {
  const ocJson = join(ROOT, "opencode.json");
  if (!existsSync(ocJson)) { warn("opencode.json not found — skipping MCP check", onLog); return; }

  let committed: { mcp?: Record<string, { enabled?: boolean }> } = {};
  try {
    committed = JSON.parse(readFileSync(ocJson, "utf8"));
  } catch (e) {
    warn(`Could not read opencode.json: ${e}`, onLog);
    return;
  }

  const wanted: Record<string, boolean> = { "twilio-docs": docsEnabled };
  const drift = Object.entries(wanted).filter(
    ([name, on]) => (committed.mcp?.[name]?.enabled ?? false) !== on,
  );

  if (!drift.length) {
    ok("opencode.json's committed MCP defaults already match your selected choices", onLog);
    return;
  }

  const override = {
    $schema: "https://opencode.ai/config.json",
    mcp: Object.fromEntries(drift.map(([name, on]) => [name, { enabled: on }])),
  };
  warn(`Your add-on choices differ from opencode.json's committed defaults (${drift.map(([n]) => n).join(", ")}).`, onLog);
  say("   opencode.json is a tracked file — this toolkit never modifies it.", onLog);
  say("   Override at launch time instead:", onLog);
  say(`       export OPENCODE_CONFIG_CONTENT='${JSON.stringify(override)}'`, onLog);
}

export async function configureAgent(opts: {
  agent: string;
  onLog: LogFn;
  onDone: (ok: boolean) => void;
}): Promise<void> {
  const { agent, onLog, onDone } = opts;
  const capabilities = selectedAgentCapabilities(readConfig().addons);

  if (agent.startsWith("Pi")) {
    // ── Pi ───────────────────────────────────────────────────────────
    const nodeInfo = pathNodeVersion();
    if (!supportsPiNode(nodeInfo)) {
      warn(`Pi requires project-local Node >= 22.19.0 — node is ${nodeInfo?.raw ?? "not found"}.`, onLog);
      warn("Re-run ./toolkit to repair .toolkit/toolchains/node-v22, then set up Pi again.", onLog);
      onDone(false);
      return;
    }

    if (!have("pi")) {
      warn("Pi not found — installing…", onLog);
      let installed = false;
      if (have("npm")) {
        const res = await runStreaming("npm", ["install", "-g", "--ignore-scripts", PI_AGENT_PKG], { cwd: ROOT, onLog });
        installed = res.ok;
        if (!installed) warn("npm install failed.", onLog);
      }
      if (installed) ok("Pi installed", onLog);
      else { err("Could not install Pi — see https://pi.dev", onLog); onDone(false); return; }
    } else {
      ok(`Pi already installed  ${capture("pi", ["--version"])}`, onLog);
    }

    if (!localModelAvailable()) {
      const model = getSelectedModel();
      say(`▶ Pi's private local model is not installed (~${model.sizeLabel}). Downloading it now…`, onLog);
      const installed = await installLocalModel({ model, onLog });
      if (!installed) { onDone(false); return; }
      const config = readConfig();
      writeConfig({ ...config.addons, localGemma: true }, config.settings);
    }

    // Capabilities + launch — shared with the menu's own Pi path
    // (lib/pi.ts) so there's exactly one place that knows how to wire
    // Skills/MCP/model config and open Pi in a new terminal window.
    const launch = await launchPi({ onLog });
    warn("Small local models work best with a focused tool set. For heavier work, switch to a cloud /model inside Pi.", onLog);
    onDone(launch.ok);
    return;

  } else if (agent === "OpenCode") {
    // OpenCode is config-file driven for MCP (opencode.json), not `mcp add`,
    // so capability selection is synchronized against the tracked config.
    await configureStandardAgent(
      {
        label: "OpenCode",
        bin: "opencode",
        install: { brew: ["install", "anomalyco/tap/opencode"], npm: ["install", "-g", "opencode-ai"] },
        docsUrl: "https://opencode.ai/docs",
        firstRunHint: "run /connect there to pick a model (Anthropic, OpenAI, or Zen).",
        wireSkills: () => ok("Twilio Skills use the Agent Skills standard — OpenCode reads them from ~/.agents/skills.", onLog),
        syncCapabilities: (selected, l) => configureOpencodeMcpSelection(selected.docs, l),
      },
      capabilities, onLog, onDone,
    );
    return;

  } else if (agent === "Claude Code") {
    await configureStandardAgent(
      {
        label: "Claude Code",
        bin: "claude",
        install: { brew: ["install", "--cask", "claude-code"], npm: ["install", "-g", "@anthropic-ai/claude-code"] },
        docsUrl: "https://code.claude.com/docs/en/quickstart",
        firstRunHint: "sign in there if it's your first run.",
        wireSkills: async (l) => {
          say("   Installing the Twilio developer kit plugin…", l);
          await tryMcpAdd("claude", ["plugin", "marketplace", "add", "https://github.com/twilio/ai"], l);
          await tryMcpAdd("claude", ["plugin", "install", "twilio-developer-kit@twilio"], l);
        },
        wireDocsMcp: async (l) => {
          say("   Adding the Docs MCP…", l);
          await tryMcpAdd("claude", ["mcp", "add", "twilio-docs", "--transport", "http", DOCS_MCP_URL], l);
        },
      },
      capabilities, onLog, onDone,
    );
    return;

  } else if (agent === "Cursor") {
    await configureStandardAgent(
      {
        label: "Cursor CLI",
        bin: "cursor-agent",
        install: { brew: ["install", "--cask", "cursor-cli"] },
        docsUrl: "https://cursor.com/docs/cli",
        firstRunHint: "sign in there if it's your first run.",
        wireSkills: (l) => { say("   In Cursor Composer or the CLI, install the plugin:", l); say("       /add-plugin twilio-developer-kit", l); },
        wireDocsMcp: (l) => { say("   Add the Docs MCP under Cursor Settings > MCP:", l); say(`       type: http   url: ${DOCS_MCP_URL}`, l); },
      },
      capabilities, onLog, onDone,
    );
    return;

  } else if (agent === "Codex") {
    await configureStandardAgent(
      {
        label: "Codex",
        bin: "codex",
        install: { brew: ["install", "codex"], npm: ["install", "-g", "@openai/codex"] },
        docsUrl: "https://developers.openai.com/codex/cli",
        firstRunHint: "sign in there if it's your first run.",
        wireSkills: (l) => {
          say("   In Codex, open Plugins and install \"Twilio developer kit\" (Codex plugin", l);
          say("   marketplaces aren't auto-wired by this toolkit yet).", l);
          say("       /plugins", l);
        },
        wireDocsMcp: async (l) => { say("   Adding the Docs MCP…", l); await tryMcpAdd("codex", ["mcp", "add", "twilio-docs", "--url", DOCS_MCP_URL], l); },
      },
      capabilities, onLog, onDone,
    );
    return;

  } else if (agent === "GitHub Copilot") {
    await configureStandardAgent(
      {
        label: "GitHub Copilot CLI",
        bin: "copilot",
        install: { brew: ["install", "--cask", "copilot-cli"], npm: ["install", "-g", "@github/copilot"] },
        docsUrl: "https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli",
        firstRunHint: "run /login there if it's your first run.",
        wireSkills: (l) => ok("Twilio Skills use the Agent Skills standard — Copilot CLI reads them from ~/.agents/skills.", l),
        // Copilot manages MCP interactively via /mcp (no stable subcommand).
        wireDocsMcp: (l) => { say("   Add the Docs MCP inside Copilot with the /mcp command:", l); say(`       name: twilio-docs   type: http   url: ${DOCS_MCP_URL}`, l); },
      },
      capabilities, onLog, onDone,
    );
    return;

  } else {
    // Other / Bring my own
    say("=== Bring Your Own Agent ===", onLog);
    say("Everything uses open standards: Agent Skills + MCP.", onLog);
    if (capabilities.docs) {
      say("", onLog);
      say(`  Live Twilio Docs (HTTP, no login):  ${DOCS_MCP_URL}`, onLog);
    }
    if (capabilities.skills) {
      say("", onLog);
      say("  Twilio Skills — copy to your agent's skills directory:", onLog);
      say(`      cp -r "${join(ROOT, "vendor", "twilio-ai", "skills")}" ~/.agents/skills/`, onLog);
    }
    say("", onLog);
    say("  Local model (OpenAI-compatible):", onLog);
    say(`      ${MODEL_SERVER_BASE_URL}/v1   (launch from Local chat)`, onLog);
    say("", onLog);
    say("  Works with Copilot, Gemini CLI, JetBrains Junie + 30 more.", onLog);
  }

  onDone(true);
}
