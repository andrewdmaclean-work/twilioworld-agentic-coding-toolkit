# Security policy

This toolkit is experimental and is not supported for production workloads.
Only the current `main` branch receives security fixes.

Report suspected vulnerabilities through a private GitHub Security Advisory for
this repository. Do not include live Twilio credentials, API keys, Auth Tokens,
phone numbers, or customer data in an issue, screenshot, log, or test fixture.

## Security boundaries

- Live Docs search is read-only and does not require Twilio credentials.
- Local AI binds to `127.0.0.1` by default.
- Downloaded runtimes and models are verified against pinned SHA-256 digests.
- Toolkit-managed Twilio CLI profiles are isolated under `.toolkit/`.
- Dev Phone can change a phone number's webhooks; use a non-production number.

If a secret was exposed, revoke or rotate it in the Twilio Console before
reporting the software issue.
