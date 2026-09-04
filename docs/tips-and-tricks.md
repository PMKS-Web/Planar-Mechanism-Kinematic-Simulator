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

**Playwright is now a devDependency**, added alongside the Playwright MCP server so Claude Code and
the e2e scripts can share one install. The browsers it drives are *not* in `node_modules`: Playwright
keeps them in a per-user cache (`~/Library/Caches/ms-playwright` on macOS), so a project-local
Playwright and the `/tmp` one below use the same Chromium as long as their versions match.

**`netlify.toml` exists for exactly one reason: to stop that install downloading a browser.**
Keeping Playwright out of the repo was a deliberate choice once — `npm ci` on Netlify installs
devDependencies, and `playwright`'s postinstall pulls ~150 MB of Chromium on every build. The file
declares `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"` under `[build.environment]` and nothing else.

Two things about it. It has to be an *environment* variable rather than an `env` prefix on the build
command, because the install runs before the build command does. And a `netlify.toml` overrides only
the keys it declares, so the build command, publish directory and functions directory still come
from each site's own UI settings — which is what you want here, since there are two sites and this
one file has to suit both.

**The e2e scripts still look in `/tmp/pmks-playwright` by default**, overridable with
`PMKS_PLAYWRIGHT_DIR` — which can now be the repo itself. The resolver appends
`/node_modules/playwright/index.mjs` to what you give it and imports that *relative to the script*,
so the repo root is `..` and not `.` — `.` resolves inside `e2e/` and fails with a
module-not-found that reads like a missing install:

```bash
PMKS_PLAYWRIGHT_DIR=.. node e2e/locking.mjs     # the project's own copy
```

The `/tmp` install is still what the suites default to, and it carries two packages the filmstrip
helper needs that the project does not:

```bash
mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright gif-encoder pngjs && npx playwright install chromium
```

**`/tmp` is cleared on reboot**, so that install disappears and every browser suite starts failing
with a module-not-found. Reinstalling — or pointing `PMKS_PLAYWRIGHT_DIR` at the repo — is the first
thing to try.

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

**Running all of them takes about an hour**, and most of that is suites that walk every template or
every context-menu row. So do not run the lot to "be safe": run the suites that cover the change,
and any you can name a reason to worry about, and leave the full batch for when the user asks or
when a change is so broad that no shorter list would be honest.

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

**A length times a percentage is not a thing `calc()` can work out.** The scrub card's start marker
was placed with `calc(... + (100% - 24px) * var(--at) / 100)`, and `--at` was bound from Angular as
`[style.--at.%]` — so the multiplication read `<length> * 41.7%`, the whole `left` declaration was
invalid, and the marker fell back to its static position at the left of the well. The value it was
*given* never mattered. Bind a custom property that gets multiplied as a **bare number**
(`[style.--at]`), and keep the `.%` suffix for properties that are used as a percentage outright, the
way `--along` is used as a gradient stop.

This one hid for a whole feature because the value was always zero: a marker pinned to the left is
indistinguishable from a marker correctly placed at zero. If a positioned element only ever gets
tested at one value, set it to a second one and measure — `getBoundingClientRect()` against the
control it is supposed to line up with, not a screenshot.

**On a phone browser the page is not the screen, and `env(safe-area-inset-*)` is zero.** Measured on
an iPhone in Safari with the bars showing: `innerHeight` 654, `vh` and `lvh` 754, `dvh` and `svh`
654, and all four safe-area insets **0**. Safari lays the page out in the band between its own bars,
which is already inside the safe area — so `viewport-fit=cover` has nothing to do there and the
`env()` readers all return zero. They are for a Home Screen web app, where the page really is the
screen. Do not debug a phone layout by reasoning about which inset applies; put a fixed `<div>` on
the page that prints `innerHeight`, `visualViewport`, `documentElement.clientHeight`, each of
`vh/dvh/svh/lvh` measured off a probe element, and the four insets, and read it on the device.

**A browser tab cannot go edge to edge, and no amount of CSS changes that.** Measured, not guessed:
Safari hands the page 654pt of an 852pt screen and paints no page *content* outside it — a canvas
laid out 100pt taller draws nothing in the strip past the viewport, and neither does a
`background-image` on the root element. The one thing that reaches the whole screen is the root
element's background **color**, which the browser propagates. So in a tab the grid stops where the
page stops, with matching white either side, and that is the end of it.

Installed to the Home Screen the same build reports `innerHeight` 874, `safe-area-inset-top` 62 and
`-bottom` 34, and the canvas spans the whole screen. That is what `manifest.webmanifest`,
`apple-mobile-web-app-capable` and — the load-bearing one —
`apple-mobile-web-app-status-bar-style: black-translucent` are for: the last puts the status bar
*over* the web view rather than above it. A standalone web app also gets its **own storage jar**, so
`tutorialSeen` and every other `localStorage` mark starts empty there; the tutorial opening on first
launch of the installed app is correct, not a bug.

`start_url` is deliberately absent from the manifest so it defaults to the installed page. A
mechanism here is a URL, and a manifest naming `/` would turn every pinned linkage into a blank grid.

