// screens/setup.ts — two-phase setup wizard using native OpenTUI.
// Phase 1: native CheckList for add-on selection (writes config.json).
// Phase 2: log screen streaming runSetup() output in-TUI.

import { type CliRenderer, BoxRenderable, SelectRenderable, SelectRenderableEvents, TextRenderable } from "@opentui/core";
import { CheckList, type CheckItem } from "../checklist.ts";
import { writeConfig, readConfig, type AddonKey } from "../lib/config.ts";
import { capture, have } from "../lib/exec.ts";
import { modelReady } from "../lib/model.ts";
import { getSelectedModel } from "../lib/local-models.ts";
import { runSetup } from "../lib/setup.ts";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome, removeAllChildren } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";
import { buildLogScreen } from "./log.ts";

type SetupItem = CheckItem & { key: AddonKey | `__${string}`; done?: boolean };

function isConfigItem(item: SetupItem): item is SetupItem & { key: AddonKey } {
  return !item.heading;
}

function doneLabel(done: boolean, label: string): string {
  return done ? `✓ ${label}` : label;
}

function devPhoneInstalled(): boolean {
  return have("twilio") && capture("twilio", ["plugins"]).includes("plugin-dev-phone");
}

function buildAddonItems(): SetupItem[] {
  const model = modelReady();
  const localDone = model.runtime && model.weights;
  const devDone = devPhoneInstalled();
  return [
    { key: "__local", label: "Included AI toolkit", description: "Skills + live Docs are always prepared; local chat is selected by default.", heading: true },
    {
      key: "localGemma" as AddonKey,
      label: doneLabel(localDone, "Install private local chat"),
      description: localDone ? "Downloaded; use it in the browser or Pi." : `Browser or Pi interface; downloads about ${getSelectedModel().sizeLabel}`,
      done: localDone,
    },
    { key: "__tools", label: "Additional Twilio tools", description: devDone ? "Done." : "Installed only when selected.", heading: true },
    {
      key: "devPhone" as AddonKey,
      label: doneLabel(devDone, "Install Dev Phone for SMS + voice testing"),
      description: devDone ? "Dev Phone plugin installed." : "Browser soft phone for SMS + voice",
      done: devDone,
    },
  ];
}

export function buildSetupScreen(
  renderer: CliRenderer,
  onFinished: () => void,
  onCancel: () => void,
  opts: { firstRun?: boolean } = {},
): BoxRenderable {
  const current = readConfig();
  const addonItems = buildAddonItems();
  const configItems = addonItems.filter(isConfigItem);
  const initialChecked = new Set<number>(
    addonItems.map((item, i) => (isConfigItem(item) && (current.addons[item.key] || item.done) ? i : -1)).filter((i) => i >= 0),
  );

  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "setup-screen",
    route: opts.firstRun ? "Welcome" : "Dashboard / Settings / Features",
    title: opts.firstRun ? "Review your setup" : "Install or repair features",
    subtitle: opts.firstRun
      ? "AI features are selected by default. Dev Phone is an additional account-facing tool."
      : "Choose features to install on this computer. Space toggles; Enter reviews.",
    bodyTitle: "Features",
    footer: opts.firstRun
      ? shortcutBar(["Esc", "set up later"], ["Space", "toggle"], ["Enter", "review"])
      : shortcutBar(["Esc", "dashboard"], ["Space", "toggle"], ["Enter", "save"]),
  });

  const checklist = new CheckList(renderer, "addon-pick", addonItems, initialChecked);
  body.add(checklist.container);

  // Confirm panel (shown after checklist confirm)
  const confirmLabel = new TextRenderable(renderer, { id: "confirm-label", content: "Choices saved. Apply them now?", fg: THEME.green, visible: false });
  const confirmSelect = new SelectRenderable(renderer, {
    id: "confirm-select", height: 4, flexGrow: 1, flexShrink: 0, visible: false,
    options: [
      { name: "Apply now", description: "prepares Twilio knowledge and installs the selected features" },
      { name: "Go back", description: "review the optional feature choices again" },
    ],
    ...SELECT_STYLE,
  });
  const confirmGuard = createInputGuard();

  function startSetup(): void {
    const logScreen = buildLogScreen(
      renderer, "Setup — installing",
      (onLog, onDone) => runSetup({ onLog, onDone }),
      () => onFinished(),
    );
    removeAllChildren(screen);
    screen.add(logScreen);
  }

  function showChecklist(): void {
    confirmLabel.visible = false;
    confirmSelect.visible = false;
    checklist.container.visible = true;
    checklist.focus();
  }

  confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
    if (!confirmGuard.ready()) return;
    if (index === 0) {
      startSetup();
    } else {
      showChecklist();
    }
  });
  confirmSelect.onKeyDown = (key) => {
    if (key.name === "escape" || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      showChecklist();
    }
  };
  body.add(confirmLabel);
  body.add(confirmSelect);

  checklist.onConfirm = (checkedKeys) => {
    // Twilio Skills and Docs MCP are core capabilities,
    // not optional installs. Only the local model and Dev Phone need a choice.
    const addons: Record<AddonKey, boolean> = {
      ...current.addons,
      twilioSkills: true,
      docsMcp: true,
    };
    for (const item of configItems) addons[item.key] = checkedKeys.includes(item.key) || Boolean(item.done);
    writeConfig(addons);
    checklist.container.visible = false;
    confirmLabel.visible = true;
    confirmSelect.visible = true;
    confirmSelect.setSelectedIndex(0);
    confirmSelect.focus();
    confirmGuard.arm();
  };
  checklist.onCancel = () => {
    if (opts.firstRun) {
      writeConfig({
        ...current.addons,
        twilioSkills: true,
        docsMcp: true,
        localGemma: true,
        devPhone: false,
      }, current.settings);
      onFinished();
      return;
    }
    onCancel();
  };
  checklist.focus();

  return screen;
}
