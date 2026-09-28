import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { ROOT } from "./constants.ts";
import { launchId, opencodeOverride } from "./configure-agent.ts";

const committed = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8"));

test("default choices need no OpenCode override", () => {
  expect(opencodeOverride(committed, true, { slug: "gemma4-e2b", name: "Gemma 4 E2B" })).toBeNull();
});

test("disabling Docs is passed to OpenCode at launch", () => {
  const override = opencodeOverride(committed, false, { slug: "gemma4-e2b", name: "Gemma 4 E2B" });
  expect(override?.mcp).toEqual({ "twilio-docs": { enabled: false } });
  expect(override?.provider).toBeUndefined();
});

test("choosing Phi-4-mini points OpenCode's local provider at it", () => {
  const override = opencodeOverride(committed, true, { slug: "phi4-mini", name: "Phi-4-mini" }, 32768) as {
    provider: { llamafile: { models: Record<string, { limit: { context: number } }> } };
  };
  expect(override.provider.llamafile.models["phi4-mini"].limit.context).toBe(32768);
});

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
