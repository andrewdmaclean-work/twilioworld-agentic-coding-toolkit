import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";

// Everything about local AI lives on this page: both interfaces plus its
// settings (model, reasoning, stop, remove). Nothing else in the dashboard
// installs or manages it.
export function buildLocalChatScreen(
  renderer: CliRenderer,
  opts: {
    modelReady: boolean;
    piReady: boolean;
    running: boolean;
    modelName: string;
    port: string;
    onBrowser: () => void;
    onPi: () => void;
    onSettings: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  const state = opts.running ? `running on :${opts.port}` : opts.modelReady ? "stopped" : "not downloaded yet";
  return buildSubmenuScreen(renderer, {
    id: "local-chat-screen",
    route: "Dashboard / Local chat",
    title: "Local chat",
    subtitle: opts.modelReady
      ? "Both interfaces share the same private model on this computer."
      : "Both interfaces share one private model. You'll choose it before anything downloads.",
    bodyTitle: "Choose an interface",
    options: [
      {
        name: "Browser chat (llamafile)",
        description: opts.modelReady
          ? "simple chat interface with live Twilio Docs search"
          : "pick a model to download, then open it in your browser",
        onSelect: () => { opts.onBrowser(); return false; },
      },
      {
        name: "Pi (terminal)",
        description: opts.piReady
          ? "coding-focused interface with Twilio Skills and live Docs tools"
          : opts.modelReady
            ? "installs Pi, then opens it with Twilio Skills and live Docs tools"
            : "choose a model, then install and open Pi",
        onSelect: () => { opts.onPi(); return false; },
      },
      {
        name: "Local AI settings",
        description: `${opts.modelName} · ${state} · model, stop, remove`,
        onSelect: () => { opts.onSettings(); return false; },
      },
    ],
  }, opts.onCancel);
}
