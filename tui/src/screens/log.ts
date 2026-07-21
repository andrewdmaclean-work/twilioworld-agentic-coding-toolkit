// screens/log.ts — streaming command output screen.
// Shows a header, a scrollable log pane with live output, and a status
// footer. Used for Setup installs, Configure agent, and any other
// multi-step command sequence that streams output.
//
// The caller provides an async `run` function that receives an `onLog`
// callback and a `onDone(ok)` callback. The screen subscribes to those
// and renders output line-by-line into a ScrollBox.

import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../theme.ts";
import { shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

const ERR_COLOR = THEME.danger;
const START_DELAY_MS = 75;

function isDismissKey(args: unknown[]): boolean {
  for (const arg of args) {
    if (typeof arg === "string" && ["\r", "\n", " ", "q"].includes(arg)) return true;
    if (!arg || typeof arg !== "object") continue;
    const name = (arg as { name?: unknown }).name;
    if (typeof name === "string" && ["enter", "return", "space", "escape", "q"].includes(name)) return true;
  }
  return false;
}

function colorFor(line: string, stream: "stdout" | "stderr"): string {
  if (line.startsWith("✓")) return THEME.green;
  if (line.startsWith("☑")) return THEME.green;
  if (line.startsWith("✗")) return ERR_COLOR;
  if (line.startsWith("⚠")) return THEME.yellow;
  if (line.startsWith("▶")) return THEME.red;
  if (stream === "stderr") return THEME.yellow;
  return THEME.silver;
}

function wrapText(text: string, width: number): string {
  if (width <= 0) return text;
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw) {
      out.push("");
      continue;
    }
    let line = raw;
    while (line.length > width) {
      let cut = line.lastIndexOf(" ", width);
      if (cut < Math.max(12, Math.floor(width * 0.4))) cut = width;
      out.push(line.slice(0, cut).trimEnd());
      line = line.slice(cut).trimStart();
    }
    out.push(line);
  }
  return out.join("\n");
}