**The canvas takes `100lvh` and is `position: fixed`; everything else takes the small viewport.**
The drawing is the app's background, so it is the size of the screen: `100vh`/`100lvh` (the same
number on every browser that matters — it is what iOS has always meant by `vh`), and fixed, because
the body is the small viewport and clips. The chrome keeps measuring from `100dvh` so its cards stay
above the browser's toolbar. The consequence to remember is that `canvas.getBoundingClientRect()` is
now *larger than the reachable page*: `freeCanvasRect` trims it to `documentElement.clientHeight`
before framing anything, or the mechanism is centered partly under Safari. Trim with
`documentElement`, not `visualViewport` — the latter rescales under a pinch, so at any zoom but 1 the
two are in different coordinate systems.

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
- **`inert` cannot be un-inherited, so plan what it covers before you reach for it.** The Edit
  panel's refusal strip has to stay pressable while the panel it describes is out of reach, which
  means it cannot be *inside* the frozen subtree. `panel-section` therefore has three slots -- the
  title, an attached slot, and the contents -- with the freeze on the first and third only. If you
  add a control that must survive the freeze, it goes in `[panelAttached]`, not in the card body.
- **`display: contents` keeps an element in the DOM, so `>` still has to pass it.** The freeze
  wrappers above have no boxes, which is deliberate -- a real box there breaks the height chain the
  card scrolls on -- but `#normalPanel > title-block` stopped matching the moment one appeared, and
  the sticky panel title silently unstuck. Selectors that reach through them say `.sectionBody >`.
  `e2e/detail-fixes` catches this one, by way of the title's scroll shadow.
- **A component's styles do not reach a CDK overlay.** An overlay renders outside the component
  that opened it, so `:host`-scoped rules never apply: the transport's start-pose menu and the
  phone's view drawer both live in `src/styles.scss` for that reason. Put the trigger's styles in
  the component and the panel's styles in the global sheet.
- **A range input's thumb does not travel edge to edge.** Its centre runs from half its width to
  half its width short of the far end, while a `linear-gradient` percentage on the track is measured
  across the whole thing -- so a mark positioned as a plain percentage drifts from the handle by up
  to half a thumb. The anchor seat uses the thumb's own geometry
  (`calc(12px + (100% - 24px) * var(--at) / 100)`), and is additionally *not drawn* when the handle
  is on it, so the two can never be seen disagreeing.
- **Angular collapses the whitespace around an `@if` inside a run of text.** A sentence with an
  inline link -- "Drag to edit, or *return to the start* to type." -- came out as
  "orreturn to the start" because the space before the block was eaten. Write it as `&#32;`, and
  keep the trailing space out of the model string so `long` does not end up double-spaced.
- **An analysis mode edits now, and the line is `build`/`structure`, not `drag`.** The old
  blanket -- "the graphs describe this exact cycle, so the geometry is locked here" -- is gone,
  along with four outposts that hard-coded it: a `pointer-events: none` layer, a cursor rule, a
  scenery class, and `refuseAnalysisDrag`. `modeLocksGeometry` is `modeLocksStructure` now,
  because that is what is left of it. **No cell of the analysis column is ever more permissive
  than Edit's** -- a spec asserts it over every pose state.
- **Click selects, drag tunes -- and the drag still works through the selection.** Nineteen
  reads in the drag paths take their target from `activeObjService.selectedJoint`, so the press
  still selects. What is held is what the panels are *about*
  (`ActiveObjService.holdGraphSubject`), and the canvas puts the selection itself back when a
  gesture that travelled ends. The hold has to live on the service: the selection changes on
  pointer-down and the drag state that would gate it is not armed until after, so a panel
  gating on `isPointerDown` in `ngDoCheck` sees the swap and keeps it.
- **Read `travelled` off the gesture's own outcome, not off the service.** `release()` clears
  the flag as part of returning it, so a question asked later in the same handler always
  answers "no". This cost an afternoon.
- **A toggle is a singularity, and it will own any axis fitted to its maximum.** Two samples
  out of 360 read twenty thousand where the curve's real range is nought to twelve; the axis is
  then *correct* and the plot says the curve is flat, which is false. `readableRange` in
  `analysis-graph.component.ts` trims the tails when they are outliers -- and only while a
  comparison is on the plot, because a spike in a drawing somebody built deliberately is the
  answer rather than the noise.
- **A comparison axis must widen and never shrink.** Refitted per frame it moves as much as the
  curve does and every frame looks the same height as the last.
- **SCSS appended before a file's last `}` lands inside the last rule, not at the top level.**
  Two chips came out as `.analysis-gap .baselineChip` and silently did nothing. `grep` the
  built CSS for the selector, not just the class name.
- **A second mouse button pressed during a drag arrives as `pointermove`, not `pointerdown`.**
  The Pointer Events spec fires `pointerdown` only for the *first* button. These bindings are
  `pointerdown`, so the right- and middle-button teardown written into `mouseDownNow`'s button
  cases could never run during a drag -- the gesture was left standing, and the next rebuild
  settled the moved geometry onto the anchor as though it had been asked for, with nothing to
  undo it. The hook that actually fires is `contextmenu`, and `onContextMenu` runs the same
  `putBackTheDrag(); letGoOfEverything(true)` the pinch and the long press do.
