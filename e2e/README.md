# PMKS+ tests

Two layers, organized by what they exercise:

| Layer | Where | Runner | What it covers |
| --- | --- | --- | --- |
| Unit / solver | `src/**/*.spec.ts` (co-located with source, Angular convention) | Vitest — `npm test -- --watch=false` | Models, services, components; `src/app/app.component.spec.ts` is the MATLAB-verified solver regression suite |
| E2E / UI | `e2e/*.mjs` (this folder) | Playwright via plain Node, one script at a time | Real-browser interaction: grid clicks and drags, context menus, panels, playback, phone layout |

Unit specs stay in `src/` because `tsconfig.spec.json` discovers them via `src/**/*.spec.ts` and
Angular component specs resolve templates relative to their source. Everything browser-driven lives
here.

## What CI runs

`.github/workflows/verification.yml` runs `npm ci`, `npm run lint`, `npm run lint:format`,
`npm test -- --watch=false`, `npm run build` and `git diff --check`, and a pull request cannot merge
until it passes. `lint:format` covers these scripts too, so format an `.mjs` you edit.
**No e2e suite runs in CI.** They are run by hand, locally, against a dev
server — so a suite that nobody ran can be broken without anything turning red.

## Prerequisites

- **A dev server.** `npm start` serves `http://localhost:4200`. Use `localhost`: the dev server does
  not answer on `127.0.0.1`. Most suites reach into the app through `window.ng`, which only a
  development build exposes.
- **Playwright.** It is a devDependency in `package.json`, so after `npm ci` the project's own copy
  works with `PMKS_PLAYWRIGHT_DIR=..`. Suites default to a separate install in `/tmp/pmks-playwright`.
- **Run from the repository root.** Suites read `src/` and write `artifacts/` by relative path.

