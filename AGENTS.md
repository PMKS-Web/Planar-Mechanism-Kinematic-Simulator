# AGENTS.md

Guidance for any coding agent that is not Claude Code: Codex, Cursor, Copilot, Gemini CLI, Jules,
and whatever reads this file next.

## Read CLAUDE.md first

**[CLAUDE.md](CLAUDE.md) is the single description of this project** — what it is, how to
build and test it, the architecture, where things are on screen, the branch and PR process, and
the conventions. Read it before doing anything here. It is named for one agent and written for all
of them, and for people.

This file used to restate that description in its own words, and the copy went stale: it still
claimed `mechanisms` only ever uses index 0, described a `Piston` class and an `app.module.ts`
that no longer exist, and counted three left-panel tabs where there are four. Two governing
documents that must be kept in sync is how that happens, so this one holds only what differs from
one runner to the next.

## What differs by runner

- **Skills.** Claude Code loads `.claude/skills/`; Codex loads `.agents/skills/`, where each skill
  is a short pointer to its `.claude` copy. Change the canonical copy and keep the pointer a
  pointer, or the two drift apart. A runner that loads neither gets the one skill's rules from the
  next bullet.
- **Browser tools.** CLAUDE.md and the `ui-validate` skill name the Playwright MCP
  (`mcp__playwright__*`) and claude-in-chrome (`mcp__claude-in-chrome__*`). Those are Claude Code's
  tools. **If a tool a document names is not in your tool list, you are not that runner:** do not
  wait for it, and never report a live check as done with a tool you could not call.

  | Runner | Explore and reproduce | Keep a finding |
  | --- | --- | --- |
  | Claude Code | the Playwright MCP | a tracked `e2e/*.mjs` suite |
  | Codex | standard Codex computer use (`mcp__cua_repl`), in an incognito Chrome window, leaving the user's regular tabs and extension permissions alone | the same suites |
  | Anything else | whatever browser tool you have, in a profile that is not the user's; without one, the tracked suites and the screenshots they write to `artifacts/` are your eyes | the same suites |

  The rules do not change with the tool: `http://localhost:<port>` rather than `127.0.0.1` (the
  dev server binds IPv6 loopback only), a filmstrip rather than a screenshot for anything that
  moves, and only the suites that cover your change, because the whole batch takes about an hour.
- **Memory.** Claude Code keeps notes between sessions; the rest keep nothing. Durable decisions
  therefore live in the repository — CLAUDE.md, `docs/tips-and-tricks.md`, and the documents
  indexed in [`docs/README.md`](docs/README.md). When a maintainer tells you something that should
  outlast the session, write it there, whichever runner you are.
- **Permissions.** `.claude/settings.json` lists the commands Claude Code may run unasked:
  `npm run check`, the tests, the builds, the e2e suites, the gallery tools. It is a description of
  what is safe to run here, and it holds for every runner.

## What does not differ

Everything else. Pull requests go to `staging`; `npm run check` before a push; the pull request
template filled in, with the e2e suites you ran named in it; and a note in
`docs/tips-and-tricks.md` for anything that cost you an hour.