- **`putBackTheDrag()` must rebuild while the machine is still staged.** The cancel that follows
  is what finds the anchor *in those fresh frames* and makes it t = 0 again. Un-stage first and
  the settle searches frames solved from the geometry the drag had already changed.
- **A comparison's baseline keeps the axis it was drawn to, untrimmed.** Only the live curve can
  contain a singularity the reader has just created, so only the live half is worth trimming --
  and running the baseline through the same trim rescaled the plot the instant a drag began,
  clipping the very curve the overlay promises is "what you were looking at".
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

### Editing away from the start: three doors, and the sweep that tries them all

An edit made while a machine is parked mid-cycle goes through one of three doors, and the plan
(`docs/edit-mode-playback-plan.md` §6.2) names them. **Identity-addressed** edits -- delete,
ground, drive, lock, trace -- apply to the design without reading the pose; the rebuild's restore
puts every joint back on its start first, so they are safe as they are. **Capturing** edits read
geometry off the pose they are made at -- a drag, a link drawn from a joint, a cylinder, a force,
a tracer point, a weld, a slider -- and *must* be staged (`capturingPose` / `beginPosedEdit`) so
the rebuild solves from the displayed pose and the settle puts the machine back on its anchor.
Rebuilt directly, the restore sends every existing joint home and leaves the new part where the
hand put it: that is exactly what a tracer point, a force and a slider did until September 2026.
**Pose-bound numbers** -- a joint's X and Y, a link's length and angle, the CoM, a force's
endpoints, a cylinder's travel -- are refused with the banner until their transform back to t = 0
is written (§5.5).

Two things follow for anyone adding an edit. Stage it if it reads the drawing as shown; the
service methods stage themselves (`weldJoint`, `addJointAt`, `createForce`, `toggleSlider` are
the pattern), so a new caller cannot forget. And if it changes the owned-joint set, know that the
machine's anchor is keyed by that set: `carriedAnchorFor` carries the anchor to the new key and
`stagedPartitionIndex` finds the staged machine by its joints, so a part drawn from a joint or a
drop that merges two keeps the start it had.

The panel's handlers ask the permission model about *their own* action: the pose-bound fields
ask `placement`, and the toggles the freeze leaves live ask `structure`. A handler that asks the
wrong question does not misbehave loudly -- it returns, and the switch it sits behind still flips.

The anchor lookup (`reachAnchor`) has a hundredth of a sample of slack, and needs it: the pose a
re-anchor puts at sample 0 is interpolated between two solved samples, and the coordinate read
back off a point part-way along a chord is a few thousandths of a degree from the stored one.
Without the slack, a drag that changed the cycle could leave a crank's own start "unreachable",
with the ghost drawn at the last pose it could reach and a "starts here now" it had no cause for.
`e2e/posed-drag-fuzz.mjs` is the seeded random-drag sweep that found it.

And the lookup looks for the start angle at *every* whole turn inside the cycle, not just the
stored value: a provisional cycle's angles are unwrapped from wherever the hand is, and on a
rocker whose swing is wider than a turn the same crank angle is reached on two assembly branches.
The winner is the crossing nearest the anchor's seed, and a winner more than a fifth of the
drawing from the seed is refused as the other branch, which turns the ghost amber and moves the
start on release instead of drawing a design the reader never made. The seed is re-taken from the
new start on every successful re-anchor, so it stays a description of the current design.

`e2e/posed-edit-audit.mjs` tries every row, field and key at a displaced pose on three
mechanisms and judges what is left behind (nothing staged, clocks agreeing, the start pose or the
anchor kept, Undo exact). Run it after touching the canvas gestures, the menu builder, the panel
or the anchors; it takes about a quarter of an hour.

## Domain facts worth knowing before you debug

- **The transport's handle measures the *input*, not the clock, and the start pose is usually not at
  either end of it.** `drive-profile.ts` maps each solved sample to `along` ∈ 0..1 across everything
  the input does: end to end of a stroke, limit to limit of a rocker's swing, or once round for a
  crank. Only the crank is measured *from* the drawn pose, so only there does the start sit at
  `along = 0`. A rocker drawn mid-swing starts four tenths along its own track, which is why the
  start marker is `profile.along[0]` and not zero, and why "is this parked away from its start" is a
  question about `secondsOf(index)` rather than about how far along the handle is. Ask the wrong one
  and the card claims a machine standing exactly on its start is 24 degrees from it, with 0.00 s
  printed beside the claim.

- **The grid's minor step has to be a round number too, and that decides how many there are.**
  `cellSizeFor` picks the major off the one-two-five ladder; `minorDivisionsFor` then splits it 10,
  4 or 5 ways depending on which of those it landed on, so the minor comes out a 1, a 2 or a 5 as
  well. A fixed five-way split only works for the fives: at a major of 2 it drew 0.4, 0.8, 1.2 and
  1.6, so a reader looking at a line labeled 2 had no way to find 1. Snapping reads `minorCellSize`,
  so the two cannot come apart. Note the half is *not* always a line — half of 5 is 2.5, which is not
  a number anybody would choose, and being round wins over being halved.

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

