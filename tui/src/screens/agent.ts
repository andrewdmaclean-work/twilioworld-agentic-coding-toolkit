// screens/agent.ts — native agent selection + in-TUI log for configureAgent().

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
} from "@opentui/core";
import { configureAgent } from "../lib/configure-agent.ts";
import { agentPickerOptions } from "../lib/agents.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome, removeAllChildren } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";
import { buildLogScreen } from "./log.ts";

export function buildAgentScreen(
  renderer: CliRenderer,
  onFinished: (ok?: boolean) => void,
  onCancel: () => void,
): BoxRenderable {
  const agentOptions = agentPickerOptions();
  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "agent-screen",
    route: "Dashboard / Configure Agent",
    title: "Configure agent",
    subtitle: "Choose the agent integration to wire. Escape returns to dashboard.",
    bodyTitle: "Agents",
    footer: shortcutBar(["Esc", "dashboard"], ["Enter", "configure"]),
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
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!selectGuard.ready()) return;
    const agentValue = option.value as string;
    const logScreen = buildLogScreen(
      renderer,
      `Configure agent — ${agentValue}`,
      (onLog, onDone) => configureAgent({ agent: agentValue, onLog, onDone }),
      (ok) => onFinished(ok),
    );
    removeAllChildren(screen);
    screen.add(logScreen);
  });
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      onCancel();
    }
  };

  body.add(select);
  select.focus();
  selectGuard.arm();

  return screen;
}
