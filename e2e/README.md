# PMKS+ tests

Two layers, organized by what they exercise:

| Layer | Where | Runner | What it covers |
| --- | --- | --- | --- |
| Unit / solver | `src/**/*.spec.ts` (co-located with source, Angular convention) | Vitest — `npm test -- --watch=false` | Components; `src/app/app.component.spec.ts` is the MATLAB-verified solver regression suite |
| E2E / UI | `e2e/*.mjs` (this folder) | Playwright via plain Node | Real-browser interaction: grid clicks/drags, context menus, panels, animation, mobile viewport |

Unit specs stay in `src/` because `tsconfig.spec.json` discovers them via
`src/**/*.spec.ts` and Angular component specs resolve templates relative to
their source. Everything browser-driven lives here.

## E2E scripts

- `full-tour.mjs` — broad tour: panels, templates, settings, share URL, help, and a fresh load at
  phone size. Looks for a NaN degrees-of-freedom, a page wider than its viewport, a Save that starts
  no download and a template dialog that will not close; exits non-zero on any of them
- `interaction-sweep.mjs` — every context-menu action on every kind of object (joint, link, force,
  bare grid) across several mechanisms: each enabled item is clicked, the model and drawing are read
  back, and it is undone. Catches the silent click — enabled, pressed, and nothing happened and
  nothing was said. `ONLY=4-Bar,Cylinder_Boom` narrows it
- `edit-playback.mjs` — Gate 1 of `docs/edit-mode-playback-plan.md`: the transport as chrome (on
  screen and inert over an empty grid, no bar animation when the drawing changes), the Edit panel
  that stays instead of vanishing, the mode-switch table edge by edge, and every former edit gate
  giving one answer
- `posed-editing.mjs` — Gates 2 and 3: a drag at a paused pose staging and re-anchoring, the ghost
  warning while the hand is still moving, the snackbar when the start does move, undo rewinding,
  Set-This-Pose-as-Start, grab-to-pause, and cursor tracking measured at both poses
- `posed-editing-adversarial.mjs` — the other half: gestures that are *not* edits and must not
  become them. A view gesture ending a center-of-mass drag, a pinch after a drag has begun, and a
  synced two-machine drawing edited on the machine that is not the master. Every check here started
  as a defect
- `posed-edit-audit.mjs` — every way to edit a linkage while it is parked away from its start,
  tried: each context-menu row on a joint, a link, a force and the canvas; each field of the Edit
  panel; the keys; the transport — on a four-bar, a slider-crank and a cylinder. It does not decide
  what each action *should* do (§7 of `docs/edit-mode-playback-plan.md` does); it checks what is
  left behind: nothing staged, no warning pill without a hand on the drawing, clocks that agree
  about being at the start, an identity-addressed edit leaving the start pose byte-identical, a
  capturing edit keeping the anchor or saying the start moved, every link body drawn where its
  pins are, and Undo restoring the design exactly. After each edit that landed it also does what a
  reader does next -- runs the machine, deletes what the edit made, undoes to before and redoes --
  and judges those states too. A row or field that is refused is recorded as refused *with words*.
  Writes the table to `artifacts/posed-edit-audit/matrix.md`. Slow: half an hour, one fresh load
  per action
- `posed-drag-fuzz.mjs` — random drags at random poses, seeded so a finding replays (`SEED=`,
  `ONLY=` trial numbers). After each drag the ghost's crank angle, the design's sample 0 and the
  transport's "from start" have to agree, and a crank's own start may never be unreachable. This is
  how the anchor lookup's missing slack was found. About ten minutes
- `analysis-editing.mjs` — `docs/analysis-mode-editing-plan.md`: what an analysis mode allows now
  (drag, undo) and still refuses (adding, deleting, welding), click-selects-drag-tunes, the
  before/after comparison overlay and the axis holding still under it, the peak said as two
  numbers, and the force-mode budget measured rather than hoped for
- `phase1-drag.mjs` — drag gestures: joint snap ring and merge, merging onto a slider's pin,
  refusing an over-constraining merge, whole-link drag, one undo entry per gesture,
  click-without-nudge, and the canvas staying put after a merge.
  Prints a PASS/FAIL check list and exits non-zero on any failure, so it can gate a change.
- `force-analysis-panels.mjs` — Force Analysis rows on the joint and link analysis panels, and the shared Force Analysis Type toggle
- `left-nav-modes.mjs` — mode navigation in the top strip that replaced the rail: the four modes, the
  panel following the mode, the sliding highlight, the readiness chips, an analysis mode refusing to
  open, and the rewind on leaving one