### Gruebler's count is one-sided, so the geometry gets the last word

`determineDegreesOfFreedom` counts bodies and joints, and that count is wrong in exactly one
direction: it charges twice for constraints that say the same thing, so a linkage whose redundancy
is *geometric* comes out too low. The textbook case gets drawn here — a parallelogram with a third
parallel crank counts as zero and turns perfectly well, because the third crank repeats what the
first two already said. So when the count says a mechanism cannot move, and only then,
`model/mechanism/mobility.ts` asks the drawing instead: **freedoms = coordinates − rank(J)**, over
three coordinates per moving body and two rows per joint.

**A rank deficiency is not a motion, and believing it is will break a working app.** It says the
linkage can move *at this instant*. A slider-crank whose coupler is welded to its block, drawn with
the crank square to the slot, has the pin's circle touching the block's line: first order says they
agree and second order says they part immediately. So every freedom the rank finds is stepped along
and put back together — if the gap that opens has a part no first-order correction can close, it was
a tangency and the freedom is dropped. Two existing specs (`slide-mobility`, `motiongen-gripper`)
encode exactly that case and are what caught it.

Two rules keep the whole thing conservative, and both matter:

- The geometry is asked **only when the count says < 1**, so nothing the count already gets right can
  be reached.
- Its answer is taken **only when it is ≥ 1** — a rescue, never a demotion. Where both agree nothing
  moves, Gruebler's own number is the more useful: `-2` says how much has to come out, and a flat
  zero from a rank count says only that it is stuck. `e2e/phase1-drag.mjs` pins that.

The projection in `outsideRange` orthogonalizes the Jacobian's columns against each other before
projecting. Subtracting each column in turn without that leaves part of the span behind and reports
every genuine motion as a tangency — which is the answer exactly inverted, and it passes the whole
unit suite while doing it.

---

### A template can ship a picture to build on

A card in `template-catalog.ts` may carry a `backdrop`: an asset under `src/assets/backdrops/`, a
width in centimeters, and where to center it. `Backhoe_Bucket` has one. The picture is never in the
URL — an image is megabytes and a shared link is a few hundred characters — so what a *new tab*
carries is the card's name, in the **hash**, because the query is the mechanism and a second
parameter beside it would not decode past the checksum. `placeTemplateBackdrop` is the one door,
called from the library and again on arrival.

Two things it deliberately does not do. It does not clear a picture the *reader* dropped in: opening
a template replaces the mechanism, which is what the dialog warns about, and a file they chose is not
the library's to delete — so only backdrops under `assets/backdrops/` are taken down. And it does not
put the image in the undo history or the codec, the same as any background image.

---

### A force is stored in one unit and read in another

`settings.forceUnit` is what the reader is *reading*, and it is not what a magnitude is kept in.
`Force.mag`, the solver's `siUnitFactors`, and every URL in circulation are written in the length
system's own force unit — lbf under inches, newtons under centimeters and meters — and
`ForceUnit.KGF` is a third way of reading those newtons rather than a third way of keeping them.
`NumberUnitParserService.storedForceUnit` names the one, the settings subject names the other, and
`formatStoredForce` / `parseStoredForce` are the only crossing. Multiply a magnitude by 9.8 on its
way anywhere else and the solver is handed a load nine times the one that was typed. This is the
same split `displayInertiaUnit` / `storedInertiaUnit` already keeps for `g·cm²`.

