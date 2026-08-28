import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { installTwilioSkills } from "./skills.ts";

let destination = "";
afterEach(() => {
  if (destination) rmSync(destination, { recursive: true, force: true });
  destination = "";
});

test("skills install as direct groups rather than skills/skills", () => {
  destination = mkdtempSync(join(tmpdir(), "twilioworld-skills-"));
  expect(installTwilioSkills(destination, true)).toBeGreaterThan(0);
  expect(existsSync(join(destination, "twilio"))).toBe(true);
  expect(existsSync(join(destination, "skills"))).toBe(false);
});
