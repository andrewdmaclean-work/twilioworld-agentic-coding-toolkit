export const TWILIO_AI_FACTS = [
  "This toolkit installs Twilio Skills so compatible coding agents can reason through Twilio product choices.",
  "Pi can run locally with the toolkit's private model, Twilio Skills, and live Docs search.",
  "Coding-agent setup adds the same Twilio Skills and live Docs search to Claude, Codex, Cursor, OpenCode, Pi, and more.",
  "Docs MCP is read-only and searchable; it helps agents pull current Twilio API details without account credentials.",
  "Dev Phone is handy for demos, but it can overwrite phone-number webhooks; use a spare Twilio number.",
  "The local model server exposes an OpenAI-compatible endpoint for other tools at the configured model port.",
  "Reasoning visibility and effort are independent: hide High-effort reasoning, or disable reasoning with effort Off.",
  "Setup can resume large model downloads, so rerunning it should not throw away a partial Gemma archive.",
  "The Setup menu reflects completed installs, so checked items stay visible after you return to the dashboard.",
  "Use ./toolkit doctor when first-run behavior looks odd; it checks terminal, Node, submodule, disk, and model state.",
];

export function twilioFactAt(index: number): string {
  return TWILIO_AI_FACTS[index % TWILIO_AI_FACTS.length];
}
