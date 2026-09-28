import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  bold,
  fg,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../theme.ts";
import { shortcutBar } from "../ui-style.ts";

interface RouteChromeOptions {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  bodyTitle: string;
  footer?: string;
}

export interface RouteChrome {
  screen: BoxRenderable;
  body: BoxRenderable;
  footer: TextRenderable;
}

export function buildRouteChrome(renderer: CliRenderer, opts: RouteChromeOptions): RouteChrome {
  const screen = new BoxRenderable(renderer, {
    id: opts.id,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexDirection: "column",
    padding: 0,
    gap: 1,
    backgroundColor: THEME.appBg,
  });

  const header = new BoxRenderable(renderer, {
    id: `${opts.id}-header`,
    borderStyle: "single",
    borderColor: THEME.borderStrong,
    title: " TwilioWorld ",
    titleColor: THEME.red,
    paddingX: 1,
    flexDirection: "column",
    flexShrink: 0,
    backgroundColor: THEME.panelBg,
  });
  header.add(new TextRenderable(renderer, {
    id: `${opts.id}-route`,
    content: opts.route,
    fg: THEME.dim2,
  }));
  header.add(new TextRenderable(renderer, {
    id: `${opts.id}-title`,
    content: opts.title,
    fg: THEME.white,
  }));
  if (opts.subtitle) {
    header.add(new TextRenderable(renderer, {
      id: `${opts.id}-subtitle`,
      content: opts.subtitle,
      fg: THEME.dim2,
      width: "100%",
      wrapMode: "word",
    }));
  }

  const body = new BoxRenderable(renderer, {
    id: `${opts.id}-body`,
    borderStyle: "single",
    borderColor: THEME.border,
    title: ` ${opts.bodyTitle} `,
    titleColor: THEME.redSoft,
    flexDirection: "column",
    flexGrow: 1,
    gap: 1,
    padding: 1,
    backgroundColor: THEME.panelBg,
  });

  const footer = new TextRenderable(renderer, {
    id: `${opts.id}-footer`,
    content: opts.footer ?? shortcutBar(["Enter", "select"], ["Esc", "back"]),
    fg: THEME.dim2,
    flexShrink: 0,
  });

  screen.add(header);
  screen.add(body);
  screen.add(footer);
  return { screen, body, footer };
}

/** Breadcrumb for each embedded screen ("Local chat / Choose a model"). The
 *  dashboard shows it as the panel title, so screens don't repeat their name. */
export const routeLabels = new WeakMap<BoxRenderable, string>();

export function buildEmbeddedRouteChrome(renderer: CliRenderer, opts: RouteChromeOptions): RouteChrome {
  const screen = new BoxRenderable(renderer, {
    id: opts.id,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexDirection: "column",
    gap: 1,
    backgroundColor: THEME.panelBg,
  });
  const crumbs = opts.route.replace(/^Dashboard \/ /, "");
  routeLabels.set(screen, crumbs);

  // The title only appears when it says more than the breadcrumb already does.

  const header = new BoxRenderable(renderer, {
    id: `${opts.id}-header`,
    flexDirection: "column",
    flexShrink: 0,
    backgroundColor: THEME.panelBg,
  });
  if (opts.title && !crumbs.endsWith(opts.title)) {
    header.add(new TextRenderable(renderer, {
      id: `${opts.id}-title`,
      content: new StyledText([fg(THEME.white)(bold(opts.title))]),
      width: "100%",
      wrapMode: "word",
    }));
  }
  if (opts.subtitle) {
    header.add(new TextRenderable(renderer, {
      id: `${opts.id}-subtitle`,
      content: opts.subtitle,
      fg: THEME.dim2,
      width: "100%",
      wrapMode: "word",
    }));
  }

  const body = new BoxRenderable(renderer, {
    id: `${opts.id}-body`,
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: 1,
    overflow: "hidden",
    backgroundColor: THEME.panelBg,
  });

  const footer = new TextRenderable(renderer, {
    id: `${opts.id}-footer`,
    content: opts.footer ?? shortcutBar(["Enter", "select"], ["Esc", "back"]),
    fg: THEME.dim2,
    flexShrink: 0,
  });

  if (header.getChildren().length) screen.add(header);
  screen.add(body);
  screen.add(footer);
  return { screen, body, footer };
}

export function removeAllChildren(box: BoxRenderable): void {
  for (const child of [...box.getChildren()]) {
    box.remove(child.id);
  }
}