**A torque is a force times a length, and both halves are the reader's.** `torqueLabel(force,
length)` is `lbf·in`, `N·cm`, `N·m`, `kgf·cm` or `kgf·m` — one rule, no cases. Centimeters used to
be the one system whose moment did not follow it, so a reader measuring in cm was shown a moment in
meters with a silent hundredth in the middle of it. `AnalysisSampleService` divides the solver's
newton-meters by both factors, and `analysis-sample.service.spec.ts` pins all four combinations.

**Adding a unit to one of these enums means appending it, after `NULL`.** The URL codec encodes an
enum setting as the *index of its key* in `Object.keys`, one base-64 character, so a value inserted
anywhere but the end renames every value already in circulation. `InertiaUnit.G_CM2` and
`ForceUnit.KGF` both sit past `NULL` for that reason and no other.

---

### The drawing is y-up, the screen is y-down, and two directives say so

Model coordinates follow the math convention: +y is up. The screen's is down.
The app reconciles the two once, in the template, and there are exactly two
words for it -- both in `src/app/model-frame.directive.ts`:

- **`modelFrame`** on a drawing layer turns it over, so everything inside is
  written with the numbers the solver produced: a joint is `[attr.cy]="joint.y"`
  and no arithmetic. Two dozen layers of `new-grid.component.html` wear it.
- **`upright`** on one thing inside undoes that flip for itself, because text
  drawn under it reads upside down and an asset authored y-down comes out
  mirrored. `[upright]="chip"` hangs the thing on a point in the drawing;
  bare `upright` flips in place, for something already positioned by its own
  `x`/`y`; `[uprightTurnedBy]` turns it first, for a mark bolted to a part.
  Inside an `upright` the axes are the screen's again, +y down, which is what
  lets a pill or a glyph be laid out with ordinary SVG numbers.

Both used to be spelled `style="transform: scaleY(-1)"`, which is why they are
directives now: **the frame and the escape from it were the same string**, and
eleven counter-flips were indistinguishable from the layers containing them
without tracing the nesting by hand. If you add a layer, say `modelFrame`; if
you add words to one, say `upright`.

What follows from the flip, and what has cost an hour more than once:

- **`SvgGridService` has one symmetric pair, and both halves carry the flip.**
  `screenToModel(Coord)`, `screenToModelFromXY(x, y)` and `modelToScreen(Coord)`.
  The pan-zoom matrix they go through is the *viewport's*, and the viewport
  sits outside the flipped layers, so the negation in those functions is the
  step the matrix is missing. They replaced a `screenToSVG` that negated y and
  an `SVGtoScreen` that did not -- two functions named as each other's inverse
  that were not one, with nothing saying which carried the flip. `svg-grid.spec.ts`
  round-trips a point and pins that a point above the origin in the drawing
  lands above it on screen.
- **`getScreenCTM()` on a layer already contains the flip** (`d < 0`), so
  mapping a model point through *that* lands on the right pixel with no
  negation. Mixing it with the viewport's matrix is how a probe reports a crank
  turning the wrong way. `revealOnCanvas` does the flip by hand for the same
  reason the pair does, against the matrix the canvas is drawn under right now
  rather than the one the library last announced.
- **The same angle has opposite signs on the two sides.** An angle measured in
  screen pixels grows clockwise; measured in model coordinates it grows
  counterclockwise. The synthesis preview's `phase` is a model angle, so
  advancing it turns the preview counterclockwise on screen -- which is why
  `SynthesisPanelComponent.step` negates the stride for a clockwise preview.
- **A hand-written flip can be a hand-written bug, and counting elements will
  not find it.** The start-ghost's warning pill hung on `translate(x, -y)
  scale(1,-1)`, which is `upright` with the y mirrored: measured on the 4-Bar,
  `ghostTagAt` named a point 123px down the window and the pill was drawn at
  729px, the same distance the other side of the axis. It survived because
  every check on it asked whether the pill was *there*, never where. The
  placement check in `posed-editing.mjs` compares the pill's box against
  `modelToScreen(ghostTagAt(ghost))` and is what that lesson is worth.
- **If you touch a direction, look at it.** Play, take a few frames clipped
  around the driven pin, and see which way the crank goes. A numeric probe is
  only as good as the matrix it chose, and two of them in one session disagreed
  with the screen.

### A negative drive speed is clockwise, and `turnsClockwise` is the only place that knows

`model/drive-direction.ts` holds the pair: `turnsClockwise(signedSpeed)` reads
the sign and `speedTurning(clockwise, magnitude)` writes it. Every "is this
clockwise?" in the app goes through the first -- the pin's arrow glyph, the
transport's note and its rotate icon, the Edit panel's direction control, the
analysis setup's `12.00 RPM CW`, `travelingForward`, the DXF export and
synthesis' Insert -- and everything that has a direction and needs the number
goes through the second.

**Do not re-derive the convention; it does not follow from anything.** You can
talk yourself into either answer from the y-flip, and reasoning about it gets
it wrong about as often as right. It was settled by playing the four-bar
template and watching four frames of the crank. `drive-direction.spec.ts` is
what holds it there, and it exists because those eight readings used to be
eight copies of `speed < 0` -- one of which, the transport's row for a machine
whose solve is deferred, was backwards for a week (a7b83a8).

The same sign runs through `inputAngularVelocities`, which is the joint's rpm
through pi/30: a different quantity, the same convention.

### "Loops" is a claim about the drawing, not a count of samples

The sweep in `findFullMovementPos` closes a crank's cycle on a *count*: 360 one-degree samples and
the input is back where it started. That is only a cycle when the rest of the drawing is back too,
and there are two ways for it not to be. A rod that passes through tangency with its slot comes home
on the other assembly branch and needs two turns. And an input can be a **rocker whose swing is
wider than a turn** -- the ten-pin linkage in `wideSwingRockerFixture` turns a full revolution and
75 degrees more before it stops, so after 360 samples its crank is home and every other joint is
half a mechanism away. The old sweep tried a second turn, hit the limit, fell back to the one-turn
cycle "the old behavior kept", and warned about the seam *in the console*. The playback bar said
"Loops" and the drawing teleported once a turn.

Now: a solve that fails past a full turn is a limit, wherever it falls, and the input reverses
there like any other rocker; a crank gets up to three turns to bring the whole drawing home; and a
crank that is in a different pose after every turn it was given is refused as `cycle-never-closes`
rather than shown with a seam. "Different pose" is the solver's own line between a step and a jump
(`JUMP_LIMIT_FRACTION` of the span), not a thousandth: a linkage drawn at one of its own limits
comes home a few thousandths of its span off, because at a fold the pose is exquisitely sensitive to
the crank, and the one-joint-to-a-hundredth-of-a-pixel test the rocker closure used to run could
never pass there.

**A rocker walks home over the poses it found on the way out, literally.** The walk back used to be
re-solved, and near a limit the two branches meet: after adaptive subdivision has crept to within a
sixty-fourth of a degree of the fold, "the root nearest the current position" is a coin flip, and a
retrace that lost it came home on the other branch -- which the one-joint closure test then passed,
because the *crank pin* was home. `visited` maps each travel to the sample standing at it, and a
step onto covered ground puts the position solver back on that pose (`reinstatePose`). Three things
follow: the seam at home is exactly zero; a rocker found to be somewhere else when its travel is
back at zero is refused on the spot, since no further walking can fix a branch; and the adaptive
fine pass over a sliver such as Watt I's now closes instead of sailing off into the lobe the sliver's
branch never visits.

When a mechanism's cycle looks wrong, get the truth before touching the solver: a pseudo-arclength
continuation of the constraint equations in a hundred lines of node (unknown joint positions plus
the crank angle, distance constraints, tangent from the null space) traces the whole configuration
curve and reports the crank's range and its turning points. That is how the 444-degree swing above,
the boundary six-bar's 382-degree swing with the drawn pose at a limit, and Watt I's eleven-degree
sliver were each established, and each contradicted what the spec at the time asserted.

### A hold is a constraint, not a lock, and every move goes through the solver

A bar can hold its **length** or its **angle** against edits (`RealLink.hold`, the menu's Fixed
Length / Fixed Angle rows, the padlocks on the Link Length and Link Angle fields). It is not a Lock:
the joints stay free to move, on the arc or the line the held value leaves them. One or the other,
never both -- both is what a Lock on the joints already means -- so asking for the second moves the
hold and says so, with "Lock length instead" on the message. To the reader the word is always
**Locked** (the padlock's label, "Locked by fixed length AB", the Unlock action); `hold` is the
code's name for it, kept distinct from the joint Lock it is not.

The rules are the CAD ones, and they live in one place, `model/hold-solver.ts`: the joint that was
asked for reaches its ask when the holds allow and lands on the nearest allowed place when they do
not; every other joint on a held bar moves as little as it must (drag the free end of a held bar and
its far end is towed; drag it when the far end is grounded and it rides the arc); grounded, locked,
slider and cylinder joints never move. A joint the holds have fully determined -- between two held
lengths from two fixed points -- is refused at the grab, naming the holds, exactly as a locked joint
is; an ask no configuration satisfies (a four-bar dragged past where its coupler can follow) is
refused *whole* -- the half-settled positions the sweep stopped in have a hold false in them, and
writing those was how a locked length once changed under a drag. A typed length or angle near a
lock is a constraint, not a place: `setBarValue` adds the number to the holds and lets the solver
move whatever must move, which is also what typing into a locked field does -- the number typed
becomes the number locked. **Every route that moves a joint lands in `GridUtilsService.dragJoint`, and that is where the
solver is asked**, so a typed coordinate, a distance-to-joint field and a link drag get the same
answer as a canvas drag. `settled` is how the solver writes its answer back through the same door
without being asked again; forget it and you get a recursion.

A hold is only meaningful on a plain two-joint bar, and `holdOf()` in `model/link-holds.ts` reads
one as absent on anything else -- which is why nothing has to clear the flag when a bar is welded or
given a third joint. It rides the URL as an `H` entry in the trailing section (`HlAB`, `HaAB`),
beside the locks, so it survives undo and travels in a shared link; the decoder refuses a hold on
anything but a bar. The held-value chips and the amber guide are canvas state
(`heldChips()`, `holdGuide`, `holdRing` in `new-grid.component.ts`), shown only when the lock marks
are (`lockVisualsOn`), and the hover dimensions for a length or an angle -- the link's and the
joint panel's distance-to-joint ones alike -- are now a hairline with a pill, sized in screen pixels
through `svgGrid.scaleWithZoom`. `e2e/link-holds.mjs` walks all of it.

**And a Lock is about position, full stop.** It refuses every gesture that would *move* what it
holds -- a drag, a typed coordinate, a merge -- and refuses nothing else. Two other rules had grown
onto the same mark, and neither was anything the padlock claimed:

- **Deleting** a locked part was refused, directly and through the cascade (a link whose deletion
  would orphan a locked joint), so a reader who locked a joint to stop nudging it found they could
  not delete it either. `MechanismService.deleteRefusal` and `SelectionBatchService`'s cascade check
  were where that lived; both are gone.
- **Attaching** a link, cylinder or force to a locked *joint* was refused, while attaching to a
  locked *link* was allowed -- an inconsistency that was really the same mistake. Nothing a lock
  holds moves when a bar is drawn out from a joint: the joint keeps its coordinate and the new joint
  lands under the pointer. `frozenRefusal` in the menu builder is gone with it; the attach rows still
  refuse what a third body would actually break (driven, welded, several links sharing the joint).

`e2e/locking.mjs` and `e2e/context-menu.mjs` pin both the other way round now, and the locking suite
draws a real bar onto a locked joint rather than only reading the row's state.

### Where a drag's time goes, and how to re-measure it

Measured on 2 Sep 2026 in a real Chromium with the DevTools profiler and tracer, on the
production build and the dev server (`e2e/drag-profile.mjs`). The lag was JavaScript, not
rendering: paint is about 1% of a drag second, style and layout at most 12%, and production was
only 15 to 20% faster than the dev server. Six things ran on **every pointer move**, and each was
fixed on 3 Sep 2026 (commits eedd5d8 through 70dda33); the numbers are app time per pointer move
on the dev server, before and after:

| Scenario | before | after |
| --- | --- | --- |
| four-bar, Edit, drag a joint | 20 ms | 9 ms |
| four-bar, Edit, every joint tracing its path | 24 ms | 8 ms |
| four-bar, Kinematic, three graph rows open | 58 ms | 14 ms |
| Jansen leg, Edit | 49 ms | 12 ms |
| Jansen leg, Kinematic, three rows | 98 ms | 27 ms |
| four machines in one drawing, one joint dragged | 60 ms | 19 ms |

1. **The position sweep copied link artwork, not positions.** For each of the ~360 timesteps
   and each link, `findFullMovementPos` built a `RealLink` whose constructor re-tokenized the
   SVG path with a regex, rotated every point and reformatted every number with `toFixed(9)`:
   two thirds of the sweep. Now the copy is deferred: a solved sample's link keeps its
   `visualSource` and realizes the path on the first read of `d` or the outline
   (`link.deferred-artwork.spec.ts`).
2. **Each open graph re-solved the whole cycle's kinematics on its own.** Three rows, three
   full solves. `AnalysisSampleService` now keeps the solver's answer per sample, weakly keyed
   on the mechanism a drag replaces on every move.
3. **ApexCharts rebuilt every plot from scratch** through `updateOptions`, about 8 ms per chart
   per move and ~7,000 DOM mutations. While the hand is down the bridge now draws the live
   curves as paths over the standing plot (`showLive` in `analysis-apex-chart.component.ts`) and
   the chart is handed the final series once, on release. The overlay goes up before the chart
   drops its live series and comes down only after the chart has redrawn them, so no frame ever
   shows the earlier curve alone -- `e2e/analysis-editing.mjs` samples every frame for exactly
   that.
4. **Every machine in the drawing was rebuilt when one joint moved.** `updateMechanism` now
   fingerprints each partition from everything its solve reads and keeps the `Mechanism` whose
   fingerprint did not change (`mechanism.rebuild-reuse.spec.ts`).
5. **Traced paths were rebuilt in a template binding** on each of the ~12 change-detection
   passes a pointer move causes. `getJointPath` now keeps its strings per solved machine.
6. **A pointer can report faster than the screen refreshes**, and every report cost a solve. The
   canvas now takes the latest move on the next animation frame; a release lands the move still
   waiting before it is read.

Still true and worth knowing: change detection runs about a dozen times per pointer move (the
Edit panel's two `setTimeout`s per selection publish, the top bar's animation frame from every
`ngAfterViewChecked`, the grid's settle loop, each graph row's frame request and
`ResizeObserver`). Each pass is cheap now that nothing heavy hangs off a template binding, but
anything that does will be multiplied by twelve. Not it: the before-drag comparison, forces in
Edit mode, joint labels, the center-of-mass marks, the canvas SVG itself.

**Guarding it.** `node e2e/drag-perf.mjs` drags every scenario with nothing attached and fails
any that runs more than 35% above `e2e/drag-perf-baseline.json`. The baseline is for the
machine that wrote it; after a change that deliberately moves the numbers, run it with
`--baseline` and commit the rewrite with the change. Since moves are coalesced to one solve per
frame, the suite's "ms per move" counts the work the frames actually did, and the 90th-percentile
frame is the number a reader feels. To see *why* a number moved, `node e2e/drag-profile.mjs
<scenario>`. Both subtract the DevTools protocol's own ~8 ms per pointer event, measured on a
blank page at the start of each run, and profile the second drag on a page, because the first
runs 15 to 25% slower while the JIT warms up.

**The deferred link artwork is a snapshot, and has to stay one.** A solved sample's `RealLink`
carries its outline across from the editable link lazily (fix 1 above). The first version kept a
reference to the editable link and read its `d` and its joints when the outline was first asked
for -- which is the first frame of a seek, after the display has already moved those joints and
written the previous frame's path over `d`. The rigid move from source to sample was then the
identity: bodies lagged their pins by a degree in playback and by the whole jump after any seek,
and a delete at a displaced pose left the linkage drawn in two places at once. The sample now
snapshots the path, the lines and the two pin coordinates at construction, which costs a few
numbers and keeps the string work deferred. `e2e/posed-edit-audit.mjs` checks every link body
against its pins after every action; the pixel diff that cleared the original change compared
poses reached by playback, where a one-sample lag is invisible.

## Deploys, domains and surrounding services

- **Production is [app.pmksplus.com](https://app.pmksplus.com)**, deployed from `main`. **Never
  push to `main`** unless someone has told you to: a commit there ships.
- **There are two Netlify sites, and branch builds come from `pmksnew`.** Branch previews are
  `https://[BRANCHNAME]--pmksnew.netlify.app`. The older `--pmks.netlify.app` pattern 404s, which is
  at least honest; `[BRANCH]--pmksprod.netlify.app` is the trap, because it still answers **200 with
  a months-stale bundle**. Measured on the day this was written: `staging--pmksprod` served a build
  with none of the last several commits in it while `staging--pmksnew` served the current one, and
  `app.pmksplus.com` matched `pmksprod.netlify.app`. So production may still be the old site while
  branches are on the new one — check rather than assume.
