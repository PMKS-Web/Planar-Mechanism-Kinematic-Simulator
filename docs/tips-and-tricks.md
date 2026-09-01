# Tips and tricks

Things that cost somebody an hour to find out. Read it before your first change, and **add to it
whenever something surprises you** — a surprise you do not write down is one the next person pays
for again.

This is not the architecture tour. `README.md` and `CLAUDE.md` say what the app *is*; this says how
to work on it without stepping in the same holes.

---

## Contents

- [Environment](#environment)
- [Running the app](#running-the-app)
- [Unit tests](#unit-tests)
- [Browser tests](#browser-tests)
- [Getting inside the running app](#getting-inside-the-running-app)
- [Spelling: American, everywhere](#spelling-american-everywhere)
- [Formatting, and why you should not just run Prettier](#formatting-and-why-you-should-not-just-run-prettier)
- [Angular and build gotchas](#angular-and-build-gotchas)
- [Editing, playback, and who is allowed to say no](#editing-playback-and-who-is-allowed-to-say-no)
- [SCSS gotchas](#scss-gotchas)
- [Domain facts worth knowing before you debug](#domain-facts-worth-knowing-before-you-debug)
- [Deploys, domains and surrounding services](#deploys-domains-and-surrounding-services)
- [Checking an exported file](#checking-an-exported-file)
- [Working out whether a failure is yours](#working-out-whether-a-failure-is-yours)

---

## Environment

**Node** 22.22.3+, 24.15+ or 26+ — the range the Angular 22 toolchain declares. `npm ci` for a
clean install.

**Playwright lives outside the repo.** It is deliberately not a devDependency, because it would
bloat deploy installs. The e2e scripts look for it at `/tmp/pmks-playwright`, overridable with
`PMKS_PLAYWRIGHT_DIR`:

```bash
mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright gif-encoder pngjs && npx playwright install chromium
```

**`/tmp` is cleared on reboot**, so that install disappears and every browser suite starts failing
with a module-not-found. Reinstalling is the first thing to try.

**Two suites need more than Chromium.** `playback-loop-indicator` compares the same bar across
engines, so it needs Firefox and WebKit too, and reports three confusing failures without them:

```bash
cd /tmp/pmks-playwright && npx playwright install firefox webkit
```

**One suite needs a native helper.** `real-mouse-slots` drives the actual system cursor and refuses
to run unless `MOUSECTL` points at a compiled `e2e/tools/mousectl.swift`. It is opt-in; a bare
"Error: set MOUSECTL" is the test declining, not the app breaking.

**macOS has no `timeout`.** A loop written as `timeout 240 node e2e/thing.mjs` fails with
`command not found` and reads as a test failure. Use `gtimeout` from coreutils, or nothing.

---

## Running the app

```bash
npm start          # http://localhost:4200
```

**Use `localhost`, not `127.0.0.1`.** The dev server binds the hostname, so
`PMKS_BASE_URL=http://127.0.0.1:4200` fails to connect while `http://localhost:4200` works. Several
e2e scripts default to `127.0.0.1`, which is fine when they start their own server and wrong when
you point them at yours. Pass `PMKS_BASE_URL=http://localhost:<port>` and the problem goes away.

**Do not gate a script on the tail of the serve log.** This looks reasonable and hangs forever:

```bash
until tail -3 serve.log | grep -q "generation complete"; do sleep 3; done   # ← don't
```

The builder prints `generation complete` and then follows it with `Stylesheet update sent to
client(s)` and friends, so within a few seconds the last three lines no longer contain the phrase.
Ask the port whether it is up instead:

```bash
until curl -sf -o /dev/null http://localhost:4200/; do sleep 2; done
```

---

## Unit tests

```bash
npm test -- --watch=false      # drop the flag for watch mode
```

Vitest with jsdom, driven by `@angular/build:unit-test`, but the specs are written in Jasmine style
with globals from `vitest/globals`.

**Run them through `npm test`, not through `vitest` directly.** `npx vitest run some.spec.ts` dies
with `window is not defined` from inside `svg-pan-zoom`: the Angular builder supplies the jsdom
environment and the setup files, and a bare Vitest invocation has neither.

**`console.log` in a spec goes nowhere.** The harness swallows it. To see a value, fail on it:

```ts
expect(JSON.stringify(whatever, null, 1)).toBe('SHOW-ME');
```

The assertion diff prints the object. Delete it when you are done.

**Vitest errors on a spec file containing no tests**, so a file you have commented out fails the
run rather than being skipped.

**`tsc --noEmit` is noisy in a way that hides real errors.** `tsconfig.json` does not include the
spec files, so a plain typecheck prints hundreds of `Cannot find name 'describe'`. Filter them, or
you will scroll past the three lines that matter:

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -vE "\.spec\.ts|test-utils|getEmailJSKey"
```

---

## Browser tests

They are plain Node scripts in `e2e/*.mjs`, run one at a time, printing `PASS`/`FAIL` lines and
exiting non-zero if anything failed. There is no runner.

```bash
PMKS_BASE_URL=http://localhost:4200 node e2e/playback-bar.mjs
```

**Never re-parse `template-linkages.ts`.** Import the shared reader:

```js
import { TEMPLATE_IDS, TEMPLATE_LINKAGES, ALL_LINKAGES, assertTemplatesParsed } from './template-payloads.mjs';
```

Every script used to carry its own regular expression and they were not all right. The file has
payloads on the key's line or the next, split across `+`-joined pieces, with comments throughout —
including one containing an apostrophe, which offset the quote pairing of the id-list pattern and
silently reduced "every template" to 18 of the 42. `ALL_LINKAGES` adds the three dev drawings, and
unescapes the backslashes two of them contain. Call `assertTemplatesParsed()` in anything that
sweeps.

**Some suites rewrite tracked files.** `template-animations`, `template-thumbnails`, `readme-shots`
and `shot` regenerate GIFs and PNGs under `src/assets/gifs` and `docs/images`. Running them dirties
the working tree, and a careless `git add -A` commits twenty binary files nobody asked for:

```bash
git checkout -- src/assets docs        # after running any of those
```

Both accept `ONLY=<template-id>` to do one drawing instead of all of them.

**Screenshots and reports** land in `artifacts/`, which is gitignored. Look at them; an exit code
tells you a check failed, not what the page looked like.

**`getByText` is a substring match, and the dialogs have hint text.** `.getByText('R12')` in the
CAD Export dialog matches both the R12 button and the note "R12 is for old CAM only" beside it, and
Playwright's strict mode fails the run rather than picking one. Reach for
`getByRole('button', { name: 'R12', exact: true })` when a short label also appears inside a
sentence nearby.

**Force analysis needs a load.** Only five templates have one — `Punch_Press`, `Derrick_Crane`,
`Toggle_Clamp`, `Offset_Load_Rocker`, `Crane_Two_Loads`. Every other drawing reports "A load to
react against" unmet, the export drawer asks three questions instead of four, and any test that
expects the Forces step will be disappointed. `Punch_Press` is usually what you want: it has a load
*and* a slider.

---

## Getting inside the running app

From a Playwright `page.evaluate`, Angular's global is the way in. This is how most of the e2e
suites read state, and it is far steadier than scraping the DOM:

```js
const grid = ng.getComponent(document.querySelector('app-new-grid'));
grid.mechanismSrv      // MechanismService: joints, links, forces, mechanisms, partitions
grid.settings          // SettingsService: units, gravity, isShowCOM, isSnapToGrid, objectScale
grid.svgGrid           // SvgGridService: zoomIn(), minorCellSize, snapToGrid()
grid.activeObjService  // what is selected
grid.tabService        // setTab(TabID)
```

Other components worth reaching for:

```js
ng.getComponent(document.querySelector('app-playback-bar'))   // maxStep, rows, stepBy()
ng.getComponent(document.querySelector('app-synthesis-panel')) // design, solution
ng.getComponent(document.querySelector('app-export-panel'))
```

`TabID` is `0` Synthesis, `1` Edit, `2` Kinematic analysis, `3` Force analysis. The number keys do
the same thing from the keyboard, and pressing `3` is often less trouble than clicking a tab.

**Prefer the model over the picture.** A check written against joint coordinates survives a theme
change, a re-layout and a pan-zoom animation; one written against SVG markup does not. `playback-timing`
used to compare whole SVG strings and failed a third of the time on the camera settling.

---

## Spelling: American, everywhere

**Comments, user-facing strings, identifiers, docs and test names are all American English.**
`e2e/ui-copy.mjs` already fails the build on `colour`, `centre`, `neighbour` and `analyse` in
anything the user can read; the rest is convention. It is a consistency rule rather than a taste
one: `centre` and `center` are the same word to a reader and two different symbols to `grep`, so a
codebase holding both quietly answers half of every search. In identifiers it is worse, where
`colourOf` and `colorOf` are two functions nobody meant to write.

| Write | Not |
| --- | --- |
| center, centered, centering, centerline | centre, centred, centring, centreline |
| color, colored, coloring | colour, coloured, colouring |
| gray, grayed | grey, greyed |
| neighbor, neighboring | neighbour, neighbouring |
| behavior | behaviour |
| meter, centimeter, millimeter | metre, centimetre, millimetre |
| analyze, analyzed, analyzing | analyse, analysed, analysing |
| normalize, initialize, serialize, recognize, organize | normalise, initialise, serialise, recognise, organise |
| labeled, modeled, traveled, canceled | labelled, modelled, travelled, cancelled |
| catalog, program, dialog, license, defense, offense | catalogue, programme, dialogue, licence, defence, offence |
| favor, honor, artifact, judgment, math, learned | favour, honour, artefact, judgement, maths, learnt |
| while, among | whilst, amongst |

### Sweeping it, and the three ways that goes wrong

A find-and-replace over stems is the obvious way to do this and it breaks in three separate ways,
all of which compile and all of which pass every test, because the damage is in prose and in
identifiers renamed consistently on both sides:

- **A stem is not the whole word.** British drops the `e` that American keeps, so `centre` ->
  `center` turns `centred` into `centerd`. It did, fifty-five times. And `centring` has no `centre`
  in it at all, so the same sweep misses every one. Put both in an explicit word list ahead of the
  stem pass.
- **A stem can span a camelCase boundary.** Case-insensitively, `modell` is inside `ModelLength`,
  `labell` is inside `labelLevel`, `travell` is inside `cylinderTravelLabel`, and — the one nobody
  sees coming — `litre` is inside `unsplitResult`. Renaming those produced `formatModelength`,
  `labelevel`, `cylinderTravelabel` and `unsplitersult`. Reject any match containing a lowercase
  letter immediately followed by an uppercase one: that hump means the stem only appeared to be
  there.
- **A stem can wreck an American word.** `programme` -> `program` applied as a stem turns
  `programmed` into `programd`; `cancell` -> `cancel` turns `cancellation`, which is correct
  American, into `cancelation`. Whole-word list for both.

Two words have to be read rather than swept:

- **`analyses` is correct** as the plural of *analysis* — "the two analyses need it". It is wrong
  only as a verb, where American writes *analyzes*.
- **`cancellation` keeps both `l`s**, even though `canceled` and `canceling` drop one.

And do not sweep `e2e/ui-copy.mjs`. It is a list of words that must never appear, so rewriting it
inverts the lint into a ban on the spellings it exists to enforce. That happened, and the check went
on passing because it was now banning words the app does not use.

Afterwards, grep for the American stem followed by a suspicious ending — `centerd`, `Modelength`,
`unsplitersult` — and read the diff. Nothing else catches this class of mistake.

---

## Formatting, and why you should not just run Prettier

**About fifty source files and six e2e files predate the Prettier config.** Running
`prettier --write` across one of them reformats code you did not write, and your actual change
disappears into three hundred lines of reflow.

Format only files you edited, **and only if they were already clean**. To find out:

```bash
git stash push -u -- path/to/file
npx prettier --check path/to/file
git stash pop
```

The unformatted e2e files, as of this writing, are `cylinder-drag`, `phase1-drag`,
`phase2-floating-slot`, `phase3-slide`, `synthesis-redesign` and `template-animations`. Edit those
by hand and leave them unformatted.

A blanket `npx prettier --write "e2e/*.mjs"` will quietly reformat four files you never touched.
Check `git status` afterwards and revert anything you did not mean to change.

`.prettierignore` deliberately excludes Markdown — Prettier pads every table cell and rewrites
`*emphasis*` as `_emphasis_`, so a one-line doc edit lands as hundreds of lines of realignment.

---

## Angular and build gotchas

- **Fully standalone.** No `AppModule`, no `NgModule` anywhere. A component spec imports the
  component itself, never a declaring module.
- **Default change detection**, not `OnPush`. That is the house style; matching it matters more
  than the theoretical win.
- **No runtime `require()`.** The esbuild `application` builder does not support it. ES imports
  only.
- **`outputPath.browser` is pinned to `""`** so the build stays flat at `dist/pmksweb`, which is
  what Netlify publishes.
- **Circular service dependencies are broken with `injector.get(...)` at call time**, in
  `MechanismService`, `SaveHistoryService` and `UrlProcessorService`. Adding a constructor injection
  between those three will bite.
- **Not everything goes through a service.** Some components still talk through statics —
  `RightPanelComponent.openTab`, `insistOn`. Grep for the static before assuming a service is the
  only channel.
- **A lazy `injector.get(...)` can outlive its injector.** A predicate or key handler registered
  with a root service keeps running after the component that registered it is torn down, and a
  service that resolves its dependencies on first *use* then reads a destroyed injector —
  `NG0205`, seventy-two times, in a suite whose tests all passed. Two halves to the fix: resolve
  eagerly where the ring allows it, and hand the predicate back on destroy
  (`destroyRef.onDestroy`). `NewGridComponent`'s `whenArrowsNudge` is the example.
- **`anyComponentStyle` is 6 kB warning / 10 kB error**, raised from 4/6 for the CAD Export dialog
  — a whole screen of UI in one component, where the cap was written for panels. It is a global
  cap with no per-component override, so the choice is one number for everything; 10 kB still
  catches real bloat. `npm run build` is where you find out, and it fails the build rather than
  warning.

---

## SCSS gotchas

**A panel's `styleUrls` does not scope it. The `@mixin` does the opposite.** 39 of the 43 component
stylesheets are written as `@mixin css($theme)` and `@include`d from `src/mytheme.scss`, and a mixin
emits nothing where it is declared — so the `styleUrls` entry on the component is inert and every
rule in the mixin lands in the *global* stylesheet exactly as written. `.check { padding-top: 10px }`
inside `some-panel.component.scss` styles every `.check` in the app. Which panel wins a shared name
is decided by the order of the `@include` lines at the bottom of `mytheme.scss`; the later one wins
ties.

Rules written *outside* the mixin — `edit-panel.component.scss` has 32 of them — get both
treatments: Angular emits an `_ngcontent`-attributed copy from `styleUrls`, and `mytheme.scss` emits
an unscoped copy from the `@use`. The attributed copy wins, so the global one is dead weight that
still leaks.

This has bitten more than once, as a panel whose spacing is set by a panel it has nothing to do
with. `analysis-setup` is scoped now; fourteen bare class names are still shared across components —
`.row`, `.label-help`, `.chip`, `.cardActions`, the six `.help*`, `.mechHead`, `.nextButton`,
`.rowNote`, `.stepBar` — some deliberately (`blocks.common.scss` and the help panel exist to be
shared) and some not. Read the shipped rules rather than the sources to tell which is which. Guard
the cross-origin sheets and recurse into `@media`, or you will miss most of them:

```js
const all = [];
const walk = (rules) => { for (const r of rules) { if (r.selectorText) all.push(r.selectorText); if (r.cssRules) walk(r.cssRules); } };
for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* Google Fonts */ } }
```

To ask the narrower question — *what is reaching into the component I am working on* — filter those
rules to the ones that actually match it: skip selectors containing `_ngcontent` (the component's
own) and `.mat-`/`.cdk-`, then call `el.matches(rule.selectorText)` for every element under it.
Anything that comes back is coming from outside. That is how `.check { padding-top: 10px }` from
`analysis-setup` was found sitting five pixels under the CAD Export dialog's tick.

**Declaring a property is what protects you from a leak, if you are not scoping it.** A component
rule wins wherever it *declares* the property and nowhere else, so the defensive `padding: 0` in
`drawing-export.component.scss` is the fix for one of these — leaving a property unset is what lets
the global one through. Scoping the offending sheet is the better fix where you can afford the
verification; the defensive one is what to reach for when you cannot.

**Scope such a file with `:where(app-thing) { ... }`, not `app-thing { ... }`.** `:where()`
contributes no specificity, so every rule keeps exactly the weight it had and nothing starts or
stops winning. A bare element wrapper adds a type selector to all of them at once, which sounds
harmless and is not: rules that had been quietly losing to Angular Material start winning, and the
panel changes appearance in a commit that was supposed to be a no-op.

**A `/* */` comment directly inside a wrapper emits an empty rule.** Sass opens the parent to place
a loud comment, so `:where(app-thing) { }` appears in the bundle once per comment. Use `//` for
comments at a wrapper's top level.

**Not every leaked rule is doing anything.** Before treating a shared name as load-bearing, check
whether the receiving component already overrides it — `mechanism-panel` writes
`.mechanismPanel .sectionHeader` and `edit-panel` writes `.massArea .dot`, both of which outrank the
bare rule and were covering its whole rendered appearance. Not every declaration, though:
`mechanism-panel` never restated `min-height`, and only got away with it because it pins `height`.
The way to find out is to diff computed styles before and after, not to read the two stylesheets and
reason about them. Diff the *properties*, not screenshots — the canvas camera settles differently
between runs, so a pixel comparison of this app has a noise floor in the tens of thousands of pixels
and will bury a real one-property change.

**There is more than one `@media (max-width: 600px)` block in a file.** `playback-bar.component.scss`
has two, hundreds of lines apart, and the later one wins. A rule added to the first that already
exists in the second does nothing at all, and looks correct while doing it.

**Check where a block sits before adding to it.** The phone layout is spread over several media
blocks by concern, not gathered in one place.

**The phone's spacing is a single value.** Every gap in the bottom stack is `$card-inset`, the same
one the top strip keeps from the window, and `e2e/mobile.mjs` measures the strip and compares. Do
not adjust a gap there to make something fit — shrink the thing instead.

**The phone layout was fitted to 390px.** `top-strip-states` also exercises 360, where thirty fewer
pixels are available; anything you add to the bottom row has to survive that.

---

## Editing, playback, and who is allowed to say no

- **One model answers "may this edit happen".** `model/edit-permission.ts` is a pure function from
  a described state to a refusal-or-nothing; `services/edit-permission.service.ts` describes the
  current state to it. Six surfaces quote it — the canvas's drag gate, the Edit panel's banner,
  the context menu's graying, undo/redo, the analysis geometry lock, and the transport's hint.
  **Do not re-derive the rule at a new surface.** Three of those six used to read the *shared*
  clock, and with the machines unsynced they disagreed with the three that did not: a row scrubbed
  mid-cycle left the canvas editable while undo refused.
- **Ask `isAtStartPose()`, never `mechanismTimeStep === 0`.** The second is the shared clock only.
  An unsynced machine can be parked anywhere while it still reads zero.
- **The transport's visibility is decided by mode alone.** It is on screen in Edit and both
  analyses, including over an empty grid, and hidden only in Synthesis. That is what keeps its
  `riseFromBottom` entry animation off the drawing-changed path: a bar that slid in when the first
  link was drawn was animating on something that is not a mode change.
- **The Edit panel does not vanish any more.** It stays with its body `inert` and dimmed, and a
  banner across the top carrying the permission model's own words. `inert` rather than a
  `disabled` on each control: it removes the whole subtree from pointer, keyboard and focus reach
  in one attribute. The fields still tick — `ngDoCheck` patches the selected joint's coordinates,
  because `animate()` mutates the joints in place and publishes on nothing you could subscribe to.
- **The anchor is what stops the ratchet.** The editable joints are the design,
  the drawn pose, and the solver's t = 0 all at once, so a rebuild that runs while playback has
  moved them redefines "start" as wherever playback was. `model/mechanism/anchor.ts` keeps, per
  machine, the driven joint's *coordinate at t = 0* -- measured absolutely, and **stored**, not
  re-derived. Re-derive it and every posed edit rounds to the nearest sample and the next rounds
  from there; store it, and the error stays bounded however many edits are made.
- **Anchors are keyed on the whole owned-joint set, never `partitionKey`.** That key is the lowest
  owned moving-joint id, which a fusion usually lets one parent keep. A wrong resume point is a
  nuisance; an inherited anchor is a corrupted design.
- **`restoreStartPose` skips exactly one machine**, for exactly the length of one gesture
  (`seedFromDisplay`). Skipping it globally would turn *every* displaced machine's shown pose into
  its provisional t = 0, corrupting machines the edit never touched.
- **Drop anchors before the rebuild, not after.** `UrlProcessorService` calls `forgetAnchors()`
  ahead of `finishStructuralEdit`; after it, the call threw away the anchors that rebuild had just
  taken, and every freshly opened mechanism had none until its first edit.
- **A held clock only holds the pose while the machine is measured the same way.** A rebuild
  carries each machine's elapsed seconds across and lays them back on afterwards, which is right
  for an ordinary rebuild and wrong for one that re-parameterizes the machine: move the drive from
  joint A to joint B and t = 0.7 s stops meaning "0.7 s of A turning" and starts meaning "0.7 s of
  B turning", so the same clock reading is a different pose. A four-bar parked mid-swing jumped
  ~800 model units the moment its input changed. The *start* pose was never in danger -- the anchor
  looks after that, and it is why the bug is easy to miss -- but the pose the reader was looking at
  teleported. `posesAcrossReparameterization` notices the rule changing (compared whole, like
  `ruleStillHolds`), measures the drawn pose in the **new** rule before `restoreStartPose` moves
  the arrays, and `restoreHeldPoses` finds it again in the cycle the rebuild solved. The pose is
  held and **the clock is what jumps** -- the same trade `reverseDrive` makes, and the same one to
  make at any future rebuild that re-measures a machine.
- **`findPose` exists because a heading you do not know is worse than none.** `reachAnchor` prefers
  crossings matching the heading it is given, so passing a guess actively steers it to the wrong
  leg of a reversing cycle. `findPose` searches both and lets the pose itself decide.
- **Do not run `npm test` and a large Playwright sweep at the same time.** Six heavy fixture,
  codec and graph specs time out under the load and fail together, which reads exactly like a
  shared-state bug in whatever you just changed. Re-run the unit suite on a quiet machine before
  believing it.
- **A machine being edited at a pose must have its clock read as zero for that rebuild.** Its
  displayed pose *is* its provisional t = 0 while the gesture is in flight, so holding its elapsed
  seconds and laying them back on afterwards moves it that far along a cycle that now starts under
  the reader's hand -- on a four-bar two seconds in, every pointer move threw the joint two
  seconds' worth of motion away from the cursor and the drag flew apart. Measure a drag rather than
  watching it: the offset between cursor and joint should hold still, and with Alt (snap off) it is
  0.00px on both axes.
- **The staging closes itself.** Three rounds of review each found another path that ended a
  gesture without closing its posed edit -- Escape, a right or middle click, a mode key, Space,
  tabbing away, a delete held mid-drag. Rather than a fourth list of paths to keep in step,
  `updateMechanism` refuses to run with a staging behind it that no gesture owns:
  `closeStaleStaging` settles it first. A staging opened without a pointer (a menu action, a test)
  closes itself and is never treated as abandoned, and a deliberate commit says so with
  `committingPosedEdit`, because by then the pointer is already up.
- **Cancelling a posed edit is a commit without the save, not a `= null`.** Every pointer move has
  already solved a provisional cycle whose sample 0 is the pose under the hand, so a machine merely
  unstaged has the displaced pose as its canonical t = 0. But only settle when a rebuild *has* run
  while staged (`stagedRebuilt`) -- otherwise a click that selects and releases without moving
  anything settles onto its own anchor and rewinds the drawing under the reader.
- **An edit that captures the pose it is made at must be staged like a drag.** Adding a link,
  welding, dropping a cylinder: §6.2 calls these *capturing*, and they rebuilt directly, so the
  restore ran over them. `MechanismService.capturingPose` stages, runs and settles, holding the
  inner save so the gesture is still one undo entry.
- **`updateLinkageUnits` scales the live joints, which mid-cycle are a solved sample.** Rewind
  first -- the clocks too, not just the joints, or the rebuild's own restore undoes the scale --
  then put the reader back afterwards.
- **Every path that abandons a gesture must abandon its staging.** `letGoOfEverything` is the one
  a pinch and a long press take, and a `seedFromDisplay` left behind outlives the gesture: the next
  ambient rebuild reads "seed this machine from what is drawn" and the displaced pose becomes the
  design. Four unrelated Playwright suites failed on that one leak, none of them about posed
  editing.
- **A comparison that lists the fields it checks stops checking whatever is added next.** The
  anchor copied two fields out of its `CoordinateRule` -- the two a grounded crank needs -- so the
  floating-actuator halves added later were dropped on the way in and invented on the way out. It
  carries the whole rule now and compares it whole.
- **Slipping a wrapper div into a panel breaks its scroll.** The mode panels are a chain of flex
  items that give up their height so the card inside can cap itself at `max-height: 100%` and
  scroll its own contents. A plain `<div>` inserted anywhere in that chain leaves the percentage
  nothing definite to resolve against, and on a short window the card overflows its frame instead
  of scrolling -- visible only below about 600px tall. Any new wrapper needs
  `flex: 1 1 auto; min-height: 0`.
- **A getter the template calls must be a question, not a step.** The ghost's warning counter was
  advanced inside the getter that read it, so Angular's second check -- the one that proves nothing
  moved -- got a different answer, and every drag past the Grashof boundary raised `NG0100`. Key
  such a counter on `solveRevision` and advance it once per solve.
- **"No ghost" is not "reachable".** A machine that cannot be solved draws no ghost, and reading
  that absence as a yes said yes to the exact case the warning exists for.
- **An actuator's coordinate is a *relative* freedom.** A grounded crank's angle can be read off
  the world; a floating pin's cannot, because neither of its bodies is the world. Same for a slot
  cut into a moving link: the axis is fixed in the carrier, so it is re-read from the carrier in
  every pose rather than stored as a world vector.
- **Losing Grashof is not the same event as losing the anchor.** A rotating crank passes every
  angle, and a rocker's range still contains the pose the mechanism was drawn in. The start goes
  out of reach when the *new limits* exclude it, which depends on where in the cycle the edit was
  made -- so drive such a test by `anchorIsReachable`, never by a distance worked out in advance.
- **Grab-to-pause fires in `setLastLeftClick`, before the gesture is classified.** That is
  deliberate: what follows is a drag, a tap or a long press, and every one of them wants the
  machine standing still. It is also why touch needs no second code path.
- **Aiming at a moving joint in a test is a press on empty canvas.** A crank at ten rpm crosses a
  joint's own width in less time than it takes to read its position and put the pointer there, and
  the miss reads exactly like the app refusing the gesture. Set `driveSpeed` low first.
- **A four-bar a third of the way round its cycle puts a joint several hundred pixels below the
  window.** A Playwright press aimed there lands on nothing and reads exactly like the drag being
  refused. Re-frame (the Reset View control) after seeking, before aiming at anything.
- **The phone's bottom stack is two rows now**, not one: the shared scrub row came back so a phone
  can park mid-cycle. Per-machine rows and the sync toggle stay desktop-only. Two consequences for
  tests: **a fixed canvas coordinate near the bottom of a phone viewport is no longer open grid**
  (compute a free point with `elementFromPoint`), and **the canvas re-frame after the sheet opens
  takes longer** because the drawing has further to travel — poll until it settles rather than
  waiting a flat second.

---

## Domain facts worth knowing before you debug

- **`MODEL_SCALE` is 200** (`model/render-scale.ts`) — model units per centimeter. A coordinate of
  600 is 3 cm. Most solver code is in model units and most panel code is in the reader's unit.
- **`partition.joints` are the same objects as the editable drawing** (not copies), and `animate()`
  mutates them in place. If something reads the "drawing" while the mechanism is not at timestep 0,
  it reads an animated pose.
- **`partition.joints` vs `partition.ownJoints`**: the first is everything the solver must be handed,
  shared frame pieces included; the second is what that machine is actually made of. "Is this mine?"
  is `ownJoints`.
- **Do not assume mechanism index 0.** One drawing can hold several machines, each with its own
  input, speed and playback row. Ask `partitions`. `mechanisms[0]` is not necessarily the master —
  `masterMechanism()` is, and the transport steps by *its* frame count.
- **A cycle's last sample repeats the first**, and the period *is* the last sample's time. A step
  that lands exactly on the period wraps to zero, so the final frame is reachable only by accident
  unless you index frames rather than add time.
- **Samples are one degree of crank apart**, except where a fold made the walk cut finer — see
  `Mechanism.addedSamples`. Time per sample is therefore not always uniform; `stepAtTime` and
  `timeAtStep` binary-search the real sample times, and code that divides the period by the frame
  count is making an assumption.
- **Editing is gated on being at the start pose.** `isAtStartPose()` is false while playing or at a
  non-zero timestep, and the Edit panel and several menu rows go quiet. If a UI test cannot edit,
  check the playhead before checking the feature.
- **A big drawing arrives unsolved.** Past 24 joints solving is deferred out of Edit and paid when
  an analysis mode is pressed, behind the loading cover. `mechanisms` being empty in Edit is normal
  for those.
- **Only two templates draw their frame as a link** — `Four_Bar_Inversions` and
  `Slider_Crank_Inversions` — so all-ground links are rare and easy to forget about.

---

## Deploys, domains and surrounding services

- **Production is [app.pmksplus.com](https://app.pmksplus.com)**, deployed from `main`. **Never
  push to `main`** unless someone has told you to: a commit there ships.
- **The Netlify site is named `pmksprod`.** Branch previews are
  `https://[BRANCHNAME]--pmksprod.netlify.app`. The older `--pmks.netlify.app` pattern 404s, and
  the wrong hostname looks exactly like a broken deploy.
- **`version` in `package.json` is what the bottom bar shows**, via `environments/environment*.ts`.
  It is bumped by hand, in the PR that ships a release.
- **The feedback form needs a serverless key.** `netlify/functions/getEmailJSKey.ts` supplies it
  from `EMAIL_JS_KEY`. A branch deploy without that variable set reports that the build has no mail
  key — which is the honest message, not a failure to send. EmailJS also keeps a domain allow-list,
  so a new preview hostname can be refused even with the key present.
- **`docs/fixture-urls.md` is generated** from `FIXTURE_GALLERY` by `npm run fixture-urls`, and a
  spec fails if it is stale. Regenerate against a deploy preview when a reviewer needs to click a
  mechanism that uses a feature which has not shipped:

  ```bash
  PMKS_FIXTURE_BASE_URL=https://deploy-preview-NNN--pmksprod.netlify.app npm run fixture-urls
  ```

- **The mechanism library's payloads are generated** by `npm run template-payloads` from the
  verification fixtures, so a template cannot quietly become a different linkage than the tests
  cover. Do not hand-edit the generated block.

---

## Checking an exported file

**Draw it.** A DXF or SVG export can pass every assertion you thought to write and still be wrong
in a way that is obvious the moment you look at it. Two real examples, both caught by rendering and
neither by a test: every `DIMENSION` named an anonymous block that was emitted *empty* (AutoCAD and
Fusion redraw the picture from the measurement and never complained, but a reader that draws only
the block shows nothing -- which is the entire reason the R12 option exists), and the dimension line
was offset a fixed distance in -Y, so on a vertical link it lay exactly along the centerline it was
dimensioning.

Parse the download with `dxf-parser` (it is already a dependency, at
`node_modules/dxf-parser/dist/dxf-parser.js` -- there is no `index.js`), flatten the entities *and*
every block's contents into line segments, emit an SVG, and screenshot it. Remember DXF's Y axis
points up and SVG's points down, so negate Y or the drawing arrives upside down. Keep the script in
the scratchpad rather than `e2e/`; what belongs in `e2e/` is the assertion the picture taught you to
write.

**R12 is the only format PMKS writes, on purpose.** `AC1009` predates `LWPOLYLINE`, the `100`
subclass markers, entity handles, the CLASSES section and the OBJECTS dictionary -- which is exactly
why every CAD program, laser cutter and CAM tool still reads it, and why it is hard to get wrong.
The R2000 path was deleted rather than fixed: what it bought was a units hint, a tidier polyline
entity, and real `DIMENSION` entities, and Fusion and Onshape do not turn a DXF dimension into a
sketch dimension anyway. The units hint lives in the file's *name* now (`mechanism (cm).dxf`) and in
its notes layer, because both importers make you choose units regardless.

**Arcs ride on polyline vertices.** A rounded link outline is one closed `POLYLINE` whose vertices
carry a `bulge` -- `tan(theta / 4)`, signed counter-clockwise. That is what lets a part arrive as a
face CAD can pick and extrude rather than a heap of lines and arcs to stitch. `RealLink.outlineLoops()`
is where the canvas's own geometry gets translated; the sign follows the ring's winding rather than
the arc's endpoints, because a half circle's start and end angles are the same pair whichever way
round it goes.

**Two checks run themselves; the third is yours.**
`src/app/services/export/dxf/gallery-round-trip.spec.ts` exports every `FIXTURE_GALLERY` mechanism
in both presets and parses it back. `e2e/dxf-sweep.mjs` does the same through the real dialog for
all 42 templates -- which is the only way to reach the solved slot travels and the file names -- and
leaves every DXF in `artifacts/dxf-sweep/`.

**Then audit those files with `ezdxf`.** `dxf-parser` tells you the file parses; it does not tell
you an importer will accept it without quietly repairing it first. Install `ezdxf` into a throwaway
venv in the scratchpad and print `auditor.fixes` as well as `auditor.errors`:

```python
import sys, ezdxf
from ezdxf import recover
for path in sys.argv[1:]:
    doc, auditor = recover.readfile(path)
    print(path, doc.dxfversion, len(auditor.errors), len(auditor.fixes))
```

A clean parse with four silent `INVALID_TABLE_HANDLE` repairs is how the old R2000 tables went a
long time without their handles. Every file should report zero of each. Once a release, import one
into Fusion or Onshape by hand as well -- translator strictness is the one thing no parser here can
stand in for.

**Check the units convert, not just that they are labeled.** `$INSUNITS` and the coordinates are
written by different code. Export the same drawing as cm, m and in, and check `$EXTMAX` scales by
1, 1/100 and 1/2.54 -- it did not, for a while, and the file looked completely correct until you
measured something in CAD.

---

## Working out whether a failure is yours

The suite has carried stale failures for weeks at a time, so a red run does not mean you broke it.
Before spending an afternoon on one, ask git:

```bash
git stash push -u
PMKS_BASE_URL=http://localhost:4200 node e2e/the-suite.mjs   # does it fail here too?
git stash pop
```

If it fails identically without your changes, it was already broken — say so, and decide separately
whether to fix it.

To bisect a *product* change rather than a test change, stash only the file you suspect:

```bash
git stash push -u -- src/app/component/new-grid/new-grid.component.ts
```

**A stale test usually looks like one of these**, all of which have happened here:

- a selector or `aria-label` whose wording drifted (`traced` → `Show Traced Paths`);
- a member that was renamed or removed (`synthesisBuilder`, `swapDrivePin`);
- a behavior deliberately replaced, with the new one covered by a different file;
- a drag distance or coordinate tuned against a layout that has since moved;
- an assertion that depends on a template happening to have some property — a pale link, a load, a
  particular sample count — which a later change took away.

When you find one, fix it to assert the rule rather than the coincidence. A check that computes what
the answer should be cannot be invalidated by a palette or a template.
