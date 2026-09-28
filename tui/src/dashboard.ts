// dashboard.ts — the main dashboard layout: header, actions menu, system
// status, action details, and a footer that keeps the latest activity
// (what opened where) visible instead of flashing it away.

import {
  ASCIIFontRenderable,
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { ToolkitStatus } from "./status.ts";
import { buildRobotFace } from "./screens/robot-face.ts";
import { buildInvadersScreen } from "./screens/invaders.ts";
import { routeLabels } from "./screens/chrome.ts";
import { THEME } from "./theme.ts";
import { SELECT_STYLE, shortcutBar, styleDetail, wrapText } from "./ui-style.ts";
import { detailFor, headlineText, nextMove, statusLines, visibleItems, type ItemId, type MenuItem } from "./dashboard-content.ts";

const RED      = THEME.red;
const WHITE    = THEME.white;
const SILVER   = THEME.silver;
const DIM      = THEME.dim;
const DIM2     = THEME.dim2;
const YELLOW   = THEME.yellow;
const CYAN     = THEME.cyan;
const BG_PANEL = THEME.panelBg;

export type { ItemId };

export function clip(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`;
}

export function buildDashboard(renderer: CliRenderer, onQuit: () => void) {
  const STATUS_ROWS = 5;
  type CompactPane = "actions" | "status" | "details";
  let compactPane: CompactPane = "actions";
  let narrowLayout = false;
  let statusContentWidth = 40;
  let detailContentWidth = 40;

  // ── Widgets ─────────────────────────────────────────────────────
  const header = new BoxRenderable(renderer, {
    id: "header",
    borderStyle: "single",
    borderColor: THEME.borderStrong,
    title: " TwilioWorld ",
    titleColor: RED,
    paddingX: 1,
    flexDirection: "row",
    backgroundColor: BG_PANEL,
  });
  // Small ASCII wordmark, stacked above the subtitle — @opentui/core ships
  // this font data already (no figlet/lolcat dependency needed). A multi-row
  // glyph can't sit "inline with the border" (the border is only 1 row
  // tall, every ASCIIFont is >= 2 rows — tried it, it either collides with
  // the subtitle or gets half its letters clipped off). "TwilioWorld" in
  // the "tiny" font is only 44 cols x 2 rows, so it stacks in normal flow
  // above the subtitle text without needing any special positioning.
  // resize() below only shows it once there's room, falling back to the
  // plain border title on narrower terminals so nothing clips.
  const banner = new ASCIIFontRenderable(renderer, {
    id: "header-banner",
    text: "TwilioWorld",
    font: "tiny",
    color: RED,
  });
  const titleText = new TextRenderable(renderer, {
    id: "header-title",
    content: "Agentic Coding Toolkit",
    fg: WHITE,
  });
  const headline = new TextRenderable(renderer, {
    id: "header-headline",
    content: headlineText(null),
    fg: CYAN,
  });
  const nextText = new TextRenderable(renderer, {
    id: "header-next",
    content: `Next: ${nextMove(null)}`,
    fg: YELLOW,
  });
  const brand = new BoxRenderable(renderer, {
    id: "header-brand",
    flexDirection: "column",
    flexGrow: 1,
  });
  brand.add(banner);
  brand.add(titleText);
  brand.add(headline);
  brand.add(nextText);
  const robot = buildRobotFace(renderer);
  header.add(brand);
  header.add(robot.container);

  // Left column: menu
  const MENU_W = 36;
  const menuCol = new BoxRenderable(renderer, {
    id: "menu-col", borderStyle: "single", borderColor: THEME.border,
    title: " Actions ", titleColor: THEME.redSoft,
    width: MENU_W, flexShrink: 0,
    backgroundColor: BG_PANEL,
  });
  const menuList = new SelectRenderable(renderer, {
    id: "menu-list",
    width: MENU_W - 2, height: 10, // overridden by resize()
    options: [],
    ...SELECT_STYLE,
    showScrollIndicator: false, showDescription: false, itemSpacing: 0,
  });
  menuCol.add(menuList);

  // Right column: status + detail
  const rightCol = new BoxRenderable(renderer, {
    id: "right-col", flexDirection: "column", flexGrow: 1, gap: 1,
  });

  const statusCol = new BoxRenderable(renderer, {
    id: "status-col", borderStyle: "single", borderColor: THEME.border,
    title: " System status ", titleColor: THEME.redSoft,
    flexShrink: 0, flexDirection: "column", alignItems: "stretch", overflow: "hidden",
    backgroundColor: BG_PANEL,
  });
  const statusTexts = Array.from({ length: STATUS_ROWS }, (_, i) =>
    new TextRenderable(renderer, { id: `sl-${i}`, content: "", fg: DIM, width: "100%" })
  );
  statusTexts.forEach((t) => statusCol.add(t));

  const detailCol = new BoxRenderable(renderer, {
    id: "detail-col", borderStyle: "single", borderColor: THEME.border,
    title: " Action details ", titleColor: THEME.redSoft,
    flexGrow: 1, paddingX: 1, alignItems: "stretch", overflow: "hidden",
    backgroundColor: BG_PANEL,
  });
  const detailText = new TextRenderable(renderer, {
    id: "detail-text", content: "", fg: SILVER, width: "100%",
  });
  detailCol.add(detailText);
  let routeScreen: BoxRenderable | null = null;

  rightCol.add(statusCol);
  rightCol.add(detailCol);

  const body = new BoxRenderable(renderer, {
    id: "body", flexDirection: "row", gap: 1, flexGrow: 1,
  });
  body.add(menuCol);
  body.add(rightCol);

  const paneTabs = new TextRenderable(renderer, {
    id: "dashboard-pane-tabs",
    content: "",
    fg: THEME.dim2,
    visible: false,
  });

  const bottomBar = new TextRenderable(renderer, {
    id: "bottom", content: shortcutBar(["↑↓", "navigate"], ["Enter", "select"], ["Q", "quit"]),
    fg: DIM2,
  });

  const dashboard = new BoxRenderable(renderer, {
    id: "dashboard",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexDirection: "column",
    padding: 0,
    gap: 1,
  });
  dashboard.add(header);
  dashboard.add(paneTabs);
  dashboard.add(body);
  dashboard.add(bottomBar);

  let lastStatus: ToolkitStatus | null = null;
  // Latest thing the toolkit opened or closed ("Claude Code closed · 14:02",
  // "Browser chat: http://127.0.0.1:8080/"). Stays until replaced.
  let activity = "";

  function footerContent(...items: Array<[key: string, action: string]>): string {
    const shortcuts = shortcutBar(...items);
    return activity ? `  ● ${activity}   ${shortcuts.trimStart()}` : shortcuts;
  }

  // ── Resize: fill the full terminal ──────────────────────────────
  // SelectRenderable needs explicit height; set everything explicitly
  // so nothing is left to guess.
  function updatePaneVisibility(): void {
    paneTabs.visible = narrowLayout;
    menuCol.visible = !narrowLayout || compactPane === "actions";
    rightCol.visible = !narrowLayout || compactPane !== "actions";
    // A sub-screen gets the whole right column; the status box would
    // otherwise squeeze it to nothing on an 80×24 terminal.
    statusCol.visible = !routeScreen && (!narrowLayout || compactPane === "status");
    detailCol.visible = !narrowLayout || compactPane === "details";
    if (narrowLayout) {
      const tab = (id: CompactPane, label: string) => compactPane === id ? `[${label}]` : ` ${label} `;
      paneTabs.content = `  ${tab("actions", "Actions")}  ${tab("status", "Status")}  ${tab("details", "Details")}    [Tab] switch`;
      bottomBar.content = clip(footerContent(["Tab", "view"], ["↑↓", "navigate"], ["Enter", "select"], ["Q", "quit"]), renderer.width);
    } else {
      bottomBar.content = clip(footerContent(["↑↓", "navigate"], ["Enter", "select"], ["Q", "quit"]), renderer.width);
    }
  }

  function resize() {
    const H = renderer.height;
    const W = renderer.width;

    // "TwilioWorld" in the "tiny" font is 44 cols; header has 2 border cols
    // + 2 padding cols (paddingX: 1 each side) = 4 cols of overhead, plus a
    // little breathing room so it doesn't sit flush against the border.
    const wide = W >= 92;
    narrowLayout = W < 64;
    const robotMode = wide ? "full" : W >= 72 ? "compact" : "hidden";
    const robotWidth = robotMode === "full" ? 16 : robotMode === "compact" ? 9 : 0;
    banner.visible = wide;
    robot.setMode(robotMode);
    header.title = wide ? "" : " TwilioWorld ";

    const headerH = wide ? 7 : robotMode === "compact" ? 6 : 5;
    const bodyH = Math.max(8, H - headerH - (narrowLayout ? 5 : 3));
    const menuW = narrowLayout ? W : wide ? MENU_W : 30;
    const rightW = narrowLayout ? W : Math.max(24, W - menuW - 1);
    statusContentWidth = Math.max(10, rightW - 2);
    detailContentWidth = Math.max(20, rightW - 4);

    // Explicit sizes — Yoga flexGrow handles width of rightCol,
    // but height needs to be explicit for SelectRenderable.
    body.height = bodyH;
    body.width = W;
    body.flexDirection = "row";
    header.height = headerH;
    header.width = W;

    menuCol.height = bodyH;
    menuCol.width = menuW;
    menuList.height = Math.max(2, bodyH - 2); // subtract borders
    menuList.width  = Math.max(10, menuW - 2);
    rightCol.height = bodyH;
    rightCol.width = rightW;

    // Status box: STATUS_ROWS lines + 2 border
    const statusBoxH = narrowLayout ? bodyH : routeScreen ? 0 : STATUS_ROWS + 2;
    statusCol.height = statusBoxH;
    statusCol.width  = rightW;

    // Detail fills remaining right col height (gained a panel's worth of
    // space by folding Installed into Status).
    const detailH = narrowLayout || routeScreen ? bodyH : Math.max(4, bodyH - statusBoxH - 1);
    detailCol.height = detailH;
    detailCol.width  = rightW;

    const brandWidth = Math.max(10, W - 4 - robotWidth);
    brand.width = brandWidth;
    titleText.width = brandWidth;
    headline.width = brandWidth;
    nextText.width = brandWidth;
    bottomBar.width = W;
    paneTabs.width = W;
    updatePaneVisibility();
  }

  resize();
  renderer.on("resize", resize);

  // ── Update logic ─────────────────────────────────────────────────
  let lastItems: MenuItem[] = [];

  function refreshHeaderAndAddon(s: ToolkitStatus | null) {
    headline.content = clip(headlineText(s), Math.max(10, renderer.width - 4));
    nextText.content = clip(`› ${nextMove(s)}`, Math.max(10, renderer.width - 4));
  }

  function setDetail(item: MenuItem | undefined, s: ToolkitStatus | null) {
    if (routeScreen) return;
    if (!item || item.id === "exit") {
      detailCol.title = " — ";
      detailText.content = "";
    } else {
      detailCol.title = ` ${item.label(s)} `;
      detailText.content = styleDetail(wrapText(detailFor(item, s), detailContentWidth));
    }
  }

  function update(s: ToolkitStatus | null) {
    lastStatus = s;
    robot.update(s);
    refreshHeaderAndAddon(s);

    const lines = statusLines(s).slice(0, STATUS_ROWS);
    statusTexts.forEach((text, i) => {
      const line = lines[i];
      text.content = line ? clip(line.text, statusContentWidth) : "";
      text.fg = line?.fg ?? DIM;
    });

    const items = visibleItems();
    lastItems = items;

    // Preserve selection by id across updates
    const curId = (menuList.options[menuList.getSelectedIndex()]?.value ?? "") as ItemId;
    menuList.options = items.map((m) => ({ name: m.label(s), value: m.id, description: m.detail(s) }));
    const newIdx = items.findIndex((m) => m.id === curId);
    menuList.setSelectedIndex(newIdx >= 0 ? newIdx : Math.min(menuList.getSelectedIndex(), items.length - 1));

    setDetail(items[menuList.getSelectedIndex()], s);
  }

  // Live detail update as user navigates
  menuList.on(SelectRenderableEvents.SELECTION_CHANGED, (idx) => {
    setDetail(lastItems[idx], lastStatus);
  });

  const typedSecret = "twilio";
  const konamiSecret = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
  let typedBuffer = "";
  let konamiIndex = 0;

  menuList.onKeyDown = (key) => {
    if (key.name === "q") {
      onQuit();
      return;
    }

    typedBuffer = `${typedBuffer}${key.name ?? ""}`.slice(-typedSecret.length);
    if (typedBuffer === typedSecret) {
      typedBuffer = "";
      konamiIndex = 0;
      showRoute(buildInvadersScreen(renderer, backRoute), "Signal Invaders");
      return;
    }

    if (key.name === konamiSecret[konamiIndex]) {
      konamiIndex++;
      if (konamiIndex === konamiSecret.length) {
        typedBuffer = "";
        konamiIndex = 0;
        showRoute(buildInvadersScreen(renderer, backRoute), "Signal Invaders");
      }
    } else {
      konamiIndex = key.name === konamiSecret[0] ? 1 : 0;
    }
  };

  function showRoute(screen: BoxRenderable, title: string) {
    if (routeScreen) {
      detailCol.remove(routeScreen.id);
    } else {
      detailCol.remove("detail-text");
    }
    routeScreen = screen;
    if (narrowLayout) compactPane = "details";
    detailCol.title = ` ${routeLabels.get(screen) ?? title} `;
    detailCol.add(screen);
    resize();
    if (screen.focusable) screen.focus();
  }

  function backRoute() {
    robot.react("curious");
    if (routeScreen) {
      detailCol.remove(routeScreen.id);
      routeScreen = null;
      detailCol.add(detailText);
    }
    setDetail(lastItems[menuList.getSelectedIndex()], lastStatus);
    if (narrowLayout) compactPane = "actions";
    resize();
    menuList.focus();
  }

  const paneOrder: CompactPane[] = ["actions", "status", "details"];
  const paneKeyHandler = (...args: unknown[]) => {
    if (!narrowLayout || routeScreen) return;
    const key = args.find((arg) => arg && typeof arg === "object" && typeof (arg as { name?: unknown }).name === "string") as { name?: string } | undefined;
    if (key?.name !== "tab") return;
    compactPane = paneOrder[(paneOrder.indexOf(compactPane) + 1) % paneOrder.length];
    updatePaneVisibility();
    if (compactPane === "actions") menuList.focus();
  };
  renderer.keyInput.on("keypress", paneKeyHandler);

  menuList.focus();
  return {
    dashboard,
    menuList,
    bottomBar,
    update,
    showRoute,
    backRoute,
    react: robot.react,
    restoreFooter: updatePaneVisibility,
    setActivity: (text: string) => {
      activity = text;
      updatePaneVisibility();
    },
    dispose: () => {
      renderer.off("resize", resize);
      renderer.keyInput.removeListener("keypress", paneKeyHandler);
      robot.dispose();
    },
  };
}

