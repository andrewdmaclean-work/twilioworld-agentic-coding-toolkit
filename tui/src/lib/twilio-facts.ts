export const TWILIO_AI_FACTS = [
  "This toolkit installs Twilio Skills so compatible coding agents can reason through Twilio product choices.",
  "Chat with Twilio runs locally; the model uses a Twilio-aware prompt built from the toolkit's Skills index.",
  "Configure agent wires the same Twilio Skills and MCP choices into Claude, Codex, Cursor, OpenCode, Pi, and more.",
  "Docs MCP is read-only and searchable; it helps agents pull current Twilio API details without account credentials.",
  "Execute MCP is opt-in because it can call real Twilio APIs using credentials you explicitly create.",
  "The toolkit saves Execute MCP credentials in .toolkit/.env with chmod 600 and never prints the secret to the log.",
  "Dev Phone is handy for demos, but it can overwrite phone-number webhooks; use a spare Twilio number.",
  "The local model server exposes an OpenAI-compatible endpoint for other tools at the configured model port.",
  "Model thinking is off by default for speed; toggle it from the Chat menu when you want slower, more deliberate replies.",
  "Setup can resume large model downloads, so rerunning it should not throw away a partial Gemma archive.",
  "The Setup menu reflects completed installs, so checked items stay visible after you return to the dashboard.",
  "Use ./toolkit doctor when first-run behavior looks odd; it checks terminal, Node, submodule, disk, and model state.",
];

export function twilioFactAt(index: number): string {
  return TWILIO_AI_FACTS[index % TWILIO_AI_FACTS.length];
}
