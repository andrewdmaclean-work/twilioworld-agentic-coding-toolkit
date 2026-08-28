import type { ToolkitStatus } from "./status.ts";
import { MODEL_SERVER_PORT } from "./lib/constants.ts";
import { getSelectedModel } from "./lib/local-models.ts";
import { THEME } from "./theme.ts";

export type ItemId = "agent" | "localchat" | "devphone" | "cli" | "resources" | "settings" | "exit";

export interface MenuItem {
  id: ItemId;
  label: (status: ToolkitStatus | null) => string;
  detail: (status: ToolkitStatus | null) => string;
}

export interface StatusLine {
  text: string;
  fg: string;
}

export function nextMove(status: ToolkitStatus | null): string {
  if (!status) return "Loading local status.";
  if ((status.skills.count ?? 0) === 0) return "Run first-time setup to prepare Twilio knowledge.";
  if (!status.model.ready) return `Set up a coding agent, or add private local chat (~${getSelectedModel().sizeLabel}).`;
  return "Open local chat in your browser or Pi, or configure another coding agent.";
}

export function headlineText(status: ToolkitStatus | null): string {
  const model = status?.model.running ? "local chat online" : status?.model.ready ? "local chat ready" : "local chat optional";
  const knowledge = (status?.skills.count ?? 0) > 0 ? "Twilio knowledge ready" : "knowledge setup needed";
  return `${model}  |  ${knowledge}`;
}

export function statusLines(status: ToolkitStatus | null): StatusLine[] {
  const row = (icon: string, label: string, value: string, fg: string): StatusLine => ({
    text: `  ${icon}  ${label.padEnd(11)} ${value}`,
    fg,
  });
  if (!status) return [
    row("◌", "Local AI", "Checking", THEME.dim2),
    row("◌", "Knowledge", "Checking", THEME.dim2),
    row("◌", "Agents", "Checking", THEME.dim2),
    row("◌", "Dev Phone", "Checking", THEME.dim2),
    row("◌", "Twilio", "Checking", THEME.dim2),
  ];

  return [
    status.model.running
      ? row("●", "Local AI", `Online :${MODEL_SERVER_PORT}`, THEME.green)
      : status.model.ready ? row("●", "Local AI", "Ready", THEME.cyan) : row("○", "Local AI", "Optional", THEME.dim2),
    status.skills.count > 0
      ? row("●", "Knowledge", `${status.skills.count} skills + Docs`, THEME.green)
      : row("○", "Knowledge", "Setup needed", THEME.yellow),
    status.agents.installedCount > 0
      ? row("●", "Agents", `${status.agents.installedCount} detected`, THEME.cyan)
      : row("○", "Agents", "None detected", THEME.dim2),
    status.devPhone.installed
      ? row("●", "Dev Phone", "Installed", THEME.cyan)
      : row("○", "Dev Phone", "Not installed", THEME.dim2),
    status.twilio.sid
      ? row("●", "Twilio", status.twilio.profile || "Signed in", THEME.green)
      : status.twilio.installed
        ? row("○", "Twilio", "Sign-in optional", THEME.dim2)
        : row("○", "Twilio", "CLI not installed", THEME.dim2),
  ];
}

const ITEMS: MenuItem[] = [
  { id: "agent", label: () => "Set up a coding agent", detail: () => "add Twilio Skills + live Docs to Pi, Claude Code, Cursor, Codex, OpenCode, or Copilot" },
  { id: "localchat", label: () => "Local chat", detail: (s) => s?.model.ready ? "choose the browser interface or Pi" : `private local model; browser or Pi interface (~${getSelectedModel().sizeLabel})` },
  { id: "devphone", label: () => "Dev Phone", detail: (s) => s?.devPhone.installed ? "browser SMS + voice test phone — installed" : "optional browser SMS + voice test phone" },
  { id: "cli", label: () => "Twilio CLI", detail: (s) => s?.twilio.sid ? `signed in as ${s.twilio.profile}` : s?.twilio.installed ? "installed; sign-in is optional until an account task needs it" : "install or open an isolated Twilio terminal" },
  { id: "resources", label: () => "Resources", detail: () => "TwilioWorld and Twilio AI documentation" },
  { id: "settings", label: () => "Settings", detail: () => "install or repair features, manage local AI, or uninstall/reset" },
  { id: "exit", label: () => "Exit", detail: () => "" },
];

export function visibleItems(): MenuItem[] {
  return ITEMS;
}

function readiness(value: boolean): string {
  return value ? "Ready" : "Needs setup";
}

export function detailFor(item: MenuItem | undefined, status: ToolkitStatus | null): string {
  if (!item || item.id === "exit") return "";
  switch (item.id) {
    case "localchat":
      return [
        "OVERVIEW",
        "  Chat with a private local model. Choose the simple llamafile browser",
        "  interface or Pi for coding, Twilio Skills, and live Docs tools.",
        "",
        "READINESS",
        `  Runtime       ${readiness(Boolean(status?.model.runtimeReady))}`,
        `  Model         ${readiness(Boolean(status?.model.fileReady))}`,
        `  Service       ${status?.model.running ? "Online" : "Stopped"}`,
        "",
        status?.model.ready
          ? `INTERFACES\n  Browser ready. Pi ${status?.pi.installed ? "installed" : "can be installed when selected"}.`
          : `DOWNLOAD\n  Both interfaces use a local model of approximately ${getSelectedModel().sizeLabel}.`,
      ].join("\n");
    case "agent":
      return [
        "OVERVIEW",
        "  Add Twilio Skills + live Docs to the coding agent you choose, then",
        "  open it in a new terminal. Missing agent CLIs can be installed.",
        "",
        "INCLUDED",
        "  Twilio Skills + live Docs search (no Twilio login required)",
      ].join("\n");
    case "devphone":
      return [
        "OVERVIEW",
        "  Browser test phone for real SMS and voice without a physical device.",
        "",
        "READINESS",
        `  Twilio CLI    ${readiness(Boolean(status?.twilio.installed))}`,
        `  Dev Phone     ${readiness(Boolean(status?.devPhone.installed))}`,
        `  Account       ${status?.twilio.sid ? "Signed in" : "Sign in before use"}`,
        "",
        "NOTICE",
        "  Use a spare number; Dev Phone can replace its webhook settings.",
      ].join("\n");
    case "cli":
      return [
        "OVERVIEW",
        "  Install or open the isolated Twilio CLI, then sign in or switch",
        "  accounts when a Twilio account task requires it.",
        "",
        "STATUS",
        `  CLI           ${readiness(Boolean(status?.twilio.installed))}`,
        status?.twilio.sid ? `  Account       ${status.twilio.profile} (${status.twilio.sid})` : "  Account       Not signed in",
      ].join("\n");
    case "resources":
      return "RESOURCES\n  Open TwilioWorld or browse the Twilio AI documentation.";
    case "settings":
      return [
        "SETTINGS",
        "  Install or repair   Restore the AI bundle or add Dev Phone.",
        "  Manage local AI     Model, reasoning visibility, effort, and storage.",
        "  Uninstall or reset  Review toolkit-managed data before removing it.",
      ].join("\n");
  }
}
