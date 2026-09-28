// screens/agent.ts — native agent selection + in-TUI log for configureAgent().

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { configureAgent } from "../lib/configure-agent.ts";
import type { LaunchTarget } from "../lib/terminal.ts";
import { agentPickerOptions } from "../lib/agents.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { THEME } from "../theme.ts";
import { buildEmbeddedRouteChrome, removeAllChildren } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";
import { buildLogScreen } from "./log.ts";

export function buildAgentScreen(
  renderer: CliRenderer,
  onFinished: (ok?: boolean) => void,
  onCancel: () => void,
  onLaunch: (target: LaunchTarget) => void = () => {},
): BoxRenderable {
  const agentOptions = agentPickerOptions();
  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "agent-screen",
    route: "Dashboard / Set up a coding agent",
    title: "Set up a coding agent",
    subtitle: "Adds Twilio knowledge, then you choose where the agent opens. Missing CLIs may be installed.",
    bodyTitle: "Choose an agent",
    footer: shortcutBar(["Esc", "dashboard"], ["Enter", "review"]),
  });

  const select = new SelectRenderable(renderer, {
    id: "agent-select",
    height: agentOptions.length + 2,
    flexGrow: 1,
    flexShrink: 0,
    options: agentOptions,
    ...SELECT_STYLE,
  });

  const selectGuard = createInputGuard();
  const confirmGuard = createInputGuard();
  const confirmLabel = new TextRenderable(renderer, {
    id: "agent-confirm-label",
    content: "",
    fg: THEME.yellow,
    visible: false,
  });
  const confirmSelect = new SelectRenderable(renderer, {
    id: "agent-confirm-select",
    height: 4,
    flexGrow: 1,
    flexShrink: 0,
    visible: false,
    options: [
      { name: "Continue", description: "install if needed and add Twilio knowledge; you choose where it opens next" },
      { name: "Go back", description: "choose a different agent" },
    ],
    ...SELECT_STYLE,
  });
  let selectedAgent = "";

  function showAgentList(): void {
    confirmLabel.visible = false;
    confirmSelect.visible = false;
    select.visible = true;
    select.focus();
    selectGuard.arm();
  }

  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!selectGuard.ready()) return;
    selectedAgent = option.value as string;
    select.visible = false;
    confirmLabel.content = selectedAgent.startsWith("Pi")
      ? `Set up Pi? This may install Pi and download the selected local model.`
      : `Set up ${selectedAgent}? This may install its CLI.`;
    confirmLabel.visible = true;
    confirmSelect.visible = true;
    confirmSelect.setSelectedIndex(1);
    confirmSelect.focus();
    confirmGuard.arm();
  });
  confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
    if (!confirmGuard.ready()) return;
    if (index !== 0 || !selectedAgent) { showAgentList(); return; }
    let ready: LaunchTarget | null = null;
    const logScreen = buildLogScreen(
      renderer,
      `Set up coding agent — ${selectedAgent}`,
      (onLog, onDone) => {
        ready = null;
        return configureAgent({ agent: selectedAgent, onLog, onDone, onReady: (target) => { ready = target; } });
      },
      (ok) => {
        if (ok && ready) onLaunch(ready);
        else onFinished(ok);
      },
      { successAction: () => ready ? `choose where to open ${ready.label}` : undefined },
    );
    removeAllChildren(screen);
    screen.add(logScreen);
  });
  confirmSelect.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      showAgentList();
    }
  };
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      onCancel();
    }
  };

  body.add(select);
  body.add(confirmLabel);
  body.add(confirmSelect);
  select.focus();
  selectGuard.arm();

  return screen;
}
