import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildSettingsScreen(
  renderer: CliRenderer,
  opts: {
    onSetup: () => void;
    onModelControls: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "settings-screen",
    route: "Dashboard / Settings",
    title: "Settings",
    subtitle: "Choose toolkit components or manage the local AI model.",
    bodyTitle: "What do you want to manage?",
    options: [
      { name: "Components", description: "choose and install Ask Twilio or Dev Phone", onSelect: () => { opts.onSetup(); return false; } },
      { name: "Local AI model", description: "browser chat, response style, running state, and downloaded files", onSelect: () => { opts.onModelControls(); return false; } },
    ],
  }, opts.onCancel);
}
