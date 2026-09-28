import { expect, test } from "bun:test";
import { createRequire } from "module";
import { join } from "path";
import { ROOT } from "./constants.ts";
import { launchId } from "./configure-agent.ts";

test("launch script ids are filename-safe", () => {
  expect(launchId("GitHub Copilot CLI")).toBe("github-copilot-cli");
  expect(launchId("Claude Code")).toBe("claude-code");
});

test("the MCP bridge only accepts the local chat page as a browser origin", () => {
  const proxy = createRequire(import.meta.url)(join(ROOT, "tools", "mcp-proxy.js"));
  const allowed = proxy.allowedOrigins(8080);
  expect(proxy.corsOrigin(undefined, allowed)).toBeNull();
  expect(proxy.corsOrigin("http://127.0.0.1:8080", allowed)).toBe("http://127.0.0.1:8080");
  expect(proxy.corsOrigin("http://localhost:8080", allowed)).toBe("http://localhost:8080");
  expect(proxy.corsOrigin("https://example.com", allowed)).toBe(false);
  expect(proxy.corsOrigin("http://127.0.0.1:9999", allowed)).toBe(false);
});
