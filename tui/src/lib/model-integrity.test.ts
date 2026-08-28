import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LOCAL_MODELS } from "./local-models.ts";
import { sha256File } from "./model-install.ts";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

test("model catalog URLs and pinned digests agree", () => {
  for (const model of LOCAL_MODELS) {
    expect(model.url.endsWith(model.sha256)).toBe(true);
    expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
});

test("sha256File hashes without loading the whole artifact into memory", async () => {
  dir = mkdtempSync(join(tmpdir(), "twilioworld-hash-"));
  const path = join(dir, "sample");
  writeFileSync(path, "twilioworld\n");
  expect(await sha256File(path)).toBe("4ec5ba86552baaf066b949f3382692d453e6be2f596c2fcec89ad7de9239f30b");
});
