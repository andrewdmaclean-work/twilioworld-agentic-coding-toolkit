// scripts/preview.ts — render toolkit screens as text with the real OpenTUI
// renderer, no terminal needed. Usage:
//   bun run preview                 # every screen at 100×40
//   W=80 H=24 bun run preview       # a different terminal size
//   bun run preview handoff,quit    # only some screens

import { createTestRenderer } from "@opentui/core/testing";
import { buildDashboard } from "../src/dashboard.ts";
import { buildWelcomeScreen } from "../src/screens/welcome.ts";
import { buildLocalChatScreen } from "../src/screens/local-chat.ts";
import { buildLocalAiInstallScreen } from "../src/screens/local-ai-install.ts";
import { buildHandoffScreen } from "../src/screens/handoff.ts";
import { buildInstallReviewScreen, buildQuitScreen } from "../src/screens/prompts.ts";
import { buildSettingsScreen } from "../src/screens/settings.ts";
import { buildAgentScreen } from "../src/screens/agent.ts";
import { buildLogScreen } from "../src/screens/log.ts";
import type { ToolkitStatus } from "../src/status.ts";

const W = Number(process.env.W ?? 100), H = Number(process.env.H ?? 40);
const status: ToolkitStatus = {
  twilio: { installed: false, profile: "", sid: "" }, skills: { count: 56, installedCount: 0 },
  model: { fileReady: true, runtimeReady: true, ready: true, running: true }, devPhone: { installed: false },
  opencode: { installed: false, version: "" }, pi: { installed: true }, agents: { installedCount: 2 },
  node: { version: "v22.19.0", supportsPi: true }, addons: {},
};
const noop = () => {};

async function frame(title: string, build: (t: any) => Promise<void> | void) {
  const t = await createTestRenderer({ width: W, height: H });
  await build(t);
  await t.renderOnce();
  console.log(`\n=== ${title} ===`);
  console.log(t.captureCharFrame().split("\n").map((l: string) => l.trimEnd()).join("\n").trimEnd());
  t.renderer.destroy();
}

async function inDashboard(title: string, route: string, screen: (r: any) => any, activity = "", press?: (t: any) => Promise<void>) {
  await frame(title, async (t) => {
    const d = buildDashboard(t.renderer, noop);
    t.renderer.root.add(d.dashboard);
    d.update(status);
    if (activity) d.setActivity(activity);
    if (route) d.showRoute(screen(t.renderer), route);
    if (press) { await t.renderOnce(); await press(t); }
  });
}

const which = process.argv[2] ?? "all";
const show = (k: string) => which === "all" || which.split(",").includes(k);

if (show("welcome")) await frame("1. First run — welcome", (t) => { t.renderer.root.add(buildWelcomeScreen(t.renderer, { modelSizeRange: "2.5–3.3 GB", onChoose: noop })); });
if (show("dashboard")) await inDashboard("2. Dashboard — footer keeps the latest activity", "", () => null, "Claude Code opened in iTerm2 · 14:02");
if (show("agent")) await inDashboard("3. Set up a coding agent — review", "Set up a coding agent", (r) => buildAgentScreen(r, noop, noop), "", async (t) => { await Bun.sleep(250); t.mockInput.pressEnter(); await t.flush(); });
if (show("handoff")) await inDashboard("4. Where should it open? (running in iTerm2)", "Open Claude Code", (r) => buildHandoffScreen(r, {
  prepared: { target: { id: "claude-code", label: "Claude Code", command: "claude", cwd: "/repo", hint: "sign in when prompted." }, scriptPath: "/Users/andrewmaclean/GitHub/twilioworld-agentic-coding-toolkit/.toolkit/launch/claude-code.sh", command: "'…/claude-code.sh'" },
  terminal: { name: "iTerm2", windows: [{ kind: "iterm", label: "iTerm2", current: true }, { kind: "apple-terminal", label: "Terminal", current: false }] },
  onHere: noop, onWindow: async () => ({ ok: true }), onCopy: async () => true, onDone: noop,
}));
if (show("localchat")) await inDashboard("5. Local chat — first time (nothing downloaded yet)", "Local chat", (r) => buildLocalChatScreen(r, { modelReady: false, piReady: false, running: false, modelName: "Gemma 4 E2B", port: "8080", onBrowser: noop, onPi: noop, onSettings: noop, onCancel: noop }));
if (show("model")) await inDashboard("6. Choose a model — review before download", "Choose a model", (r) => buildLocalAiInstallScreen(r, { next: "browser", selectedSlug: "gemma4-e2b", installedSlugs: [], runtimeInstalled: false, piInstalled: false, freeGb: 212.4, onChoose: noop, onCancel: noop }));
if (show("devphone")) await inDashboard("7. Dev Phone — install review", "Install Dev Phone", (r) => buildInstallReviewScreen(r, { id: "devphone-install", title: "Install Dev Phone", summary: "Installs the Twilio CLI and the Dev Phone plugin into .toolkit/ in this repo. Your system Twilio CLI is not changed.", confirm: "Install and continue", onConfirm: noop, onCancel: noop }));
if (show("settings")) await inDashboard("8. Settings", "Settings", (r) => buildSettingsScreen(r, { onRepair: noop, onUninstall: noop, onCancel: noop }));
if (show("repair")) await inDashboard("9. Check & repair — result", "Check & repair", (r) => buildLogScreen(r, "Check & repair", async (log, done) => {
  for (const l of ["\n▶ [1/3] Twilio knowledge", "✓ 56 Twilio Skills available", "✓ Coding-agent Skills refreshed in ~/.agents/skills", "✓ Live Docs reachable (https://mcp.twilio.com/docs)", "\n▶ [2/3] Local AI", "✓ llamafile runtime verified", "✓ Gemma 4 E2B verified (selected)", "✓ Cleared a stale Docs bridge process record", "✓ Local AI is running", "\n▶ [3/3] Tools", "✓ Pi 0.80.3", "   Twilio CLI: not installed. It installs when you open the Twilio CLI or Dev Phone.", "", "✓ Check complete — 1 repaired."]) log(l, "stdout");
  done(true);
}, noop), "", async () => { await Bun.sleep(150); });
if (show("quit")) await inDashboard("10. Quit while local AI is running", "Quit", (r) => buildQuitScreen(r, { modelName: "Gemma 4 E2B", port: "8080", onStopAndQuit: noop, onQuit: noop, onCancel: noop }));
process.exit(0);
