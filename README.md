# TwilioWorld Agentic Coding Toolkit

> Experimental toolkit for the 2026 Twilio Assemble series. It is actively
> developed, may change without notice, and is not a supported production tool.

Give coding agents reliable Twilio context with Twilio Skills and live,
read-only documentation search. The toolkit also offers optional private local
chat, Dev Phone, and an isolated Twilio CLI—all from one terminal dashboard.

## Quick start

```bash
git clone --recursive https://github.com/andrewdmaclean-work/twilioworld-agentic-coding-toolkit.git
cd twilioworld-agentic-coding-toolkit
./toolkit
```

The first run asks one question: what would you like to do first?

- **Set up a coding agent** (recommended) — no large download
- **Try private local chat** — you pick the model before it downloads (about 2.5–3.3 GB)
- **Look around first** — open the dashboard

Nothing large downloads up front. Local chat, Pi, Dev Phone, and the Twilio
CLI each install the first time you choose them, after a review that says what
will be installed and where.

If anything looks wrong, run the read-only environment check:

```bash
./toolkit doctor
```

## What is included

| Capability | Purpose | Twilio login needed? |
| --- | --- | --- |
| Twilio Skills | Product guidance, architecture, compliance, and implementation patterns | No |
| Live Docs MCP | Current Twilio documentation and API-schema search | No |
| Local chat | Private local model with a simple browser interface or the Pi coding agent | No |
| Coding-agent setup | Adds Skills and Docs to Claude Code, Codex, Cursor, OpenCode, Copilot, or Pi | Agent-specific sign-in only |
| Dev Phone | Browser soft phone for real SMS and voice testing | Yes |
| Twilio CLI | Isolated command-line access to your Twilio account | Yes |

The toolkit does not give agents authenticated access to your Twilio account.
Live Docs search is remote but read-only and does not require credentials.

## Dashboard guide

The main menu is ordered around common tasks:

1. **Set up a coding agent** — add Twilio Skills and live Docs, then open it
2. **Local chat** — browser interface or Pi, plus local AI settings
3. **Dev Phone** — install or open the browser test phone
4. **Twilio CLI** — install, sign in, switch account, or open an isolated terminal
5. **Resources** — open TwilioWorld or Twilio AI documentation
6. **Settings** — check & repair, or uninstall/reset

Every action shows a summary before potentially destructive work. Long-running
tasks have progress, detailed output, failure recovery, and retry controls.

### Where things open

Agents, Pi, Dev Phone, and the Twilio CLI open in this terminal. The dashboard
steps aside and comes back when you exit them. Each one also gets a script under
`.toolkit/launch/`, shown when it opens, so you can run it again from any
terminal with the toolkit's settings. The dashboard footer shows the latest
thing that opened or closed.

## Coding-agent setup

