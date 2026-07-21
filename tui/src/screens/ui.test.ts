import { afterEach, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { SelectRenderable } from "@opentui/core";
import { buildToolsScreen } from "./tools.ts";
import { buildRobotFace } from "./robot-face.ts";
import { isChatSendShortcut } from "./chat.ts";
import type { ToolkitStatus } from "../status.ts";

let activeRenderer: Awaited<ReturnType<typeof createTestRenderer>> | null = null;

afterEach(() => {
  activeRenderer?.renderer.destroy();
  activeRenderer = null;
});

test("Tools renders and keyboard selection invokes the selected action", async () => {
  const t = await createTestRenderer({ width: 80, height: 24 });
  activeRenderer = t;
  let setupOpened = false;
  const screen = buildToolsScreen(t.renderer, {
    onSetup: () => { setupOpened = true; },
    onModelControls: () => {},
    onTwilioWorld: () => {},
    onDocs: () => {},
    onCancel: () => {},
  });
  t.renderer.root.add(screen);
  (screen.findDescendantById("tools-screen-select") as SelectRenderable).focus();
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("Tools & settings");
  expect(t.captureCharFrame()).toContain("Setup choices");

  await Bun.sleep(250);
  t.mockInput.pressEnter();
  await t.flush();
  expect(setupOpened).toBe(true);
});

test("robot expression reflects a running model", async () => {
  const t = await createTestRenderer({ width: 20, height: 8 });
  activeRenderer = t;
  const robot = buildRobotFace(t.renderer);
  t.renderer.root.add(robot.container);
  robot.update({ model: { ready: true, running: true } } as ToolkitStatus);
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("^  ^");
  robot.dispose();
});

test("chat sends only on Ctrl+Enter variants", () => {
  expect(isChatSendShortcut({ ctrl: true, name: "return" })).toBe(true);
  expect(isChatSendShortcut({ ctrl: false, name: "return" })).toBe(false);
});
