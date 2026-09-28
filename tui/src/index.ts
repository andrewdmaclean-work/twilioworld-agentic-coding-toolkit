// index.ts — TwilioWorld Agentic Coding Toolkit TUI
// Layout: branded header · actions · active features · selected-action detail.

import { createCliRenderer, SelectRenderableEvents, type CliRenderer } from "@opentui/core";

import { invalidateStatusCache, readStatusAsync, type ToolkitStatus } from "./status.ts";
import { existsSync } from "fs";
import { buildAgentScreen } from "./screens/agent.ts";
import { buildSubmenuScreen } from "./screens/submenu.ts";
import { buildLogScreen } from "./screens/log.ts";
import { buildWelcomeScreen, type WelcomeChoice } from "./screens/welcome.ts";
import { buildLocalAiInstallScreen } from "./screens/local-ai-install.ts";
import { buildModelControlsScreen } from "./screens/model-controls.ts";
import { buildModelPickerScreen } from "./screens/model-picker.ts";
import { buildSettingsScreen } from "./screens/settings.ts";
import { buildResourcesScreen } from "./screens/resources.ts";
import { buildUninstallScreen } from "./screens/uninstall.ts";
import { buildLocalChatScreen } from "./screens/local-chat.ts";
import { buildHandoffScreen } from "./screens/handoff.ts";
import { buildInstallReviewScreen, buildQuitScreen } from "./screens/prompts.ts";
import { configureAgent } from "./lib/configure-agent.ts";
import {
  devPhoneTarget, downloadLocalModel, installDevPhone, installTwilioCli,
  listTwilioProfiles, stopModelServer, twilioLoginTarget, twilioShellTarget, useTwilioProfile,
} from "./lib/actions.ts";
import { runUninstall, type UninstallKey } from "./lib/uninstall.ts";
import { addonEnabled, markFirstRunComplete, setLocalModelSlug, modelReasoningMode, setModelReasoningMode, setThinkingVisible, thinkingVisible, type ModelReasoningMode } from "./lib/config.ts";
import {
  LLAMAFILE_DEST, ROOT, MODEL_SERVER_PID, MODEL_SERVER_PORT, MODEL_SERVER_URL, CONFIG_FILE,
} from "./lib/constants.ts";
import { LOCAL_MODELS, getSelectedModel, localModelInstalled } from "./lib/local-models.ts";
import { freeDiskGb } from "./lib/model-install.ts";
import { ensureSkillsSource, runRepair, skillsSourceReady } from "./lib/setup.ts";
import { fileExecutable } from "./lib/exec.ts";
import { MODEL_SERVER_LOG, serverArgs, waitForModelServer } from "./lib/model.ts";
import { capture, have, runTakeover } from "./lib/exec.ts";
import { modelServerManaged, startDaemon, startMcpProxy } from "./lib/daemons.ts";
import {
  copyToClipboard, detectTerminal, llamaWebUiDisplayUrl, openInWindow, openLlamaWebUi, openPreference, openUrl,
  prepareLaunch, type LaunchTarget, type PreparedLaunch, type WindowTarget,
} from "./lib/terminal.ts";
import { prepareBrowserMcpUi, webUiStaticAssetsReady } from "./lib/webui-config.ts";
import { pathNodeVersion, supportsPiNode } from "./lib/node-version.ts";
import { THEME } from "./theme.ts";
import { buildDashboard, type ItemId } from "./dashboard.ts";
import { headlineText, nextMove, statusLines } from "./dashboard-content.ts";

export { buildDashboard };

// ── Palette ──────────────────────────────────────────────────────────
const GREEN    = THEME.green;
const YELLOW   = THEME.yellow;
const POLL_MS  = 30000;

const TERMINAL_RESTORE = [
  "\x1b[?1000l", // basic mouse
  "\x1b[?1001l", // highlight mouse
  "\x1b[?1002l", // button-event mouse
  "\x1b[?1003l", // any-event mouse
  "\x1b[?1005l", // UTF-8 mouse
  "\x1b[?1004l", // focus events
  "\x1b[?1006l", // SGR mouse
  "\x1b[?1007l", // alternate scroll
  "\x1b[?1015l", // urxvt mouse
  "\x1b[?2004l", // bracketed paste
  "\x1b[?2026l", // synchronized output
  "\x1b[?2027l",
  "\x1b[?2031l",
  "\x1b[?25h",   // show cursor
  "\x1b[0m",
].join("");

