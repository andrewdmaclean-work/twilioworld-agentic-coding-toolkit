import { expect, test } from "bun:test";
import { selectedAgentCapabilities } from "./configure-agent.ts";
import { browserMcpBootstrap, buildWebUiConfig } from "./webui-config.ts";

test("agent configuration honors enabled knowledge capabilities", () => {
  expect(selectedAgentCapabilities({ twilioSkills: true, docsMcp: false })).toEqual({
    skills: true,
    docs: false,
  });
  expect(selectedAgentCapabilities({ twilioSkills: false, docsMcp: true })).toEqual({
    skills: false,
    docs: true,
  });
});

test("browser chat includes Docs only when enabled", () => {
  const enabled = buildWebUiConfig(true);
  const disabled = buildWebUiConfig(false);
  expect(JSON.parse(String(enabled.mcpServers))).toHaveLength(1);
  expect(String(enabled.systemMessage)).toContain("Twilio Docs MCP is connected");
  expect(JSON.parse(String(disabled.mcpServers))).toEqual([]);
  expect(String(disabled.systemMessage)).not.toContain("Twilio Docs MCP is connected");
});

test("browser chat enforces the selected reasoning action", () => {
  const off = JSON.parse(String(buildWebUiConfig(true, "off").custom));
  const low = JSON.parse(String(buildWebUiConfig(true, "low").custom));
  const high = JSON.parse(String(buildWebUiConfig(true, "high").custom));

  expect(off.chat_template_kwargs.enable_thinking).toBe(false);
  expect(low.chat_template_kwargs.enable_thinking).toBe(true);
  expect(high.chat_template_kwargs.enable_thinking).toBe(true);
});

test("browser chat activates Docs for new conversations without bypassing approval", () => {
  const enabled = browserMcpBootstrap(true);
  const disabled = browserMcpBootstrap(false);
  expect(enabled).toContain("LlamaUi.mcpDefaultEnabled");
  expect(enabled).toContain('serverId\\\":\\\"twilio-docs-mcp');
  expect(enabled).not.toContain("alwaysAllowedTools");
  expect(disabled).toContain("removeItem");
});
