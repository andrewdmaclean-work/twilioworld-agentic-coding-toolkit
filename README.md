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

First run selects the AI bundle by default:

- Twilio Skills and live Docs search
- **Private local chat**, opened in the llamafile browser interface or Pi (about 2.5–3.3 GB)

**Dev Phone** and its account-facing Twilio CLI are additional and remain
unselected. You can deselect the local model during review and configure an
existing coding agent without the large download.

Applying the defaults installs the selected model/runtime and Pi. Opening
**Local chat** then lets you choose the browser or terminal interface.

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

1. **Set up a coding agent** — add Twilio Skills and live Docs, then launch it
2. **Local chat** — choose the simple browser interface or Pi
3. **Dev Phone** — install or open the browser test phone
4. **Twilio CLI** — install, sign in, switch account, or open an isolated terminal
5. **Resources** — open TwilioWorld or Twilio AI documentation
6. **Settings** — install or repair features, manage local AI, or uninstall/reset

Every action shows a summary before potentially destructive work. Long-running
tasks have progress, detailed output, failure recovery, and retry controls.

## Coding-agent setup

Choose **Set up a coding agent**, review the action, and continue. The toolkit
uses package-manager installers where available, configures Twilio knowledge,
and opens the agent in a new terminal window.

| Agent | Skills | Live Docs |
| --- | --- | --- |
| Claude Code | Twilio developer-kit plugin | Configured automatically |
| Codex | Agent Skills / plugin guidance | Configured automatically |
| Cursor | Plugin guidance | Manual MCP settings shown |
| OpenCode | `~/.agents/skills` | Included in `opencode.json` |
| GitHub Copilot CLI | `~/.agents/skills` | Interactive `/mcp` guidance |
| Pi | Toolkit-managed skills directory | Toolkit-managed MCP adapter |
| Other | Open Agent Skills instructions | Standard HTTP MCP endpoint shown |

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

Under **Settings → Manage local AI** you can:

- choose the model shared by the browser interface and Pi;
- disable reasoning or set its effort to Low, Medium, or High independently from whether Pi displays its reasoning blocks (browser chat only receives reasoning when effort is enabled);
- stop the local service; or
- remove downloaded model files.

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
| macOS arm64/x64 | Supported; multiple terminal apps are detected |
| Linux arm64/x64 | Supported; requires a compatible graphical terminal for new-window actions |
| Windows | Native launch is not currently supported; WSL is not yet verified |

Host requirements are `bash`, `git`, `curl`, and standard archive tools. The
toolkit installs project-local Bun and Node runtimes when needed.

## Development

```bash
cd tui
bun install --frozen-lockfile
bun run typecheck
bun test

cd ..
./test.sh --no-net
```

The test suite includes OpenTUI headless interaction tests, behavior tests for
configuration and MCP output, integrity checks, TypeScript compilation,
ShellCheck, and a TUI smoke test. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow and [SECURITY.md](SECURITY.md) for reporting guidance.

## Troubleshooting

- **The TUI will not start:** run `./toolkit doctor`.
- **Skills are missing:** run `git submodule update --init --recursive`, then
  apply setup again from Settings.
- **Local AI does not start:** inspect `models/pi-server.log`, stop local AI in
  Settings, and retry.
- **An agent did not configure:** review the task details; the toolkit prints
  the agent-specific manual step when its CLI has no stable configuration API.
- **A terminal window did not open:** launch the agent or Twilio CLI manually
  from this repository so it inherits the toolkit's local paths.

Twilio Skills and Twilio MCP are Public Beta Twilio surfaces and are not covered
by Twilio Support Terms or an SLA.
