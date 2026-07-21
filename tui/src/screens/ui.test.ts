import { afterEach, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { SelectRenderable } from "@opentui/core";
import { buildSettingsScreen } from "./settings.ts";
import { buildResourcesScreen } from "./resources.ts";
import { buildRobotFace } from "./robot-face.ts";
import { isChatSendShortcut } from "./chat.ts";
import type { ToolkitStatus } from "../status.ts";
import { buildDashboard } from "../index.ts";
import { buildLogScreen } from "./log.ts";

let activeRenderer: Awaited<ReturnType<typeof createTestRenderer>> | null = null;

afterEach(() => {
  activeRenderer?.renderer.destroy();
  activeRenderer = null;
});

test("Settings renders only configuration actions", async () => {
  const t = await createTestRenderer({ width: 80, height: 24 });
  activeRenderer = t;
  let setupOpened = false;
  const screen = buildSettingsScreen(t.renderer, {
    onSetup: () => { setupOpened = true; },
    onModelControls: () => {},
    onCancel: () => {},
  });
  t.renderer.root.add(screen);
  (screen.findDescendantById("settings-screen-select") as SelectRenderable).focus();
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("Settings");
  expect(t.captureCharFrame()).toContain("Components");
  expect(t.captureCharFrame()).toContain("Local AI model");
  expect(t.captureCharFrame()).not.toContain("TwilioWorld");

  await Bun.sleep(250);
  t.mockInput.pressEnter();
  await t.flush();
  expect(setupOpened).toBe(true);
});

test("Resources renders as a dedicated top-level route", async () => {
  const t = await createTestRenderer({ width: 80, height: 24 });
  activeRenderer = t;
  const screen = buildResourcesScreen(t.renderer, {
    onTwilioWorld: () => {},
    onDocs: () => {},
    onCancel: () => {},
  });
  t.renderer.root.add(screen);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("Dashboard / Resources");
  expect(frame).toContain("TwilioWorld");
  expect(frame).toContain("Twilio AI Docs");
});

test("robot expression reflects a running model", async () => {
  const t = await createTestRenderer({ width: 20, height: 8 });
  activeRenderer = t;
  const robot = buildRobotFace(t.renderer);
  t.renderer.root.add(robot.container);
  robot.update({ model: { ready: true, running: true } } as ToolkitStatus);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("^   ^");
  const lines = frame.split("\n");
  const antennaColumn = lines[0].indexOf("·");
  expect(antennaColumn).toBe(lines[1].indexOf("╭") + 4);
  expect(lines[1][antennaColumn]).toBe("┴");
  robot.react("excited");
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("★   ★");
  robot.dispose();
});

test("chat sends only on Ctrl+Enter variants", () => {
  expect(isChatSendShortcut({ ctrl: true, name: "return" })).toBe(true);
  expect(isChatSendShortcut({ ctrl: false, name: "return" })).toBe(false);
});

const readyStatus = {
  twilio: { installed: true, profile: "demo", sid: "AC123" },
  skills: { count: 20, installedCount: 12 },
  model: { fileReady: true, runtimeReady: true, ready: true, running: true },
  voice: { runtimeReady: false, modelReady: false, recorder: "", ready: false },
  devPhone: { installed: true },
  opencode: { installed: true, version: "1.0" },
  pi: { installed: true },
  node: { version: "v22", supportsPi: true },
  localGemmaAvailable: true,
  addons: {},
} satisfies ToolkitStatus;

test("dashboard renders the visual hierarchy at wide width", async () => {
  const t = await createTestRenderer({ width: 100, height: 30 });
  activeRenderer = t;
  const dashboard = buildDashboard(t.renderer, () => {});
  t.renderer.root.add(dashboard.dashboard);
  dashboard.update(readyStatus);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("System status");
  expect(frame).toContain("●  Model");
  expect(frame).toContain("OVERVIEW");
  expect(frame).toContain("╭───┴───╮");
  dashboard.dispose();
});

test("narrow dashboard switches between non-overlapping panes", async () => {
  const t = await createTestRenderer({ width: 58, height: 24 });
  activeRenderer = t;
  const dashboard = buildDashboard(t.renderer, () => {});
  t.renderer.root.add(dashboard.dashboard);
  dashboard.update(readyStatus);
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("[Actions]");

  t.mockInput.pressTab();
  await t.flush();
  const statusFrame = t.captureCharFrame();
  expect(statusFrame).toContain("[Status]");
  expect(statusFrame).toContain("System status");
  expect(statusFrame).not.toContain("Action details");
  dashboard.dispose();
});

test("medium dashboard uses the compact robot without hiding both columns", async () => {
  const t = await createTestRenderer({ width: 80, height: 26 });
  activeRenderer = t;
  const dashboard = buildDashboard(t.renderer, () => {});
  t.renderer.root.add(dashboard.dashboard);
  dashboard.update(readyStatus);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("╭─┴─╮");
  expect(frame).toContain("Actions");
  expect(frame).toContain("System status");
  dashboard.dispose();
});

test("task log renders progress and a contextual completion footer", async () => {
  const t = await createTestRenderer({ width: 72, height: 20 });
  activeRenderer = t;
  const screen = buildLogScreen(t.renderer, "Setup - installing", (onLog, onDone) => {
    onLog("▶ [1/2] Download model", "stdout");
    onLog("☑ [2/2] Model ready", "stdout");
    onDone(true);
  }, () => {});
  t.renderer.root.add(screen);
  await Bun.sleep(100);
  await t.flush();
  const frame = t.captureCharFrame();
  expect(frame).toContain("Task complete");
  expect(frame).toContain("●  [2/2] Model ready");
  expect(frame).toContain("[Enter] return");
});
