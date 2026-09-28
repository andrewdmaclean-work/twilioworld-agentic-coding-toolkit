// status.ts — compute live toolkit status natively in TypeScript.
// Uses the same lib modules the rest of the TUI uses so nothing can drift.
//
// IMPORTANT: every subprocess check here (twilio CLI, opencode, pi, curl,
// node --version) runs via the *Async primitives in exec.ts, and independent
// checks run concurrently with Promise.all. The Twilio CLI alone takes ~1s
// to boot per invocation (oclif startup cost) and we call it twice; done
// synchronously and sequentially that's ~2.7s of the whole TUI (rendering,
// keypresses, any in-flight chat fetch) being completely frozen on every
// 30s poll. Async + parallel keeps the event loop free the whole time, so
// nothing freezes even though the status update itself still takes ~1s.

import { existsSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { captureAsync, fileExecutable, haveAsync } from "./lib/exec.ts";
import { copilotVersionIsReal } from "./lib/agent-wiring.ts";
import { readConfig } from "./lib/config.ts";
import {
  LLAMAFILE_DEST,
  MODEL_SERVER_URL,
  ROOT,
  SKILLS_DIR,
} from "./lib/constants.ts";
import { getSelectedModel } from "./lib/local-models.ts";
import { pathNodeVersionAsync, supportsPiNode } from "./lib/node-version.ts";

export { ROOT };

export interface ToolkitStatus {
  twilio:   { installed: boolean; profile: string; sid: string };
  skills:   { count: number; installedCount: number };
  model:    { fileReady: boolean; runtimeReady: boolean; ready: boolean; running: boolean };
  devPhone: { installed: boolean };
  opencode: { installed: boolean; version: string };
  pi:       { installed: boolean };
  agents:   { installedCount: number };
  node:     { version: string; supportsPi: boolean };
  addons:   Record<string, boolean>;
}

const STATUS_CACHE_MS = 10_000;
let cachedStatus: ToolkitStatus | null = null;
let cachedAt = 0;
let statusInFlight: Promise<ToolkitStatus> | null = null;

export function invalidateStatusCache(): void {
  cachedAt = 0;
}

function ggufReady(): boolean {
  const model = getSelectedModel();
  if (!existsSync(model.dest)) return false;
  try { return statSync(model.dest).size >= model.minBytes; } catch { return false; }
}

function countSkills(dir: string): number {
  let n = 0;
  if (!existsSync(dir)) return 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) n += countSkills(join(dir, entry.name));
      else if (entry.name === "SKILL.md") n++;
    }
  } catch { /* ignore */ }
  return n;
}

/** Fully async, fully parallel status read. Nothing here blocks the main
 *  thread — every subprocess check is spawned concurrently and awaited
 *  together, so OpenTUI keeps rendering/handling input the whole time. */
async function computeStatus(): Promise<ToolkitStatus> {
  // fs-only checks are cheap and synchronous is fine for them.
  const fileReady = ggufReady();
  const runtimeReady = fileExecutable(LLAMAFILE_DEST);
  const skillCount = countSkills(SKILLS_DIR);
  const installedSkillCount =
    countSkills(join(homedir(), ".agents", "skills", "twilio")) +
    countSkills(join(homedir(), ".agents", "skills", "sendgrid"));
  const cfg = readConfig();

  // Round 1: independent existence/version checks, all in flight together.
  const [twilioInstalled, opencodeInstalled, piInstalled, claudeInstalled, codexInstalled, cursorInstalled, copilotInstalled, nodeInfo, modelPing] = await Promise.all([
    haveAsync("twilio"),
    haveAsync("opencode"),
    haveAsync("pi"),
    haveAsync("claude"),
    haveAsync("codex"),
    haveAsync("cursor-agent"),
    haveAsync("copilot").then(async (found) => found && copilotVersionIsReal(await captureAsync("copilot", ["--version"]))),
    pathNodeVersionAsync(),
    (fileReady && runtimeReady) ? captureAsync("curl", ["-fsS", MODEL_SERVER_URL]) : Promise.resolve(""),
  ]);

  // Round 2: calls that depend on round 1's installed-checks — the two
  // most expensive calls (twilio profiles:list, twilio plugins) run
  // concurrently with each other instead of back-to-back.
  const [profilesRaw, pluginsRaw, opencodeVersionRaw] = await Promise.all([
    twilioInstalled ? captureAsync("twilio", ["profiles:list", "-o", "json"]) : Promise.resolve(""),
    twilioInstalled ? captureAsync("twilio", ["plugins"]) : Promise.resolve(""),
    opencodeInstalled ? captureAsync("opencode", ["--version"]) : Promise.resolve(""),
  ]);

  let profile = "";
  let sid = "";
  try {
    const profiles: Array<{ id: string; accountSid: string; active?: boolean }> = JSON.parse(profilesRaw || "[]");
    const active = profiles.find((p) => p.active) ?? profiles[0];
    if (active) { profile = active.id ?? ""; sid = active.accountSid ?? ""; }
  } catch { /* ignore */ }

  const running = Boolean(modelPing);
  const supportsPi = supportsPiNode(nodeInfo);
  const installedCount = [opencodeInstalled, piInstalled, claudeInstalled, codexInstalled, cursorInstalled, copilotInstalled].filter(Boolean).length;

  return {
    twilio:   { installed: twilioInstalled, profile, sid },
    skills:   { count: skillCount, installedCount: installedSkillCount },
    model:    { fileReady, runtimeReady, ready: fileReady && runtimeReady, running },
    devPhone: { installed: pluginsRaw.includes("plugin-dev-phone") },
    opencode: { installed: opencodeInstalled, version: opencodeVersionRaw.split("\n")[0] },
    pi:       { installed: piInstalled },
    agents:   { installedCount },
    node:     { version: nodeInfo?.raw ?? "not found", supportsPi },
    addons:   cfg.addons as Record<string, boolean>,
  };
}

export async function readStatusAsync(opts: { fresh?: boolean } = {}): Promise<ToolkitStatus> {
  const now = Date.now();
  if (!opts.fresh && cachedStatus && now - cachedAt < STATUS_CACHE_MS) return cachedStatus;
  if (!opts.fresh && statusInFlight) return statusInFlight;

  statusInFlight = computeStatus().then((status) => {
    cachedStatus = status;
    cachedAt = Date.now();
    return status;
  }).finally(() => {
    statusInFlight = null;
  });
  return statusInFlight;
}
