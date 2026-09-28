import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildSettingsScreen(
  renderer: CliRenderer,
  opts: {
    onRepair: () => void;
    onUninstall: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "settings-screen",
    route: "Dashboard / Settings",
    title: "Settings",
    subtitle: "Features install when you first choose them. Local AI settings live under Local chat.",
    bodyTitle: "Settings",
    options: [
      { name: "Check & repair", description: "verify and fix Skills, Docs, local AI, and tools", onSelect: () => { opts.onRepair(); return false; } },
      { name: "Uninstall or reset", description: "review and remove anything the toolkit installed", onSelect: () => { opts.onUninstall(); return false; } },
    ],
  }, opts.onCancel);
}
