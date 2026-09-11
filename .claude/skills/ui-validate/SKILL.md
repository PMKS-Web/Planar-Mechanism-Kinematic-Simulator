---
name: ui-validate
description: Run UI validation, browser automation, screenshots, smoke tests, visual verification, and computer-use tasks directly with Playwright. Use whenever a change needs visual or behavioral verification in the running app, or the user mentions UI validation, browser testing, screenshots, end-to-end checks, or computer use.
---

# Direct UI validation with Playwright

Run browser and computer-use work directly. Reuse or extend the tracked
Playwright scripts in `e2e/*.mjs`, inspect the resulting screenshots and JSON
reports yourself, and return a compact PASS/FAIL summary.

## Three ways to drive a browser, for different jobs

The tool names below are Claude Code's. In Codex, use its own browser or computer-use tool for the
MCP and claude-in-chrome jobs; the rules around each job stay the same.

- **The Playwright MCP** (`mcp__playwright__*`) — reach for this first when
  exploring or reproducing. It holds one live browser across calls and answers
  with the accessibility tree, so a selector is something you read rather than
  something you guess: finding out that a mode tab is `.tabButton` and not
  `.modeTab` costs one call here and a whole app boot otherwise. It launches its
  own browser with a temporary profile.
- **A tracked `e2e/*.mjs` suite** — how a finding gets *kept*. An MCP session
  proves something worked once, in one conversation; only a suite that exits
  non-zero can catch the regression months later. Explore with the MCP, then
  write the suite with the guesswork already burned off.
- **claude-in-chrome** (`mcp__claude-in-chrome__*`) — drives the user's real,
  logged-in Chrome. Use it only when that is the point (a deploy preview behind a
  login, a Netlify or GitHub page, something already open in front of them),
  never for routine checks of the app, and never to sign in, buy, post or submit
  without being asked.

## Safety

- Routine Playwright runs use a disposable profile under `/tmp`. A task-specific
  persistent profile is allowed only when the user authenticates it for the task.
- Never point *scripted* automation at the user's normal browser profile.
- Keep screenshots and reports in gitignored `artifacts/` directories.

## Preconditions

1. **A dev server serving your code.** `npm start` serves on
   `http://localhost:4200`; in a worktree, start your own with
   `npx ng serve --port <free port>`, because 4200 is usually already serving
   another checkout. Always use `localhost`, never `127.0.0.1`: the server binds
   IPv6 loopback only. Point suites at it with `PMKS_BASE_URL=http://localhost:<port>`.
2. **Playwright.** It is a devDependency, so `PMKS_PLAYWRIGHT_DIR=..` runs a suite
   against the project's own copy (`..`, not `.`, because the resolver imports
   relative to the script). The install outside the repo, and what else some
   suites need, is in
   [`docs/tips-and-tricks.md#environment`](../../../docs/tips-and-tricks.md#environment).

## Filmstrips are mandatory for any animated or gestural change

A screenshot proves the end state and says nothing about the frames before it,
which is where interaction bugs live. **Any change that animates, slides, fades,
resizes, or responds to a drag must be captured as a filmstrip and the frames
looked at** — not a before-and-after pair.

Use `e2e/filmstrip.mjs`: `filmstrip(page, dir, clip)` gives numbered burst
frames and `during(everyMs, count, tag, work)` captures while an interaction
runs; `contactSheet(pattern, out, columns)` tiles them into one image to read
(it needs Pillow under python3, and skips the sheet without it). Playwright's
`recordVideo` is not a substitute — a `.webm` cannot be inspected here.

Then **look at the frames**. Collecting frames and asserting nothing proves
nothing. Two real bugs were caught this way and by nothing else: a card that
snapped to its full width before the control it was making room for had begun
to slide, and that control being clipped at the card's edge for the first third
of its entrance. Both were invisible in the finished screenshot.

What to film, at minimum: the frame the gesture takes hold, two or three frames
mid-way, the release, and the settle. For a drag, film a pose *away from* the
start of the cycle as well — a gesture at t = 0 and the same gesture parked
mid-cycle are different code paths here.

## Running checks

- Capture console errors, page crashes, and element counts at meaningful
  checkpoints, and inspect screenshots and reports rather than trusting the exit
  status alone.
- Run only the suites that cover the change: the whole batch takes about an hour.
  `e2e/README.md` says what each suite covers and which ones rewrite tracked
  files.
- Add generally useful PMKS+ workflows to `e2e/`; keep one-off external-site or
  authenticated helpers out of the repo.
- Prefer a suite that asserts and exits non-zero over one that only takes
  screenshots: the point is to fail, not to look.

The PMKS+ canvas places joints from tracked mouse movement rather than click
coordinates. Move to the target before the finalizing click, and prefer the
Edit panel's HTML controls over drifting SVG context-menu hitboxes.
