// screens/local-ai-install.ts — the review shown before local AI downloads.
// The model is chosen here, at the moment of download, so nobody downloads
// the default and then a second model they actually wanted.

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { LLAMAFILE_SIZE_LABEL } from "../lib/constants.ts";
import { DEFAULT_MODEL_SLUG, LOCAL_MODELS, type LocalModel } from "../lib/local-models.ts";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, listHeight, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";

export function buildLocalAiInstallScreen(
  renderer: CliRenderer,
  opts: {
    /** Interface to open once the download finishes. */
    next: "browser" | "pi";
    selectedSlug: string;
    installedSlugs: string[];
    runtimeInstalled: boolean;
    piInstalled: boolean;
    freeGb: number | null;
    onChoose: (model: LocalModel) => void;
    onCancel: () => void;
  },
): BoxRenderable {
  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "local-ai-install-screen",
    route: "Dashboard / Local chat / Choose a model",
    title: "Set up private local chat",
    subtitle: "Runs entirely on this computer. It downloads once, into this repo.",
    bodyTitle: "Choose a model",
    footer: shortcutBar(["Enter", "download and open"], ["Esc", "back"]),
  });

  const extras = [
    opts.runtimeInstalled ? "" : `llamafile runtime (${LLAMAFILE_SIZE_LABEL})`,
    opts.next === "pi" && !opts.piInstalled ? "the Pi terminal interface (npm)" : "",
  ].filter(Boolean);
  const info = new TextRenderable(renderer, {
    id: "local-ai-install-info",
    content: [
      extras.length ? `Also installs: ${extras.join(" and ")}` : "",
      opts.freeGb === null ? "" : `Free disk space: ${opts.freeGb.toFixed(1)} GB`,
      "Checksums are verified before anything runs. You can change or remove the model later.",
    ].filter(Boolean).join("\n"),
    fg: THEME.dim2,
    width: "100%",
    wrapMode: "word",
  });

  const options = [
    ...LOCAL_MODELS.map((model) => ({
      name: `${model.name}${model.slug === DEFAULT_MODEL_SLUG ? " (recommended)" : ""}`,
      description: opts.installedSlugs.includes(model.slug)
        ? `${model.description} · already downloaded, opens right away`
        : model.description,
      value: model.slug,
    })),
    { name: "Cancel", description: "nothing is downloaded", value: "" },
  ];
  const select = new SelectRenderable(renderer, {
    id: "local-ai-install-select",
    height: listHeight(options.length),
    flexShrink: 1,
    minHeight: 4,
    options,
    ...SELECT_STYLE,
  });
  select.setSelectedIndex(Math.max(0, LOCAL_MODELS.findIndex((m) => m.slug === opts.selectedSlug)));

  const guard = createInputGuard();
  select.on(SelectRenderableEvents.ITEM_SELECTED, (_, option) => {
    if (!guard.ready()) return;
    const model = LOCAL_MODELS.find((m) => m.slug === option.value);
    if (model) opts.onChoose(model);
    else opts.onCancel();
  });
  select.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      opts.onCancel();
    }
  };

  body.add(info);
  body.add(select);
  select.focus();
  guard.arm();
  return screen;
}
