# SKILLS.md

Project skills for AI coding agents working in this repo. Skills live in
`.claude/skills/<name>/SKILL.md` and are auto-discovered by Claude Code.

## Computer use and UI validation

Run UI validation, browser automation, screenshots, visual/behavioral checks,
and end-to-end interaction tests directly with Playwright. Use a disposable or
task-specific Chrome profile under `/tmp`; never attach automation to the user's
normal browser profile. Reuse or extend the repeatable scripts in `e2e/` and
inspect their screenshots and JSON reports in `artifacts/` before reporting a
compact PASS/FAIL summary.

## Delegation policy: save primary-model tokens

Beyond computer use, prefer delegating scouting and mechanical work to cheaper
subagents and keep the primary (most expensive) model for judgment —
architecture, tricky debugging, review, and synthesizing reports:

- **Codebase scouting / broad search** — Claude Code `Agent` tool with
  `subagent_type: Explore` and `model: opus` (Opus 4.8).
- **Mechanical multi-step tasks** (bulk edits, test-suite runs, log trawls) —
  `Agent` tool `general-purpose` with `model: opus` when delegation is useful.
- Subagents must report back **compact summaries** (findings, file:line refs,
  PASS/FAIL), never raw grep/log/DOM output.

## Test layout

- **Unit / solver tests** — Vitest, co-located in `src/**/*.spec.ts`
  (`npm test -- --watch=false`); `src/app/app.component.spec.ts` is the
  MATLAB-verified solver regression suite.
- **E2E / UI tests** — Playwright scripts in `e2e/*.mjs`, run headless via plain
  Node (Playwright lives in `/tmp/pmks-playwright`, not in devDependencies).
  Details in `e2e/README.md`.

## Skills

### `ui-validate` — `.claude/skills/ui-validate/SKILL.md`

Defines the direct Playwright workflow for UI validation and computer-use tasks.
Covers preconditions (dev server on :4200, Playwright at `/tmp/pmks-playwright`),
profile isolation, result inspection, and the existing reusable test scripts.
Use it whenever a change needs to be verified in the running app or the user
asks for UI validation, browser testing, or screenshots.
