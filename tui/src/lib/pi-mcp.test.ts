import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writePiMcpConfig } from "./pi-mcp.ts";
import { PI_ROUTING_PROMPT } from "./constants.ts";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

test("Pi MCP config contains only read-only Docs MCP", () => {
  dir = mkdtempSync(join(tmpdir(), "twilioworld-pi-mcp-"));
  writePiMcpConfig(dir, true);
  const path = join(dir, "mcp.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  expect(Object.keys(config.mcpServers)).toEqual(["twilio-docs"]);
  expect(config.mcpServers["twilio-docs"].url).toBe("https://mcp.twilio.com/docs");
  expect(config.mcpServers["twilio-docs"].directTools).toEqual(["twilio__search", "twilio__retrieve"]);
  expect(config.settings.disableProxyTool).toBe(true);
  expect(config.settings.scriptMode).toBe(false);
  expect(config.settings.strictDirectToolArguments).toBe(true);
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

test("Pi MCP config can explicitly disable Docs MCP", () => {
  dir = mkdtempSync(join(tmpdir(), "twilioworld-pi-mcp-"));
  writePiMcpConfig(dir, false);
  const config = JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8"));
  expect(config.mcpServers).toEqual({});
  expect(config.settings.disableProxyTool).toBe(false);
  expect(config.settings.scriptMode).toBe(false);
});

test("Pi MCP config removes cached metadata for deleted servers", () => {
  dir = mkdtempSync(join(tmpdir(), "twilioworld-pi-mcp-"));
  const cachePath = join(dir, "mcp-cache.json");
  writeFileSync(cachePath, JSON.stringify({
    version: 1,
    servers: {
      "twilio-docs": { tools: [{ name: "twilio__search" }] },
      "twilio-execute": { tools: [{ name: "dangerous-old-tool" }] },
    },
  }));
  writePiMcpConfig(dir, true);
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  expect(Object.keys(cache.servers)).toEqual(["twilio-docs"]);
  expect(statSync(cachePath).mode & 0o777).toBe(0o600);
});

test("Pi routing uses exact direct Docs tool names and no account execution", () => {
  const prompt = readFileSync(PI_ROUTING_PROMPT, "utf8");
  expect(prompt).toContain("direct tool named exactly `twilio__search`");
  expect(prompt).toContain("Twilio Flex overview");
  expect(prompt).not.toContain("twilio-execute");
});
