import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writePiDisplaySettings } from "./pi-settings.ts";

let tempDir = "";

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

test("Pi thinking visibility and effort remain independent", () => {
  tempDir = mkdtempSync(join(tmpdir(), "twilioworld-pi-settings-"));
  writeFileSync(join(tempDir, "settings.json"), JSON.stringify({ theme: "light", packages: ["example"] }));

  writePiDisplaySettings(tempDir, false, "high");
  const settings = JSON.parse(readFileSync(join(tempDir, "settings.json"), "utf8"));

  expect(settings.hideThinkingBlock).toBe(true);
  expect(settings.defaultThinkingLevel).toBe("high");
  expect(settings.theme).toBe("light");
  expect(settings.packages).toEqual(["example"]);
});
