import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

export function buildLocalChatScreen(
  renderer: CliRenderer,
  opts: {
    modelReady: boolean;
    piReady: boolean;
    modelSize: string;
    onBrowser: () => void;
    onPi: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  return buildSubmenuScreen(renderer, {
    id: "local-chat-screen",
    route: "Dashboard / Local chat",
    title: "Local chat",
    subtitle: opts.modelReady
      ? "Choose an interface. Both use the same private model on this computer."
      : `Choose an interface. The shared model downloads once (~${opts.modelSize}).`,
    bodyTitle: "Choose an interface",
    options: [
      {
        name: "Browser chat (llamafile)",
        description: opts.modelReady
          ? "simple chat interface with live Twilio Docs search"
          : `download ${opts.modelSize}, then open the simple browser interface`,
        onSelect: () => { opts.onBrowser(); return false; },
      },
      {
        name: "Pi (terminal)",
        description: opts.piReady
          ? "coding-focused interface with Twilio Skills and live Docs tools"
          : "install what is missing, then open Pi with Twilio Skills and live Docs tools",
        onSelect: () => { opts.onPi(); return false; },
      },
    ],
  }, opts.onCancel);
}
