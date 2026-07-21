import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { ToolkitStatus } from "../status.ts";
import { THEME } from "../theme.ts";

const FRAME_MS = 420;
const REACTION_MS = 1_250;

export type RobotReaction = "curious" | "excited" | "alert" | "thinking";
export type RobotMode = "full" | "compact" | "hidden";

interface RobotFrame {
  art: string;
  color: string;
}

function baseMood(status: ToolkitStatus | null): "sleepy" | "ready" | "connected" | "working" {
  if (!status?.model.ready) return "sleepy";
  if (status.model.running) return "working";
  if (status.twilio.sid) return "connected";
  return "ready";
}

function frame(status: ToolkitStatus | null, phase: number, reaction: RobotReaction | null): RobotFrame {
  const mood = baseMood(status);
  const pulse = ["·", "●", "•"][phase % 3];
  const blinking = phase > 0 && phase % 12 === 0;
  const glanceLeft = phase % 16 >= 6 && phase % 16 <= 8;
  const glanceRight = phase % 16 >= 12 && phase % 16 <= 14;

  let eyes = " ●   ● ";
  let mouth = "   ─   ";
  let color = THEME.cyan;

  if (mood === "sleepy") {
    eyes = phase % 8 === 0 ? " ●   ● " : " ─   ─ ";
    mouth = "   ·   ";
    color = THEME.dim2;
  } else if (mood === "working") {
    eyes = blinking ? " ─   ─ " : " ^   ^ ";
    mouth = phase % 2 === 0 ? "   ▿   " : "   ⌣   ";
    color = THEME.green;
  } else if (mood === "connected") {
    eyes = blinking ? " ─   ─ " : " ◉   ◉ ";
    mouth = "   ⌣   ";
    color = THEME.red;
  } else if (blinking) {
    eyes = " ─   ─ ";
  } else if (glanceLeft) {
    eyes = "●   ●  ";
  } else if (glanceRight) {
    eyes = "  ●   ●";
  }

  if (reaction === "curious") {
    eyes = phase % 2 === 0 ? " ◉   ● " : " ●   ◉ ";
    mouth = "   ?   ";
    color = THEME.yellow;
  } else if (reaction === "excited") {
    eyes = " ★   ★ ";
    mouth = phase % 2 === 0 ? "   ▽   " : "   ◡   ";
    color = THEME.green;
  } else if (reaction === "alert") {
    eyes = " !   ! ";
    mouth = "   ─   ";
    color = THEME.danger;
  } else if (reaction === "thinking") {
    eyes = phase % 2 === 0 ? " ●   · " : " ·   ● ";
    mouth = "   ·   ";
    color = THEME.cyan;
  }

  return {
    art: [
      `      ${pulse}`,
      "  ╭───┴───╮",
      `  │${eyes}│`,
      `  │${mouth}│`,
      "  ╰──┬─┬──╯",
    ].join("\n"),
    color,
  };
}

function compactFrame(status: ToolkitStatus | null, phase: number, reaction: RobotReaction | null): RobotFrame {
  const mood = baseMood(status);
  let eyes = mood === "sleepy" ? "─ ─" : mood === "working" ? "^ ^" : mood === "connected" ? "◉ ◉" : "● ●";
  let color = mood === "sleepy" ? THEME.dim2 : mood === "working" ? THEME.green : mood === "connected" ? THEME.red : THEME.cyan;
  if (reaction === "curious") { eyes = "◉ ?"; color = THEME.yellow; }
  if (reaction === "excited") { eyes = "★ ★"; color = THEME.green; }
  if (reaction === "alert") { eyes = "! !"; color = THEME.danger; }
  if (reaction === "thinking") { eyes = phase % 2 === 0 ? "● ·" : "· ●"; color = THEME.cyan; }
  return {
    art: [`   ${["·", "●", "•"][phase % 3]}`, " ╭─┴─╮", ` │${eyes}│`, " ╰───╯"].join("\n"),
    color,
  };
}

export interface RobotFace {
  container: BoxRenderable;
  update: (status: ToolkitStatus | null) => void;
  react: (reaction: RobotReaction) => void;
  setMode: (mode: RobotMode) => void;
  dispose: () => void;
}

export function buildRobotFace(renderer: CliRenderer): RobotFace {
  const container = new BoxRenderable(renderer, {
    id: "robot-face",
    width: 16,
    height: 5,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.panelBg,
  });
  const initial = frame(null, 0, null);
  const display = new TextRenderable(renderer, {
    id: "robot-face-display",
    content: initial.art,
    fg: initial.color,
  });
  container.add(display);

  let currentStatus: ToolkitStatus | null = null;
  let currentReaction: RobotReaction | null = null;
  let reactionUntil = 0;
  let phase = 0;
  let mode: RobotMode = "full";

  function render(): void {
    if (mode === "hidden") return;
    if (currentReaction && Date.now() >= reactionUntil) currentReaction = null;
    const next = mode === "compact"
      ? compactFrame(currentStatus, phase, currentReaction)
      : frame(currentStatus, phase, currentReaction);
    display.content = next.art;
    display.fg = next.color;
  }

  const interval = setInterval(() => {
    phase++;
    render();
  }, FRAME_MS);

  return {
    container,
    update(status) {
      currentStatus = status;
      render();
    },
    react(reaction) {
      currentReaction = reaction;
      reactionUntil = Date.now() + REACTION_MS;
      phase++;
      render();
    },
    setMode(nextMode) {
      mode = nextMode;
      container.visible = mode !== "hidden";
      container.width = mode === "compact" ? 9 : 16;
      container.height = mode === "compact" ? 4 : 5;
      if (mode !== "hidden") render();
    },
    dispose() {
      clearInterval(interval);
    },
  };
}