function forceTerminalRestore(): void {
  if (process.stdout.isTTY) {
    try { process.stdout.write(TERMINAL_RESTORE); } catch { /* ignore */ }
  }
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try { process.stdin.setRawMode(false); } catch { /* ignore */ }
  }
}

function assertInteractiveTerminal(): void {
  if (process.env.TOOLKIT_TUI_SMOKE === "1") return;
  const term = process.env.TERM ?? "";
  if (!process.stdin.isTTY || !process.stdout.isTTY || term === "dumb") {
    console.error("TwilioWorld Agentic Coding Toolkit requires an interactive terminal for OpenTUI.");
    console.error("Run ./toolkit from a real terminal window, not through a pipe, task runner output panel, or dumb terminal.");
    process.exit(2);
  }
}

function assertCompatibleNode(): void {
  if (process.env.TOOLKIT_TUI_SMOKE === "1") return;
  const nodeInfo = pathNodeVersion();
  if (!supportsPiNode(nodeInfo)) {
    console.error("TwilioWorld Agentic Coding Toolkit requires project-local Node >= 22.19.0.");
    console.error(`Current node is ${nodeInfo?.raw ?? "not found"}. Re-run ./toolkit so it can repair .toolkit/toolchains/node-v22.`);
    process.exit(2);
  }
}

// Security audit E-8/H-4: if the toolkit is ever run as root (sudo out of
// habit, or a shared/CI box), downloaded models, .toolkit/config.json,
// and the creds file would all end up root-owned — breaking every
// subsequent normal-user run and leaving world-unreadable-by-you files
// behind. No-op on Windows (no EUID concept, no getuid()).
function assertNotRoot(): void {
  if (process.env.TOOLKIT_TUI_SMOKE === "1") return;
  if (process.platform === "win32") return;
  if (typeof process.getuid !== "function") return;
  if (process.getuid() === 0) {
    console.error("TwilioWorld Agentic Coding Toolkit should not be run as root.");
    console.error("Re-run ./toolkit as your normal user — sudo here would root-own your model files and config.");
    process.exit(2);
  }
}

function modelReasoningLabel(mode: ModelReasoningMode): string {
  return mode[0].toUpperCase() + mode.slice(1);
}

function nextModelReasoningMode(mode: ModelReasoningMode): ModelReasoningMode {
  if (mode === "off") return "low";
  if (mode === "low") return "medium";
  if (mode === "medium") return "high";
  return "off";
}

