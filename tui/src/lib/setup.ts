// lib/setup.ts — Twilio Skills source + Check & repair.
//
// There is no up-front install step any more: local chat, Pi, Dev Phone, and
// the Twilio CLI install when first chosen, each behind its own review. This
// module keeps the two jobs that are not tied to one feature:
//
//   ensureSkillsSource()  fetch the Twilio Skills submodule if it is missing
//   runRepair()           check everything the toolkit manages, fix what is
//                         safe to fix automatically, and say plainly what's left

import { existsSync, readdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { capture, have, runStreaming, type LogFn } from "./exec.ts";
import { MCP_PROXY_SCRIPT, MCP_PROXY_PID, MODEL_SERVER_PID, LLAMAFILE_DEST, LLAMAFILE_SHA256, ROOT, SKILLS_DIR, DOCS_MCP_URL } from "./constants.ts";
import { digestMatches } from "./model-install.ts";
import { LOCAL_MODELS, getSelectedModel } from "./local-models.ts";
import { installTwilioSkills } from "./skills.ts";
import { pidFileAlive } from "./daemons.ts";

function ok(msg: string, onLog: LogFn) { onLog(`✓ ${msg}`, "stdout"); }
function warn(msg: string, onLog: LogFn) { onLog(`⚠  ${msg}`, "stderr"); }
function err(msg: string, onLog: LogFn) { onLog(`✗ ${msg}`, "stderr"); }
function say(msg: string, onLog: LogFn) { onLog(msg, "stdout"); }
function step(msg: string, onLog: LogFn) { onLog(`\n▶ ${msg}`, "stdout"); }

export const AGENT_SKILLS_DIR = join(homedir(), ".agents", "skills");

export function skillsSourceReady(): boolean {
  return existsSync(join(SKILLS_DIR, "README.md"));
}

function skillCount(): number {
  const out = capture("find", [SKILLS_DIR, "-name", "SKILL.md"]);
  return out.split("\n").filter(Boolean).length;
}

/** Fetch the Twilio Skills submodule when a clone skipped --recursive. */
export async function ensureSkillsSource(opts: { onLog: LogFn; onDone?: (ok: boolean) => void }): Promise<boolean> {
  const { onLog, onDone } = opts;
  if (skillsSourceReady()) {
    ok(`${skillCount()} Twilio Skills available`, onLog);
    onDone?.(true);
    return true;
  }
  say("   Downloading Twilio Skills (git submodule)…", onLog);
  if (!have("git")) {
    err("git is required to download Twilio Skills. Install git, then retry.", onLog);
    onDone?.(false);
    return false;
  }
  const res = await runStreaming("git", ["submodule", "update", "--init", "--recursive"], { cwd: ROOT, onLog });
  const ready = res.ok && skillsSourceReady();
  if (ready) ok(`${skillCount()} Twilio Skills downloaded`, onLog);
  else err("Could not download Twilio Skills. Check your network, then retry.", onLog);
  onDone?.(ready);
  return ready;
}

function agentSkillsInstalled(): boolean {
  try { return readdirSync(AGENT_SKILLS_DIR).some((name) => name === "twilio" || name === "sendgrid"); }
  catch { return false; }
}

/** Check & repair. Fixes only what is safe without asking (missing Skills,
 *  outdated Skills copies, stale PID files). Anything that would delete user
 *  data, like a model that fails its checksum, is reported with the next step. */
export async function runRepair(opts: { onLog: LogFn; onDone: (ok: boolean) => void }): Promise<void> {
  const { onLog, onDone } = opts;
  let repaired = 0;
  let attention = 0;

  step("[1/3] Twilio knowledge", onLog);
  const hadSkills = skillsSourceReady();
  if (!await ensureSkillsSource({ onLog })) {
    attention++;
  } else {
    if (!hadSkills) repaired++;
    if (agentSkillsInstalled()) {
      try {
        installTwilioSkills(AGENT_SKILLS_DIR);
        ok(`Coding-agent Skills refreshed in ${AGENT_SKILLS_DIR.replace(homedir(), "~")}`, onLog);
      } catch (error) {
        err(`Could not refresh Skills in ${AGENT_SKILLS_DIR}: ${(error as Error).message}`, onLog);
        attention++;
      }
    } else {
      say(`   Coding-agent Skills are added to ${AGENT_SKILLS_DIR.replace(homedir(), "~")} when you set up an agent.`, onLog);
    }
  }
  // Any HTTP response counts as reachable; curl reports 000 when nothing answered.
  const docsStatus = capture("curl", ["-sI", "--max-time", "8", "-o", "/dev/null", "-w", "%{http_code}", DOCS_MCP_URL]);
  if (/^[1-5]\d\d$/.test(docsStatus)) ok(`Live Docs reachable (${DOCS_MCP_URL})`, onLog);
  else { warn(`Live Docs not reachable right now (${DOCS_MCP_URL}). Agents will retry; check your network.`, onLog); attention++; }

  step("[2/3] Local AI", onLog);
  if (!existsSync(LLAMAFILE_DEST)) {
    say("   Not installed. It installs from Local chat when you first open it.", onLog);
  } else {
    say("   Verifying llamafile runtime checksum…", onLog);
    if (await digestMatches(LLAMAFILE_DEST, LLAMAFILE_SHA256)) ok("llamafile runtime verified", onLog);
    else { err("llamafile runtime failed its checksum. Remove local AI from Local chat → Local AI settings, then open Local chat again.", onLog); attention++; }

    const installed = LOCAL_MODELS.filter((m) => existsSync(m.dest));
    if (!installed.length) say("   No model downloaded yet. Choose one when you open Local chat.", onLog);
    for (const model of installed) {
      say(`   Verifying ${model.name} checksum (a few seconds)…`, onLog);
      if (await digestMatches(model.dest, model.sha256)) ok(`${model.name} verified${model.slug === getSelectedModel().slug ? " (selected)" : ""}`, onLog);
      else { err(`${model.name} failed its checksum. Remove it from Local chat → Local AI settings, then download it again.`, onLog); attention++; }
    }
  }
  for (const [pidFile, expected, label] of [
    [MODEL_SERVER_PID, LLAMAFILE_DEST, "local AI"],
    [MCP_PROXY_PID, MCP_PROXY_SCRIPT, "Docs bridge"],
  ] as const) {
    if (existsSync(pidFile) && !pidFileAlive(pidFile, [expected])) {
      rmSync(pidFile, { force: true });
      ok(`Cleared a stale ${label} process record`, onLog);
      repaired++;
    }
  }
  if (pidFileAlive(MODEL_SERVER_PID, [LLAMAFILE_DEST])) ok("Local AI is running", onLog);

  step("[3/3] Tools", onLog);
  const version = (bin: string, args = ["--version"]) => capture(bin, args).split("\n")[0];
  if (have("pi")) ok(`Pi ${version("pi")}`, onLog);
  else say("   Pi: not installed. It installs when you open Pi from Local chat.", onLog);
  if (have("twilio")) {
    ok(`Twilio CLI ${version("twilio").replace(/^twilio-cli\//, "")}`, onLog);
    if (capture("twilio", ["plugins"]).includes("plugin-dev-phone")) ok("Dev Phone plugin installed", onLog);
    else say("   Dev Phone: not installed. It installs when you open Dev Phone.", onLog);
  } else {
    say("   Twilio CLI: not installed. It installs when you open the Twilio CLI or Dev Phone.", onLog);
  }

  say("", onLog);
  const summary = [
    repaired ? `${repaired} repaired` : "",
    attention ? `${attention} need${attention === 1 ? "s" : ""} attention (see above)` : "",
  ].filter(Boolean).join(", ");
  if (attention) warn(`Check complete — ${summary}.`, onLog);
  else ok(`Check complete — ${summary || "everything looks good"}.`, onLog);
  onDone(attention === 0);
}
