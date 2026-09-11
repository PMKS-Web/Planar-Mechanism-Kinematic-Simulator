---
name: ui-validate
description: Run UI validation, browser automation, screenshots, smoke tests, visual verification, and computer-use tasks directly with Playwright. Use whenever a change needs visual or behavioral verification in the running app, or the user mentions UI validation, browser testing, screenshots, end-to-end checks, or computer use.
---

# Direct UI validation with Playwright

This skill has one home: **read [`.claude/skills/ui-validate/SKILL.md`](../../../.claude/skills/ui-validate/SKILL.md)
and follow it.** This file only points there, so the two copies cannot drift apart again.

**In Codex, your browser tool is standard Codex computer use (`mcp__cua_repl`), in an incognito
Chrome window.** The canonical skill also names Claude Code's Playwright MCP and claude-in-chrome;
you do not have those, so use the Codex column of its table.

The short version, in case you only read this far: verify UI changes in the running app yourself,
at `http://localhost:<port>` (never `127.0.0.1` — the dev server binds IPv6 loopback only); capture
a filmstrip, not a screenshot, for anything that animates or responds to a drag; keep reports in
gitignored `artifacts/`; and run only the `e2e/` suites that cover your change, because the whole
batch takes about an hour.
