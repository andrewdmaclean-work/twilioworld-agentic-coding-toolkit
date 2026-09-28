// screens/model-picker.ts — model selection with a confirm step before
// starting a multi-GB download (already-downloaded models switch instantly).

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { LOCAL_MODELS, getSelectedModel, localModelInstalled } from "../lib/local-models.ts";
import { setLocalModelSlug } from "../lib/config.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { THEME } from "../theme.ts";
import { buildEmbeddedRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

export function buildModelPickerScreen(
  renderer: CliRenderer,
  opts: {
    onModelReady: () => void;
    onModelNeedsDownload: () => void;
    onCancel: () => void;
  },
): BoxRenderable {
  const current = getSelectedModel();

  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "model-picker-screen",
    route: "Dashboard / Local chat / Local AI settings / Change model",
    title: "Change model",
    subtitle: "Choose which local model to use. Already-downloaded models switch instantly.",
    bodyTitle: "Available models",
    footer: shortcutBar(["Esc", "dashboard"], ["Enter", "select"]),
  });

  const select = new SelectRenderable(renderer, {
    id: "model-picker-select",
    height: LOCAL_MODELS.length + 2,
    flexGrow: 1,
    flexShrink: 0,
    options: LOCAL_MODELS.map((m, i) => ({
      name: m.slug === current.slug ? `● ${m.name}` : `  ${m.name}`,
      description: m.description,
      value: String(i),
    })),
    ...SELECT_STYLE,
  });

  const selectGuard = createInputGuard();
  const confirmGuard = createInputGuard();
  const confirmLabel = new TextRenderable(renderer, {
    id: "model-picker-confirm-label",
    content: "",
    fg: THEME.yellow,
    visible: false,
  });
  const confirmSelect = new SelectRenderable(renderer, {
    id: "model-picker-confirm-select",
    height: 4,
    flexGrow: 1,
    flexShrink: 0,
    visible: false,
    options: [
      { name: "Go back", description: "keep the current model; choose again" },
      { name: "Download and switch", description: "starts the download now, then switches when it finishes" },
    ],
    ...SELECT_STYLE,
  });
  let pendingSlug = "";

  function showList(): void {
    confirmLabel.visible = false;
    confirmSelect.visible = false;
    select.visible = true;
    select.focus();
    selectGuard.arm();
  }

  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!selectGuard.ready()) return;
    const idx = parseInt(option.value as string, 10);
    const model = LOCAL_MODELS[idx];
    if (!model) return;

    if (localModelInstalled(model)) {
      setLocalModelSlug(model.slug);
      opts.onModelReady();
      return;
    }

    pendingSlug = model.slug;
    select.visible = false;
    confirmLabel.content = `Download ${model.name} (${model.sizeLabel})? This uses network and disk space.`;
    confirmLabel.visible = true;
    confirmSelect.visible = true;
    confirmSelect.setSelectedIndex(0);
    confirmSelect.focus();
    confirmGuard.arm();
  });

  confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
    if (!confirmGuard.ready()) return;
    if (index !== 1 || !pendingSlug) { showList(); return; }
    setLocalModelSlug(pendingSlug);
    opts.onModelNeedsDownload();
  });
  confirmSelect.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      showList();
    }
  };
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      opts.onCancel();
    }
  };

  body.add(select);
  body.add(confirmLabel);
  body.add(confirmSelect);
  select.focus();
  selectGuard.arm();

  return screen;
}
