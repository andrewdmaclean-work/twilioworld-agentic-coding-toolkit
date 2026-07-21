import { type CliRenderer, type BoxRenderable } from "@opentui/core";
import type { ToolkitStatus } from "../status.ts";
import type { ModelReasoningMode } from "../lib/config.ts";
import { LOCAL_MODEL_SIZE_LABEL, MODEL_SERVER_PORT } from "../lib/constants.ts";
import { buildSubmenuScreen } from "./submenu.ts";

function reasoningLabel(mode: ModelReasoningMode): string {
  if (mode === "on") return "On";
  if (mode === "auto") return "Auto";
  return "Off";
}

export function buildModelControlsScreen(
  renderer: CliRenderer,
  opts: {
    status: ToolkitStatus | null;
    reasoningMode: ModelReasoningMode;
    onOpenBrowser: () => void;
    onToggleReasoning: () => void;
    onStop: () => void;
    onRemove: () => void;
    onMissingModel: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "model-controls-screen",
    route: "Dashboard / Tools & settings / Local model",
    title: "Local model",
    subtitle: "Browser UI, response mode, storage, and process controls.",
    bodyTitle: "Local model",
    options: [
      {
        name: "Open browser UI",
        description: opts.status?.model.ready ? "start the model if needed, then open the web UI" : "download the model from Setup choices first",
        onSelect: () => {
          if (!opts.status?.model.ready) { opts.onMissingModel(); return false; }
          opts.onOpenBrowser();
          return true;
        },
      },
      {
        name: `Model thinking: ${reasoningLabel(opts.reasoningMode)}`,
        description: opts.reasoningMode === "off" ? "faster replies; Enter turns thinking on" : "more deliberate replies; Enter turns thinking off",
        onSelect: () => { opts.onToggleReasoning(); return true; },
      },
      {
        name: "Stop model server",
        description: opts.status?.model.running ? `running on :${MODEL_SERVER_PORT}` : "not running",
        onSelect: () => { opts.onStop(); return true; },
      },
      {
        name: "Remove local model",
        description: opts.status?.model.ready ? `delete model and runtime (~${LOCAL_MODEL_SIZE_LABEL})` : "nothing downloaded",
        onSelect: () => { opts.onRemove(); return false; },
      },
    ],
  }, opts.onCancel);
}
