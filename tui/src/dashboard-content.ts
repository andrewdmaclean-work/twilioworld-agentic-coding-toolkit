import type { ToolkitStatus } from "./status.ts";
import { MODEL_SERVER_PORT } from "./lib/constants.ts";
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
  if ((status.skills.count ?? 0) === 0) return "Open Settings → Check & repair to download Twilio Skills.";
  if (!status.model.ready) return "Add Twilio to your coding agents, or try private local chat.";
  return "Open local chat in your browser or Pi, or set up another coding agent.";
}

export function headlineText(status: ToolkitStatus | null): string {
  const model = status?.model.running ? "Local chat online" : status?.model.ready ? "Local chat ready" : "Local chat not set up";
  const knowledge = (status?.skills.count ?? 0) > 0 ? "Twilio Skills ready" : "Twilio Skills missing";
  return `${model} · ${knowledge}`;
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
      : status.model.ready ? row("●", "Local AI", "Ready", THEME.cyan) : row("○", "Local AI", "Not set up", THEME.dim2),
    status.skills.count > 0
      ? row("●", "Knowledge", `${status.skills.count} skills + Docs`, THEME.green)
      : row("○", "Knowledge", "Skills missing", THEME.yellow),
    status.agents.installedCount > 0
      ? row("●", "Agents", `${status.agents.installedCount} detected`, THEME.cyan)
      : row("○", "Agents", "None detected", THEME.dim2),
    status.devPhone.installed
      ? row("●", "Dev Phone", "Installed", THEME.cyan)
      : row("○", "Dev Phone", "Not installed", THEME.dim2),
    status.twilio.sid
      ? row("●", "Twilio", status.twilio.profile || "Logged in", THEME.green)
      : status.twilio.installed
        ? row("○", "Twilio", "Not logged in", THEME.dim2)
        : row("○", "Twilio", "CLI not installed", THEME.dim2),
  ];
}

const ITEMS: MenuItem[] = [
  { id: "agent", label: () => "Set up coding agents", detail: () => "add Twilio Skills + live Docs to your coding agents" },
  { id: "localchat", label: () => "Local chat", detail: (s) => s?.model.ready ? "browser chat or Pi" : "private local model · browser chat or Pi" },
  { id: "devphone", label: () => "Dev Phone", detail: (s) => s?.devPhone.installed ? "browser phone for SMS and voice · installed" : "browser phone for SMS and voice" },
  { id: "cli", label: () => "Twilio CLI", detail: (s) => s?.twilio.sid ? `logged in as ${s.twilio.profile}` : s?.twilio.installed ? "installed · log in when you need an account" : "an isolated Twilio CLI" },
  { id: "resources", label: () => "Resources", detail: () => "TwilioWorld and Twilio AI docs" },
  { id: "settings", label: () => "Settings", detail: () => "check & repair, or uninstall" },
  { id: "exit", label: () => "Exit", detail: () => "" },
];

export function visibleItems(): MenuItem[] {
  return ITEMS;
}

// Detail panel text. Paragraphs are single lines; wrapText() wraps them to
// the panel width and keeps the two-space indent on every wrapped line.
function row(label: string, value: string): string {
  return `  ${label.padEnd(12)}${value}`;
}

export function detailFor(item: MenuItem | undefined, status: ToolkitStatus | null): string {
  if (!item || item.id === "exit") return "";
  switch (item.id) {
    case "agent":
      return [
        "Overview",
        "  Add Twilio Skills and live Docs to all your coding agents at once, or install and open a specific one.",
        "",
        "Included",
        "  Twilio Skills and live Docs search. No Twilio login needed.",
      ].join("\n");
    case "localchat":
      return [
        "Overview",
        "  Chat with a private model that runs on this computer, in a simple browser interface or in Pi for coding with Twilio Skills and live Docs.",
        "",
        "Status",
        row("Model", status?.model.ready ? "Downloaded" : "Not downloaded"),
        row("Service", status?.model.running ? "Running" : "Stopped"),
        row("Pi", status?.pi.installed ? "Installed" : "Installs when you open it"),
        ...(status?.model.ready ? [] : ["", "Download", "  You choose a model (2.5–3.3 GB) before anything downloads."]),
      ].join("\n");
    case "devphone":
      return [
        "Overview",
        "  A browser phone for testing real SMS and voice, no device needed.",
        "",
        "Status",
        row("Dev Phone", status?.devPhone.installed ? "Installed" : "Installs when you open it"),
        row("Account", status?.twilio.sid ? "Logged in" : "Log in before use"),
        "",
        "Note",
        "  Use a spare number. Dev Phone can replace its webhook settings.",
      ].join("\n");
    case "cli":
      return [
        "Overview",
        "  An isolated Twilio CLI for account tasks. It never touches your system CLI or its profiles.",
        "",
        "Status",
        row("CLI", status?.twilio.installed ? "Installed" : "Installs when you open it"),
        row("Account", status?.twilio.sid ? `${status.twilio.profile} (${status.twilio.sid})` : "Not logged in"),
      ].join("\n");
    case "resources":
      return "Resources\n  Open TwilioWorld or browse the Twilio AI docs.";
    case "settings":
      return [
        "Settings",
        row("Check & repair", "Verify and fix Skills, Docs, local AI, and tools."),
        row("Uninstall", "Review what the toolkit installed, then remove it."),
        "",
        "  Features install when you first choose them. Local AI settings are under Local chat.",
      ].join("\n");
  }
}