- **Never confirm a deploy by loading the page.** Ask for something only the new commit has:

  ```bash
  curl -s https://staging--pmksnew.netlify.app/ | grep -o 'main-[A-Z0-9]*\.js'
  ```

  A changed bundle hash is proof; a 200 is not. This is also how to tell "Netlify has not built yet"
  from "Netlify is not watching this branch any more", which look identical from a browser.
- **Re-pushing the same commit does nothing.** Netlify reacts to a new SHA, so `git push` on an
  up-to-date branch prints `Everything up-to-date` and no build starts. `git commit --allow-empty`
  is the way to ask for a rebuild.
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
  PMKS_FIXTURE_BASE_URL=https://deploy-preview-NNN--pmksnew.netlify.app npm run fixture-urls
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

## Analysis graphs: keep annotations in the options, not on the chart

`ApexCharts.addXaxisAnnotation(…, pushToMemory=false)` draws onto the chart, and *any* later
`updateOptions` — the series changing, the axis refitting, the bridge's width watcher — redraws the
chart from its options and the drawing is gone. A row that has just opened redraws three times in
a few milliseconds, and chasing each with a fresh drawing (even one frame later) lost the race
every time: the playhead was simply absent on a freshly opened row, and present only after the
next playback tick. `showAnnotations` in `analysis-graph.component.ts` now writes the playhead
into `chartOptions.annotations` *and* draws it; the options are what every redraw reads, the
drawing is what makes a moving playhead cheap.

