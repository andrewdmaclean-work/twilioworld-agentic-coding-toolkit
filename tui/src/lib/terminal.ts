// lib/terminal.ts — everything that shows something outside this TUI:
// browser tabs, new terminal windows, launch scripts, and the clipboard.
//
// Rule: nothing opens where the user can't see it. The UI always names the
// destination app (detectTerminal), every open waits for the opener's real
// exit status instead of "spawn didn't throw", and every launch is backed
// by a script under .toolkit/launch/ the user can run themselves.

import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { CONFIG_DIR, MODEL_SERVER_PORT } from "./constants.ts";
import { commandEnv, commandForSpawn, have, q, shCmd } from "./exec.ts";

export interface NewWindowResult {
  ok: boolean;
  error?: string;
}

/** An interactive program the user asked to open (agent, Pi, Dev Phone…). */
export interface LaunchTarget {
  /** Slug for the launch script, e.g. "claude-code". */
  id: string;
  /** Human name, e.g. "Claude Code". */
  label: string;
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** First-run note shown before opening, e.g. "sign in if it's your first run". */
  hint?: string;
  /** How to get back when opened in this terminal, e.g. "Ctrl+C stops Dev Phone". */
  exitHint?: string;
}

// ── Preference ───────────────────────────────────────────────────────

export type OpenPreference = "ask" | "here" | "window" | "print";

/** TOOLKIT_OPEN lets a workshop host pick one behavior for everyone. */
export function openPreference(env: NodeJS.ProcessEnv = process.env): OpenPreference {
  const value = (env.TOOLKIT_OPEN ?? "").trim().toLowerCase();
  return value === "here" || value === "window" || value === "print" ? value : "ask";
}

// ── Terminal detection ───────────────────────────────────────────────

export type WindowKind = "iterm" | "apple-terminal" | "wezterm" | "linux" | "windows";

export interface WindowTarget {
  kind: WindowKind;
  /** App name shown in the UI, e.g. "iTerm2". */
  label: string;
  /** True when this is the app the toolkit is running in right now. */
  current: boolean;
  /** Linux terminal emulator binary. */
  bin?: string;
}

export interface TerminalInfo {
  /** Name of the terminal the toolkit is running in, for UI copy. */
  name: string;
  /** Why no window option is offered, when windows is empty. */
  reason?: string;
  windows: WindowTarget[];
}

const LINUX_TERMINALS: Array<{ bin: string; args: (cmd: string) => string[] }> = [
  { bin: "gnome-terminal", args: (cmd) => ["--", "/bin/sh", "-c", cmd] },
  { bin: "konsole", args: (cmd) => ["-e", "/bin/sh", "-c", cmd] },
  { bin: "xfce4-terminal", args: (cmd) => ["-e", `/bin/sh -c ${q(cmd)}`] },
  { bin: "x-terminal-emulator", args: (cmd) => ["-e", `/bin/sh -c ${q(cmd)}`] },
  { bin: "xterm", args: (cmd) => ["-e", `/bin/sh -c ${q(cmd)}`] },
];

function terminalName(env: NodeJS.ProcessEnv): string {
  switch (env.TERM_PROGRAM) {
    case "iTerm.app": return "iTerm2";
    case "Apple_Terminal": return "Terminal";
    case "WezTerm": return "WezTerm";
    case "ghostty": return "Ghostty";
    case "vscode": return "the editor's terminal";
    case "WarpTerminal": return "Warp";
    case "Hyper": return "Hyper";
    case "tmux": return "tmux";
  }
  if (env.KITTY_WINDOW_ID) return "kitty";
  if (env.ALACRITTY_WINDOW_ID || env.ALACRITTY_SOCKET) return "Alacritty";
  return "this terminal";
}

/** Work out which "new window" options are honest for this session.
 *  Only apps that reliably open a visible window are offered; anything else
 *  (Ghostty, Warp, VS Code, kitty…) gets "Open here" and "Copy command". */
