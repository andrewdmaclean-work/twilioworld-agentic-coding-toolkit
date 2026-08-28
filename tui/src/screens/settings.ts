import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildSettingsScreen(
  renderer: CliRenderer,
  opts: {
    onSetup: () => void;
    onModelControls: () => void;
    onUninstall: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "settings-screen",
    route: "Dashboard / Settings",
    title: "Settings",
    subtitle: "Install, repair, or remove toolkit features on this computer.",
    bodyTitle: "Settings",
    options: [
      { name: "Install or repair features", description: "restore the default AI bundle or add Dev Phone", onSelect: () => { opts.onSetup(); return false; } },
      { name: "Manage local AI", description: "change the shared model or response effort, stop it, or free storage", onSelect: () => { opts.onModelControls(); return false; } },
      { name: "Uninstall or reset", description: "review and remove toolkit-managed files, tools, skills, or legacy account data", onSelect: () => { opts.onUninstall(); return false; } },
    ],
  }, opts.onCancel);
}
