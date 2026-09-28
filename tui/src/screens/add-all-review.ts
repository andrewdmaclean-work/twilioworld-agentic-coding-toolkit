// screens/add-all-review.ts — review before adding Twilio to every coding
// agent on this computer. Lists exactly what gets written for each agent.
// Nothing is installed and nothing opens.

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, listHeight, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

export function buildAddAllReviewScreen(
  renderer: CliRenderer,
  opts: {
    plans: Array<{ name: string; summary: string }>;
    skills: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "add-all-screen",
    route: "Dashboard / Add Twilio to my agents",
    title: "Add Twilio to my coding agents",
    subtitle: "Skills + live Docs for every project. Nothing new is installed and nothing opens.",
    bodyTitle: "Review",
    footer: shortcutBar(["Enter", "select"], ["Esc", "back"]),
  });

  const lines = [
    ...(opts.skills ? ["Twilio Skills → ~/.agents/skills (shared by Codex, Cursor, Copilot, OpenCode)"] : []),
    ...opts.plans.map((p) => `${p.name.padEnd(12)} ${p.summary}`),
    "",
    "Safe to run again: anything already set up is left as is.",
  ];
  const plan = new TextRenderable(renderer, {
    id: "add-all-plan",
    content: lines.join("\n"),
    fg: THEME.silver,
    width: "100%",
    wrapMode: "word",
    flexShrink: 0,
  });

  const select = new SelectRenderable(renderer, {
    id: "add-all-select",
    height: listHeight(2),
    flexShrink: 1,
    minHeight: 4,
    options: [
      { name: `Add Twilio to ${opts.plans.length === 1 ? opts.plans[0].name : `these ${opts.plans.length} agents`}`, description: "progress and details are shown as it goes", value: "go" },
      { name: "Cancel", description: "nothing is changed", value: "" },
    ],
    ...SELECT_STYLE,
  });

  const guard = createInputGuard();
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!guard.ready()) return;
    if (option.value === "go") opts.onConfirm();
    else opts.onCancel();
  });
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      opts.onCancel();
    }
  };

  body.add(plan);
  body.add(select);
  select.focus();
  guard.arm();
  return screen;
}