- `template-open.mjs` — the template library: loads in place on an empty grid, and shows a new-tab / replace / cancel choice (with replace undoable) when the grid already holds work
- `template-graphs.mjs` — every template in the library, checked for *correct* kinematic graphs: opens each payload, selects each moving joint in the Kinematic mode, reads the plotted series out of `AnalysisGraphComponent` (numbers, not pixels) and cross-checks position against the solved joint positions and velocity/acceleration against difference quotients of the series above them. Reversals and dead centers are identified from the source series and reported by sample index rather than tolerated silently. Exits non-zero on any failure
- `mobile.mjs` — the phone layout and the gesture that replaces the right button: the page laid
  out at the phone's own width, a held finger opening the context menu (and the menu surviving
  the finger lifting), a tap and a swipe opening nothing, the mode panel as a sheet that starts
  shut and never takes more than half the window, the playback cluster standing clear of it, and
  a link drawn end to end with two taps and a hold. Runs against an iPhone 13 profile with real
  touch events; exits non-zero on any failure
- `readme-shots.mjs` — regenerates the screenshots the project README embeds, into tracked
  `docs/images/readme/`. Not a check: it writes assets, so run it after a change to the chrome
  that appears in one of them. The labeled `interface-map` shot measures each region from the
  selector it already carries, so a card that moves takes its label with it. `ONLY=hero,templates`
  retakes part of the set
- `template-thumbnails.mjs` — regenerates the library cards' images in `src/assets/gifs/` by opening each generated template payload and clipping the canvas. Not a check: it writes assets, so run it after `npm run template-payloads` changes a payload
- `playback-timing.mjs` — real-time playback: a revolution takes 60/RPM wall-clock seconds, the reported cycle period scales with input speed, and simulation time is held (not the sample index) across a speed change
- `input-settings-and-playback.mjs` — the input joint's Input Settings section (direction, unit-free speed field, RPM / deg/s / rad/s picker), its removal from global Settings, the time field's width, and that playback interpolates between samples at a slow input speed
- `synthesis-redesign.mjs` — Synthesis end to end: the chooser, arming and dropping the three positions (wheel turns the one about to land, and does not zoom), dragging one without panning the canvas, Generate, the candidate gallery and its hover comparison, the six-bar driver, the preview transport, Insert and its Undo, and the design surviving undo and redo
- `context-menu.mjs` — the right-click menu on every kind of part and in every mode: the fixed Attach/State/Machine ladder with Delete alone at the foot, states written as ticked switches rather than labels that flip, the model's own reason in the right-hand slot of every grayed row (a load at a shared pin, a weld with nothing to fuse, a sealed cylinder, a locked part), the deletion cascades named before the click, the counts beside Lock All and Unlock All, and the analysis modes offering the trace and the way back into Edit and nothing that edits
- `ui-copy.mjs` — the words themselves, read off the running app: that the Edit panel's toggles carry the state names the right-click menu uses (`Grounded`, `Welded`, `Trace Path`), that no tooltip there runs past two sentences, that the units tooltip names the way out only while the switch is actually grayed, that the analysis checklist no longer prints Gruebler in code notation, and that none of the surfaces it walks uses a word `docs/ui-vocabulary.md` rules out

- `whats-new.mjs` — which of the three welcomes a reader gets, and the two covers that go up while
  a mechanism is being solved: a first visit gets the tutorial and no release notes, a returning
  visit gets the notes once and never again (by the button, by Escape, and across a reload),
  `?library` beats both and leaves the address bar clean, the boot splash is up before the app is
  and gone once it has drawn, and the loading cover goes up and comes back down for a template, a
  `.pmks` file and a `.pmks` file that will not decode -- and does not go up at all when the file
  picker is dismissed

- `menu-focus.mjs` — who gets a ring round the project menu's first row: opening the menu moves focus
  into it so the keyboard can reach it, a click draws nothing even on the first menu after a page
  load, Enter on the trigger draws it, and reaching for the arrow keys after a click brings it back.
  A fresh context per case on purpose, because the case that was reported only happens before the
  page has recorded any interaction

