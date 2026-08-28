// lib/pi-mcp.ts — shared helper for writing Pi MCP config.
// Used by configure-agent.ts and pi.ts.
//
// Docs MCP is the toolkit's only MCP integration. It is remote, read-only,
// and does not require a Twilio account or credentials.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DOCS_MCP_URL } from "./constants.ts";

export function writePiMcpConfig(piDir: string, docsEnabled = true): void {
  const servers: Record<string, unknown> = {};
  if (docsEnabled) {
    servers["twilio-docs"] = {
      type: "http",
      url: DOCS_MCP_URL,
      lifecycle: "eager",
      // Docs has only two small tools. Direct exposure is more reliable for
      // local models than asking them to route exact names through a proxy.
      directTools: ["twilio__search", "twilio__retrieve"],
    };
  }
  mkdirSync(piDir, { recursive: true });
  const dest = join(piDir, "mcp.json");
  writeFileSync(dest, JSON.stringify({
    settings: {
      toolPrefix: "none",
      disableProxyTool: docsEnabled,
      // Local models should call the two Docs tools directly. The adapter's
      // JavaScript mcpScript tool invites models to invent invalid call syntax.
      scriptMode: false,
      strictDirectToolArguments: true,
    },
    mcpServers: servers,
  }, null, 2) + "\n");
  try { chmodSync(dest, 0o600); } catch { /* best-effort */ }

  // The adapter retains tool metadata between sessions. Remove metadata for
  // servers no longer configured so deleted integrations cannot linger in Pi.
  const cachePath = join(piDir, "mcp-cache.json");
  if (existsSync(cachePath)) {
    try {
      const cache = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cache && typeof cache === "object" && cache.servers && typeof cache.servers === "object") {
        cache.servers = Object.fromEntries(
          Object.entries(cache.servers).filter(([name]) => Object.hasOwn(servers, name)),
        );
        writeFileSync(cachePath, JSON.stringify(cache) + "\n");
        try { chmodSync(cachePath, 0o600); } catch { /* best-effort */ }
      }
    } catch { /* adapter will rebuild an invalid cache */ }
  }
}
