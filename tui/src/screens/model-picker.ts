import { type BoxRenderable, type CliRenderer } from "@opentui/core";
import { buildSubmenuScreen } from "./submenu.ts";
import { LOCAL_MODELS, getSelectedModel, localModelInstalled } from "../lib/local-models.ts";
import { setLocalModelSlug } from "../lib/config.ts";

export function buildModelPickerScreen(
  renderer: CliRenderer,
  opts: {
    onModelReady: () => void;
    onModelNeedsDownload: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  const current = getSelectedModel();
  return buildSubmenuScreen(renderer, {
    id: "model-picker-screen",
    route: "Dashboard / Settings / Local AI model / Change model",
    title: "Change model",
    subtitle: "Choose which local model to use. Already-downloaded models switch instantly.",
    bodyTitle: "Available models",
    options: LOCAL_MODELS.map((m) => ({
      name: m.slug === current.slug ? `● ${m.name}` : `  ${m.name}`,
      description: m.description,
      onSelect: () => {
        setLocalModelSlug(m.slug);
        if (localModelInstalled(m)) {
          opts.onModelReady();
        } else {
          opts.onModelNeedsDownload();
        }
        return false;
      },
    })),
  }, opts.onCancel);
}
