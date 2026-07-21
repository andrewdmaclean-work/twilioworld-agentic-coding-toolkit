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
