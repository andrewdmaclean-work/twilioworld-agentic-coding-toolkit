import { StyledText, bold, fg, type TextChunk } from "@opentui/core";
import { THEME } from "./theme.ts";

export const SELECT_STYLE = {
  backgroundColor: "transparent",
  focusedBackgroundColor: "transparent",
  textColor: THEME.silver,
  focusedTextColor: THEME.silver,
  selectedBackgroundColor: THEME.bgSelected,
  selectedTextColor: THEME.white,
  descriptionColor: THEME.dim2,
  selectedDescriptionColor: THEME.silver,
  showSelectionIndicator: true,
} as const;

export const INPUT_STYLE = {
  backgroundColor: THEME.panelRaised,
  focusedBackgroundColor: THEME.panelRaised,
  textColor: THEME.silver,
  focusedTextColor: THEME.white,
  placeholderColor: THEME.dim,
} as const;

export function shortcutBar(...items: Array<[key: string, action: string]>): string {
  return `  ${items.map(([key, action]) => `[${key}] ${action}`).join("    ")}`;
}

/** Word-wrap text to width. Continuation lines keep the original line's
 *  indent, so an indented paragraph stays indented instead of spilling
 *  back to column 0. */
export function wrapText(text: string, width: number): string {
  if (width <= 0) return text;
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) { out.push(""); continue; }
    const indent = raw.match(/^\s*/)?.[0] ?? "";
    const room = Math.max(12, width - indent.length);
    let line = raw.slice(indent.length);
    while (line.length > room) {
      let cut = line.lastIndexOf(" ", room);
      if (cut < Math.floor(room * 0.4)) cut = room;
      out.push(indent + line.slice(0, cut).trimEnd());
      line = line.slice(cut).trimStart();
    }
    out.push(indent + line);
  }
  return out.join("\n");
}

/** Style detail-panel text so structure is visible at a glance:
 *   - headings (unindented lines) → bold, CAPS, brand red
 *   - rows ("  Label      value") → dim label, bright value (green when good)
 *   - everything else → neutral body text */
const GOOD_VALUE = /^(Running|Installed|Downloaded|Logged in|Online)\b/;

export function styleDetail(text: string): StyledText {
  const chunks: TextChunk[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const row = line.match(/^(  \S.*?\s{2,})(\S.*)$/);
    if (line && !line.startsWith(" ")) chunks.push(fg(THEME.red)(bold(line.toUpperCase())));
    else if (row) chunks.push(fg(THEME.dim2)(row[1]), fg(GOOD_VALUE.test(row[2]) ? THEME.green : THEME.white)(row[2]));
    else chunks.push(fg(THEME.silver)(line));
    if (i < lines.length - 1) chunks.push(fg(THEME.silver)("\n"));
  });
  return new StyledText(chunks);
}