- `drag-perf.mjs` — is dragging as smooth as it was? Drags a fixed set of scenarios (Edit joint and link, traced paths shown, one and three graph rows, the before-drag comparison, a force-analysis row, the Jansen leg, a four-machine drawing) with nothing attached, subtracts the protocol's own per-event cost, and compares the app's cost per pointer move and the 90th-percentile frame to `drag-perf-baseline.json`. Fails a scenario more than 35% (`PMKS_PERF_TOLERANCE`) above its baseline. The baseline is per machine: `--baseline` rewrites it, and the rewrite belongs in the same commit as the change that earned it
- `drag-profile.mjs <scenario>` — where that drag's time goes: the DevTools profiler and tracer on one scenario, reported per second of drag by stage (position sweep, link-geometry copies, the graphs' kinematic re-solve, the chart redraw, change detection, GC), by function with source-map attribution, and, on the dev server, how often each stage ran per pointer move. `docs/tips-and-tricks.md` keeps the last full account under "Where a drag's time goes"
- `multi-select-and-dxf.mjs` — real Ctrl/Command selection, macOS Control-click, blank/Escape/plain
  replacement, group drag/rotate/scale with one-step history and Lock refusal, atomic duplicate/delete,
  plus desktop/narrow visual checks and a downloaded semantic DXF smoke test

## Running

Prerequisites: dev server on http://127.0.0.1:4200/ (`npm start`) and a
Playwright install at `/tmp/pmks-playwright`
(`mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright`).
Playwright is deliberately **not** a devDependency — it would bloat Netlify
deploy installs. Run these scripts directly for local validation; they are not
part of CI (see `SKILLS.md` and `.claude/skills/ui-validate/SKILL.md`).

```bash
node e2e/interaction-sweep.mjs
```

Environment overrides:

- `PMKS_BASE_URL` — app URL (default `http://127.0.0.1:4200`). `PMKS_URL` is still read by the
  scripts that were written against it, but every script now takes `PMKS_BASE_URL` first, so one
  variable drives the whole folder
- `RUN_PREFIX` — prefix for screenshot/report filenames
- `PMKS_PLAYWRIGHT_DIR` — Playwright install dir (default `/tmp/pmks-playwright`)
- `PMKS_CHROME` — Chrome executable (default `/Applications/Google Chrome.app/...`)
- `PMKS_HEADED=1` — show the browser window (headless by default)

Each run launches Chrome with a disposable profile under `/tmp` (never your
real browser session) and writes screenshots plus a `*-report.json` (console
errors, crashes, element counts per checkpoint) to `artifacts/screenshots/`,
which is gitignored — outputs are throwaway, scripts are tracked.

Interaction gotchas baked into these scripts:

- The app places joints from tracked `mousemove`, not click coordinates — always
  hover/move to the target before the finalizing click, and prefer the Edit
  panel's HTML controls over the SVG context menu (its hitboxes drift at some
  viewports).
- Modes are the `.tabButton`s in the top strip: Synthesis, Edit, Kinematic, Force.
  What used to be called Analyze is **Kinematic**. Below 1080px the labels are hidden,
  and `hasText` stops matching with them; size the viewport wider than that.
- **Pressing an analysis mode is not idempotent.** There is one button per mode, and it
  does one of three things: a mode you cannot enter yet opens its setup drawer and does
  not switch; a mode you can enter but are not in switches to it; and the mode you are
  *already* in toggles its setup drawer open or closed. So a script that presses
  Kinematic twice ends up with the setup drawer open over the panel it was about to read.
  To reach the drawer for an enterable mode, press until the drawer says so rather than
  counting presses — `e2e/mechanism-panel.mjs` has the pattern. Synthesis and Edit are
  still plain switches and can be pressed without checking.
- The readiness chip (`.chip`) is a plain label **inside** the mode button, not a control.
  Read it for readiness; do not click it — the click lands on the mode and follows the
  rule above.
- File actions (Templates, Open, Save, Share Project, Settings, Help / Feedback) live
  behind the hamburger: click `.topStrip .iconButton`, then the `.projectMenu .menuItem`.
  Undo and Redo are `.historyButton`s in the strip itself, in every mode.
- The playback controls (play/pause, speed, `#slider`, `#animationBar-input`) live in
  `app-playback-bar`, which renders only in the Kinematic and Force modes. The scrubber
  is now a plain horizontal `input[type=range]`.
- An analysis mode that cannot be entered does not open at all: the press raises the
  `app-analysis-setup` drawer instead, so an absent play button — not a disabled one —
  is what "this mechanism will not run" looks like.
- `#bottomBar` is a read-only status strip (mode, status phrase, units, version) with
  `pointer-events: none`. It no longer prints the degrees of freedom; read the mobility
  from `mechanismSrv.mechanisms[i].dof`, or from the setup drawer's `.factGrid`.
