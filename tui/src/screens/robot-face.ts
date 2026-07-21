import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { ToolkitStatus } from "../status.ts";
import { THEME } from "../theme.ts";

const BLINK_EVERY_MS = 3200;
const BLINK_LENGTH_MS = 160;

function face(status: ToolkitStatus | null, blinking: boolean, alternate: boolean): string {
  const antenna = alternate ? "    *" : "    .";
  if (blinking) return `${antenna}\n  .----.\n  |-  -|\n  |  _ |\n  '----'`;
  if (!status?.model.ready) return `${antenna}\n  .----.\n  |-  -|\n  |  . |\n  '----'`;
  if (status.model.running) return `${antenna}\n  .----.\n  |^  ^|\n  | \\_/|\n  '----'`;
  if (status.twilio.sid) return `${antenna}\n  .----.\n  |o  o|\n  | \\_/|\n  '----'`;
  return `${antenna}\n  .----.\n  |o  o|\n  |  - |\n  '----'`;
}

export interface RobotFace {
  container: BoxRenderable;
  update: (status: ToolkitStatus | null) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function buildRobotFace(renderer: CliRenderer): RobotFace {
  const container = new BoxRenderable(renderer, {
    id: "robot-face",
    width: 12,
    height: 5,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.panelBg,
  });
  const display = new TextRenderable(renderer, {
    id: "robot-face-display",
    content: face(null, false, false),
    fg: THEME.cyan,
  });
  container.add(display);

  let currentStatus: ToolkitStatus | null = null;
  let alternate = false;
  let blinkTimer: ReturnType<typeof setTimeout> | null = null;
  const interval = setInterval(() => {
    alternate = !alternate;
    display.content = face(currentStatus, true, alternate);
    blinkTimer = setTimeout(() => {
      display.content = face(currentStatus, false, alternate);
      blinkTimer = null;
    }, BLINK_LENGTH_MS);
  }, BLINK_EVERY_MS);

  return {
    container,
    update(status) {
      currentStatus = status;
      display.content = face(status, false, alternate);
    },
    setVisible(visible) {
      container.visible = visible;
    },
    dispose() {
      clearInterval(interval);
      if (blinkTimer) clearTimeout(blinkTimer);
    },
  };
}
