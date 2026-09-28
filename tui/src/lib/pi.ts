// lib/pi.ts — Pi preparation.
// Installs Pi capabilities (MCP, models, skills) and starts local AI, then
// returns a LaunchTarget; the handoff screen decides where Pi opens.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { capture, fileExecutable, have, runStreaming, type LogFn } from "./exec.ts";
import { startDaemon } from "./daemons.ts";
import type { LaunchTarget } from "./terminal.ts";
import { addonEnabled, modelReasoningMode, thinkingVisible } from "./config.ts";
import { writePiDisplaySettings } from "./pi-settings.ts";
import {
  LLAMAFILE_DEST,
  MODEL_SERVER_BASE_URL,
  MODEL_SERVER_LOG,
  MODEL_SERVER_PID,
  MODEL_SERVER_PORT,
  MODEL_SERVER_URL,
  PI_AGENT_DIR,
  PI_MODELS_JSON,
  PI_ROUTING_PROMPT,
  ROOT,
  SKILLS_DIR,
} from "./constants.ts";
import { getSelectedModel } from "./local-models.ts";
import { writePiMcpConfig } from "./pi-mcp.ts";
import { modelStartupStatus, serverArgs, waitForModelServer } from "./model.ts";
import { statSync } from "fs";
import { pathNodeVersion, supportsPiNode } from "./node-version.ts";
import { installTwilioSkills } from "./skills.ts";

function localModelReady(): boolean {
  const model = getSelectedModel();
  if (!existsSync(model.dest)) return false;
  try { if (statSync(model.dest).size < model.minBytes) return false; } catch { return false; }
  return fileExecutable(LLAMAFILE_DEST);
}

export function localModelAvailable(): boolean {
  return localModelReady();
}

export function nodeSupportsPi(): boolean {
  return supportsPiNode(pathNodeVersion());
}

export function piNodeVersionLabel(): string {
  return pathNodeVersion()?.raw ?? "not found";
}

export function isModelServerRunning(): boolean {
  try { return Boolean(capture("curl", ["-fsS", MODEL_SERVER_URL])); } catch { return false; }
}

export function writePiModelsConfig(piDir: string): void {
  const raw = readFileSync(PI_MODELS_JSON, "utf8");
  const config = JSON.parse(raw) as {
    providers?: Record<string, { baseUrl?: string } & Record<string, unknown>>;
  };
  const model = getSelectedModel();
  const providers = config.providers ?? {};
  const llamafile = providers.llamafile ?? {};
  llamafile.baseUrl = `${MODEL_SERVER_BASE_URL}/v1`;
  llamafile.models = [{
    id: model.slug,
    name: `${model.name} (local)`,
    reasoning: true,
    input: model.slug === "gemma4-e2b" ? ["text", "image"] : ["text"],
    contextWindow: 49152,
    maxTokens: 4096,
  }];
  providers.llamafile = llamafile;
  config.providers = providers;
  writeFileSync(join(piDir, "models.json"), `${JSON.stringify(config, null, 2)}\n`);
}

export type PiReadiness =
  | { ok: false; reason: string }
  | { ok: true };

export function checkPiReadiness(): PiReadiness {
  if (!localModelAvailable()) return { ok: false, reason: "Local AI is not installed. Open Local chat to choose and download a model." };
  if (!nodeSupportsPi()) return { ok: false, reason: `Pi requires project-local Node >= 22.19.0 — node is ${piNodeVersionLabel()}. Re-run ./toolkit to repair .toolkit/toolchains/node-v22.` };
  if (!have("pi")) return { ok: false, reason: "Pi is not installed. Open Local chat → Pi to install it." };
  return { ok: true };
}

/** Install Pi capabilities and start local AI, then return a launch target
 *  for the handoff screen (null on failure — the reason is logged). */
export async function preparePi(opts: { onLog: LogFn }): Promise<LaunchTarget | null> {
  const { onLog } = opts;
  const readiness = checkPiReadiness();
  if (!readiness.ok) {
    onLog(`✗ ${readiness.reason}`, "stderr");
    return null;
  }

  const piDir = PI_AGENT_DIR;
  mkdirSync(piDir, { recursive: true });

  // Model config
  if (localModelAvailable() && existsSync(PI_MODELS_JSON)) {
    writePiModelsConfig(piDir);
  }

  // Docs MCP adapter + config.
  const docsEnabled = addonEnabled("docsMcp");
  if (docsEnabled) {
    await runStreaming("pi", ["install", "npm:pi-mcp-adapter"], {
      cwd: ROOT,
      env: { ...process.env, PI_CODING_AGENT_DIR: piDir },
      onLog,
    });
  }
  writePiMcpConfig(piDir, docsEnabled);

  // Skills — copy only when enabled; remove a stale managed copy when disabled.
  const piSkillsDir = join(piDir, "skills");
  if (addonEnabled("twilioSkills") && existsSync(SKILLS_DIR)) {
    try {
      installTwilioSkills(piSkillsDir, true);
    } catch (error) {
      onLog(`✗ Could not install Twilio Skills for Pi: ${(error as Error).message}`, "stderr");
      return null;
    }
  } else if (existsSync(piSkillsDir)) {
    rmSync(piSkillsDir, { recursive: true, force: true });
  }

  // Ensure model server is running
  if (!isModelServerRunning()) {
    onLog(`▶ Starting local AI service (${modelStartupStatus()})…`, "stdout");
    startDaemon(LLAMAFILE_DEST, serverArgs(), { cwd: ROOT, logFile: MODEL_SERVER_LOG, pidFile: MODEL_SERVER_PID });
    const ready = await waitForModelServer({
      timeoutSeconds: 90,
      onTick: (elapsed, status) => {
        if (elapsed === 1 || elapsed % 10 === 0) {
          onLog(`  Loading local AI… ${elapsed}s elapsed (${status})`, "stdout");
        }
      },
    });
    if (!ready) {
      onLog(`✗ Local AI did not respond after 90s. Logs: ${MODEL_SERVER_LOG}`, "stderr");
      return null;
    } else {
      onLog(`✓ Local AI ready on :${MODEL_SERVER_PORT}`, "stdout");
    }
  }

  const selectedModel = getSelectedModel();
  const reasoningMode = modelReasoningMode();
  const thinking = reasoningMode;
  writePiDisplaySettings(piDir, thinkingVisible(), reasoningMode);
  const managedRoutingPrompt = join(piDir, "routing-prompt.md");
  writeFileSync(managedRoutingPrompt, readFileSync(PI_ROUTING_PROMPT, "utf8"));
  const piArgs = [
    "--provider", "llamafile",
    "--model", selectedModel.slug,
    "--thinking", thinking,
    "--no-skills",
  ];
  if (docsEnabled) piArgs.push("--append-system-prompt", managedRoutingPrompt);
  if (existsSync(piSkillsDir)) {
    piArgs.push("--skill", piSkillsDir);
  }

  onLog("✓ Pi is ready", "stdout");
  return {
    id: "pi",
    label: "Pi",
    command: "pi",
    args: piArgs,
    cwd: ROOT,
    env: { PI_CODING_AGENT_DIR: piDir },
    hint: "small local models work best with a focused tool set; switch to a cloud /model inside Pi for heavier work.",
  };
}