The install commands, the browser cache, why `..` and not `.`, and the localhost rule are in
[tips-and-tricks: Environment](../docs/tips-and-tricks.md#environment). Some suites need more than
Chromium; the catalog below says which.

## Running

```bash
PMKS_BASE_URL=http://localhost:4200 PMKS_PLAYWRIGHT_DIR=.. node e2e/playback-bar.mjs
```

There is no runner. A check prints `PASS`/`FAIL` lines and exits non-zero if anything failed. The
asset generators and `shot.mjs` are not checks.

**The full batch takes about an hour.** Run the suites that cover the change, plus any you can name
a reason to worry about.

## Outputs

Each suite that saves anything writes it to its own directory under `artifacts/`, which is
gitignored — for example `artifacts/link-holds/` or `artifacts/posed-edit-audit/matrix.md`. A few
older suites share `artifacts/screenshots/`, and most of those prefix their filenames with
`RUN_PREFIX`. Look at what
they save: an exit code tells you a check failed, not what the page looked like.

**Three suites rewrite tracked files**, and running them dirties the working tree:

- `readme-shots.mjs` writes `docs/images/readme/`
- `template-thumbnails.mjs` writes the PNG stills in `src/assets/gifs/`
- `template-animations.mjs` writes the GIF loops in `src/assets/gifs/`

`drag-perf.mjs --baseline` also rewrites the tracked `e2e/drag-perf-baseline.json`, on purpose.

## Environment variables

- `PMKS_BASE_URL` — the app's origin, read by every suite. Default `http://localhost:4200`. Some
  older suites also accept `PMKS_URL`; `PMKS_BASE_URL` wins when both are set.
- `PMKS_PLAYWRIGHT_DIR` — where to import Playwright from (it appends
  `/node_modules/playwright/index.mjs`). Default `/tmp/pmks-playwright`; `..` is the project's copy.
- `PMKS_CHROME` — Google Chrome executable. Only some suites read it; they launch installed Chrome
  (default under `/Applications/Google Chrome.app`) rather than Playwright's Chromium.
- `PMKS_HEADED=1` — show the browser window. Only some suites read it; the rest are always headless.
- `RUN_PREFIX` — prefix for screenshot and report filenames. Only some suites read it.

Per-suite switches are listed with their suite: `ONLY`, `PMKS_ONLY`, `SEED`, `SHOTS`,
`SHOT_WIDTH`/`SHOT_HEIGHT`, `PMKS_PERF_TOLERANCE`, `MOUSECTL`, `PW_CHROME`.

## Shared helpers

Not suites — import them from one.

- `app-ready.mjs` — `waitForReady(page)` waits until the mechanism is built, solved (if it can be)
  and nothing on screen is still moving; `openMechanism(page, url)` loads a URL and waits the same
  way. Use these instead of a fixed sleep: a click measured before the canvas settles lands
  somewhere else.
- `quiet-start.mjs` — `startQuiet(context)` seeds `localStorage` so neither the tutorial invitation
  nor the release notes covers the canvas. Apply it before the first page opens. `whatsNewSeen` in
  `QUIET_START` must match `WHATS_NEW_VERSION`; `whats-new.mjs` fails if it does not.
- `template-payloads.mjs` — every template id and URL payload, read out of
  `template-linkages.ts` and `dev-templates.ts`: `TEMPLATE_IDS`, `TEMPLATE_LINKAGES`,
  `ALL_LINKAGES` (with the dev drawings) and `assertTemplatesParsed()` for anything that sweeps.
  Never re-parse the source yourself.
- `filmstrip.mjs` — `filmstrip(page, dir, clip)` captures numbered frames (`shot(tag)`, or
  `during(everyMs, count, tag, work)` across an animation); `contactSheet(pattern, out)` tiles
  them into one image. Anything that animates or responds to a drag needs a filmstrip, not a
  screenshot. The sheet needs Pillow under `python3`; without it the sheet is skipped with a
  warning and the frames are still written.
- `drag-perf-harness.mjs` — the drag scenarios (`SCENARIOS`) and the machinery `drag-perf.mjs`
  and `drag-profile.mjs` share: `launch()`, `loadScenario`, `plainDrag`, `harnessFloor` (the
  protocol's own cost, to subtract), `profiledDrag`, and call counters that need a dev build.

## Suites

### Broad sweeps and tours

- `full-tour.mjs` — panels, templates, settings, share URL, help, and a fresh load at phone size.
  Fails on a NaN degrees of freedom, a page wider than its viewport, a Save that starts no
  download, or a template dialog that will not close. Needs installed Chrome (`PMKS_CHROME`).
- `interaction-sweep.mjs` — every context-menu row on every joint, link, force and the bare grid,
  on several mechanisms: each enabled row is clicked, read back and undone. Catches the silent
  click. Slow; `ONLY=4-Bar,Cylinder_Boom` narrows it.
- `gallery-sweep.mjs` — every mechanism in `docs/fixture-urls.md` opened in the app: it decodes,
  reports the mobility its spec says, precomputes a cycle, and animates. Slow.
- `multi-mechanism-smoke.mjs` — the app boots, and the running service finds more than one
  machine in drawings that hold several.
- `force-status-survey.mjs` — investigation script: prints what force analysis says for each
  template.
- `shot.mjs` — not a check: one screenshot of one state, `node e2e/shot.mjs <name> <template>
  <steps...>`, into `artifacts/shots/`. `SHOT_WIDTH`/`SHOT_HEIGHT` size the window.

### Editing, undo and paused poses

- `edit-playback.mjs` — Gate 1 of `docs/edit-mode-playback-plan.md`: the transport is chrome
  (present and inert over an empty grid), the Edit panel stays while the mechanism moves, every
  gate gives one answer, and the mode-switch table edge by edge.
- `posed-editing.mjs` — Gate 2: a drag at a paused pose stages and re-anchors, the ghost warns
  while the hand moves, the snackbar says when the start moved, and undo rewinds.
- `posed-editing-adversarial.mjs` — gestures that are not edits must not become them: a view
  gesture ending a center-of-mass drag, a pinch after a drag began, a synced drawing edited on the
  machine that is not the master.
- `posed-edit-audit.mjs` — every menu row, panel field, key and transport control at a displaced
  pose, on three mechanisms, judged on what is left behind. Writes
  `artifacts/posed-edit-audit/matrix.md`. Slow: tips-and-tricks puts it at about a quarter of an
  hour.
- `posed-drag-fuzz.mjs` — seeded random drags at random poses; the ghost, the design's sample 0
  and the transport's "from start" must agree. `SEED=` replays, `ONLY=` picks trial numbers. Slow:
  about ten minutes.
- `posed-menu.mjs` — paused context-menu attachments and property edits keep the authored start
  pose. `PMKS_ONLY=<case>` runs one case.
- `analysis-editing.mjs` — `docs/analysis-mode-editing-plan.md`: dragging and undo in an analysis
  mode, what is still refused, click selects and drag tunes, the before/after comparison overlay,
  and the force-mode budget.
- `edit-undo.mjs` — one committed edit is one undo step, whether it was dragged or typed.
- `unit-undo-view.mjs` — undoing a unit change does not move the view.

### Drag, snap and pointer input

- `phase1-drag.mjs` — joint snap ring and merge, merging onto a slider's pin, refusing an
  over-constraining merge, whole-link drag, one undo entry per gesture, click without nudge. Needs
  installed Chrome (`PMKS_CHROME`).
- `snap-alignment.mjs` — a dragged joint squares up with its neighbors; a body dragged by its
  middle does not; Option and the setting turn it off.
- `snap-to-grid.mjs` — snap to grid with a real mouse: joints land on grid corners, a link lands
  its reference joint, a capture beats the grid, off rounds nothing.
- `pointer-pairing.mjs` — a bare `mousedown` with no `pointerdown` (Safari after a native select)
  must not pan the canvas under a held link. Runs in Chromium and WebKit, so it needs WebKit
  installed.
- `real-mouse-slots.mjs` — builds every slider and cylinder variant with the real system cursor.
  Opt-in: needs `MOUSECTL` pointing at a compiled `e2e/tools/mousectl.swift` and Accessibility
  permission; `PW_CHROME` names the browser app it opens.
- `multi-select-and-dxf.mjs` — Ctrl/Command and macOS Control-click selection, group
  drag/rotate/scale with one history step and Lock refusal, atomic duplicate and delete, desktop
  and narrow visual checks, and a downloaded semantic DXF.
- `keyboard-shortcuts.mjs` — each key does what the control it doubles does, and nothing while a
  field is being typed in.
- `creation-previews.mjs` — the ghost drawn while creating a link or cylinder wears the color the
  part gets, and a canceled gesture does not shuffle the colors after it.
- `hover-dimensions.mjs` — every dimension drawn while an Edit panel field is pointed at uses the
  same chip, hairline weight and angle unit.

### Context menu

- `context-menu.mjs` — the right-click menu on every kind of part in every mode: the fixed
  ladder, states as ticked switches, the model's reason on every grayed row, deletion cascades
  named before the click, and analysis modes matching Edit at the start pose.
- `context-menu-modes.mjs` — shared Edit/Kinematic/Force menus, right-click targets, start-pose
  mutation gates, traces preserving paused geometry and t=0, bulk field explanations, and menu
  scrolling on phones.
- `circular-link.mjs` — Drawn as a Disc on a grounded crank: offered there, refused on a coupler
  with its reason, drawn as a disc, and still one after a share link and while running.
- `disabled-toggles.mjs` — a disabled toggle block looks disabled, and the Elliptical Crank card
  traces the coupler point.

### Links, holds, locks and labels

- `link-holds.mjs` — holding a bar's length or angle: the menu rows, the chip, the padlocks, the
  joint riding its arc, a joint two holds pin down refusing with a Release button, and undo
  taking the hold off. The same for a cylinder's mounts.
- `link-holds-angles.mjs` — a held bar's name, length chip and center-of-mass mark at eight
  angles: none may overlap. Writes a contact sheet to `artifacts/link-holds-angles/`, which is
  the check to look at. The sheet needs Pillow under `python3` and is skipped without it.
- `locking.mjs` — a locked link refuses a drag with an Unlock in the message, a locked joint
  turns a link drag into a swing, undo removes a lock, the marks stand down outside Edit.
- `link-labels.mjs` — a link's name is readable against its body and lands on it, welded shapes
  included.

### Slots, slides and cylinders

- `phase2-floating-slot.mjs` — an inverted slider-crank from a URL decodes, assembles, animates
  and reports real velocities. Needs installed Chrome (`PMKS_CHROME`).
- `phase3-slide.mjs` — a Scotch yoke from a URL reaches one degree of freedom and translates its
  yoke without rotating it. Needs installed Chrome (`PMKS_CHROME`).
- `phase4-marks.mjs` — slot channels, slider blocks, weld plates and rails drawn on the four
  reference linkages.
- `phase4-animation.mjs` — the marks stay anchored to the right thing while the mechanism plays.
- `phase4-invariants.mjs` — every slider mark sits on its pin, along its slot, centered in a
  floating channel, with weld plates reaching their joint — at rest, after drags and after a scale
  change.
- `phase4-corner-arcs.mjs` — every corner arc of a link outline bulges outward, across a drag.
- `phase4-stack-and-menu.mjs` — paint order, the block staying in its channel, and the menu
  agreeing with the Edit panel.
- `phase4-sticky-and-snap.mjs` — sticky slot release and axis snapping, with the mouse.
- `phase4-gestures.mjs` — slot and slider gestures with pointer events on real coordinates: hit
  targets, previews, one undo entry, the second attempt.
- `phase4-build-from-scratch.mjs` — builds a linkage from an empty canvas with the mouse, then
  adds a slot and drives it.
- `phase4-cylinder.mjs` — the cylinder end to end: created from the menu, re-posed by a mount
  drag, grounded, driven, sped up, deleted as one part, undone and redone.
- `phase5-driven-cylinder.mjs` — the cylinder-driven boom opens valid, animates, and keeps its
  cylinder straight and whole through the stroke.
- `attach-cylinder.mjs` — Attach Cylinder from a link's menu joins the mount to the link's body,
  in one undo step.
- `cylinder-attach.mjs` — dragging a mount onto a linkage attaches it without deleting the
  cylinder.
- `cylinder-end-on-joint.mjs` — ending the cylinder gesture on a joint attaches the rod there.
- `cylinder-drag.mjs` — dragging a mount slides the piston within its travel, then grows or
  shrinks the ram past its stops.
- `cylinder-mount.mjs` — a mount as an ordinary attachment point: menu rows and reasons, the live
  ring under a dragged joint, slots cut at a mount, welded selection, undo across a weld, a second
  machine left alone, filmstrips of a compound drag.
- `cylinder-mount-render.mjs` — what welded mounts look like in every planned shape, with contact
  sheets to inspect.
- `cylinder-panel.mjs` — the cylinder panel's past defects: a picker that moved the part, an edit
  that could not be undone, a silent limit, a rounded position.
- `cylinder-skin.mjs` — the head's stops are drawn by the skin itself, with no annotation on the
  barrel.

### Forces

- `force-edit.mjs` — picking a force up by its arrow, where its anchor may land and snap, and
  drawing a new one.
- `force-analysis-panels.mjs` — the Force Analysis rows on the joint and link panels and the
  shared Force Analysis Type toggle. Needs installed Chrome (`PMKS_CHROME`).
- `force-labels-and-legend.mjs` — force graph titles name parts the reader can see, both cylinder
  mounts are listed, and the legend does not shift as values change sign.
- `force-units.mjs` — which unit a force is read in: the Force Units row, kilograms-force leaving
  storage alone, conversion at each edge, and a grayed pill not reacting to hover.

### Analysis modes and machines

- `analysis-setup.mjs` — pressing an analysis mode that cannot be entered opens a list naming the
  mechanism at fault, the way out, and a button that goes to the part.
- `analysis-drawing-switches.mjs` — the trace and vector switches under an analysis panel's
  graphs draw on the mechanism and gray in the menu's own words.
- `analysis-audit.mjs` — every analysis panel on every template for every part: blank graphs,
  holes, a turning part with zero angular velocity, absurd numbers. Slow; `ONLY=4-Bar` narrows it,
  `SHOTS=1` screenshots every panel state.
- `template-graphs.mjs` — every template's kinematic graphs read as numbers and cross-checked:
  position against solved joints, velocity and acceleration against difference quotients. Slow;
  `PMKS_ONLY=4-Bar,Slider_Crank` narrows it.
- `mechanism-panel.mjs` — selecting a whole machine from the transport chip or the setup drawer's
  name.
- `two-mechanisms.mjs` — two machines in one drawing: a row each in the transport, a section each
  in the setup drawer, and a sync toggle that decouples them.

### Playback

- `playback-bar.mjs` — the transport over the grid: a way to press play, a transport in Edit, a
  row per runnable mechanism, and the mode highlight landing on the chosen mode.
- `playback-direction.mjs` — reversing a machine keeps its place and keeps it running; the master
  and per-machine play buttons agree.
- `playback-loop-indicator.mjs` — the transport row's two lines, the end-of-cycle reading, the
  full-width handle, and the row's selection surface, compared across engines. Needs Firefox and
  WebKit installed.
- `playback-stepping.mjs` — the arrow keys step by time and wrap round the cycle, in both
  directions, on every template.
- `playback-timing.mjs` — a revolution takes 60/RPM seconds, doubling speed halves it, and the time
  readout holds across a speed change. Needs installed Chrome (`PMKS_CHROME`).
- `input-settings-and-playback.mjs` — the input joint's Input Settings (direction, speed, unit
  picker), the time field's width, and playback interpolating between samples.

### App chrome, layout and words

- `left-nav-modes.mjs` — the four mode tabs, the panel following the mode, the sliding highlight,
  readiness chips, a refused analysis mode, the transport present in Edit and absent in Synthesis,
  and the rewind on leaving an analysis mode. Needs installed Chrome (`PMKS_CHROME`).
- `top-strip-states.mjs` — the top strip at every width, chip load and mode, laid out or resized:
  nothing outside the tab card, no sideways scroll, no flicker between label levels.
- `right-drawer.mjs` — the right drawer's width, left edge and bottom gap against the view
  controls, with the tutorial pinned and on a short window.
- `mobile.mjs` — the phone layout on an iPhone 13 profile with touch: a held finger opens the
  menu, taps and swipes do not, the mode panel is a sheet, the playback cluster clears it, and a
  link drawn with taps.
- `menu-focus.mjs` — the project menu's focus ring appears for the keyboard and not for a click,
  including on the first open after a page load.
- `notifications.mjs` — a second, different refusal within a second is shown, and a quiet period
  counts from the last message rather than page load.
- `ui-copy.mjs` — the words on screen: toggle state names matching the menu, tooltip length, and
  none of the terms `docs/ui-vocabulary.md` rules out, British spellings included.
- `detail-fixes.mjs` — small reported fixes a unit test cannot see: cursors, warning colors, panel
  scroll.
- `whats-new.mjs` — which welcome a reader gets (`?library`, release notes, tutorial invitation),
  the boot splash, and the loading cover for templates and `.pmks` files.
- `tutorial.mjs` — the guided first build from a bare grid to a velocity, with the step read off
  the drawing.
- `background-image.mjs` — placing, moving, resizing, fading and deleting a background image, which
  cannot be clicked or dragged and follows the grid's zoom.

### Library, synthesis and export

- `template-open.mjs` — a template loads in place on an empty grid, and offers new tab / replace /
  cancel over existing work, with replace undoable.
- `template-backdrops.mjs` — the real-life library section and the picture each card opens on.
- `synthesis-redesign.mjs` — Synthesis end to end: place three positions, generate, browse and
  compare candidates, preview, insert, undo, and survive a shared link.
- `export-flow.mjs` — the Export Data drawer end to end, including reading the downloaded file.
- `release-export-ui.mjs` — malformed URL recovery, semantic field names, and a phone CAD origin
  chooser with twelve joints.
- `dxf-sweep.mjs` — every template through the real CAD export dialog, each file parsed back and
  left in `artifacts/dxf-sweep/`. Slow; `ONLY=Slider_Crank` narrows it.

### Performance

- `drag-perf.mjs` — is dragging as smooth as it was? Measures each scenario in
  `drag-perf-harness.mjs` (that file is the list) and compares the cost per pointer move and the
  90th-percentile frame to `drag-perf-baseline.json`. A scenario fails more than 35% above its
  baseline (`PMKS_PERF_TOLERANCE`, default `1.35`). Name scenario ids to run only those:
  `node e2e/drag-perf.mjs edit-joint kin-3rows`. The baseline is per machine; `--baseline`
  rewrites it, and the rewrite belongs in the commit that earned it.
- `drag-profile.mjs` — where one scenario's drag time goes, from the DevTools profiler and tracer:
  `node e2e/drag-profile.mjs kin-3rows`, or no argument to list the ids. Stage counts need the dev
  server. Tips-and-tricks keeps the last full account under "Where a drag's time goes".

### Asset generators (not checks; they rewrite tracked files)

- `readme-shots.mjs` — the project README's screenshots, into `docs/images/readme/`. The labeled
  interface map measures each region from its selector. `ONLY=hero,templates` retakes part of the
  set; the `templates` shot must be taken against a production build (see the script's header).
- `template-thumbnails.mjs` — the library cards' still images in `src/assets/gifs/`, clipped from
  each template's own URL. Needs macOS `sips`. `ONLY=<template ids>` does some.
- `template-animations.mjs` — the library cards' hover GIFs in `src/assets/gifs/`, stepped through
  each template's solved cycle. Needs macOS `sips`, and `gif-encoder` and `pngjs` installed beside
  Playwright in `PMKS_PLAYWRIGHT_DIR`. `ONLY=<template ids>` does some.

## Interaction gotchas

- **Joints are placed from tracked `mousemove`, not click coordinates.** Move to the target before
  the click that commits it.
- **Modes are the `.tabButton`s in the top strip:** Synthesis, Edit, Kinematic Analysis, Force
  Analysis. The labels shorten, then disappear, as the strip runs out of room — measured, not a
  fixed breakpoint — so give the window room before matching a tab by its text.
- **Pressing an analysis mode is not idempotent.** A mode you cannot enter opens its setup drawer
  and does not switch; a mode you can enter but are not in switches to it; the mode you are already
  in toggles its setup drawer. A script that presses Kinematic twice ends with the drawer open over
  the panel it meant to read. Press until the drawer says so rather than counting presses —
  `mechanism-panel.mjs` has the pattern. Synthesis and Edit are plain switches.
- **The readiness chip (`.chip`) is a label inside the mode button**, not a control. Read it; a
  click lands on the mode.
- **File actions are behind the menu button:** click `app-top-bar .iconButton`, then a
  `.projectMenu .menuItem` (New project, Open, Mechanism Library, Save, Share project, Export data,
  CAD export, Settings, Tutorial, Help and feedback). Undo and Redo are `.historyButton`s in the
  strip's corner card in every mode; the analysis modes add Export data beside them.
- **The transport (`app-playback-bar`) shows in Edit and both analysis modes**, over an empty grid
  too, and is hidden only in Synthesis. It has one row per machine, each with its own
  `input[type=range]` scrubber; `#slider`, `#playbackTime` and `#playbackPosition` are bound only
  on the master machine's row. On a phone the transport and the scrub card merge into one card.
- **`#bottomBar` is a read-only strip** with `pointer-events: none`. It shows the mode, a status
  phrase, `Degrees of freedom: N` (omitted when the drawing has no mobility to report), the cursor
  coordinates when there are any, and the units.
