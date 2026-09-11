# AGENTS.md

Guidance for Codex working in this repository.

## Read CLAUDE.md first

**[CLAUDE.md](CLAUDE.md) is the single description of this project** — what it is, how to
build and test it, the architecture, where things are on screen, the branch and PR process, and
the conventions. Read it before doing anything here. It applies to every agent, not just Claude.

This file used to restate that description in its own words, and the copy went stale: it
still claimed `mechanisms` only ever uses index 0 (multi-mechanism is the headline feature
now), described a `Piston` class and an `app.module.ts` that no longer exist, and counted
three left-panel tabs where there are four. Two governing documents that must be kept in
sync is how that happens, so this one now holds only what is specific to Codex.

## What is specific to Codex

- **Skills.** Codex loads skills from `.agents/skills/`; Claude Code loads them from
  `.claude/skills/`. The `.claude` copy is the canonical one, and each `.agents` skill is a short
  pointer to it. Change the canonical copy; keep the pointer a pointer, or the two drift apart.
- **Browser tools.** Your live browser tool is **standard Codex computer use
  (`mcp__cua_repl`)**, in an incognito Chrome window. Confirm the window is incognito before
  loading the local app, and leave the user's regular tabs and extension permissions alone.
  CLAUDE.md and the ui-validate skill also name the Playwright MCP (`mcp__playwright__*`) and
  claude-in-chrome (`mcp__claude-in-chrome__*`): those are Claude Code tools you do not have, so
  do not wait for them or report a check done with them. Tracked `e2e/*.mjs` suites run the same
  in both. The rules still apply: `http://localhost:<port>` rather than `127.0.0.1`, and a
  filmstrip for anything that moves.
- **No project memory.** Codex keeps nothing between sessions for this repository, so durable
  decisions live in the repository itself — CLAUDE.md, `docs/tips-and-tricks.md`, and the
  documents indexed in [`docs/README.md`](docs/README.md). When a maintainer tells you something
  that should outlast the session, write it there.
