// screens/handoff.ts — "where should this open?" for agents, Pi, Dev Phone,
// and the Twilio CLI.
//
// Every option names its destination: this terminal, a new window of the
// detected app, or a command to run yourself. After a window opens the
// screen stays put with the outcome, so "nothing happened" always has a
// visible next step instead of a flash that disappears.

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { relative } from "path";
import { ROOT } from "../lib/constants.ts";
import type { NewWindowResult, PreparedLaunch, TerminalInfo, WindowTarget } from "../lib/terminal.ts";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

export interface HandoffScreenOptions {
  prepared: PreparedLaunch;
  terminal: TerminalInfo;
  /** Only offer Copy command (TOOLKIT_OPEN=print). */
  printOnly?: boolean;
  /** Outcome to show on arrival, e.g. a failed automatic window open. */
  notice?: { text: string; ok: boolean };
  onHere: () => void;
  onWindow: (window: WindowTarget) => Promise<NewWindowResult>;
  onCopy: () => Promise<boolean>;
  onDone: () => void;
}

interface HandoffChoice {
  name: string;
  description: string;
  run: () => void | Promise<void>;
}

function timeLabel(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function windowOptionName(window: WindowTarget): string {
  if (window.kind === "windows") return "Open in a new console window";
  return window.current ? `Open in a new ${window.label} window` : `Open in ${window.label} (separate app)`;
}

export function buildHandoffScreen(renderer: CliRenderer, opts: HandoffScreenOptions): BoxRenderable {
  const { prepared, terminal } = opts;
  const { target } = prepared;
  const scriptLabel = relative(ROOT, prepared.scriptPath) || prepared.scriptPath;

  const { screen, body, footer } = buildEmbeddedRouteChrome(renderer, {
    id: "handoff-screen",
    route: `Dashboard / Open ${target.label}`,
    title: `Open ${target.label}`,
    subtitle: target.hint ? `First run: ${target.hint}` : "Choose where it should open.",
    bodyTitle: "Where should it open?",
    footer: shortcutBar(["Enter", "select"], ["Esc", "dashboard"]),
  });

  const info = new TextRenderable(renderer, {
    id: "handoff-info",
    content: [
      `Command  ${scriptLabel}`,
      terminal.windows.length === 0 && terminal.reason ? `New windows aren't offered here (${terminal.reason}).` : "",
    ].filter(Boolean).join("\n"),
    fg: THEME.dim2,
    width: "100%",
    wrapMode: "word",
  });

  const choices: HandoffChoice[] = [];
  let busy = false;
  const result = new TextRenderable(renderer, {
    id: "handoff-result",
    content: opts.notice?.text ?? "",
    fg: opts.notice ? (opts.notice.ok ? THEME.green : THEME.danger) : THEME.silver,
    width: "100%",
    wrapMode: "word",
  });
  const show = (text: string, ok: boolean) => {
    result.content = text;
    result.fg = ok ? THEME.green : THEME.danger;
  };

  if (!opts.printOnly) {
    choices.push({
      name: terminal.name === "this terminal" ? "Open here" : `Open here (this ${terminal.name} window)`,
      description: target.exitHint ?? "returns to the dashboard when it exits",
      run: () => opts.onHere(),
    });
    for (const window of terminal.windows) {
      choices.push({
        name: windowOptionName(window),
        description: window.current
          ? "the toolkit stays open here"
          : "its window may appear behind this one",
        run: async () => {
          result.content = `Opening ${window.label}…`;
          result.fg = THEME.yellow;
          const res = await opts.onWindow(window);
          if (res.ok) {
            show(`✓ Opened ${target.label} in ${window.label} at ${timeLabel()}. Not seeing it? Choose Open here or Copy command.`, true);
          } else {
            show(`✗ Could not open ${window.label}: ${res.error ?? "unknown error"}. Try Open here or Copy command.`, false);
          }
        },
      });
    }
  }
  choices.push({
    name: "Copy command",
    description: "run it yourself in any terminal",
    run: async () => {
      const copied = await opts.onCopy();
      show(copied
        ? `✓ Copied. Paste it into any terminal: ${prepared.command}`
        : `Clipboard unavailable. Run this yourself: ${prepared.command}`, copied);
    },
  });
  choices.push({ name: "Back to dashboard", description: "", run: () => opts.onDone() });

  const select = new SelectRenderable(renderer, {
    id: "handoff-select",
    height: choices.length * 2 + 1,
    flexShrink: 1,
    minHeight: 4,
    options: choices.map((choice, i) => ({ name: choice.name, description: choice.description, value: String(i) })),
    ...SELECT_STYLE,
  });

  // "Open here" is the default everywhere: it works in every terminal
  // (including editor terminals) and can't land behind another window.
  // TOOLKIT_OPEN=window skips this screen for hosts who prefer windows.
  const copyIndex = choices.findIndex((c) => c.name === "Copy command");
  select.setSelectedIndex(opts.printOnly ? copyIndex : 0);

  const guard = createInputGuard();
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!guard.ready() || busy) return;
    const choice = choices[Number.parseInt(option.value as string, 10)];
    if (!choice) return;
    const maybe = choice.run();
    if (maybe && typeof (maybe as Promise<void>).then === "function") {
      busy = true;
      footer.content = "  Working…";
      void (maybe as Promise<void>).finally(() => {
        busy = false;
        footer.content = shortcutBar(["Enter", "select"], ["Esc", "dashboard"]);
      });
    }
  });
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      if (!busy) opts.onDone();
    }
  };

  body.add(info);
  body.add(select);
  body.add(result);
  select.focus();
  guard.arm();
  return screen;
}
