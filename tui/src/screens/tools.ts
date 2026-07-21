import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildToolsScreen(
  renderer: CliRenderer,
  opts: {
    onSetup: () => void;
    onModelControls: () => void;
    onTwilioWorld: () => void;
    onDocs: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "tools-screen",
    route: "Dashboard / Tools & settings",
    title: "Tools & settings",
    subtitle: "Manage optional components or open project resources.",
    bodyTitle: "Tools & settings",
    options: [
      { name: "Setup choices", description: "install optional components or save choices for later", onSelect: () => { opts.onSetup(); return false; } },
      { name: "Local model controls", description: "browser UI, thinking mode, process, and storage", onSelect: () => { opts.onModelControls(); return false; } },
      { name: "Sign up for TwilioWorld", description: "open twilio.world in your browser", onSelect: () => { opts.onTwilioWorld(); return true; } },
      { name: "Twilio AI Docs", description: "open twilio.com/docs/ai in your browser", onSelect: () => { opts.onDocs(); return true; } },
    ],
  }, opts.onCancel);
}
