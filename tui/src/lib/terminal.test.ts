import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectTerminal, envExportLines, launchScriptContent, openPreference } from "./terminal.ts";
import { shCmd } from "./exec.ts";

const none = () => false;

test("iTerm2 offers a new iTerm2 window first and Terminal as a named separate app", () => {
  const info = detectTerminal({ TERM_PROGRAM: "iTerm.app" }, "darwin", none);
  expect(info.name).toBe("iTerm2");
  expect(info.windows.map((w) => [w.kind, w.current])).toEqual([["iterm", true], ["apple-terminal", false]]);
});

test("Terminal.app is the current app when running in it", () => {
  const info = detectTerminal({ TERM_PROGRAM: "Apple_Terminal" }, "darwin", none);
  expect(info.windows).toEqual([{ kind: "apple-terminal", label: "Terminal", current: true }]);
});

test("terminals without a reliable window API never get a 'current' window option", () => {
  for (const program of ["ghostty", "vscode", "WarpTerminal"]) {
    const info = detectTerminal({ TERM_PROGRAM: program }, "darwin", none);
    expect(info.windows.some((w) => w.current)).toBe(false);
  }
});

test("SSH sessions offer no windows, since they would open on another display", () => {
  const info = detectTerminal({ TERM_PROGRAM: "iTerm.app", SSH_CONNECTION: "1.2.3.4 1 5.6.7.8 22" }, "darwin", () => true);
  expect(info.windows).toEqual([]);
  expect(info.reason).toContain("SSH");
});

test("Linux without a display offers no windows and says why", () => {
  const info = detectTerminal({}, "linux", () => true);
  expect(info.windows).toEqual([]);
  expect(info.reason).toBe("no graphical display");
});

test("Linux with a display names the terminal emulator it will use", () => {
  const info = detectTerminal({ DISPLAY: ":0" }, "linux", (bin) => bin === "konsole");
  expect(info.windows).toEqual([{ kind: "linux", label: "konsole", current: false, bin: "konsole" }]);
});

test("TOOLKIT_OPEN accepts only known modes", () => {
  expect(openPreference({})).toBe("ask");
  expect(openPreference({ TOOLKIT_OPEN: "HERE" })).toBe("here");
  expect(openPreference({ TOOLKIT_OPEN: "window" })).toBe("window");
  expect(openPreference({ TOOLKIT_OPEN: "print" })).toBe("print");
  expect(openPreference({ TOOLKIT_OPEN: "bogus" })).toBe("ask");
});

test("env exports always include PATH, only changed vars, and skip unsafe names", () => {
  const lines = envExportLines(
    { PATH: "/a b:/c", SAME: "1", CHANGED: "it's new", "BAD-NAME": "x" },
    { PATH: "/a b:/c", SAME: "1", CHANGED: "old" },
  );
  expect(lines).toEqual([`export PATH='/a b:/c'`, `export CHANGED='it'\\''s new'`]);
});

test("launch scripts run correctly from paths with spaces and quotes", () => {
  const root = mkdtempSync(join(tmpdir(), "toolkit launch "));
  try {
    const cwd = join(root, "repo with 'quotes'");
    mkdirSync(cwd);
    const script = join(root, "probe.sh");
    writeFileSync(
      script,
      launchScriptContent("Probe", cwd, [`export PROBE_VALUE='a b'`], shCmd("/bin/sh", ["-c", 'printf "%s|%s" "$PWD" "$PROBE_VALUE"'])),
      { mode: 0o755 },
    );
    const result = spawnSync(script, [], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${cwd}|a b`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