export function detectTerminal(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  haveBin: (bin: string) => boolean = have,
): TerminalInfo {
  const name = terminalName(env);

  // A window opened for an SSH session appears on the remote machine's
  // display — exactly the kind of invisible open this module exists to avoid.
  if (env.SSH_CONNECTION || env.SSH_TTY) {
    return { name, reason: "remote SSH session", windows: [] };
  }

  const windows: WindowTarget[] = [];
  if (platform === "darwin") {
    if (env.TERM_PROGRAM === "iTerm.app") windows.push({ kind: "iterm", label: "iTerm2", current: true });
    if (env.TERM_PROGRAM === "WezTerm" && haveBin("wezterm")) windows.push({ kind: "wezterm", label: "WezTerm", current: true });
    windows.push({ kind: "apple-terminal", label: "Terminal", current: env.TERM_PROGRAM === "Apple_Terminal" });
    return { name, windows };
  }

  if (platform === "win32") {
    windows.push({ kind: "windows", label: "a new console", current: false });
    return { name, windows };
  }

  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return { name, reason: "no graphical display", windows: [] };
  }
  if (env.TERM_PROGRAM === "WezTerm" && haveBin("wezterm")) {
    windows.push({ kind: "wezterm", label: "WezTerm", current: true });
  }
  const linuxTerminal = LINUX_TERMINALS.find((t) => haveBin(t.bin));
  if (linuxTerminal) windows.push({ kind: "linux", label: linuxTerminal.bin, current: false, bin: linuxTerminal.bin });
  return { name, reason: windows.length ? undefined : "no supported terminal emulator found", windows };
}

// ── Launch scripts ───────────────────────────────────────────────────

export const LAUNCH_DIR = join(CONFIG_DIR, "launch");

/** export lines for env vars the launched program needs. The target is a
 *  brand-new shell, NOT a fork of this process, so nothing is inherited —
 *  PATH is always exported so it resolves the toolkit-local node/npm/
 *  twilio/pi binaries this process validated. Other vars only get exported
 *  when they differ from this process's environment. */
export function envExportLines(env: NodeJS.ProcessEnv, base: NodeJS.ProcessEnv = process.env): string[] {
  const lines: string[] = [];
  if (env.PATH) lines.push(`export PATH=${q(env.PATH)}`);
  for (const [key, value] of Object.entries(env)) {
    if (key === "PATH" || value === undefined || base[key] === value) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    lines.push(`export ${key}=${q(value)}`);
  }
  return lines;
}

export function launchScriptContent(label: string, cwd: string, envLines: string[], inner: string): string {
  return [
    "#!/bin/sh",
    `# ${label} — generated by the TwilioWorld toolkit.`,
    "# Runs with the toolkit's local toolchain and settings. Safe to run again.",
    `cd ${q(cwd)} || exit 1`,
    ...envLines,
    `exec ${inner}`,
    "",
  ].join("\n");
}

export interface PreparedLaunch {
  target: LaunchTarget;
  scriptPath: string;
  /** Copy-pasteable command that runs the launch script. */
  command: string;
}

/** Write .toolkit/launch/<id>.sh for a target. Every way of opening it
 *  (here, new window, copy) runs this same script, so they behave the same. */
export function prepareLaunch(target: LaunchTarget): PreparedLaunch | { error: string } {
  const resolved = commandForSpawn(target.command);
  if (!resolved) return { error: `${target.command} is not installed in this toolkit environment.` };
  const env = commandEnv(target.command, target.env);
  const scriptPath = join(LAUNCH_DIR, `${target.id}.sh`);
  try {
    mkdirSync(LAUNCH_DIR, { recursive: true });
    writeFileSync(
      scriptPath,
      launchScriptContent(target.label, target.cwd, envExportLines(env), shCmd(resolved, target.args ?? [])),
      { mode: 0o755 },
    );
  } catch (error) {
    return { error: `Could not write ${scriptPath}: ${(error as Error).message}` };
  }
  return { target, scriptPath, command: q(scriptPath) };
}

// ── Opening things ───────────────────────────────────────────────────

/** Run an opener and report its real outcome. Openers like `open` and
 *  `osascript` exit quickly with a status; emulators like xterm keep running
 *  for the life of the window, so still-running after settleMs means success. */
function runOpener(bin: string, args: string[], settleMs: number): Promise<NewWindowResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const finish = (result: NewWindowResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], detached: true });
    } catch (error) {
      finish({ ok: false, error: `${bin}: ${(error as Error).message}` });
      return;
    }
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", (error: Error) => finish({ ok: false, error: `${bin}: ${error.message}` }));
    child.on("exit", (code) => {
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, error: stderr.trim().split("\n").pop() || `${bin} exited with code ${code}` });
    });
    setTimeout(() => {
      child.stderr?.destroy();
      child.unref();
      finish({ ok: true });
    }, settleMs).unref?.();
  });
}