Choose **Set up a coding agent**, review the action, and continue. The toolkit
uses package-manager installers where available, configures Twilio knowledge,
and then opens the agent in this terminal (see [Where things open](#where-things-open)).

Already have agents installed? Choose **All my agents** (or **Add Twilio to my
coding agents** on first run). It adds Twilio Skills and live Docs to every
agent it finds, for every project, without installing or opening anything.
Re-running it is safe.

| Agent | Skills | Live Docs (global) |
| --- | --- | --- |
| Claude Code | Twilio developer-kit plugin | `claude mcp add --scope user` |
| Codex | `~/.agents/skills` | `codex mcp add` → `~/.codex/config.toml` |
| Cursor (editor + CLI) | `~/.agents/skills` | merged into `~/.cursor/mcp.json` |
| OpenCode | `~/.agents/skills` | merged into `~/.config/opencode/opencode.json` |
| GitHub Copilot CLI | `~/.agents/skills` | `copilot mcp add --transport http` |
| Pi | Toolkit-managed skills directory | Toolkit-managed MCP adapter |
| Other | Open Agent Skills instructions | Standard HTTP MCP endpoint shown |

Config files are only merged when they are plain JSON; other servers and
settings are kept. VS Code's Copilot Chat extension is not the Copilot CLI and
is not configured.

Manual Docs MCP endpoint:

```text
https://mcp.twilio.com/docs
```

Manual Skills source:

```text
vendor/twilio-ai/skills/
```

## Local AI

Local AI uses [llamafile](https://github.com/mozilla-ai/llamafile) and exposes an
OpenAI-compatible endpoint on `127.0.0.1:8080` by default. Model and runtime
downloads are checksum-verified before use.

Reasoning Off is enforced in both Pi and browser requests, and at the model
server with a zero-token reasoning budget. Low, Medium, and High use increasing
local token budgets; showing Pi reasoning blocks is a separate presentation
setting.

Available models:

| Model | Approximate size | Best fit |
| --- | ---: | --- |
| Gemma 4 E2B | 3.3 GB | Multimodal Twilio Q&A |
| Phi-4-mini | 2.5 GB | Reasoning and code on smaller machines |

Choose **Local chat** to open the shared model in one of two interfaces:

- **Browser chat (llamafile)** — a simple built-in chat interface, preconfigured with live Twilio Docs search.
- **Pi (terminal)** — a coding-focused interface with Twilio Skills and live Docs tools.

The first time, you choose the model before anything downloads. Under
**Local chat → Local AI settings** you can:

- choose the model shared by the browser interface and Pi;
- disable reasoning or set its effort to Low, Medium, or High independently from whether Pi displays its reasoning blocks (browser chat only receives reasoning when effort is enabled);
- stop the local service; or
- remove downloaded model files.

Local AI keeps running in the background after you open it, so browser chat
keeps working. When you quit the dashboard while it is running, the toolkit
asks whether to stop it, and it prints a reminder if you leave it running.

Set a different port or context size before launching:

```bash
MODEL_SERVER_PORT=8082 CTX_SIZE=32768 ./toolkit
```

## Dev Phone safety

Dev Phone can replace a Twilio number's webhook settings. Use a spare test
number, not a production number. The toolkit-local Twilio CLI and its profiles
live inside this repository and do not modify your normal system CLI profile.

## Files created locally

| Data | Location |
| --- | --- |
| Toolkit settings and process state | `.toolkit/` |
| Managed Bun, Node, npm, and Twilio CLI | `.toolkit/toolchains/`, `.toolkit/npm-global/` |
| Isolated Twilio CLI profiles | `.toolkit/twilio-cli-home/` |
| Local models and logs | `models/` |
| Local AI runtimes | `tools/llamafile*` |
| Pi configuration | `.toolkit/pi-agent/` |
| Launch scripts for agents, Pi, Dev Phone, and the CLI | `.toolkit/launch/` |
| Globally installed Twilio Skills | `~/.agents/skills/` |

Runtime state, credentials, models, logs, and generated configuration are
ignored by Git. Use **Settings → Uninstall or reset** to review individual
removals, or run the standalone guided uninstaller:

```bash
./uninstall.sh
```

## Platform support

| Platform | Status |
| --- | --- |
| macOS arm64/x64 | Supported |
| Linux arm64/x64 | Supported |
| Windows | Native launch is not currently supported; WSL is not yet verified |

Host requirements are `bash`, `git`, `curl`, and standard archive tools. The
toolkit installs pinned, checksum-verified project-local Bun and Node runtimes
when needed.

## Development

```bash
cd tui
bun install --frozen-lockfile
bun run typecheck
bun test

cd ..
./test.sh --no-net
```

To see every screen as text without a terminal (at any size):

```bash
cd tui
bun run preview                # all screens at 100×40
W=80 H=24 bun run preview      # the default terminal size
```

The test suite includes OpenTUI headless interaction tests, behavior tests for
configuration and MCP output, integrity checks, TypeScript compilation,
ShellCheck, and a TUI smoke test. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow and [SECURITY.md](SECURITY.md) for reporting guidance.

## Troubleshooting

- **The TUI will not start:** run `./toolkit doctor`.
- **Something seems broken:** run **Settings → Check & repair**. It downloads
  missing Skills, refreshes installed Skills, verifies local AI checksums,
  clears stale process records, and tells you exactly what still needs attention.
- **Local AI does not start:** inspect `models/pi-server.log`, stop local AI
  under **Local chat → Local AI settings**, and retry.
- **An agent did not configure:** review the task details; the toolkit prints
  the agent-specific manual step when its CLI has no stable configuration API.
- **You want an agent in another window:** run its script from
  `.toolkit/launch/` (for example `.toolkit/launch/claude-code.sh`) in any
  terminal. It carries the toolkit's local paths and settings.

Twilio Skills and Twilio MCP are Public Beta Twilio surfaces and are not covered
by Twilio Support Terms or an SLA.
