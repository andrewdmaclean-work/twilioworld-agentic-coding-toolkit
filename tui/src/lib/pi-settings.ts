import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ModelReasoningMode } from "./config.ts";

/** Update only toolkit-managed Pi preferences while preserving packages/theme. */
export function writePiDisplaySettings(
  piDir: string,
  showThinking: boolean,
  reasoningEffort: ModelReasoningMode,
): void {
  mkdirSync(piDir, { recursive: true });
  const dest = join(piDir, "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const existing = JSON.parse(readFileSync(dest, "utf8"));
    if (existing && typeof existing === "object" && !Array.isArray(existing)) settings = existing;
  } catch { /* start with a clean settings object */ }

  settings.hideThinkingBlock = !showThinking;
  settings.defaultThinkingLevel = reasoningEffort;
  writeFileSync(dest, `${JSON.stringify(settings, null, 2)}\n`);
  try { chmodSync(dest, 0o600); } catch { /* best-effort */ }
}
