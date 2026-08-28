// lib/webui-config.ts — builds and writes the llama.cpp web UI config.
//
// llamafile's --ui-config-file flag seeds the web UI's default settings at
// server startup (server-side), so the Twilio Docs MCP server and a
// Twilio-aware system message are already configured the first time the
// browser loads the UI — no localStorage injection, no port hijacking.
//
// The MCP server URL points at the local HTTP→HTTPS bridge (mcp-proxy.js),
// not directly at https://mcp.twilio.com/docs, because llamafile 0.10.3 is
// compiled without OpenSSL and its CORS proxy cannot make https:// calls.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { ModelReasoningMode } from "./config.ts";
import {
  MCP_PROXY_URL,
  MODEL_SERVER_BASE_URL,
  WEBUI_CONFIG_FILE,
  WEBUI_STATIC_DIR,
} from "./constants.ts";

const MCP_SERVER_ID = "twilio-docs-mcp";
const WEBUI_BASE_INDEX = join(WEBUI_STATIC_DIR, "index.base.html");
const WEBUI_INDEX = join(WEBUI_STATIC_DIR, "index.html");
const WEBUI_BUNDLE = join(WEBUI_STATIC_DIR, "bundle.js");
const WEBUI_STYLES = join(WEBUI_STATIC_DIR, "bundle.css");
const BOOTSTRAP_START = "<!-- twilioworld-bootstrap:start -->";
const BOOTSTRAP_END = "<!-- twilioworld-bootstrap:end -->";

const BASE_SYSTEM_MESSAGE = [
  "You are a concise Twilio developer assistant running locally.",
  "Do not expose chain-of-thought, hidden reasoning, <think> blocks, or internal deliberation.",
  "Use clear Markdown and fenced code examples when they make the answer easier to use.",
].join(" ");

const DOCS_SYSTEM_MESSAGE = [
  "You have tool calling. The Twilio Docs MCP is connected. For Twilio-specific answers, call twilio__search first. If the search result needs more detail, call twilio__retrieve with the id from the search results. If the user explicitly asks for MCP, call twilio__search.",
  "After a tool call, summarize the result plainly and briefly.",
].join(" ");

/** The web UI config object llamafile seeds via --ui-config-file. */
export function buildWebUiConfig(
  docsEnabled = true,
  reasoning: ModelReasoningMode = "off",
): Record<string, unknown> {
  // mcpServers is a JSON-stringified array inside the config (matches the
  // shape the web UI persists to LlamaUi.config in localStorage).
  const mcpServers = JSON.stringify(docsEnabled ? [
    { id: MCP_SERVER_ID, enabled: true, url: MCP_PROXY_URL, requestTimeoutSeconds: 300 },
  ] : []);

  // The browser UI can add chat-template arguments to each request. Without
  // this explicit value, a previously enabled model default can override the
  // server's --reasoning setting and expose the model's internal preamble as
  // a completed "Reasoning" panel. Keep the request and server controls in
  // agreement; the concrete Low/Medium/High token cap remains server-side.
  const custom = JSON.stringify({
    chat_template_kwargs: { enable_thinking: reasoning !== "off" },
  });

  return {
    systemMessage: docsEnabled ? `${BASE_SYSTEM_MESSAGE} ${DOCS_SYSTEM_MESSAGE}` : BASE_SYSTEM_MESSAGE,
    showSystemMessage: true,
    mcpRequestTimeoutSeconds: 300,
    mcpServers,
    custom,
  };
}

export function browserMcpBootstrap(docsEnabled = true): string {
  const defaults = docsEnabled ? [{ serverId: MCP_SERVER_ID, enabled: true }] : [];
  const action = defaults.length > 0
    ? `localStorage.setItem("LlamaUi.mcpDefaultEnabled", ${JSON.stringify(JSON.stringify(defaults))});`
    : `localStorage.removeItem("LlamaUi.mcpDefaultEnabled");`;
  return [
    BOOTSTRAP_START,
    "<script>",
    "try {",
    `  ${action}`,
    "} catch (_) {}",
    "</script>",
    BOOTSTRAP_END,
  ].join("\n");
}

function stripBootstrap(index: string): string {
  const start = index.indexOf(BOOTSTRAP_START);
  const end = index.indexOf(BOOTSTRAP_END);
  if (start < 0 || end < start) return index;
  return `${index.slice(0, start)}${index.slice(end + BOOTSTRAP_END.length)}`;
}

/** Update the same-origin bootstrap before llama UI starts. This sets only the
 * server's per-conversation enabled default; the UI's tool approval policy is
 * deliberately left untouched. */
export function writeBrowserMcpBootstrap(docsEnabled = true): boolean {
  if (!existsSync(WEBUI_BASE_INDEX)) return false;
  const base = stripBootstrap(readFileSync(WEBUI_BASE_INDEX, "utf8"));
  const marker = "<head>";
  if (!base.includes(marker)) return false;
  const index = base.replace(marker, `${marker}\n${browserMcpBootstrap(docsEnabled)}`);
  writeFileSync(WEBUI_INDEX, index);
  return true;
}

export function webUiStaticAssetsReady(): boolean {
  return [WEBUI_BASE_INDEX, WEBUI_INDEX, WEBUI_BUNDLE, WEBUI_STYLES]
    .every((file) => existsSync(file));
}

async function fetchUiAsset(baseUrl: string, name: string): Promise<string> {
  const url = name ? `${baseUrl}/${name}` : `${baseUrl}/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}: HTTP ${response.status}`);
  const body = await response.text();
  if (!body) throw new Error(`Could not read ${url}: empty response`);
  return body;
}

/** Cache the stock UI assets from the running embedded server, then add a
 * small same-origin bootstrap. Required because llama UI stores MCP activation
 * outside the settings object supported by --ui-config-file. */
export async function prepareBrowserMcpUi(
  docsEnabled = true,
  baseUrl = MODEL_SERVER_BASE_URL,
): Promise<boolean> {
  mkdirSync(WEBUI_STATIC_DIR, { recursive: true });
  const [index, bundle, styles] = await Promise.all([
    fetchUiAsset(baseUrl, ""),
    fetchUiAsset(baseUrl, "bundle.js"),
    fetchUiAsset(baseUrl, "bundle.css"),
  ]);
  if (!index.includes("bundle.js") || bundle.length < 100_000 || styles.length < 10_000) {
    throw new Error("Local chat returned incomplete UI assets");
  }
  writeFileSync(WEBUI_BASE_INDEX, stripBootstrap(index));
  writeFileSync(WEBUI_BUNDLE, bundle);
  writeFileSync(WEBUI_STYLES, styles);
  return writeBrowserMcpBootstrap(docsEnabled);
}

/** Write ui-config.json to WEBUI_CONFIG_FILE. Returns the path. */
export function writeWebUiConfig(
  docsEnabled = true,
  reasoning: ModelReasoningMode = "off",
): string {
  mkdirSync(dirname(WEBUI_CONFIG_FILE), { recursive: true });
  writeFileSync(WEBUI_CONFIG_FILE, JSON.stringify(buildWebUiConfig(docsEnabled, reasoning), null, 2) + "\n");
  return WEBUI_CONFIG_FILE;
}
