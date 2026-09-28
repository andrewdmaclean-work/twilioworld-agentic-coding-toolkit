import { afterEach, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { killPidFile, pidFileAlive } from "./daemons.ts";

let child: ChildProcess | null = null;
let dir = "";

afterEach(() => {
  try { child?.kill("SIGKILL"); } catch { /* already gone */ }
  child = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startSleeper(): Promise<{ pid: number; pidFile: string }> {
  dir = mkdtempSync(join(tmpdir(), "toolkit-daemons-"));
  child = spawn("sleep", ["30"], { stdio: "ignore" });
  await Bun.sleep(50);
  const pidFile = join(dir, "test.pid");
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, command: "sleep 30" }));
  return { pid: child.pid!, pidFile };
}

test.skipIf(process.platform === "win32")("a stale PID file never kills an unrelated process", async () => {
  const { pid, pidFile } = await startSleeper();
  expect(pidFileAlive(pidFile, ["llamafile"])).toBe(false);
  expect(killPidFile(pidFile, ["llamafile"])).toBe(false);
  expect(alive(pid)).toBe(true);
  expect(existsSync(pidFile)).toBe(false);
});

test.skipIf(process.platform === "win32")("a matching PID file stops its own process", async () => {
  const { pid, pidFile } = await startSleeper();
  expect(pidFileAlive(pidFile, ["sleep"])).toBe(true);
  const exited = new Promise((resolve) => child!.once("exit", resolve));
  expect(killPidFile(pidFile, ["sleep"])).toBe(true);
  await exited;
  expect(child?.signalCode).toBe("SIGTERM");
  expect(alive(pid)).toBe(false);
  expect(existsSync(pidFile)).toBe(false);
});

test("a missing or corrupt PID file is a no-op", () => {
  dir = mkdtempSync(join(tmpdir(), "toolkit-daemons-"));
  const pidFile = join(dir, "bad.pid");
  writeFileSync(pidFile, "not a pid");
  expect(killPidFile(pidFile, ["sleep"])).toBe(false);
  expect(killPidFile(join(dir, "missing.pid"), ["sleep"])).toBe(false);
});
