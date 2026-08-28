// lib/constants.ts — pinned versions, URLs, and shared paths.

import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

function validPort(raw: string | undefined, fallback: string): string {
  return raw && /^[0-9]+$/.test(raw) ? raw : fallback;
}

const TUI_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // tui/
export const ROOT = dirname(TUI_DIR); // repo root

// ── Pinned versions ─────────────────────────────────────────────────
export const LLAMAFILE_VERSION = "0.10.3";
export const DOCS_MCP_URL = "https://mcp.twilio.com/docs";

// Security audit L-1: this was previously installed unversioned
// (`npm install -g @earendil-works/pi-coding-agent`), exposing Setup to
// unannounced upstream breaking changes or a compromised "latest" tag.
// Pinned to a version confirmed to work with this toolkit's Pi wiring.
export const PI_AGENT_PKG = "@earendil-works/pi-coding-agent@0.80.3";

// llamafile ships as a cosmopolitan/APE binary; setup.ts checks the "MZ"
// magic bytes structurally and setup verifies this digest before chmod +x.
// The Windows artifact is distinct and is not currently distributed by this
// Bash-based toolkit, so only the supported macOS/Linux artifact is pinned.
export const LLAMAFILE_SHA256 = "e6d4041a82ca37cee15aab62e6826d7a61c6a3ea83bca68387958970df250883";

// ── Paths ────────────────────────────────────────────────────────────
export const CONFIG_DIR = join(ROOT, ".toolkit");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const DEFAULT_CONFIG_FILE = join(ROOT, "toolkit.defaults.json");
export const LEGACY_DEFAULT_CONFIG_FILE = join(CONFIG_DIR, "defaults.json");
export const TOOLCHAINS_DIR = join(CONFIG_DIR, "toolchains");
export const BUN_INSTALL_DIR = join(TOOLCHAINS_DIR, "bun");
export const BUN_BIN_DIR = join(BUN_INSTALL_DIR, "bin");
export const NODE_INSTALL_DIR = join(TOOLCHAINS_DIR, "node-v22");
export const NODE_BIN_DIR = join(NODE_INSTALL_DIR, "bin");
export const NPM_GLOBAL_PREFIX = join(CONFIG_DIR, "npm-global");
export const NPM_GLOBAL_BIN_DIR = join(NPM_GLOBAL_PREFIX, "bin");
export const TWILIO_CLI_HOME = join(CONFIG_DIR, "twilio-cli-home");
export const TOOLKIT_BIN_DIRS = [NPM_GLOBAL_BIN_DIR, BUN_BIN_DIR, NODE_BIN_DIR];

export const PI_AGENT_DIR = join(CONFIG_DIR, "pi-agent");
export const PI_MODELS_JSON = join(TUI_DIR, "assets", "pi", "models.json");
export const PI_ROUTING_PROMPT = join(TUI_DIR, "assets", "pi", "routing-prompt.md");

export const MODELS_DIR = join(ROOT, "models");
export const TOOLS_DIR = join(ROOT, "tools");
export const LLAMAFILE_SIZE_LABEL = "302MB";
export const LLAMAFILE_SIZE_BYTES = 302_000_000;

export const SKILLS_DIR = join(ROOT, "vendor", "twilio-ai", "skills");

// ── OS-specific llamafile ────────────────────────────────────────────
const isWindows = process.platform === "win32";
export const LLAMAFILE_URL = isWindows
  ? `https://github.com/mozilla-ai/llamafile/releases/download/${LLAMAFILE_VERSION}/llamafile-${LLAMAFILE_VERSION}.exe`
  : `https://github.com/mozilla-ai/llamafile/releases/download/${LLAMAFILE_VERSION}/llamafile-${LLAMAFILE_VERSION}`;
export const LLAMAFILE_DEST = join(TOOLS_DIR, isWindows ? "llamafile.exe" : "llamafile");

export const MODEL_SERVER_PORT = validPort(process.env.MODEL_SERVER_PORT ?? process.env.PORT, "8080");
export const MODEL_SERVER_BASE_URL = `http://127.0.0.1:${MODEL_SERVER_PORT}`;
export const MODEL_SERVER_URL = `${MODEL_SERVER_BASE_URL}/v1/models`;
export const MODEL_SERVER_LOG = join(MODELS_DIR, "pi-server.log");
export const MODEL_SERVER_PID = join(CONFIG_DIR, "model-server.pid");

// ── MCP proxy bridge ─────────────────────────────────────────────────
// llamafile 0.10.3 is compiled without CPPHTTPLIB_OPENSSL_SUPPORT so its
// /cors-proxy cannot reach https:// endpoints. tools/mcp-proxy.js is a
// tiny Node.js HTTP→HTTPS bridge that the web UI points at instead.
export const MCP_PROXY_PORT   = 18080;
export const MCP_PROXY_URL    = `http://127.0.0.1:${MCP_PROXY_PORT}/`;
export const MCP_PROXY_SCRIPT = join(TOOLS_DIR, "mcp-proxy.js");
export const MCP_PROXY_PID    = join(CONFIG_DIR, "mcp-proxy.pid");

// ── Web UI config ─────────────────────────────────────────────────────
// llamafile's --ui-config-file seeds the web UI's default settings at
// server startup (system message + MCP servers), server-side — no browser
// localStorage gymnastics needed. We write ui-config.json here and pass it.
export const WEBUI_DIR         = join(CONFIG_DIR, "webui");
export const WEBUI_CONFIG_FILE = join(WEBUI_DIR, "ui-config.json");
export const WEBUI_STATIC_DIR  = join(WEBUI_DIR, "static");