const ITERM_SCRIPT = [
  "on run argv",
  '  tell application "iTerm"',
  "    activate",
  "    create window with default profile command (quoted form of item 1 of argv)",
  "  end tell",
  "end run",
];

/** Open a prepared launch script in a new window of the given app. */
export function openInWindow(prepared: PreparedLaunch, window: WindowTarget, env: NodeJS.ProcessEnv = process.env): Promise<NewWindowResult> {
  const { scriptPath, target } = prepared;
  switch (window.kind) {
    case "iterm":
      // osascript waits for macOS's Automation permission prompt on first use,
      // so give it time — a denial comes back as a real error, not silence.
      return runOpener("osascript", [...ITERM_SCRIPT.flatMap((line) => ["-e", line]), scriptPath], 30000);
    case "apple-terminal":
      return runOpener("open", ["-a", "Terminal", scriptPath], 10000);
    case "wezterm":
      return runOpener(
        "wezterm",
        env.WEZTERM_PANE
          ? ["cli", "spawn", "--new-window", "--cwd", target.cwd, "--", scriptPath]
          : ["start", "--cwd", target.cwd, "--", scriptPath],
        3000,
      );
    case "linux": {
      const terminal = LINUX_TERMINALS.find((t) => t.bin === window.bin);
      if (!terminal) return Promise.resolve({ ok: false, error: `${window.bin ?? "terminal"} is not supported.` });
      return runOpener(terminal.bin, terminal.args(q(scriptPath)), 1500);
    }
    case "windows": {
      const inner = shCmd(target.command, target.args ?? []);
      return runOpener("cmd.exe", ["/c", "start", "TwilioWorld", "cmd", "/k", `cd /d "${target.cwd}" && ${inner}`], 3000);
    }
  }
}

const LINUX_BROWSER_OPENERS = ["chromium-launch", "xdg-open", "gio", "sensible-browser"];

/** Open a URL in the default browser, reporting whether that really happened. */
export function openUrl(url: string): Promise<NewWindowResult> {
  if (process.platform === "darwin") return runOpener("open", [url], 5000);
  if (process.platform === "win32") return runOpener("cmd.exe", ["/c", "start", "", url], 5000);
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return Promise.resolve({ ok: false, error: `No graphical display found. Open ${url} in a browser yourself.` });
  }
  const opener = LINUX_BROWSER_OPENERS.find((bin) => have(bin));
  if (!opener) return Promise.resolve({ ok: false, error: `No browser opener found. Open ${url} in a browser yourself.` });
  return runOpener(opener, opener === "gio" ? ["open", url] : [url], 3000);
}

/**
 * URL for the llama.cpp web UI.
 *
 * The Twilio Docs MCP server and system message are seeded server-side via
 * llamafile's --ui-config-file (see serverArgs() in model.ts), so there's
 * nothing to inject client-side — just open the page.
 */
export function llamaWebUiUrl(
  port = Number(MODEL_SERVER_PORT),
  reloadId = Date.now(),
): string {
  // A unique URL forces an already-open browser tab to reload. This matters
  // because Local Chat refreshes the MCP bridge immediately before opening;
  // merely focusing the old tab leaves its disconnected MCP client in memory
  // and the model then prints tool-call markup instead of executing the tool.
  return `http://127.0.0.1:${port}/?new_chat=true&toolkit_reload=${reloadId}#/`;
}

/** Short, stable form of the web UI address for showing on screen. */
export function llamaWebUiDisplayUrl(port = Number(MODEL_SERVER_PORT)): string {
  return `http://127.0.0.1:${port}/`;
}

export function openLlamaWebUi(port = Number(MODEL_SERVER_PORT)): Promise<NewWindowResult> {
  return openUrl(llamaWebUiUrl(port));
}

// ── Clipboard ────────────────────────────────────────────────────────

const CLIPBOARD_COMMANDS: Array<[string, string[]]> = [
  ["pbcopy", []],
  ["clip.exe", []],
  ["wl-copy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["xsel", ["--clipboard", "--input"]],
];

/** Copy text to the system clipboard. Resolves false when no clipboard tool
 *  is available (the caller keeps the text visible on screen either way). */
export function copyToClipboard(text: string): Promise<boolean> {
  const entry = CLIPBOARD_COMMANDS.find(([bin]) => have(bin));
  if (!entry) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(entry[0], entry[1], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
    child.stdin.end(text);
  });
}
