import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { SKILLS_DIR } from "./constants.ts";

const SKILL_GROUPS = ["twilio", "sendgrid"] as const;

/** Install the toolkit-managed skill groups without creating skills/skills.
 * A Pi destination is wholly toolkit-owned and can be cleaned first. A global
 * ~/.agents/skills destination may contain unrelated user skills, so only the
 * two groups managed here are replaced. */
export function installTwilioSkills(destination: string, cleanDestination = false): number {
  if (!existsSync(SKILLS_DIR)) throw new Error("Twilio Skills source is missing");
  if (cleanDestination) rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  let installed = 0;
  for (const group of SKILL_GROUPS) {
    const source = join(SKILLS_DIR, group);
    if (!existsSync(source)) continue;
    const target = join(destination, group);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
    installed++;
  }
  return installed;
}
