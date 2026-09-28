// screens/prompts.ts — small review prompts: install confirmation and the
// quit prompt shown while local AI is still running.

import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function devPhoneInstallSummary(cliInstalled: boolean): string {
  return `Installs ${cliInstalled ? "" : "the Twilio CLI and "}the Dev Phone plugin inside this repo. Your system Twilio CLI is not changed.`;
}

export const TWILIO_CLI_INSTALL_SUMMARY =
  "Installs the Twilio CLI inside this repo (npm). Your system Twilio CLI and its profiles are not touched.";

export function buildInstallReviewScreen(
  renderer: CliRenderer,
  opts: { id: string; title: string; summary: string; confirm: string; onConfirm: () => void; onCancel: () => void },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: opts.id,
    route: `Dashboard / ${opts.title}`,
    title: opts.title,
    subtitle: opts.summary,
    bodyTitle: "Review",
    options: [
      { name: opts.confirm, description: "progress and details are shown while it installs", onSelect: () => { opts.onConfirm(); return false; } },
      { name: "Cancel", description: "nothing is installed", onSelect: () => { opts.onCancel(); return false; } },
    ],
  }, opts.onCancel);
}

export function buildQuitScreen(
  renderer: CliRenderer,
  opts: { modelName: string; port: string; onStopAndQuit: () => void; onQuit: () => void; onCancel: () => void },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "quit-screen",
    route: "Dashboard / Quit",
    title: "Local AI is still running",
    subtitle: `${opts.modelName} is using memory and port ${opts.port}. Escape returns to the dashboard.`,
    bodyTitle: "Before you go",
    options: [
      {
        name: "Stop local AI and quit",
        description: "frees memory; it restarts when you next open local chat",
        onSelect: () => { opts.onStopAndQuit(); return false; },
      },
      {
        name: "Quit and keep it running",
        description: "browser chat and Pi keep working",
        onSelect: () => { opts.onQuit(); return false; },
      },
    ],
  }, opts.onCancel);
}
