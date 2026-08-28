// lib/setup.ts — setup workflow implementation (add-on picker is in the TUI).
// Install choices are already written to config.json before this is called.

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { capture, have, runStreaming, type LogFn } from "./exec.ts";
import { addonEnabled } from "./config.ts";
import { installLocalModel } from "./model-install.ts";
import { getSelectedModel } from "./local-models.ts";
import { installTwilioSkills } from "./skills.ts";
import {
  NPM_GLOBAL_PREFIX,
  PI_AGENT_PKG,
  ROOT,
  SKILLS_DIR,
  TWILIO_CLI_HOME,
} from "./constants.ts";

function ok(msg: string, onLog: LogFn) { onLog(`✓ ${msg}`, "stdout"); }
function warn(msg: string, onLog: LogFn) { onLog(`⚠  ${msg}`, "stderr"); }
function err(msg: string, onLog: LogFn) { onLog(`✗ ${msg}`, "stderr"); }
function say(msg: string, onLog: LogFn) { onLog(msg, "stdout"); }
function step(msg: string, onLog: LogFn) { onLog(`\n▶ ${msg}`, "stdout"); }
function stepDone(msg: string, onLog: LogFn) { onLog(`☑ ${msg}`, "stdout"); }

// ── Main export ───────────────────────────────────────────────────────
export async function runSetup(opts: {
  onLog: LogFn;
  onDone: (ok: boolean) => void;
}): Promise<void> {
  const { onLog, onDone } = opts;

  // Everything Setup creates from here on (.toolkit/, downloaded models/tools)
  // should default to
  // owner-only permissions, not whatever broad umask the user's shell
  // happened to have. process.umask() is process-global but Setup is a
  // one-shot flow, so this is safe for the whole run.
  process.umask(0o077);

  // ── Step 1: Prerequisites ──────────────────────────────────────────
  step("☐ [1/4] Check this computer", onLog);
  let missing = false;
  for (const tool of ["node", "git", "curl"]) {
    if (have(tool)) {
      const ver = capture(tool, ["--version"]).split("\n")[0];
      ok(`${tool}  ${ver}`, onLog);
    } else {
      err(`${tool} not found — install it, then retry setup`, onLog);
      missing = true;
    }
  }
  if (missing) { onDone(false); return; }
  stepDone("[1/4] Check this computer", onLog);

  // ── Step 2: Skills ─────────────────────────────────────────────────
  step("☐ [2/4] Prepare Twilio knowledge", onLog);
  const skillsReadme = join(ROOT, "vendor", "twilio-ai", "skills", "README.md");
  if (!existsSync(skillsReadme)) {
    say("   Downloading Twilio Skills (git submodule)…", onLog);
    const res = await runStreaming("git", ["submodule", "update", "--init", "--recursive"], { cwd: ROOT, onLog });
    if (!res.ok) { err("Could not download Twilio Skills", onLog); onDone(false); return; }
  }
  let skillCount = 0;
  try {
    const countOut = capture("find", [SKILLS_DIR, "-name", "SKILL.md"]);
    skillCount = countOut.split("\n").filter(Boolean).length;
  } catch { /* ignore */ }
  const globalSkills = join(homedir(), ".agents", "skills");
  try {
    installTwilioSkills(globalSkills);
  } catch (error) {
    err(`Could not install Twilio Skills for coding agents: ${(error as Error).message}`, onLog);
    onDone(false);
    return;
  }
  ok(`${skillCount} Twilio Skills ready; live Docs search is included`, onLog);
  stepDone("[2/4] Prepare Twilio knowledge", onLog);

  // ── Step 3: Local model ────────────────────────────────────────────
  const selectedModel = getSelectedModel();
  step(`☐ [3/4] Local AI model — ${selectedModel.name}`, onLog);
  if (!addonEnabled("localGemma")) {
    say("   Not selected — private local chat can be installed later from Settings", onLog);
  } else {
    const modelOk = await installLocalModel({ model: selectedModel, onLog });
    if (!modelOk) { onDone(false); return; }
    if (have("pi")) {
      ok(`Pi already installed  ${capture("pi", ["--version"]).split("\n")[0]}`, onLog);
    } else {
      say("   Installing the Pi local coding interface…", onLog);
      const pi = await runStreaming("npm", ["install", "-g", "--ignore-scripts", PI_AGENT_PKG], { cwd: ROOT, onLog });
      if (!pi.ok) { err("Could not install Pi", onLog); onDone(false); return; }
      ok("Pi installed", onLog);
    }
  }
  stepDone(`[3/4] Local AI model — ${selectedModel.name}`, onLog);

  // ── Step 4: Dev Phone ──────────────────────────────────────────────
  step("☐ [4/4] Dev Phone", onLog);
  if (!addonEnabled("devPhone")) {
    say("   Not selected — Dev Phone can be installed later from Settings", onLog);
  } else {
    if (!have("twilio")) {
      say("   Installing the toolkit-local Twilio CLI required by Dev Phone…", onLog);
      const cli = await runStreaming("npm", ["install", "--prefix", NPM_GLOBAL_PREFIX, "-g", "twilio-cli"], { cwd: ROOT, onLog });
      if (!cli.ok) { err("Could not install the Twilio CLI", onLog); onDone(false); return; }
      ok(`Twilio CLI installed; account profiles stay isolated in ${TWILIO_CLI_HOME}`, onLog);
    }
    const plugins = capture("twilio", ["plugins"]);
    if (plugins.includes("plugin-dev-phone")) {
      ok("Dev Phone plugin already installed", onLog);
    } else {
      const res = await runStreaming("twilio", ["plugins:install", "@twilio-labs/plugin-dev-phone"], { cwd: ROOT, onLog });
      if (res.ok) ok("Dev Phone installed", onLog);
      else { err("Dev Phone installation failed", onLog); onDone(false); return; }
    }
    warn("Dev Phone can replace a number's webhook settings. Use a spare number, not a production number.", onLog);
  }
  stepDone("[4/4] Dev Phone", onLog);

  say("", onLog);
  ok("Setup complete.", onLog);
  onDone(true);
}
