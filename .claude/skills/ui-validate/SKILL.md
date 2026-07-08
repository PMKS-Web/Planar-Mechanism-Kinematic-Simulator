---
name: ui-validate
description: Delegate ALL UI validation, browser automation, screenshots, smoke tests, visual verification, and computer-use tasks to GPT-5.5 via the Codex CLI. Use whenever a change needs visual or behavioral verification in the running app, or the user mentions UI validation, browser testing, screenshots, end-to-end checks, or computer use. Do NOT use claude-in-chrome (mcp__claude-in-chrome__*) tools for this repo.
---

# UI validation via GPT-5.5 (Codex CLI subagent)

All browser / computer-use work in this repo is delegated to GPT-5.5 running as a
subagent through the Codex CLI. GPT-5.5 drives Playwright itself, looks at its own
screenshots, and reports back a compact summary — the heavy tokens (DOM dumps,
screenshots, logs) stay in Codex's context, not this session's.

**Never** use the claude-in-chrome tools (`mcp__claude-in-chrome__*`) for tasks in
this repo; they attach to the user's real browser session and flood this context
with page content.

## Preconditions (check before delegating)

1. **Dev server** — `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4200/`
   must return `200`. If not, run `npm start` in the background and wait for the
   compile to finish before delegating.
2. **Playwright** — preinstalled at `/tmp/pmks-playwright`. If
   `/tmp/pmks-playwright/node_modules/playwright` is missing:
   `mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright && npx playwright install chromium`

## Invocation

```bash
codex exec -m gpt-5.5 --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true \
  "<TASK PROMPT>" 2>&1 | tail -30
```

- Run from the repo root with a generous timeout (10 min).
- Keep Codex's sandbox ON: do **not** pass `--full-auto` or
  `--dangerously-bypass-approvals-and-sandbox`. The single config override above
  only enables (localhost) network inside the sandbox so Playwright can reach the
  dev server.
- Read only the tail of the output — GPT-5.5's compact report is printed last.
- For long test suites, run the Bash call with `run_in_background: true` and
  collect the report when it finishes.

## Task prompt template

Always include the standing rules so GPT-5.5 behaves consistently:

```
You are a UI validation subagent for the PMKS+ Angular app.
Dev server: http://127.0.0.1:4200/. Playwright is preinstalled at
/tmp/pmks-playwright (use NODE_PATH=/tmp/pmks-playwright/node_modules).
Launch Chrome/Chromium headless with a DISPOSABLE profile under /tmp
(e.g. /tmp/pmks-<case>-<timestamp>); never attach to the user's real browser.

TASK: <what to validate — pages, interactions, expected behavior>

Reuse or extend the existing scripts in artifacts/*.mjs if present; otherwise
write a repeatable script there. Save screenshots to artifacts/screenshots/
and JSON reports to artifacts/screenshots/<name>-report.json. Capture console
errors, page crashes, and element counts at each checkpoint.

Then LOOK at the screenshots yourself and describe what is visible.
Report back ONLY a compact summary: PASS/FAIL per case, console error count,
key element counts, and 2-3 sentences describing what the screenshots show.
Do not paste raw logs or DOM dumps.
```

## Existing test scripts (reuse before writing new ones)

Kept untracked in `artifacts/` of the user's checkout:

- `artifacts/pmks-playwright-test.mjs` — broad page/panel coverage
- `artifacts/pmks-deep-interaction-test.mjs` — deep grid interactions (drag joints, right-click links, templates)
- `artifacts/pmks-focused-interactions.mjs` — focused workflows; run as
  `PMKS_URL=http://127.0.0.1:4200/ RUN_PREFIX=focused node artifacts/pmks-focused-interactions.mjs`

Outputs land in `artifacts/screenshots/` (PNGs + `*-report.json`). If the scripts
are absent (fresh clone), tell GPT-5.5 to generate them from the template above.

## Interpreting results

- Trust GPT-5.5's PASS/FAIL and description; only open the PNGs/JSON yourself if
  its report is ambiguous or contradicts expectations.
- If Codex reports it could not launch a browser or reach the server, re-check the
  preconditions rather than retrying the same command.
