// screens/uninstall.ts — choose uninstall items inside OpenTUI.

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { CheckList, type CheckItem } from "../checklist.ts";
import { runUninstall, type UninstallKey } from "../lib/uninstall.ts";
import { THEME } from "../theme.ts";
import { SELECT_STYLE, listHeight, shortcutBar } from "../ui-style.ts";
import { buildEmbeddedRouteChrome, removeAllChildren } from "./chrome.ts";
import { createInputGuard } from "./input-guard.ts";
import { buildLogScreen } from "./log.ts";

type UninstallItem = CheckItem & { key: UninstallKey | `__${string}` };

const UNINSTALL_ITEMS: UninstallItem[] = [
  { key: "__twilio", label: "Twilio account and CLI", description: "Remove optional Twilio tooling or data left by an older toolkit version.", heading: true },
  { key: "devPhone" as UninstallKey, label: "Dev Phone plugin", description: "remove @twilio-labs/plugin-dev-phone from the Twilio CLI" },
  { key: "apiKey" as UninstallKey, label: "Legacy toolkit API key", description: "delete the restricted key named twilioworld-toolkit, if an older version created one" },
  { key: "twilioCli" as UninstallKey, label: "Toolkit-local Twilio CLI", description: "remove .toolkit/npm-global and its Twilio CLI profiles" },
  { key: "__agents", label: "Coding agents", description: "Remove Twilio Skills installed where agents look for them.", heading: true },
  { key: "skills" as UninstallKey, label: "Twilio Skills installed for agents", description: "remove twilio/ and sendgrid/ from ~/.agents/skills" },
  { key: "__local", label: "Local toolkit files", description: "Remove files used by this toolkit on this machine.", heading: true },
  { key: "repoSkills" as UninstallKey, label: "Local toolkit copy of Twilio Skills", description: "remove the copy this toolkit uses; Check & repair downloads it again" },
  { key: "toolkitState" as UninstallKey, label: "Toolkit settings and managed tools", description: "remove settings, agent state, web UI state, and managed Node and Bun" },
  { key: "modelRuntime" as UninstallKey, label: "All local AI downloads", description: "remove every downloaded model, AI runtime, log, and temporary file" },
];

const REMOVABLE_ITEMS = UNINSTALL_ITEMS.filter((item): item is UninstallItem & { key: UninstallKey } => !item.heading);

export function buildUninstallScreen(
  renderer: CliRenderer,
  onFinished: () => void,
  onCancel: () => void,
): BoxRenderable {
  const { screen, body } = buildEmbeddedRouteChrome(renderer, {
    id: "uninstall-screen",
    route: "Dashboard / Uninstall",
    title: "Choose what to uninstall",
    subtitle: "Choose what to remove. Nothing is removed until you confirm.",
    bodyTitle: "Choose items to remove",
    footer: shortcutBar(["Space", "toggle"], ["Enter", "review"], ["Esc", "back"]),
  });

  const warning = new TextRenderable(renderer, {
    id: "uninstall-warning",
    content: "Nothing is removed until you confirm on the next screen. Twilio logout is never run.",
    fg: THEME.yellow,
  });
  body.add(warning);

  const checklist = new CheckList(renderer, "uninstall-pick", UNINSTALL_ITEMS, new Set());
  body.add(checklist.container);

  const confirmLabel = new TextRenderable(renderer, {
    id: "uninstall-confirm-label",
    content: "",
    fg: THEME.yellow,
    visible: false,
  });
  const confirmSelect = new SelectRenderable(renderer, {
    id: "uninstall-confirm-select",
    height: listHeight(2),
    flexGrow: 1,
    flexShrink: 0,
    visible: false,
    options: [
      { name: "Remove selected items", description: "runs only the checked removals and shows progress here" },
      { name: "Go back", description: "return to the checklist without removing anything" },
    ],
    ...SELECT_STYLE,
  });

  let selected: UninstallKey[] = [];
  const confirmGuard = createInputGuard();

  function showChecklist(): void {
    warning.visible = true;
    checklist.container.visible = true;
    confirmLabel.visible = false;
    confirmSelect.visible = false;
    checklist.focus();
  }

  confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
    if (!confirmGuard.ready()) return;
    if (index !== 0 || !selected.length) {
      showChecklist();
      return;
    }
    const logScreen = buildLogScreen(
      renderer,
      "Uninstall - removing selected items",
      (onLog, onDone) => runUninstall({ keys: selected, onLog, onDone }),
      () => onFinished(),
    );
    removeAllChildren(screen);
    screen.add(logScreen);
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
    selected = checkedKeys as UninstallKey[];
    if (!selected.length) {
      confirmLabel.content = "No items selected. Choose No to go back or Escape to return.";
      confirmSelect.options = [
        { name: "Go back", description: "return to the checklist" },
      ];
    } else {
      const labels = REMOVABLE_ITEMS
        .filter((item) => selected.includes(item.key))
        .map((item) => `* ${item.label}`)
        .join("   ");
      confirmLabel.content = `Selected: ${labels}`;
      confirmSelect.options = [
        { name: "Remove selected items", description: "runs only the checked removals and shows progress here" },
        { name: "Go back", description: "return to the checklist without removing anything" },
      ];
    }
    warning.visible = false;
    checklist.container.visible = false;
    confirmLabel.visible = true;
    confirmSelect.visible = true;
    confirmSelect.setSelectedIndex(selected.length ? 1 : 0);
    confirmSelect.focus();
    confirmGuard.arm();
  };
  checklist.onCancel = () => onCancel();
  checklist.focus();

  return screen;
}