## A record read by several components has to be brought up to date before any of them

The tuning gesture (`AnalysisCompareService`) is polled, because every edit ends in a rebuild
that publishes on nothing. Polled from a component's own `ngDoCheck`, it was updated by whichever
component was checked first — after the ones checked earlier had already rendered the stale value,
which dev mode reports as NG0100 against the earlier one (the status strip, then the panel's
switch). `AppComponent.ngDoCheck` syncs it now, before any child is checked. The graphs' own
"before" curves are taken and dropped from that same sync for the same reason: a graph deciding in
its own check decided after the panel above it had asked whether there was anything to compare.

## `analysis-graph.component.spec.ts` builds its own injector

Its production-fixture tests construct the component with `withTestInjector([...providers])`, so a
service that is `providedIn: 'root'` is *not* available there: adding an `inject()` to the graph
means adding a provider (or a stub) to that list, or every fixture test fails with NG0201.

## The chart gets one series set per redraw, and the bridge redraws one at a time

`buildChart` used to assign every live series to `displayedSeries` and leave the chosen ones to
a 1 ms timer. Under a drag -- a redraw per frame -- ApexCharts drew the first set before the
second arrived: X and Y flashing through a plot set to Magnitude, and a live curve with no
earlier one under it. Screenshots never caught it; a `requestAnimationFrame` sampler reading
the `seriesName` attributes did (`e2e/analysis-editing.mjs`, "no frame of a Magnitude drag").
`updateChartData` now builds and applies the selection in one synchronous step, and the bridge
(`analysis-apex-chart.component.ts`) runs one `updateOptions` at a time, re-running once from
the options current at the end if more were asked for meanwhile.

