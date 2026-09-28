#!/usr/bin/env bash
# Repository-level validation for the TwilioWorld Agentic Coding Toolkit.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

PASS=0
FAIL=0

check() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '  \033[32mPASS\033[0m %s\n' "$description"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m %s\n' "$description"
    FAIL=$((FAIL + 1))
  fi
}

echo "── Entry point and repository ──"
check "toolkit entry point is executable" test -x toolkit
check "toolkit doctor is available" grep -q "run_doctor" toolkit
check "Twilio Skills submodule is populated" test -f vendor/twilio-ai/skills/README.md
check "tracked JSON files are valid" bash -c 'jq empty opencode.json toolkit.defaults.json tui/assets/pi/models.json'
check "runtime PID files are not tracked" bash -c '! git ls-files --error-unmatch .toolkit/model-server.pid .toolkit/mcp-proxy.pid >/dev/null 2>&1'
check "Bun lockfile is committed" test -f tui/bun.lock
check "toolchain downloads are pinned and checksum-verified" bash -c 'grep -q "^BUN_VERSION=\"[0-9.]*\"" toolkit && grep -q "verify_download" toolkit && ! grep -q "releases/latest" toolkit'
check "no opener runs without naming its destination" bash -c '! grep -rnE --exclude="*.test.ts" "openInNewWindow|spawn\(\"open\", \[file\]" tui/src >/dev/null'

echo "── Product boundaries ──"
check "Docs MCP remains configured" grep -q "https://mcp.twilio.com/docs" opencode.json
check "local AI bundle is selected by default" grep -q '"localGemma": true' toolkit.defaults.json
check "Execute MCP is fully removed" bash -c '! grep -rnE --exclude="*.test.ts" "Execute MCP|executeMcp|TWILIO_MCP_CREDS|twilio-execute|@twilio-alpha/mcp" README.md opencode.json toolkit.defaults.json tui/src >/dev/null'
check "agent installers do not pipe downloads into a shell" bash -c '! grep -nE "curl.*\|[[:space:]]*(ba)?sh\b" tui/src/lib/configure-agent.ts >/dev/null'
check "model downloads use pinned SHA-256 digests" bash -c 'grep -q "LLAMAFILE_SHA256 = \"[a-f0-9]\\{64\\}\"" tui/src/lib/constants.ts && grep -q "digestMatches" tui/src/lib/model-install.ts'
check "quick start uses the canonical clone URL" grep -q "github.com/andrewdmaclean-work/twilioworld-agentic-coding-toolkit" README.md

echo "── Shell quality ──"
if command -v shellcheck >/dev/null 2>&1; then
  check "shellcheck passes" shellcheck toolkit test.sh uninstall.sh
else
  printf '  \033[33mSKIP\033[0m shellcheck is not installed\n'
fi

echo "── TypeScript and OpenTUI ──"
if command -v bun >/dev/null 2>&1; then
  check "locked dependencies install" bash -c 'cd tui && bun install --frozen-lockfile'
  check "TypeScript typecheck passes" bash -c 'cd tui && bun run typecheck'
  check "unit and interaction tests pass" bash -c 'cd tui && bun test'
  check "TUI starts and exits in smoke mode" bash -c 'cd tui && TOOLKIT_TUI_SMOKE=1 bun run src/index.ts | grep -q "TwilioWorld"'
else
  printf '  \033[31mFAIL\033[0m Bun is required to run TypeScript and OpenTUI checks\n'
  FAIL=$((FAIL + 1))
fi

if [[ "${1:-}" != "--no-net" ]]; then
  echo "── Network ──"
  check "Docs MCP is reachable" curl -fsSI --max-time 10 https://mcp.twilio.com/docs
  check "llamafile release is reachable" curl -fsSI --max-time 10 https://github.com/mozilla-ai/llamafile/releases/download/0.10.3/llamafile-0.10.3
fi

echo
echo "Passed: $PASS   Failed: $FAIL"
[[ $FAIL -eq 0 ]]
