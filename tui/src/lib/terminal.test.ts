import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { envExportLines, launchScriptContent } from "./terminal.ts";
import { shCmd } from "./exec.ts";

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
