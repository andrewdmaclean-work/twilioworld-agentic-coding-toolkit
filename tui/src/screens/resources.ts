import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildResourcesScreen(
  renderer: CliRenderer,
  opts: {
    onTwilioWorld: () => void;
    onDocs: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "resources-screen",
    route: "Dashboard / Resources",
    title: "Resources",
    subtitle: "Open TwilioWorld and the Twilio AI documentation.",
    bodyTitle: "Resources",
    options: [
      { name: "TwilioWorld", description: "open twilio.world in your browser", onSelect: () => { opts.onTwilioWorld(); return true; } },
      { name: "Twilio AI Docs", description: "open twilio.com/docs/ai in your browser", onSelect: () => { opts.onDocs(); return true; } },
    ],
  }, opts.onCancel);
}