export function buildLogScreen(
  renderer: CliRenderer,
  title: string,
  run: (
    onLog: (line: string, stream: "stdout" | "stderr") => void,
    onDone: (ok: boolean) => void,
  ) => void | Promise<void>,
  onFinished: (ok: boolean) => void,
): BoxRenderable {
  const { screen, body, footer } = buildEmbeddedRouteChrome(renderer, {
    id: "log-screen",
    route: "Dashboard / Task Log",
    title,
    subtitle: "",
    bodyTitle: "Live Output",
    footer: shortcutBar(["D", "details"]),
  });

  const scroll = new ScrollBoxRenderable(renderer, {
    id: "log-scroll",
    flexGrow: 1,
    stickyScroll: true,
    stickyStart: "bottom",
  });
  const progress = new TextRenderable(renderer, {
    id: "task-progress",
    content: "  ◌  Preparing task",
    fg: THEME.yellow,
    visible: true,
  });
  const timeline = new TextRenderable(renderer, {
    id: "task-timeline",
    content: "",
    fg: THEME.silver,
  });
  body.add(progress);
  body.add(timeline);
  body.add(scroll);

  let detailsVisible = !title.startsWith("Setup");
  scroll.visible = detailsVisible;
  timeline.visible = !detailsVisible;

  let lineCount = 0;
  let lastLogKey = "";
  let startedAt = Date.now();
  const recentSteps: string[] = [];
  const dismissGuard = createInputGuard();

  function onLog(line: string, stream: "stdout" | "stderr") {
    if (!line.trim()) return; // skip blank lines
    const logKey = `${stream}:${line}`;
    if (logKey === lastLogKey) return;
    lastLogKey = logKey;
    const summary = line.replace(/^[✓☑✗⚠▶]\s*/, "").trim();
    if (summary) {
      const marker = line.startsWith("✓") || line.startsWith("☑") ? "●" : line.startsWith("✗") ? "!" : line.startsWith("⚠") ? "!" : "◌";
      const numeric = summary.match(/\[(\d+)\/(\d+)\]/);
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      if (numeric) {
        const current = Number(numeric[1]);
        const total = Math.max(1, Number(numeric[2]));
        const filled = Math.min(18, Math.round((current / total) * 18));
        progress.content = `  ${"█".repeat(filled)}${"░".repeat(18 - filled)}  ${current}/${total}  ${elapsed}s`;
      } else {
        progress.content = `  ${marker}  ${summary}  ${elapsed}s`;
      }
      progress.fg = colorFor(line, stream);
      if (/^[✓☑✗⚠▶]/.test(line)) {
        recentSteps.push(`  ${marker}  ${summary}`);
        while (recentSteps.length > 8) recentSteps.shift();
        timeline.content = recentSteps.join("\n");
      }
    }
    lineCount++;
    scroll.content.add(
      new TextRenderable(renderer, {
        id: `log-line-${lineCount}`,
        content: wrapText(line, Math.max(24, (scroll.width ?? renderer.width) - 8)),
        fg: colorFor(line, stream),
      }),
    );
  }

  let taskDone = false;
  let taskOk = false;

  function onDone(ok: boolean) {
    taskDone = true;
    taskOk = ok;
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    progress.content = ok ? `  ●  Task complete  ${elapsed}s` : `  !  Task failed  ${elapsed}s`;
    progress.fg = ok ? THEME.green : ERR_COLOR;
    footer.content = ok
      ? shortcutBar(["D", "details"], ["Enter", "return"])
      : shortcutBar(["R", "retry"], ["D", "details"], ["Esc", "return"]);
    footer.fg = ok ? THEME.green : ERR_COLOR;
    dismissGuard.arm();
  }

  footer.content = "  Starting task...";
  footer.fg = THEME.yellow;

  function clearLog(): void {
    for (const child of [...scroll.content.getChildren()]) scroll.content.remove(child.id);
    lineCount = 0;
    lastLogKey = "";
    recentSteps.length = 0;
    timeline.content = "";
  }

  function startRun(): void {
    taskDone = false;
    taskOk = false;
    startedAt = Date.now();
    clearLog();
    progress.content = "  ◌  Preparing task";
    progress.fg = THEME.yellow;
    footer.content = detailsVisible ? shortcutBar(["D", "hide details"]) : shortcutBar(["D", "show details"]);
    footer.fg = THEME.yellow;

  // Yield at least one render frame before setup/uninstall begins. Those flows
  // do some synchronous local checks before their first subprocess, and starting
  // them in a microtask makes the TUI look frozen after the user confirms.
  //
  // `run` is typically async (returns a Promise). A synchronous try/catch only
  // catches synchronous throws — a REJECTED promise would escape it, become an
  // unhandledRejection, and the top-level handler in index.ts would shut the
  // whole TUI down. So we catch both: the sync throw AND the async rejection,
  // routing either into the log pane + onDone(false) instead of killing the app.
  setTimeout(() => {
    let doneCalled = false;
    const safeDone = (ok: boolean) => { if (!doneCalled) { doneCalled = true; onDone(ok); } };
    try {
      const maybePromise = run(onLog, safeDone) as unknown;
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
        (maybePromise as Promise<unknown>).catch((e: unknown) => {
          onLog(`error: ${(e as Error)?.message ?? String(e)}`, "stderr");
          safeDone(false);
        });
      }
    } catch (e) {
      onLog((e as Error).message, "stderr");
      safeDone(false);
    }
  }, START_DELAY_MS);
  }

  const handler = (...args: unknown[]) => {
    const key = args.find((arg) => arg && typeof arg === "object" && typeof (arg as { name?: unknown }).name === "string") as { name?: string } | undefined;
    if (key?.name === "d") {
      detailsVisible = !detailsVisible;
      scroll.visible = detailsVisible;
      timeline.visible = !detailsVisible;
      footer.content = taskDone
        ? (taskOk ? shortcutBar(["D", "details"], ["Enter", "return"]) : shortcutBar(["R", "retry"], ["D", "details"], ["Esc", "return"]))
        : (detailsVisible ? shortcutBar(["D", "hide details"]) : shortcutBar(["D", "show details"]));
      return;
    }
    if (taskDone && !taskOk && key?.name === "r") {
      startRun();
      return;
    }
    if (!taskDone || !dismissGuard.ready() || !isDismissKey(args)) return;
    renderer.keyInput.removeListener("keypress", handler);
    onFinished(taskOk);
  };
  renderer.keyInput.on("keypress", handler);
  startRun();

  return screen;
}
