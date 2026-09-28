import { expect, test } from "bun:test";
import { copilotVersionIsReal, mergeCursorMcp, mergeOpencodeGlobal } from "./agent-wiring.ts";

const URL = "https://mcp.twilio.com/docs";

test("the VS Code Copilot stub is not mistaken for the Copilot CLI", () => {
  expect(copilotVersionIsReal("Cannot find GitHub Copilot CLI (https://docs.github.com/...)\nInstall GitHub Copilot CLI? ['y/N']")).toBe(false);
  expect(copilotVersionIsReal("")).toBe(false);
  expect(copilotVersionIsReal("GitHub Copilot CLI 1.2.3")).toBe(true);
});

test("Cursor merge adds twilio-docs and keeps other servers", () => {
  const existing = JSON.stringify({ mcpServers: { other: { command: "x" } } });
  const result = mergeCursorMcp(existing, URL);
  if ("error" in result) throw new Error(result.error);
  expect(result.changed).toBe(true);
  expect(JSON.parse(result.content).mcpServers).toEqual({ other: { command: "x" }, "twilio-docs": { url: URL } });
});

test("Cursor merge is a no-op when already configured, and creates a new file", () => {
  const configured = JSON.stringify({ mcpServers: { "twilio-docs": { url: URL } } });
  expect(mergeCursorMcp(configured, URL)).toEqual({ content: configured, changed: false });
  const fresh = mergeCursorMcp(null, URL);
  if ("error" in fresh) throw new Error(fresh.error);
  expect(JSON.parse(fresh.content)).toEqual({ mcpServers: { "twilio-docs": { url: URL } } });
});

test("config files that aren't plain JSON are never rewritten", () => {
  expect("error" in mergeCursorMcp("{ // comment\n}", URL)).toBe(true);
  expect("error" in mergeOpencodeGlobal("[1,2]", URL)).toBe(true);
});

test("OpenCode merge adds a remote twilio-docs server and keeps other settings", () => {
  const existing = JSON.stringify({ theme: "dark", mcp: { mine: { type: "local", command: ["x"] } } });
  const result = mergeOpencodeGlobal(existing, URL);
  if ("error" in result) throw new Error(result.error);
  const parsed = JSON.parse(result.content);
  expect(parsed.theme).toBe("dark");
  expect(parsed.mcp.mine).toEqual({ type: "local", command: ["x"] });
  expect(parsed.mcp["twilio-docs"]).toEqual({ type: "remote", url: URL, enabled: true });
});

test("a disabled OpenCode twilio-docs entry is re-enabled", () => {
  const result = mergeOpencodeGlobal(JSON.stringify({ mcp: { "twilio-docs": { type: "remote", url: URL, enabled: false } } }), URL);
  if ("error" in result) throw new Error(result.error);
  expect(result.changed).toBe(true);
});
