---
name: ui-validate
description: Run UI validation, browser automation, screenshots, smoke tests, visual verification, and computer-use tasks directly with Playwright. Use whenever a change needs visual or behavioral verification in the running app, or the user mentions UI validation, browser testing, screenshots, end-to-end checks, or computer use.
---

# Direct UI validation with Playwright

Run browser and computer-use work directly. Reuse or extend the tracked
Playwright scripts in `e2e/*.mjs`, inspect the resulting screenshots and JSON
reports yourself, and return a compact PASS/FAIL summary.

## Safety

- Use a disposable Chrome profile under `/tmp` for routine Playwright testing.
  The Playwright MCP does this for you: it makes a temporary profile unless
  told otherwise.
- A task-specific persistent profile under `/tmp` is allowed when the user
  explicitly authenticates it for the task.
- Do not point *scripted* automation at the user's normal browser profile — a
  suite that reruns has no business in a logged-in session. claude-in-chrome
  (`mcp__claude-in-chrome__*`) is the sanctioned way into that browser when the
  task genuinely needs it, one deliberate step at a time; never sign in, buy,
  post or submit there without being asked.
- Keep screenshots and reports in gitignored `artifacts/` directories.

## Preconditions

1. For local PMKS+ checks, verify that `http://localhost:4200/` returns `200`.
   Start `npm start` and wait for compilation if needed. (`localhost`, not
   `127.0.0.1` — the dev server binds the hostname.)
2. The e2e scripts look for Playwright at `/tmp/pmks-playwright`, overridable
   with `PMKS_PLAYWRIGHT_DIR`. `playwright` is also a devDependency now, so
   `PMKS_PLAYWRIGHT_DIR=..` runs a suite against the project's own copy — `..`
   and not `.`, because the resolver imports relative to the script in `e2e/`.
   If the `/tmp` install is missing (it is cleared on reboot):
   `mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright gif-encoder pngjs && npx playwright install chromium`

## Filmstrips are mandatory for any animated or gestural change

A screenshot proves the end state and says nothing about the frames before it,
which is where interaction bugs live. **Any change that animates, slides, fades,
resizes, or responds to a drag must be captured as a filmstrip and the frames
looked at** — not a before-and-after pair.

Use `e2e/filmstrip.mjs`: `filmstrip(page, dir, clip)` gives numbered burst
frames and `during(everyMs, count, tag, work)` captures while an interaction
runs; `contactSheet(pattern, out, columns)` tiles them into one image to read.
Playwright's `recordVideo` is not a substitute — a `.webm` cannot be inspected
here (no ffmpeg), and a whole animation as one sheet costs about what a single
screenshot costs.

Then **look at the sheet**. Collecting frames and asserting nothing proves
nothing. Two real bugs were caught this way and by nothing else: a card that
snapped to its full width before the control it was making room for had begun
to slide, throwing two buttons 200px sideways in one frame; and that control
being clipped at the card's edge for the first third of its entrance. Both were
invisible in the finished screenshot.

What to film, at minimum: the interaction's start (the frame the gesture takes
hold), two or three frames mid-way, the release, and the settle. For a drag,
film a pose *away from* the start of the cycle as well — a gesture at t = 0 and
the same gesture parked mid-cycle are different code paths here.

## Explore with the MCP, keep it in a suite

The Playwright MCP (`mcp__playwright__*`) holds one live browser across calls
and answers with the accessibility tree, so a selector is something you read
rather than something you guess. Use it to find the handles and confirm a
reproduction — it is far cheaper than a write-run-read-fix loop over a `.mjs`
file, each turn of which costs an app boot.

Then write the tracked suite. An MCP session proves something worked once, in
one conversation; only a suite that exits non-zero gates a merge or catches the
regression months later. The MCP is the reconnaissance, not the record.

## Running checks

- Run scripts with plain Node and
  `NODE_PATH=/tmp/pmks-playwright/node_modules` when needed.
- Capture console errors, page crashes, and element counts at meaningful
  checkpoints.
- Inspect screenshots and reports rather than trusting process exit status
  alone.
- Keep browser automation repeatable. Add generally useful PMKS+ workflows to
  `e2e/`; keep one-off external-site or authenticated helpers under `/tmp`.

## Existing PMKS+ scripts

- `e2e/full-tour.mjs` — broad tour: panels, templates, settings, share URL,
  mobile viewport
- `e2e/interaction-sweep.mjs` — every context-menu action on every kind of
  object; narrow it with `ONLY=4-Bar node e2e/interaction-sweep.mjs`
- `e2e/phase1-drag.mjs` — drag gestures, snapping, merging, one undo per gesture

`e2e/README.md` lists the rest. Prefer a suite that asserts and exits non-zero
over one that only takes screenshots: the point is to fail, not to look.

The PMKS+ canvas places joints from tracked mouse movement rather than click
coordinates. Move to the target before the finalizing click, and prefer the
Edit panel's HTML controls over drifting SVG context-menu hitboxes.
