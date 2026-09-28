// lib/actions.ts — focused, single-purpose streaming actions used by the
// dashboard submenus (local AI, Dev Phone, Twilio CLI). Each mirrors a slice
// of runSetup() but can be triggered on its own from a submenu, so the
// user never has to visit a monolithic "Setup" screen.

import { join } from "path";
import { capture, have, runStreaming, twilioCliEnv, type LogFn } from "./exec.ts";
import { killModelServer } from "./daemons.ts";
import type { LaunchTarget } from "./terminal.ts";
import { installLocalModel } from "./model-install.ts";
import { getSelectedModel } from "./local-models.ts";
import { NPM_GLOBAL_PREFIX, ROOT, TWILIO_CLI_HOME } from "./constants.ts";

function ok(msg: string, onLog: LogFn) { onLog(`✓ ${msg}`, "stdout"); }
function warn(msg: string, onLog: LogFn) { onLog(`⚠  ${msg}`, "stderr"); }
function err(msg: string, onLog: LogFn) { onLog(`✗ ${msg}`, "stderr"); }
function say(msg: string, onLog: LogFn) { onLog(msg, "stdout"); }
function step(msg: string, onLog: LogFn) { onLog(`\n▶ ${msg}`, "stdout"); }

/** Download the local model + llamafile runtime shared by browser chat and Pi. */
export async function downloadLocalModel(opts: { onLog: LogFn; onDone: (ok: boolean) => void }): Promise<void> {
  const { onLog, onDone } = opts;
  const model = getSelectedModel();
  const ok = await installLocalModel({ model, onLog, heading: `Local AI model — ${model.name} via llamafile` });
  onDone(ok);
}

/** Install a toolkit-local Twilio CLI via npm. */
export async function installTwilioCli(opts: { onLog: LogFn; onDone: (ok: boolean) => void }): Promise<void> {
  const { onLog, onDone } = opts;
  step("Toolkit-local Twilio CLI", onLog);
  if (have("twilio")) { ok(`Already installed  ${capture("twilio", ["--version"]).split("\n")[0]}`, onLog); onDone(true); return; }
  if (!have("npm")) { err("Toolkit-local npm not found — re-run ./toolkit so it can repair .toolkit/toolchains/node-v22.", onLog); onDone(false); return; }
  const res = await runStreaming("npm", ["install", "--prefix", NPM_GLOBAL_PREFIX, "-g", "twilio-cli"], { cwd: ROOT, onLog });
  if (res.ok) {
    ok(`Twilio CLI installed under ${NPM_GLOBAL_PREFIX}`, onLog);
    ok(`Twilio CLI profiles are isolated under ${TWILIO_CLI_HOME}`, onLog);
    onDone(true);
  }
  else { err("Install failed — see https://www.twilio.com/docs/twilio-cli/quickstart", onLog); onDone(false); }
}

/** Install the Dev Phone plugin (installs the CLI first if needed). */
export async function installDevPhone(opts: { onLog: LogFn; onDone: (ok: boolean) => void }): Promise<void> {
  const { onLog, onDone } = opts;
  if (!have("twilio")) {
    await installTwilioCli({ onLog, onDone: () => {} });
    if (!have("twilio")) { err("Twilio CLI required for Dev Phone.", onLog); onDone(false); return; }
  }
  step("Dev Phone plugin", onLog);
  const plugins = capture("twilio", ["plugins"]);
  if (plugins.includes("plugin-dev-phone")) { ok("Dev Phone already installed", onLog); onDone(true); return; }
  const res = await runStreaming("twilio", ["plugins:install", "@twilio-labs/plugin-dev-phone"], { cwd: ROOT, onLog });
  if (res.ok) { ok("Dev Phone installed", onLog); onDone(true); }
  else { err("Dev Phone install failed", onLog); onDone(false); }
}

/** Dev Phone, opened wherever the user picks on the handoff screen. */
export function devPhoneTarget(): LaunchTarget {
  return {
    id: "dev-phone",
    label: "Dev Phone",
    command: "twilio",
    args: ["dev-phone"],
    cwd: ROOT,
    hint: "use a spare number; Dev Phone can replace its webhook settings.",
    exitHint: "press Ctrl+C to stop Dev Phone and return",
  };
}

/** An interactive shell with the isolated Twilio CLI on PATH. */
export function twilioShellTarget(): LaunchTarget {
  return {
    id: "twilio-shell",
    label: "Twilio CLI terminal",
    command: process.env.SHELL || "bash",
    cwd: ROOT,
    env: twilioCliEnv(),
    exitHint: "type exit to return",
  };
}

/** `twilio login` (interactive prompts). */
export function twilioLoginTarget(): LaunchTarget {
  return {
    id: "twilio-login",
    label: "Twilio login",
    command: "twilio",
    args: ["login"],
    cwd: ROOT,
    exitHint: "finish the prompts to return",
  };
}

// ── Twilio profiles (account switching) ──────────────────────────────
export interface TwilioProfile { id: string; accountSid: string; active: boolean; }

/** List configured Twilio CLI profiles. */
export function listTwilioProfiles(): TwilioProfile[] {
  if (!have("twilio")) return [];
  try {
    const raw = capture("twilio", ["profiles:list", "-o", "json"]);
    const rows: Array<{ id?: string; accountSid?: string; active?: boolean }> = JSON.parse(raw || "[]");
    return rows.map((r) => ({ id: r.id ?? "", accountSid: r.accountSid ?? "", active: Boolean(r.active) }));
  } catch { return []; }
}

/** Switch the active Twilio CLI profile. Returns true on success. */
export function useTwilioProfile(id: string): boolean {
  if (!have("twilio") || !id) return false;
  try {
    // profiles:use is non-interactive — it just flips the active profile.
    const res = spawnSyncOk("twilio", ["profiles:use", id]);
    return res;
  } catch { return false; }
}

function spawnSyncOk(cmd: string, args: string[]): boolean {
  // capture() returns stdout ("" on failure); profiles:use prints a
  // confirmation on success, so treat any non-error return as success by
  // re-reading the active profile.
  capture(cmd, args);
  return listTwilioProfiles().some((p) => p.active && p.id === args[args.length - 1]);
}

/** Stop the background model server + MCP proxy. */
export function stopModelServer(): boolean {
  return killModelServer();
}
