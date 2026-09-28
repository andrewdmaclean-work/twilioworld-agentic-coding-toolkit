import { expect, test } from "bun:test";
import { LLAMAFILE_DEST } from "./constants.ts";
import { daemonCommandMatches, legacyModelCommandMatches } from "./daemons.ts";
import { llamaWebUiUrl } from "./terminal.ts";

test("daemon ownership requires the expected executable or script", () => {
  expect(daemonCommandMatches("/repo/tools/llamafile --server", ["/repo/tools/llamafile"])).toBe(true);
  expect(daemonCommandMatches("node /repo/tools/mcp-proxy.js", ["/repo/tools/mcp-proxy.js"])).toBe(true);
  expect(daemonCommandMatches("/usr/bin/unrelated --server", ["/repo/tools/llamafile"])).toBe(false);
});

test("legacy model cleanup requires this toolkit server and port", () => {
  const expected = LLAMAFILE_DEST;
  expect(legacyModelCommandMatches(`${expected} --server -m model.gguf --port 8080`)).toBe(true);
  expect(legacyModelCommandMatches(`${expected} --server -m model.gguf --port 9090`)).toBe(false);
  expect(legacyModelCommandMatches(`${expected} -m model.gguf --port 8080`)).toBe(false);
  expect(legacyModelCommandMatches("/other/tools/llamafile --server --port 8080")).toBe(false);
});

test("browser chat reloads into a fresh conversation after MCP starts", () => {
  expect(llamaWebUiUrl(8080, 1234)).toBe(
    "http://127.0.0.1:8080/?new_chat=true&toolkit_reload=1234#/",
  );
});
