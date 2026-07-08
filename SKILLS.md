# SKILLS.md

Project skills for AI coding agents working in this repo. Skills live in
`.claude/skills/<name>/SKILL.md` and are auto-discovered by Claude Code.

## Routing policy: computer use → GPT-5.5 via Codex CLI

**All computer-use tasks — UI validation, browser automation, screenshots,
visual/behavioral verification, end-to-end interaction testing — are routed to
GPT-5.5 through the Codex CLI.** Claude (or any other primary agent) must not
drive the browser itself and must not use claude-in-chrome
(`mcp__claude-in-chrome__*`) tools in this repo. Instead, delegate to GPT-5.5 as
a subagent and consume its compact report:

```bash
codex exec -m gpt-5.5 --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true \
  "<task prompt>"
```

Rationale:

- GPT-5.5 runs Playwright with disposable Chrome profiles under `/tmp`, never
  touching the user's real browser session.
- It inspects its own screenshots and DOM dumps, so the heavy tokens stay in the
  subagent; only a short PASS/FAIL summary returns to the primary context.
- Test scripts and outputs accumulate in `artifacts/` (untracked), making runs
  repeatable.

## Skills

### `ui-validate` — `.claude/skills/ui-validate/SKILL.md`

Delegates any UI validation or computer-use task to GPT-5.5 via `codex exec`.
Covers preconditions (dev server on :4200, Playwright at `/tmp/pmks-playwright`),
the exact invocation, the task-prompt template with standing rules, and the
existing reusable test scripts in `artifacts/`. Use it whenever a change needs
to be verified in the running app or the user asks for UI validation, browser
testing, or screenshots.
