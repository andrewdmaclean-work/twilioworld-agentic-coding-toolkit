import { afterEach, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { SelectRenderable } from "@opentui/core";
import { buildSettingsScreen } from "./settings.ts";
import { buildResourcesScreen } from "./resources.ts";
import { buildRobotFace } from "./robot-face.ts";
import type { ToolkitStatus } from "../status.ts";
import { buildDashboard } from "../index.ts";
import { buildLogScreen } from "./log.ts";
import { buildAgentScreen } from "./agent.ts";
import { buildLocalChatScreen } from "./local-chat.ts";
import { buildModelControlsScreen } from "./model-controls.ts";
import type { ModelReasoningMode } from "../lib/config.ts";

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
    onUninstall: () => {},
    onCancel: () => {},
  });
  t.renderer.root.add(screen);
  (screen.findDescendantById("settings-screen-select") as SelectRenderable).focus();
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("Settings");
  expect(t.captureCharFrame()).toContain("Install or repair features");
  expect(t.captureCharFrame()).toContain("Manage local AI");
  expect(t.captureCharFrame()).toContain("Uninstall or reset");
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

test("coding-agent setup requires review before installation", async () => {
  const t = await createTestRenderer({ width: 90, height: 28 });
  activeRenderer = t;
  const screen = buildAgentScreen(t.renderer, () => {}, () => {});
  t.renderer.root.add(screen);
  await t.renderOnce();
  await Bun.sleep(250);
  t.mockInput.pressEnter();
  await t.flush();
  const frame = t.captureCharFrame();
  expect(frame).toContain("may install its CLI");
  expect(frame).toContain("Continue");
  expect(frame).toContain("Go back");
});

test("local chat offers existing browser and Pi interfaces", async () => {
  const t = await createTestRenderer({ width: 88, height: 24 });
  activeRenderer = t;
  const screen = buildLocalChatScreen(t.renderer, {
    modelReady: false,
    piReady: false,
    modelSize: "3.3 GB",
    onBrowser: () => {},
    onPi: () => {},
    onCancel: () => {},
  });
  t.renderer.root.add(screen);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("Browser chat (llamafile)");
  expect(frame).toContain("Pi (terminal)");
  expect(frame).toContain("downloads once (~3.3 GB)");
});

test("reasoning visibility and effort cycle independently in place", async () => {
  const t = await createTestRenderer({ width: 88, height: 24 });
  activeRenderer = t;
  let savedMode: ModelReasoningMode = "off";
  let showThinking = false;
  let cancelCount = 0;
  const screen = buildModelControlsScreen(t.renderer, {
    status: null,
    reasoningMode: savedMode,
    showThinking,
    selectedModelName: "Test model",
    onToggleThinking: (current) => {
      showThinking = !current;
      return showThinking;
    },
    onToggleReasoning: (current) => {
      savedMode = current === "off" ? "low" : current === "low" ? "medium" : current === "medium" ? "high" : "off";
      return savedMode;
    },
    onChangeModel: () => {},
    onStop: () => {},
    onRemove: () => {},
    onCancel: () => { cancelCount += 1; },
  });
  t.renderer.root.add(screen);
  await t.renderOnce();
  await Bun.sleep(250);

  expect(t.captureCharFrame()).toContain("Show reasoning: No");
  expect(t.captureCharFrame()).toContain("Reasoning effort: Off");

  t.mockInput.pressEnter();
  await t.flush();
  expect(t.captureCharFrame()).toContain("Show reasoning: Yes");

  const select = screen.findDescendantById("model-controls-screen-select") as SelectRenderable;
  select.moveDown();
  for (const expected of ["Low", "Medium", "High", "Off"] as const) {
    t.mockInput.pressEnter();
    await t.flush();
    expect(t.captureCharFrame()).toContain(`Reasoning effort: ${expected}`);
  }
  expect(showThinking).toBe(true);
  expect(savedMode).toBe("off");
  expect(cancelCount).toBe(0);
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
  expect(frame).toContain("╭─┤");
  expect(frame).toContain("├─╮");
  const lines = frame.split("\n");
  const antennaColumn = Math.max(lines[0].indexOf("·"), lines[0].indexOf("●"), lines[0].indexOf("•"));
  expect(antennaColumn).toBe(lines[1].indexOf("╭") + 4);
  expect(lines[1][antennaColumn]).toBe("┴");
  robot.react("excited");
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain("★   ★");
  robot.dispose();
});

test("robot communicates an offline model without relying on color", async () => {
  const t = await createTestRenderer({ width: 20, height: 8 });
  activeRenderer = t;
  const robot = buildRobotFace(t.renderer);
  t.renderer.root.add(robot.container);
  robot.update({ model: { ready: false, running: false } } as ToolkitStatus);
  await t.renderOnce();
  const frame = t.captureCharFrame();
  expect(frame).toContain("─   ─");
  expect(frame).toContain("z");
  expect(frame).toContain("○");
  robot.dispose();
});

const readyStatus = {
  twilio: { installed: true, profile: "demo", sid: "AC123" },
  skills: { count: 20, installedCount: 12 },
  model: { fileReady: true, runtimeReady: true, ready: true, running: true },
  devPhone: { installed: true },
  opencode: { installed: true, version: "1.0" },
  pi: { installed: true },
  agents: { installedCount: 2 },
  node: { version: "v22", supportsPi: true },
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
  expect(frame).toContain("Local chat");
  expect(frame).toContain("●  Local AI");
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
  expect(frame).toContain("╭┤^ ^├╮");
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
