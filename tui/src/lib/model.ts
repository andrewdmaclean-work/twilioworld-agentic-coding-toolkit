// lib/model.ts — local model launch arguments.
// Builds the arg arrays for llamafile. Spawning is done by the caller
// (startDaemon for the local OpenAI-compatible server).

import { existsSync, readFileSync } from "fs";
import { capture } from "./exec.ts";
import { addonEnabled, modelReasoningMode } from "./config.ts";
import { webUiStaticAssetsReady, writeBrowserMcpBootstrap, writeWebUiConfig } from "./webui-config.ts";
import {
  LLAMAFILE_DEST,
  MODEL_SERVER_BASE_URL,
  MODEL_SERVER_LOG,
  MODEL_SERVER_PORT,
  MODEL_SERVER_URL,
  WEBUI_CONFIG_FILE,
  WEBUI_STATIC_DIR,
} from "./constants.ts";
import { getSelectedModel } from "./local-models.ts";
import { statSync } from "fs";
import { fileExecutable } from "./exec.ts";

// Security audit E-11: 4096 was too small — the 56-skill system prompt plus
// tool-call scaffolding filled it within 2-3 turns ("ran out of context
// window"). 16384 gave real headroom, 32768 covered ordinary chat, and 49152
// leaves additional room for API tool schemas and results
// without running out mid-conversation. Override with CTX_SIZE if needed.
// Validated to digits only — a malformed value falls back to the default
// instead of being passed through to the llamafile arg list unchecked.
function validDigits(raw: string | undefined, fallback: string): string {
  return raw && /^[0-9]+$/.test(raw) ? raw : fallback;
}

type LlamafileReasoningMode = "off" | "auto" | "on";

function validReasoning(raw: string | undefined): LlamafileReasoningMode | null {
  if (raw === "off" || raw === "auto" || raw === "on") return raw;
  if (raw === "low") return "auto";
  if (raw === "medium" || raw === "high") return "on";
  return null;
}

export function llamafileReasoningMode(configured = modelReasoningMode()): LlamafileReasoningMode {
  if (configured === "off") return "off";
  return configured === "low" ? "auto" : "on";
}

/** Local models do not expose standardized effort tiers, so translate the
 * toolkit setting into a concrete reasoning-token cap. */
export function llamafileReasoningBudget(configured = modelReasoningMode()): string {
  if (configured === "off") return "0";
  if (configured === "low") return "256";
  if (configured === "medium") return "1024";
  return "2048";
}

export const MODEL_CTX_SIZE = validDigits(process.env.CTX_SIZE, "49152");
const MODEL_REASONING_OVERRIDE = process.env.MODEL_REASONING
  ? validReasoning(process.env.MODEL_REASONING) ?? "off"
  : null;
const PORT = MODEL_SERVER_PORT;

export { LLAMAFILE_DEST };

export function modelReady(): { runtime: boolean; weights: boolean } {
  const runtime = fileExecutable(LLAMAFILE_DEST);
  const model = getSelectedModel();
  let weights = false;
  if (existsSync(model.dest)) {
    try { weights = statSync(model.dest).size >= model.minBytes; } catch { /* ignore */ }
  }
  return { runtime, weights };
}

export function modelRunning(): boolean {
  try {
    // Quick sync check against the API endpoint
    const res = capture("curl", ["-fsS", "--max-time", "1", MODEL_SERVER_URL]);
    return Boolean(res);
  } catch { return false; }
}

export { MODEL_SERVER_LOG };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function modelStartupStatus(): string {
  if (!existsSync(MODEL_SERVER_LOG)) return "starting process";
  try {
    const lines = readFileSync(MODEL_SERVER_LOG, "utf8").split(/\r?\n/).slice(-120);
    const text = lines.join("\n");
    if (/Segmentation fault/.test(text)) return "crashed: segmentation fault";
    if (/failed to initialize|failed to create llama_context|error while trying/.test(text)) return "failed during model initialization";
    if (/server is listening/.test(text)) return "server listening";
    if (/warming up the model/.test(text)) return "warming up model";
    if (/loading model/.test(text)) return "loading model weights";
    if (/binding port/.test(text)) return `binding port ${MODEL_SERVER_PORT}`;
    return "starting process";
  } catch {
    return "reading startup log";
  }
}

export async function waitForModelServer(opts: {
  timeoutSeconds?: number;
  onTick?: (elapsedSeconds: number, status: string) => void;
} = {}): Promise<boolean> {
  const timeoutSeconds = opts.timeoutSeconds ?? 90;
  for (let i = 0; i < timeoutSeconds; i++) {
    if (modelRunning()) return true;
    opts.onTick?.(i + 1, modelStartupStatus());
    await sleep(1000);
  }
  return modelRunning();
}

function baseModelArgs(): string[] {
  const model = getSelectedModel();
  const args = [
    "-m", model.dest,
    "--ctx-size", MODEL_CTX_SIZE,
    "--parallel", "1",
    "--flash-attn", "on",
    "--cache-type-k", "q4_0",
    "--cache-type-v", "q4_0",
    // llamafile supports off/auto/on; Pi receives the exact effort setting.
    // Override per run with MODEL_REASONING=off, auto, or on.
    "--reasoning", MODEL_REASONING_OVERRIDE ?? llamafileReasoningMode(),
    "--reasoning-budget", MODEL_REASONING_OVERRIDE
      ? MODEL_REASONING_OVERRIDE === "off" ? "0" : "-1"
      : llamafileReasoningBudget(),
  ];
  return args;
}

export function modelEndpointLabel(): string {
  return `${MODEL_SERVER_BASE_URL}/v1`;
}

/** Args for `llamafile --server` (background daemon). */
export function serverArgs(): string[] {
  const args = ["--server", ...baseModelArgs(), "--host", "127.0.0.1", "--port", PORT];
  // Always seed the web UI's default settings server-side: Twilio Docs MCP
  // server (via the local HTTP→HTTPS bridge) + a Twilio-aware system
  // message. llamafile's built-in mechanism — no localStorage injection.
  writeWebUiConfig(addonEnabled("docsMcp"), modelReasoningMode());
  args.push("--ui-config-file", WEBUI_CONFIG_FILE);
  writeBrowserMcpBootstrap(addonEnabled("docsMcp"));
  if (webUiStaticAssetsReady()) args.push("--path", WEBUI_STATIC_DIR);
  // CORS proxy for MCP. Upstream warning: "do not enable in untrusted
  // environments." Only binds to 127.0.0.1, so exposure is local-only.
  args.push("--ui-mcp-proxy");
  return args;
}
