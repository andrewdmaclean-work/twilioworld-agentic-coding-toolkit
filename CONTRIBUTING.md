# Contributing

This repository is an experimental event toolkit. Keep changes small,
reversible, and explicit about anything they install or modify.

## Local checks

```bash
cd tui
bun install --frozen-lockfile
bun run typecheck
bun test

cd ..
./test.sh --no-net
```

Before opening a pull request:

1. Add behavior or OpenTUI interaction tests for user-visible changes.
2. Update the README when navigation, prerequisites, storage, or side effects change.
3. Never commit credentials, `.toolkit/` runtime state, model files, or logs.
4. Preserve user-owned agent configuration and unrelated working-tree changes.
5. Confirm destructive actions and name the exact data they remove.

Use concise, task-oriented UI language. Menu labels should describe the user's
goal; descriptions should explain the result or side effect. Avoid exposing
implementation names unless they help the user make a decision.
