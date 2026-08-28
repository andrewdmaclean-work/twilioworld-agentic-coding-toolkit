import { expect, test } from "bun:test";
import { validReasoningMode } from "./config.ts";

test("legacy thinking modes migrate to effort levels", () => {
  expect(validReasoningMode("off")).toBe("off");
  expect(validReasoningMode("auto")).toBe("low");
  expect(validReasoningMode("on")).toBe("medium");
});

test("thinking effort accepts every current cycle value", () => {
  for (const mode of ["off", "low", "medium", "high"] as const) {
    expect(validReasoningMode(mode)).toBe(mode);
  }
});
