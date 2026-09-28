// lib/exec.ts — command execution primitives for the TUI.
//
//   runStreaming()  — non-interactive command; stdout/stderr streamed
//                     line-by-line to a callback (→ log pane). Uses
//                     /bin/sh so APE binaries and npm shebangs resolve.
//
//   runTakeover()   — interactive program that takes over this terminal.
//                     Caller MUST renderer.suspend() before and
//                     renderer.resume() after (see lib/handoff.ts).
//
// Opening windows, browsers, and launch scripts lives in lib/terminal.ts;
// background daemons live in lib/daemons.ts.

import { spawn, spawnSync, execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { delimiter, join } from "path";
import {
  NPM_GLOBAL_PREFIX,
  TOOLKIT_BIN_DIRS,
  TWILIO_CLI_HOME,
} from "./constants.ts";

export type LogFn = (line: string, stream: "stdout" | "stderr") => void;

export interface RunResult {
  code: number;
  ok: boolean;
}

/** Shell-quote a single argument (single-quote wrapping). */
export function q(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Build a /bin/sh -c invocation string from command + args. */
export function shCmd(command: string, args: string[]): string {
  return [command, ...args].map(q).join(" ");
}

const TOOLKIT_LOCAL_ONLY_BINS = new Set(["bun", "node", "npm", "npx", "twilio", "pi"]);

function commandNames(bin: string): string[] {
  return process.platform === "win32"
    ? [bin, `${bin}.cmd`, `${bin}.exe`, `${bin}.ps1`]
    : [bin];
}

function localCommandPath(bin: string): string {
  for (const dir of TOOLKIT_BIN_DIRS) {
    for (const name of commandNames(bin)) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return "";
}

export function commandForSpawn(command: string): string | null {
  if (!TOOLKIT_LOCAL_ONLY_BINS.has(command)) return command;
  return localCommandPath(command) || null;
}

export function toolkitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const currentPath = extra.PATH ?? process.env.PATH ?? "";
  return {
    ...process.env,
    ...extra,
    PATH: [...TOOLKIT_BIN_DIRS, currentPath].filter(Boolean).join(delimiter),
    npm_config_prefix: extra.npm_config_prefix ?? process.env.npm_config_prefix ?? NPM_GLOBAL_PREFIX,
    NPM_CONFIG_PREFIX: extra.NPM_CONFIG_PREFIX ?? process.env.NPM_CONFIG_PREFIX ?? NPM_GLOBAL_PREFIX,
  };
}

export function twilioCliEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = toolkitEnv(extra);
  mkdirSync(TWILIO_CLI_HOME, { recursive: true });
  return {
    ...env,
    HOME: TWILIO_CLI_HOME,
    USERPROFILE: TWILIO_CLI_HOME,
    XDG_CONFIG_HOME: join(TWILIO_CLI_HOME, ".config"),
    XDG_CACHE_HOME: join(TWILIO_CLI_HOME, ".cache"),
    XDG_DATA_HOME: join(TWILIO_CLI_HOME, ".local", "share"),
    XDG_STATE_HOME: join(TWILIO_CLI_HOME, ".local", "state"),
  };
}

export function commandEnv(command: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return command === "twilio" ? twilioCliEnv(extra) : toolkitEnv(extra);
}

function stripTerminalControls(text: string): string {
  let clean = text
    // OSC/title sequences.
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    // CSI and common ANSI escape sequences.
    .replace(/[\x1B\x9B][[\]()#;?]*(?:(?:[0-9A-Za-z]*(?:;[0-9A-Za-z]*)*)?\x07|(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nq-uy=><~])/g, "")
    // Other C0 controls except backspace, newline, carriage return, and tab.
    .replace(/[\x00-\x07\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Some package-manager progress renderers use backspace to redraw a line.
  // Collapse "x\b" pairs before the append-only log sees them.
  while (/[^\n\r]\x08/.test(clean)) clean = clean.replace(/[^\n\r]\x08/g, "");
  return clean;
}

function latestCarriageReturnFrame(line: string): string {
  const parts = line.split("\r");
  return parts[parts.length - 1] ?? "";
}

function streamChunk(
  rest: string,
  data: Buffer,
  stream: "stdout" | "stderr",
  onLog: LogFn,
): string {
  const text = stripTerminalControls(rest + data.toString());
  const parts = text.split("\n");
  const nextRest = latestCarriageReturnFrame(parts.pop() ?? "");
  for (const raw of parts) {
    const line = latestCarriageReturnFrame(raw).trimEnd();
    if (line) onLog(line, stream);
  }
  return nextRest;
}

/** Non-interactive command; stdout/stderr streamed line-by-line to onLog. */
export function runStreaming(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; onLog: LogFn },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const resolved = commandForSpawn(command);
    if (!resolved) {
      opts.onLog(`${command} is not installed in this toolkit environment.`, "stderr");
      resolve({ code: 127, ok: false });
      return;
    }
    const child = spawn("/bin/sh", ["-c", shCmd(resolved, args)], {
      cwd: opts.cwd,
      env: commandEnv(command, opts.env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let outRest = "";
    let errRest = "";
    child.stdout.on("data", (d: Buffer) => {
      outRest = streamChunk(outRest, d, "stdout", opts.onLog);
    });
    child.stderr.on("data", (d: Buffer) => {
      errRest = streamChunk(errRest, d, "stderr", opts.onLog);
    });
    child.on("error", (e: Error) => { opts.onLog(`error: ${e.message}`, "stderr"); });
    child.on("close", (code: number | null) => {
      if (outRest.trim()) opts.onLog(latestCarriageReturnFrame(outRest).trimEnd(), "stdout");
      if (errRest.trim()) opts.onLog(latestCarriageReturnFrame(errRest).trimEnd(), "stderr");
      resolve({ code: code ?? 1, ok: code === 0 });
    });
  });
}

/** Interactive program that takes over the terminal. Blocks until exit.
 *  Caller MUST renderer.suspend() before and renderer.resume() after.
 *  Routes through /bin/sh -c to handle APE binaries and npm shebangs. */
export function runTakeover(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const resolved = commandForSpawn(command);
  if (!resolved) return { code: 127, ok: false };
  const res = spawnSync("/bin/sh", ["-c", shCmd(resolved, args)], {
    cwd: opts.cwd,
    env: commandEnv(command, opts.env),
    stdio: "inherit",
  });
  return { code: res.status ?? 1, ok: res.status === 0 };
}

/** True if a binary is on PATH.
 *  NOTE: synchronous (blocks the event loop, and OpenTUI's render/input
 *  loop, for the duration of the subprocess). Fine for one-off calls
 *  triggered by a menu selection; use haveAsync() for anything on a
 *  polling/background path. */
export function have(bin: string): boolean {
  if (TOOLKIT_LOCAL_ONLY_BINS.has(bin)) return Boolean(localCommandPath(bin));
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore", shell: "/bin/sh", env: toolkitEnv() });
    return true;
  } catch {
    return false;
  }
}

/** Capture stdout of a quick command. Returns "" on failure.
 *  NOTE: synchronous — see have() above for why that matters. Use
 *  captureAsync() for anything on a polling/background path. */
export function capture(command: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const resolved = commandForSpawn(command);
  if (!resolved) return "";
  try {
    const res = spawnSync("/bin/sh", ["-c", shCmd(resolved, args)], {
      encoding: "utf8",
      env: commandEnv(command, env),
    });
    return (res.stdout ?? "").trim();
  } catch {
    return "";
  }
}

/** Non-blocking sibling of have(). Runs the subprocess off the main
 *  thread via libuv, so OpenTUI keeps rendering and handling input (and
 *  any in-flight chat fetch keeps streaming) while this is pending. */
export function haveAsync(bin: string): Promise<boolean> {
  if (TOOLKIT_LOCAL_ONLY_BINS.has(bin)) return Promise.resolve(Boolean(localCommandPath(bin)));
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", `command -v ${bin}`], { stdio: "ignore", env: toolkitEnv() });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Non-blocking sibling of capture(). See haveAsync() for why this
 *  matters — this is the primitive readStatusAsync() uses so status
 *  polling never freezes the TUI. */
export function captureAsync(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const resolved = commandForSpawn(command);
  if (!resolved) return Promise.resolve("");
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", shCmd(resolved, args)], {
      env: commandEnv(command, env),
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out.trim()));
  });
}

export function fileExecutable(path: string): boolean {
  try { return existsSync(path); } catch { return false; }
}

