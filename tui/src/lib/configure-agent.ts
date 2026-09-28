// lib/configure-agent.ts — agent-specific setup.
// Drives agent-specific setup. The chosen agent string is passed in;
// everything runs via runStreaming.

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { capture, have, runStreaming, type LogFn } from "./exec.ts";
import type { LaunchTarget } from "./terminal.ts";
import { DOCS_MCP_URL, MODEL_SERVER_BASE_URL, PI_AGENT_PKG, ROOT, SKILLS_DIR } from "./constants.ts";
import { localModelAvailable, preparePi } from "./pi.ts";
import { MODEL_CTX_SIZE } from "./model.ts";
import { pathNodeVersion, supportsPiNode } from "./node-version.ts";
import { readConfig, writeConfig } from "./config.ts";
import { installLocalModel } from "./model-install.ts";
import { getSelectedModel } from "./local-models.ts";
import {
  claudeDocs, claudeSkills, codexDocs, copilotCliInstalled, copilotDocs, cursorDocs, installAgentSkills, opencodeDocs,
} from "./agent-wiring.ts";

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

// ── Unified agent wiring ─────────────────────────────────────────────────
// Every non-Pi agent (Claude Code, Codex, Cursor, OpenCode, GitHub Copilot)
// follows the exact same shape, so the flow is identical no matter which
// one you pick:
//
//   1. install the CLI (installVia brew→npm), abort on failure
//   2. wire Twilio Skills
//   3. wire the Docs MCP
//   4. hand a LaunchTarget back so the user picks where it opens
//
// The only per-agent differences are DATA, captured in AgentSpec below:
// the binary name, install sources, docs URL, and the exact MCP-wiring /
// Skills steps (each CLI genuinely has different syntax — Claude has
// plugins + `mcp add`, Codex has `mcp add` with `--url`, Cursor and OpenCode
// are config files — see lib/agent-wiring.ts). Pi is intentionally NOT in this table: it's
// a local agent that needs the model and is prepared via preparePi().

interface AgentSpec {
  /** Display name used in log messages. */
  label: string;
  /** Binary probed with have() and opened from the handoff screen. */
  bin: string;
  /** Stricter install check when a same-named stub may be on PATH. */
  installed?: () => boolean;
  /** Install sources for installVia() (brew→npm, first that works). */
  install: { brew?: string[]; npm?: string[] };
  /** Docs link shown if every install method fails. */
  docsUrl: string;
  /** First-run note shown on the handoff screen (e.g. sign in / login). */
  firstRunHint: string;
  /** Extra environment for the launched agent (e.g. config overrides). */
  launchEnv?: (capabilities: AgentCapabilities, onLog: LogFn) => NodeJS.ProcessEnv | undefined;
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

/** Filename-safe id for a launch script, e.g. "GitHub Copilot CLI" → "github-copilot-cli". */
export function launchId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Runs the identical install → wire → ready sequence for any AgentSpec.
 *  Opening the agent is the caller's job (the handoff screen), so the user
 *  always chooses — and sees — where it opens. */
async function configureStandardAgent(
  spec: AgentSpec,
  capabilities: AgentCapabilities,
  onLog: LogFn,
  onDone: (ok: boolean) => void,
  onReady?: (target: LaunchTarget) => void,
): Promise<void> {
  // 1. Install (skip if already present, abort on failure).
  if (spec.installed ? spec.installed() : have(spec.bin)) {
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
    if (!installAgentSkills(onLog)) { onDone(false); return; }
    await spec.wireSkills?.(onLog);
  }
  else say("   Twilio Skills are disabled; skipping.", onLog);
  if (spec.syncCapabilities) await spec.syncCapabilities(capabilities, onLog);
  else if (capabilities.docs) await spec.wireDocsMcp?.(onLog);
  else say("   Live Docs search is disabled; skipping.", onLog);

  // 4. Ready — hand the launch back to the caller.
  say("", onLog);
  ok(`${spec.label} is ready to open`, onLog);
  onReady?.({
    id: launchId(spec.label),
    label: spec.label,
    command: spec.bin,
    cwd: ROOT,
    env: spec.launchEnv?.(capabilities, onLog),
    hint: spec.firstRunHint,
  });
  onDone(true);
}


// opencode.json is a tracked file, committed with sensible static defaults
// (twilio-docs on, Gemma as the local model). This never writes to it; when
// the user's choices differ — Docs disabled, or a different local model —
// the difference is passed as OPENCODE_CONFIG_CONTENT (OpenCode's supported
// "final local-scope merge" env var) in OpenCode's launch script, so local
// machine state never lands in a tracked file and nothing needs exporting.
export function opencodeOverride(
  committed: { mcp?: Record<string, { enabled?: boolean }>; provider?: { llamafile?: { models?: Record<string, unknown> } } },
  docsEnabled: boolean,
  model: { slug: string; name: string },
  ctxSize = Number(MODEL_CTX_SIZE),
): Record<string, unknown> | null {
  const override: Record<string, unknown> = {};
  const mcpDrift = (committed.mcp?.["twilio-docs"]?.enabled ?? false) !== docsEnabled;
  if (mcpDrift) override.mcp = { "twilio-docs": { enabled: docsEnabled } };
  if (!committed.provider?.llamafile?.models?.[model.slug]) {
    override.provider = {
      llamafile: {
        name: `${model.name} (local)`,
        models: { [model.slug]: { name: `${model.name} (local)`, limit: { context: ctxSize, output: 4096 }, tools: true } },
      },
    };
  }
  return Object.keys(override).length ? { $schema: "https://opencode.ai/config.json", ...override } : null;
}

function opencodeLaunchEnv(docsEnabled: boolean, onLog: LogFn): NodeJS.ProcessEnv | undefined {
  const ocJson = join(ROOT, "opencode.json");
  if (!existsSync(ocJson)) { warn("opencode.json not found — skipping MCP check", onLog); return undefined; }

  let committed: Parameters<typeof opencodeOverride>[0] = {};
  try {
    committed = JSON.parse(readFileSync(ocJson, "utf8"));
  } catch (e) {
    warn(`Could not read opencode.json: ${e}`, onLog);
    return undefined;
  }

  const override = opencodeOverride(committed, docsEnabled, getSelectedModel());
  if (!override) {
    ok("opencode.json already matches your selected choices", onLog);
    return undefined;
  }
  ok("Your choices differ from opencode.json's committed defaults — applied at launch via OPENCODE_CONFIG_CONTENT (opencode.json is never modified)", onLog);
  return { OPENCODE_CONFIG_CONTENT: JSON.stringify(override) };
}

export async function configureAgent(opts: {
  agent: string;
  onLog: LogFn;
  onDone: (ok: boolean) => void;
  /** Receives what to open once setup succeeds (not called for "Other"). */
  onReady?: (target: LaunchTarget) => void;
}): Promise<void> {
  const { agent, onLog, onDone, onReady } = opts;
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
    }

