// lib/daemons.ts — toolkit-owned background processes (llamafile model
// server, MCP proxy bridge). Every daemon records a PID file with the exact
// command it was started with; stop operations re-check that command before
// signalling, so a stale PID file can never kill an unrelated process.

import { spawn, spawnSync, type ChildProcess } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import {
  LLAMAFILE_DEST,
  MCP_PROXY_PID,
  MCP_PROXY_PORT,
  MCP_PROXY_SCRIPT,
  MODEL_SERVER_PID,
  MODEL_SERVER_PORT,
  MODELS_DIR,
} from "./constants.ts";
import { join } from "path";
import { commandEnv, commandForSpawn, shCmd } from "./exec.ts";

/** Long-running background daemon in its own process group. */
export function startDaemon(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; logFile?: string; pidFile?: string } = {},
): ChildProcess {
  let logFd: number | undefined;
  if (opts.logFile) {
    mkdirSync(dirname(opts.logFile), { recursive: true });
    logFd = openSync(opts.logFile, "w");
  }
  const resolved = commandForSpawn(command);
  if (!resolved) throw new Error(`${command} is not installed in this toolkit environment.`);
  const child = spawn("/bin/sh", ["-c", shCmd(resolved, args)], {
    cwd: opts.cwd,
    env: commandEnv(command, opts.env),
    stdio: logFd === undefined ? "ignore" : ["ignore", logFd, logFd],
    detached: true,
  });
  if (logFd !== undefined) closeSync(logFd);
  if (opts.pidFile && child.pid) {
    mkdirSync(dirname(opts.pidFile), { recursive: true });
    writeFileSync(opts.pidFile, `${JSON.stringify({
      pid: child.pid,
      command: shCmd(resolved, args),
      startedAt: new Date().toISOString(),
    })}\n`, { mode: 0o600 });
  }
  child.unref();
  return child;
}

/**
 * Kill the running llamafile model server and the MCP proxy bridge if running.
 * Uses toolkit-owned PID files so unrelated llamafile processes are left alone.
 * Returns true if a llamafile process was found and signalled.
 */
export function killModelServer(): boolean {
  // Also stop the proxy bridge — it's always started/stopped with the server.
  killMcpProxy();
  const managed = killPidFile(MODEL_SERVER_PID, [LLAMAFILE_DEST]);
  return managed || killLegacyModelServer();
}

/** Match only an older toolkit-owned model process. Previous releases did not
 * always leave a PID file, so settings changes could fail to stop an already
 * running server. Path + server mode + port keeps the fallback from touching
 * an unrelated process that happens to use llamafile. */
export function legacyModelCommandMatches(
  command: string,
  port = MODEL_SERVER_PORT,
): boolean {
  const escapedPort = port.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return daemonCommandMatches(command, [LLAMAFILE_DEST])
    && /(?:^|\s)--server(?:\s|$)/.test(command)
    && new RegExp(`(?:^|\\s)--port(?:=|\\s+)${escapedPort}(?:\\s|$)`).test(command);
}

function killLegacyModelServer(): boolean {
  if (process.platform === "win32") return false;
  const result = spawnSync("lsof", [
    "-nP",
    "-t",
    `-iTCP:${MODEL_SERVER_PORT}`,
    "-sTCP:LISTEN",
  ], { encoding: "utf8" });
  if (result.status !== 0) return false;

  const pids = (result.stdout ?? "")
    .split(/\s+/)
    .map((raw) => Number.parseInt(raw, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 1);

  for (const pid of pids) {
    if (!legacyModelCommandMatches(runningCommand(pid))) continue;
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch { /* try another matching listener */ }
  }
  return false;
}

/**
 * Start the HTTP→HTTPS MCP proxy bridge as a background daemon.
 * Kills any existing instance first so restarts are clean.
 * The bridge is a plain Node.js script (tools/mcp-proxy.js) with no
 * npm dependencies — it uses only built-in http/https modules.
 */
export const MCP_PROXY_LOG = join(MODELS_DIR, "mcp-proxy.log");

export function startMcpProxy(): void {
  if (!existsSync(MCP_PROXY_SCRIPT)) return;
  killMcpProxy(); // evict any leftover from a previous run
  startDaemon("node", [MCP_PROXY_SCRIPT, "https://mcp.twilio.com/docs", String(MCP_PROXY_PORT), String(MODEL_SERVER_PORT)], { pidFile: MCP_PROXY_PID, logFile: MCP_PROXY_LOG });
}

function killMcpProxy(): void {
  killPidFile(MCP_PROXY_PID, [MCP_PROXY_SCRIPT]);
}

interface DaemonPidRecord {
  pid: number;
  command: string;
}

function pidFromFile(pidFile: string): DaemonPidRecord | null {
  try {
    const raw = readFileSync(pidFile, "utf8").trim();
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as Partial<DaemonPidRecord>;
      return Number.isInteger(parsed.pid) && Number(parsed.pid) > 1
        ? { pid: Number(parsed.pid), command: typeof parsed.command === "string" ? parsed.command : "" }
        : null;
    }
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 1 ? { pid, command: "" } : null;
  } catch {
    return null;
  }
}

export function daemonCommandMatches(command: string, expectedCommands: string[]): boolean {
  return expectedCommands.some((expected) => command.includes(expected));
}

function runningCommand(pid: number): string {
  if (process.platform === "win32") return "";
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

export function killPidFile(pidFile: string, expectedCommands: string[]): boolean {
  const record = pidFromFile(pidFile);
  if (!record) { rmSync(pidFile, { force: true }); return false; }
  const { pid } = record;
  try {
    if (process.platform !== "win32") {
      const actual = runningCommand(pid);
      if (!actual || !daemonCommandMatches(actual, expectedCommands)) {
        rmSync(pidFile, { force: true });
        return false;
      }
    } else if (record.command && !daemonCommandMatches(record.command, expectedCommands)) {
      rmSync(pidFile, { force: true });
      return false;
    }
    if (process.platform === "win32") {
      const res = spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
      rmSync(pidFile, { force: true });
      return res.status === 0;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
    rmSync(pidFile, { force: true });
    return true;
  } catch {
    rmSync(pidFile, { force: true });
    return false;
  }
}

/** True if the toolkit's model server PID file points at a live llamafile. */
export function modelServerManaged(): boolean {
  return pidFileAlive(MODEL_SERVER_PID, [LLAMAFILE_DEST]);
}

export function pidFileAlive(pidFile: string, expectedCommands: string[]): boolean {
  const record = pidFromFile(pidFile);
  if (!record || process.platform === "win32") return false;
  const actual = runningCommand(record.pid);
  return Boolean(actual) && daemonCommandMatches(actual, expectedCommands);
}
