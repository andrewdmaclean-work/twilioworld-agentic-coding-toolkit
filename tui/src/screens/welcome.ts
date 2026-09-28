// screens/welcome.ts — first run. One question instead of an install
// checklist: what do you want to do first? Nothing large downloads here;
// every feature installs when it is first chosen, behind its own review.

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { buildRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

export type WelcomeChoice = "agent" | "localchat" | "dashboard";

export function buildWelcomeScreen(
  renderer: CliRenderer,
  opts: {
    /** e.g. "2.5–3.3 GB" */
    modelSizeRange: string;
    onChoose: (choice: WelcomeChoice) => void;
  },
): BoxRenderable {
  const { screen, body } = buildRouteChrome(renderer, {
    id: "welcome-screen",
    route: "Welcome",
    title: "Agentic Coding Toolkit",
    subtitle: "Reliable Twilio context for coding agents: Twilio Skills plus live, read-only Docs search.",
    bodyTitle: "What would you like to do first?",
    footer: shortcutBar(["↑↓", "choose"], ["Enter", "continue"], ["Esc", "look around"]),
  });

  const choices: Array<{ value: WelcomeChoice; name: string; description: string }> = [
    {
      value: "agent",
      name: "Set up a coding agent  (recommended)",
      description: "Claude Code, Codex, Cursor, OpenCode, Copilot, or Pi · no large download",
    },
    {
      value: "localchat",
      name: "Try private local chat",
      description: `a model that runs on this computer · you pick it next (${opts.modelSizeRange})`,
    },
    {
      value: "dashboard",
      name: "Look around first",
      description: "open the dashboard · features install when you choose them",
    },
  ];

  const select = new SelectRenderable(renderer, {
    id: "welcome-select",
    height: choices.length * 2 + 1,
    flexShrink: 1,
    minHeight: 4,
    options: choices.map((c) => ({ name: c.name, description: c.description, value: c.value })),
    ...SELECT_STYLE,
  });

  const note = new TextRenderable(renderer, {
    id: "welcome-note",
    content: "Nothing downloads until you choose it, and you'll see what each step installs first.\nNo Twilio login is needed for Skills or Docs.",
    fg: THEME.dim2,
    width: "100%",
    wrapMode: "word",
  });

  const guard = createInputGuard();
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!guard.ready()) return;
    opts.onChoose(option.value as WelcomeChoice);
  });
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      opts.onChoose("dashboard");
    }
  };

  body.add(select);
  body.add(note);
  select.focus();
  guard.arm();
  return screen;
}
