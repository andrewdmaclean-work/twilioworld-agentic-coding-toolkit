import { type CliRenderer, type BoxRenderable } from "@opentui/core";
import type { ToolkitStatus } from "../status.ts";
import type { ModelReasoningMode } from "../lib/config.ts";
import { MODEL_SERVER_PORT } from "../lib/constants.ts";
import { getSelectedModel } from "../lib/local-models.ts";
import { buildSubmenuScreen, type SubmenuOption } from "./submenu.ts";

function reasoningLabel(mode: ModelReasoningMode): string {
  return mode[0].toUpperCase() + mode.slice(1);
}

export function buildModelControlsScreen(
  renderer: CliRenderer,
  opts: {
    status: ToolkitStatus | null;
    reasoningMode: ModelReasoningMode;
    showThinking: boolean;
    selectedModelName: string;
    onToggleThinking: (current: boolean) => boolean;
    onToggleReasoning: (current: ModelReasoningMode) => ModelReasoningMode;
    onChangeModel: () => void;
    onStop: () => void;
    onRemove: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  let showThinking = opts.showThinking;
  const thinkingOption: SubmenuOption = {
    name: `Show reasoning: ${showThinking ? "Yes" : "No"}`,
    description: "shows or hides Pi reasoning blocks without changing reasoning effort",
    onSelect: () => {
      showThinking = opts.onToggleThinking(showThinking);
      thinkingOption.name = `Show reasoning: ${showThinking ? "Yes" : "No"}`;
      return false;
    },
  };

  let reasoningMode = opts.reasoningMode;
  const effortOption: SubmenuOption = {
    name: `Reasoning effort: ${reasoningLabel(reasoningMode)}`,
    description: "Off disables reasoning; Low, Medium, and High stay independent from its display",
    onSelect: () => {
      reasoningMode = opts.onToggleReasoning(reasoningMode);
      effortOption.name = `Reasoning effort: ${reasoningLabel(reasoningMode)}`;
      return false;
    },
  };

  return buildSubmenuScreen(renderer, {
    id: "model-controls-screen",
    route: "Dashboard / Settings / Local AI model",
    title: "Manage local AI",
    subtitle: "Choose how local AI runs and how much storage it uses.",
    bodyTitle: "Local AI",
    options: [
      thinkingOption,
      effortOption,
      {
        name: `Model: ${opts.selectedModelName}`,
        description: "choose the local model shared by the browser interface and Pi",
        onSelect: () => { opts.onChangeModel(); return false; },
      },
      {
        name: "Stop local AI",
        description: opts.status?.model.running ? `currently running on :${MODEL_SERVER_PORT}` : "the local AI is not running",
        onSelect: () => { opts.onStop(); return true; },
      },
      {
        name: "Remove downloaded model",
        description: opts.status?.model.ready ? `free approximately ${getSelectedModel().sizeLabel} of local storage` : "no model files are installed",
        onSelect: () => { opts.onRemove(); return false; },
      },
    ],
  }, opts.onCancel);
}