function doneLabel(done: boolean, label: string): string {
  return done ? `✓ ${label}` : label;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  assertInteractiveTerminal();
  assertCompatibleNode();
  assertNotRoot();

  if (process.env.TOOLKIT_TUI_SMOKE === "1") {
    const status = await readStatusAsync();
    console.log("TwilioWorld Agentic Coding Toolkit");
    console.log(headlineText(status));
    for (const line of statusLines(status)) console.log(line.text);
    console.log(`Next: ${nextMove(status)}`);
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 20,
    screenMode: "alternate-screen",
    externalOutputMode: "passthrough",
    consoleMode: "disabled",
    useKittyKeyboard: null,
    useMouse: false,
    enableMouseMovement: false,
    openConsoleOnError: false,
    backgroundColor: THEME.appBg,
  });
  try { renderer.useMouse = false; } catch { /* ignore */ }

  let interval: ReturnType<typeof setInterval> | null = null;
  let shuttingDown = false;
  let disposeDashboard = () => {};

  /** Never leave local AI running without saying so: it holds ~3 GB of
   *  memory and the model port after the dashboard is gone. */
  function localAiStillRunningNote(): string {
    if (!modelServerManaged()) return "";
    return [
      `Local AI is still running on 127.0.0.1:${MODEL_SERVER_PORT} (${getSelectedModel().name}).`,
      "Stop it with ./toolkit → Local chat → Local AI settings → Stop local AI.",
    ].join("\n");
  }

  function shutdown(code = 0): void {
    if (shuttingDown) return;
    shuttingDown = true;
    if (interval) clearInterval(interval);
    disposeDashboard();
    try { renderer.useMouse = false; } catch { /* ignore */ }
    try { renderer.destroy(); } catch { /* ignore */ }
    forceTerminalRestore();
    const note = localAiStillRunningNote();
    if (note) console.log(note);
    setTimeout(() => process.exit(code), 0);
  }

  const { dashboard, menuList, bottomBar, update, showRoute, backRoute, react, restoreFooter, setActivity, dispose } = buildDashboard(renderer, () => requestQuit());
  disposeDashboard = dispose;

  let busy = false;
  // While a program runs in this terminal it owns Ctrl+C. The terminal
  // delivers SIGINT to our process group too; those signals are queued
  // until the program exits, so they must not quit the dashboard.
  let takeoverActive = false;

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      if (takeoverActive && signal === "SIGINT") return;
      shutdown(0);
    });
  }
  process.once("uncaughtException", (e) => {
    try { console.error(e); } finally { shutdown(1); }
  });
  process.once("unhandledRejection", (e) => {
    try { console.error(e); } finally { shutdown(1); }
  });

  let polling = false;
  let latestStatus: ToolkitStatus | null = null;
  async function poll(fresh = false) {
    if (polling) return;
    polling = true;
    try {
      if (fresh) invalidateStatusCache();
      const s = await readStatusAsync({ fresh });
      latestStatus = s;
      update(s);
    } finally {
      polling = false;
    }
  }
  function refreshStatus(delayMs = 0) {
    if (delayMs > 0) setTimeout(() => { void poll(true); }, delayMs);
    else void poll(true);
  }
  function back() { backRoute(); busy = false; refreshStatus(); }

  let flashId = 0;
  function flash(msg: string, color = YELLOW) {
    const id = ++flashId;
    bottomBar.content = `  ${msg}`;
    bottomBar.fg = color;
    react(color === GREEN ? "excited" : color === THEME.danger ? "alert" : "curious");
    setTimeout(() => {
      if (id !== flashId) return;
      restoreFooter();
      bottomBar.fg = THEME.dim2;
    }, 4000);
  }

  function timeLabel(): string {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function requestQuit(): void {
    if (!modelServerManaged()) { shutdown(0); return; }
    busy = true;
    showRoute(buildQuitScreen(renderer, {
      modelName: getSelectedModel().name,
      port: MODEL_SERVER_PORT,
      onStopAndQuit: () => { stopModelServer(); shutdown(0); },
      onQuit: () => shutdown(0),
      onCancel: back,
    }), "Quit");
  }

  // ── Handoff: every program the toolkit opens goes through here ──────
  // The user picks (or TOOLKIT_OPEN presets) where it opens, and the
  // outcome stays visible in the footer afterwards.

  /** Run a launch script in this terminal, then come back to the dashboard. */
  function openHere(prepared: PreparedLaunch): void {
    const { target } = prepared;
    takeoverActive = true;
    renderer.suspend();
    forceTerminalRestore();
    process.stdout.write(`\x1b[2J\x1b[H── ${target.label} · opened from the TwilioWorld toolkit ──\n`);
    process.stdout.write(`${target.exitHint ? target.exitHint[0].toUpperCase() + target.exitHint.slice(1) : `Exit ${target.label} to return to the dashboard`}.\n\n`);
    const result = runTakeover(prepared.scriptPath, []);
    renderer.resume();
    // Let any SIGINT queued during the program drain before re-arming quit.
    setTimeout(() => { takeoverActive = false; }, 250);
    setActivity(`${target.label} ${result.ok ? "closed" : `exited (code ${result.code})`} · ${timeLabel()}`);
    back();
  }

  async function openWindow(prepared: PreparedLaunch, window: WindowTarget) {
    const result = await openInWindow(prepared, window);
    if (result.ok) setActivity(`${prepared.target.label} opened in ${window.label} · ${timeLabel()}`);
    return result;
  }

  function showHandoff(prepared: PreparedLaunch, notice?: { text: string; ok: boolean }): void {
    busy = true;
    const terminal = detectTerminal();
    showRoute(buildHandoffScreen(renderer, {
      prepared,
      terminal,
      printOnly: openPreference() === "print",
      notice,
      onHere: () => openHere(prepared),
      onWindow: (window) => openWindow(prepared, window),
      onCopy: () => copyToClipboard(prepared.command),
      onDone: back,
    }), `Open ${prepared.target.label}`);
  }

  function handoff(target: LaunchTarget): void {
    const prepared = prepareLaunch(target);
    if ("error" in prepared) {
      back();
      flash(`⚠  ${prepared.error}`, THEME.danger);
      return;
    }
    const preference = openPreference();
    if (preference === "here") { openHere(prepared); return; }
    const current = detectTerminal().windows.find((w) => w.current);
    if (preference === "window" && current) {
      void openWindow(prepared, current).then((result) => {
        if (result.ok) { back(); flash(`✓  ${target.label} opened in a new ${current.label} window`, GREEN); }
        else showHandoff(prepared, { text: `✗ Could not open ${current.label}: ${result.error}`, ok: false });
      });
      return;
    }
    showHandoff(prepared);
  }

  // Run a streaming action in a log screen route. If the action hands back
  // something to open (onReady), Enter continues to the handoff screen.
  function runAction(
    title: string,
    run: (
      onLog: (l: string, s: "stdout" | "stderr") => void,
      onDone: (ok: boolean) => void,
      onReady: (target: LaunchTarget) => void,
    ) => void | Promise<void>,
    opts: { then?: (ok: boolean) => void } = {},
  ): void {
    busy = true;
    react("thinking");
    let ready: LaunchTarget | null = null;
    showRoute(buildLogScreen(renderer, title, (onLog, onDone) => {
      ready = null;
      return run(onLog, (ok) => {
        onDone(ok);
        react(ok ? "excited" : "alert");
        void poll(true);
      }, (target) => { ready = target; });
    }, (ok) => {
      if (ok && ready) handoff(ready);
      else if (opts.then) { backRoute(); busy = false; refreshStatus(); opts.then(ok); }
      else back();
    }, { successAction: () => ready ? `choose where to open ${ready.label}` : undefined }), title);
  }

  async function openBrowser(url: string, label: string, shownUrl = url): Promise<void> {
    flash(`Opening ${label} in your browser…`, GREEN);
    const result = await openUrl(url);
    if (result.ok) {
      setActivity(`${label}: ${shownUrl} · ${timeLabel()}`);
      flash(`✓  Opened ${label} in your browser — ${shownUrl}`, GREEN);
    } else {
      flash(`⚠  ${result.error ?? `Could not open a browser. Visit ${shownUrl}`}`, YELLOW);
    }
  }

  async function startBrowserChat(): Promise<void> {
    const docsEnabled = addonEnabled("docsMcp");
    if (docsEnabled) startMcpProxy();
    if (!Boolean(capture("curl", ["-fsS", MODEL_SERVER_URL]))) {
      startDaemon(LLAMAFILE_DEST, serverArgs(), { cwd: ROOT, logFile: MODEL_SERVER_LOG, pidFile: MODEL_SERVER_PID });
      flash(`Starting local AI on :${MODEL_SERVER_PORT} — it keeps running until you stop it`, GREEN);
      refreshStatus();
      const ready = await waitForModelServer();
      refreshStatus();
      if (!ready) {
        flash(`Local AI did not start — see ${MODEL_SERVER_LOG}`, THEME.danger);
        return;
      }
    }
    if (docsEnabled && !webUiStaticAssetsReady()) {
      try {
        flash("Preparing Twilio Docs for browser chat…", GREEN);
        await prepareBrowserMcpUi(true);
        stopModelServer();
        startMcpProxy();
        startDaemon(LLAMAFILE_DEST, serverArgs(), { cwd: ROOT, logFile: MODEL_SERVER_LOG, pidFile: MODEL_SERVER_PID });
        if (!await waitForModelServer()) {
          flash(`Local AI did not restart — see ${MODEL_SERVER_LOG}`, THEME.danger);
          return;
        }
      } catch (error) {
        flash(`Could not activate Docs in browser chat: ${(error as Error).message}`, THEME.danger);
        return;
      }
    }
    const shown = llamaWebUiDisplayUrl();
    const result = await openLlamaWebUi();
    if (result.ok) {
      setActivity(`Browser chat: ${shown} · ${timeLabel()}`);
      flash(`✓  Opened browser chat — ${shown}`, GREEN);
    } else {
      flash(`⚠  ${result.error ?? "Could not open a browser"} — visit ${shown}`, THEME.danger);
    }
    refreshStatus();
  }

  function showModelControls(): void {
    const reasoningMode = modelReasoningMode();
    const showThinking = thinkingVisible();
    showRoute(buildModelControlsScreen(renderer, {
      status: latestStatus,
      reasoningMode,
      showThinking,
      selectedModelName: getSelectedModel().name,
      onToggleThinking: (current) => {
        const next = !current;
        setThinkingVisible(next);
        flash(`Show reasoning: ${next ? "Yes" : "No"} — applies to Pi on next start`, GREEN);
        return next;
      },
      onToggleReasoning: (current) => {
        const next = nextModelReasoningMode(current);
        setModelReasoningMode(next);
        stopModelServer();
        flash(`Reasoning effort: ${modelReasoningLabel(next)} — applies on next start`, GREEN);
        refreshStatus();
        return next;
      },
      onChangeModel: () => {
        showRoute(buildModelPickerScreen(renderer, {
          onModelReady: () => {
            stopModelServer();
            flash(`Switched to ${getSelectedModel().name}`, GREEN);
            refreshStatus();
            back();
          },
          onModelNeedsDownload: () => {
            runAction(`Download ${getSelectedModel().name}`, (onLog, onDone) => downloadLocalModel({ onLog, onDone }));
          },
          onCancel: () => showModelControls(),
        }), "Change model");
      },
      onStop: () => {
        const stopped = stopModelServer();
        flash(stopped ? "Model server stopped" : "Nothing was running", stopped ? GREEN : YELLOW);
        refreshStatus();
      },
      onRemove: () => runAction("Remove local model", (onLog, onDone) => runUninstall({ keys: ["modelRuntime"] as UninstallKey[], onLog, onDone })),
      onCancel: openLocalChat,
    }), "Local AI settings");
  }

  // ── On-demand installs ───────────────────────────────────────────────
  // Every feature installs the first time it's chosen, after a review that
  // says exactly what will be installed and where.

  function confirmInstall(opts: { id: string; title: string; summary: string; confirm: string; onConfirm: () => void }): void {
    busy = true;
    showRoute(buildInstallReviewScreen(renderer, { ...opts, onCancel: back }), opts.title);
  }

  function localAiReady(): boolean {
    return localModelInstalled(getSelectedModel());
  }

  /** Model choice + download review, then continue into the chosen interface. */
  function reviewLocalAi(next: "browser" | "pi"): void {
    busy = true;
    showRoute(buildLocalAiInstallScreen(renderer, {
      next,
      selectedSlug: getSelectedModel().slug,
      installedSlugs: LOCAL_MODELS.filter(localModelInstalled).map((m) => m.slug),
      runtimeInstalled: fileExecutable(LLAMAFILE_DEST),
      piInstalled: have("pi"),
      freeGb: freeDiskGb(),
      onChoose: (model) => {
        setLocalModelSlug(model.slug);
        if (next === "browser") {
          runAction(`Set up local chat — ${model.name}`, (onLog, onDone) => downloadLocalModel({ onLog, onDone }), {
            then: (ok) => { if (ok) void startBrowserChat(); },
          });
        } else {
          runAction(`Set up Pi — ${model.name}`, async (onLog, onDone, onReady) => {
            let downloaded = false;
            await downloadLocalModel({ onLog, onDone: (ok) => { downloaded = ok; } });
            if (!downloaded) { onDone(false); return; }
            await configureAgent({ agent: "Pi (lightweight TUI)", onLog, onDone, onReady });
          });
        }
      },
      onCancel: openLocalChat,
    }), "Choose a model");
  }

  function openLocalChat(): void {
    busy = true;
    const modelReady = localAiReady();
    showRoute(buildLocalChatScreen(renderer, {
      modelReady,
      piReady: modelReady && have("pi"),
      running: modelServerManaged() || Boolean(latestStatus?.model.running),
      modelName: getSelectedModel().name,
      port: MODEL_SERVER_PORT,
      onBrowser: () => {
        if (localAiReady()) void startBrowserChat();
        else reviewLocalAi("browser");
      },
      onPi: () => {
        if (!localAiReady()) { reviewLocalAi("pi"); return; }
        runAction("Set up Pi", (onLog, onDone, onReady) => configureAgent({
          agent: "Pi (lightweight TUI)", onLog, onDone, onReady,
        }));
      },
      onSettings: showModelControls,
      onCancel: back,
    }), "Local chat");
  }

  function openAgentSetup(): void {
    busy = true;
    showRoute(buildAgentScreen(renderer, back, back, handoff, () => !localAiReady(), () => reviewLocalAi("pi")), "Set up a coding agent");
  }

  function openDevPhone(): void {
    if (have("twilio") && latestStatus?.devPhone.installed) { handoff(devPhoneTarget()); return; }
    confirmInstall({
      id: "devphone-install",
      title: "Install Dev Phone",
      summary: `Installs ${have("twilio") ? "" : "the Twilio CLI and "}the Dev Phone plugin inside this repo. Your system Twilio CLI is not changed.`,
      confirm: "Install and continue",
      onConfirm: () => runAction("Install Dev Phone", async (onLog, onDone, onReady) => {
        let installed = false;
        await installDevPhone({ onLog, onDone: (ok) => { installed = ok; } });
        if (installed) onReady(devPhoneTarget());
        onDone(installed);
      }),
    });
  }

  function withTwilioCli(target: () => LaunchTarget): void {
    if (have("twilio")) { handoff(target()); return; }
    confirmInstall({
      id: "cli-install",
      title: "Install the Twilio CLI",
      summary: "Installs the Twilio CLI inside this repo (npm). Your system Twilio CLI and its profiles are not touched.",
      confirm: "Install and continue",
      onConfirm: () => runAction("Install Twilio CLI", (onLog, onDone, onReady) => installTwilioCli({
        onLog,
        onDone: (ok) => { if (ok) onReady(target()); onDone(ok); },
      })),
    });
  }

  menuList.on(SelectRenderableEvents.ITEM_SELECTED, async (_i, opt) => {
    if (busy) return;
    switch (opt.value as ItemId) {
      case "exit": requestQuit(); break;

      case "agent": openAgentSetup(); break;

      case "resources": {
        busy = true;
        showRoute(buildResourcesScreen(renderer, {
          onTwilioWorld: () => { void openBrowser("https://twilio.world", "TwilioWorld"); },
          onDocs: () => { void openBrowser("https://www.twilio.com/docs/ai", "Twilio AI docs"); },
          onCancel: back,
        }), "Resources");
        break;
      }

      case "settings": {
        busy = true;
        showRoute(buildSettingsScreen(renderer, {
          onRepair: () => runAction("Check & repair", (onLog, onDone) => runRepair({ onLog, onDone })),
          onUninstall: () => showRoute(buildUninstallScreen(renderer, back, back), "Uninstall or reset"),
          onCancel: back,
        }), "Settings");
        break;
      }

      case "localchat": openLocalChat(); break;

      case "devphone": {
        busy = true;
        showRoute(buildSubmenuScreen(renderer, {
          id: "devphone-screen",
          route: "Dashboard / Dev Phone",
          title: "Dev Phone",
          subtitle: "Browser soft phone. Escape returns to dashboard.",
	          bodyTitle: "Dev Phone",
	          options: [
	            {
	              name: doneLabel(Boolean(latestStatus?.devPhone.installed), "Open Dev Phone"),
	              description: latestStatus?.devPhone.installed
	                ? "installed — choose where it opens"
	                : "review what installs, then open",
	              onSelect: () => { openDevPhone(); return false; },
	            },
	            {
	              name: "Uninstall Dev Phone",
	              description: latestStatus?.devPhone.installed
	                ? "remove the @twilio-labs/plugin-dev-phone plugin"
	                : "not installed",
	              onSelect: () => {
                runAction("Uninstall Dev Phone", (onLog, onDone) => runUninstall({ keys: ["devPhone"] as UninstallKey[], onLog, onDone }));
                return false;
              },
            },
          ],
        }, back), "Dev Phone");
        break;
      }

      case "cli": {
        busy = true;
        const showCliMenu = () => {
          showRoute(buildSubmenuScreen(renderer, {
            id: "cli-screen",
            route: "Dashboard / Twilio CLI",
            title: "Twilio CLI",
            subtitle: "Your account appears in System status once you log in. Escape returns to dashboard.",
            bodyTitle: "Twilio CLI",
            options: [
	            {
	              name: doneLabel(Boolean(latestStatus?.twilio.installed), "Open a terminal"),
	              description: latestStatus?.twilio.installed
	                ? "isolated terminal with the toolkit's Twilio CLI"
	                : "review what installs, then open an isolated terminal",
	              onSelect: () => { withTwilioCli(twilioShellTarget); return false; },
	            },
	            {
	              name: doneLabel(Boolean(latestStatus?.twilio.sid), "Log in (add an account)"),
	              description: latestStatus?.twilio.sid
	                ? `logged in as ${latestStatus.twilio.profile}`
	                : "run twilio login — choose where it opens",
              onSelect: () => { withTwilioCli(twilioLoginTarget); return false; },
            },
	            {
	              name: "Switch account",
	              description: latestStatus?.twilio.sid
	                ? `active: ${latestStatus.twilio.profile}`
	                : "choose among this toolkit's isolated Twilio CLI profiles",
              onSelect: () => {
                if (!have("twilio")) { flash("⚠  Toolkit-local Twilio CLI not installed", YELLOW); return true; }
                const profiles = listTwilioProfiles();
                if (profiles.length === 0) { flash("⚠  No profiles — use Log in first", YELLOW); return false; }
                if (profiles.length === 1) { flash(`Only one account: ${profiles[0].id}`, YELLOW); return false; }
                showRoute(buildSubmenuScreen(renderer, {
                  id: "cli-profiles",
                  route: "Dashboard / Twilio CLI / Switch account",
                  title: "Switch Twilio account",
                  subtitle: "Pick the profile to make active. Escape goes back.",
                  bodyTitle: "Accounts",
                  options: profiles.map((p) => ({
                    name: `${p.active ? "● " : "  "}${p.id}`,
                    description: `${p.accountSid}${p.active ? "  (active)" : ""}`,
                    onSelect: () => {
                      if (p.active) { flash(`Already on ${p.id}`, YELLOW); showCliMenu(); return false; }
                      const okSwitched = useTwilioProfile(p.id);
                      flash(okSwitched ? `✓  Switched to ${p.id}` : `⚠  Could not switch to ${p.id}`, okSwitched ? GREEN : YELLOW);
                      refreshStatus();
                      refreshStatus(500);
                      showCliMenu();
                      return false;
                    },
                  })),
                }, showCliMenu), "Switch Twilio account");
                return false;
              },
            },
	            {
	              name: "Uninstall Twilio CLI",
	              description: latestStatus?.twilio.installed ? "remove .toolkit-local Twilio CLI + profiles" : "not installed",
              onSelect: () => {
                runAction("Uninstall Twilio CLI", (onLog, onDone) => runUninstall({ keys: ["twilioCli"] as UninstallKey[], onLog, onDone }));
                return false;
              },
            },
            ],
          }, back), "Twilio CLI");
        };
        showCliMenu();
        break;
      }
    }
  });

  // First run asks one question instead of showing an install checklist.
  // Placed here — after poll/back/flash/busy are all initialized — so
  // enterDashboard()'s poll() call never hits a temporal-dead-zone binding.
  function enterDashboard(): void {
    renderer.root.add(dashboard);
    void poll();
    interval = setInterval(poll, POLL_MS);
    menuList.focus();
  }

  function finishWelcome(choice: WelcomeChoice): void {
    markFirstRunComplete();
    renderer.root.remove(welcome.id);
    enterDashboard();
    const go = () => {
      if (choice === "agent") openAgentSetup();
      else if (choice === "localchat") openLocalChat();
    };
    // Clones made without --recursive lack the Skills submodule; fetch it
    // visibly (it's small) before continuing.
    if (!skillsSourceReady()) {
      runAction("Download Twilio Skills", async (onLog, onDone) => { await ensureSkillsSource({ onLog, onDone }); }, {
        then: (ok) => { if (ok) go(); },
      });
    } else {
      go();
    }
  }

  const sizes = LOCAL_MODELS.map((m) => m.sizeBytes).sort((x, y) => x - y);
  const welcome = buildWelcomeScreen(renderer, {
    modelSizeRange: `${(sizes[0] / 1e9).toFixed(1)}–${(sizes[sizes.length - 1] / 1e9).toFixed(1)} GB`,
    onChoose: finishWelcome,
  });
  if (!existsSync(CONFIG_FILE)) {
    renderer.root.add(welcome);
  } else {
    enterDashboard();
  }

  renderer.on("destroy", () => {
    if (interval) clearInterval(interval);
    forceTerminalRestore();
  });
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    forceTerminalRestore();
    process.exit(1);
  });
}
