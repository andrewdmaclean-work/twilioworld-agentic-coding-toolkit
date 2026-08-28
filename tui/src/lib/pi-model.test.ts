import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { llamafileReasoningBudget, llamafileReasoningMode } from "./model.ts";
import { writePiModelsConfig } from "./pi.ts";

let tempDir = "";

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

test("local reasoning effort maps to explicit llamafile modes and budgets", () => {
  expect(llamafileReasoningMode("off")).toBe("off");
  expect(llamafileReasoningBudget("off")).toBe("0");
  expect(llamafileReasoningBudget("low")).toBe("256");
  expect(llamafileReasoningBudget("medium")).toBe("1024");
  expect(llamafileReasoningBudget("high")).toBe("2048");
});

test("generated Pi model sends thinking enabled or disabled explicitly", () => {
  tempDir = mkdtempSync(join(tmpdir(), "twilioworld-pi-model-"));
  writePiModelsConfig(tempDir);
  const config = JSON.parse(readFileSync(join(tempDir, "models.json"), "utf8"));
  const provider = config.providers.llamafile;
  const model = provider.models[0];

  expect(model.reasoning).toBe(true);
  expect(provider.compat.supportsReasoningEffort).toBe(false);
  expect(provider.compat.thinkingFormat).toBe("chat-template");
  expect(provider.compat.chatTemplateKwargs.enable_thinking).toEqual({ $var: "thinking.enabled" });
});