    // Capabilities + model server — lib/pi.ts is the one place that knows
    // how to wire Skills/MCP/model config for Pi.
    const target = await preparePi({ onLog });
    if (target) onReady?.(target);
    onDone(Boolean(target));
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
        firstRunHint: "run /connect to pick a model (Anthropic, OpenAI, or Zen).",
        wireSkills: (l) => ok("OpenCode reads Twilio Skills from ~/.agents/skills", l),
        wireDocsMcp: async (l) => { await opencodeDocs(l); },
        launchEnv: (selected, l) => opencodeLaunchEnv(selected.docs, l),
      },
      capabilities, onLog, onDone, onReady,
    );
    return;

  } else if (agent === "Claude Code") {
    await configureStandardAgent(
      {
        label: "Claude Code",
        bin: "claude",
        install: { brew: ["install", "--cask", "claude-code"], npm: ["install", "-g", "@anthropic-ai/claude-code"] },
        docsUrl: "https://code.claude.com/docs/en/quickstart",
        firstRunHint: "sign in when prompted.",
        wireSkills: async (l) => { await claudeSkills(l); },
        wireDocsMcp: async (l) => { await claudeDocs(l); },
      },
      capabilities, onLog, onDone, onReady,
    );
    return;

  } else if (agent === "Cursor") {
    await configureStandardAgent(
      {
        label: "Cursor CLI",
        bin: "cursor-agent",
        install: { brew: ["install", "--cask", "cursor-cli"] },
        docsUrl: "https://cursor.com/docs/cli",
        firstRunHint: "sign in when prompted.",
        wireSkills: (l) => ok("Cursor reads Twilio Skills from ~/.agents/skills", l),
        wireDocsMcp: async (l) => { await cursorDocs(l); },
      },
      capabilities, onLog, onDone, onReady,
    );
    return;

  } else if (agent === "Codex") {
    await configureStandardAgent(
      {
        label: "Codex",
        bin: "codex",
        install: { brew: ["install", "codex"], npm: ["install", "-g", "@openai/codex"] },
        docsUrl: "https://developers.openai.com/codex/cli",
        firstRunHint: "sign in when prompted.",
        wireSkills: (l) => ok("Codex reads Twilio Skills from ~/.agents/skills", l),
        wireDocsMcp: async (l) => { await codexDocs(l); },
      },
      capabilities, onLog, onDone, onReady,
    );
    return;

  } else if (agent === "GitHub Copilot") {
    await configureStandardAgent(
      {
        label: "GitHub Copilot CLI",
        bin: "copilot",
        install: { brew: ["install", "--cask", "copilot-cli"], npm: ["install", "-g", "@github/copilot"] },
        docsUrl: "https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli",
        firstRunHint: "run /login to sign in.",
        installed: copilotCliInstalled,
        wireSkills: (l) => ok("Copilot CLI reads Twilio Skills from ~/.agents/skills", l),
        wireDocsMcp: async (l) => { await copilotDocs(l); },
      },
      capabilities, onLog, onDone, onReady,
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