## `segmented-block` is the pick-one control

Every "choose one of two or three" in the app is `segmented-block`: `radio-block` wraps it for
form-bound settings, the graph rows use it for Magnitude / X & Y, the export drawers use it
directly. The pill under the chosen option is positioned by measuring that option
(`--thumb-left`, `--thumb-width`), so options may be as wide as their labels (`[fill]="false"`
at the end of a settings row) or share the width equally (the default in a panel). Its buttons
carry the plain button role and `aria-pressed`, which is what the suites find them by.

## ApexCharts draws every annotation in front, and has no option about it

`annotations.position` is not a thing (only `grid.position` and the crosshairs have one), so a
zero line drawn as a y-axis annotation crossed the curve it was there to be read against. The
chart bridge moves the axis-annotation groups under the series group after each draw, from a
`MutationObserver` on the chart's host -- the one vantage point that sees Apex's own late
redraws too. The move must be a no-op once the order is right: moving a node that is already in
place is itself a mutation, and the first version of this looped the tab solid.

## `panel-section` has a live slot for what a frozen panel may still change

`[frozen]` makes the card's body `inert`. A child marked `panelLive` is projected after the
body, outside it, and stays usable while the rest is gray: that is how the mass fields are typed
while the machine plays. The frozen look in `edit-panel.component.scss` is scoped to `[inert]`
descendants for the same reason, so the live section keeps its ink.

## Template payloads outside the generated block are edited by hand

`npm run template-payloads` rewrites only the block between the `<generated …>` markers in
`template-linkages.ts`; the entries above it and everything in `dev-templates.ts` are typed in.
A default that lives in the URL's settings flags (joint labels, say) therefore has to be flipped
in those strings too: the first two characters are the packed bool settings in the URL's
base-64 alphabet, and the checksum on the end is a function of the length alone, so a flipped
bit needs no other change.
