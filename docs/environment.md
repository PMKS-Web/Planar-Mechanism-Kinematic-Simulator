# Environment and toolchain

> **Status:** Reference — how to run, test, build and ship this app, and the traps in doing so.

How to get the app running, how to run its checks, how to tell whether a failure is
yours, and where it deploys. Read this one first; the other three are opened when you are already
in the area they cover.

This is not the architecture tour. [`../README.md`](../README.md) and
[`../CLAUDE.md`](../CLAUDE.md) say what the app *is*; this says how to work on it without stepping
in the same holes.

---

## Contents

- [Environment](#environment)
- [Running the app](#running-the-app)
- [Unit tests](#unit-tests)
- [Browser tests](#browser-tests)
- [Getting inside the running app](#getting-inside-the-running-app)
- [Working out whether a failure is yours](#working-out-whether-a-failure-is-yours)
- [Deploys, domains and surrounding services](#deploys-domains-and-surrounding-services)
- [Formatting](#formatting)

---

## Environment

**Node** 22.22.3+, 24.15+ or 26+ — the range the Angular 22 toolchain declares. `npm ci` for a
clean install.

**A worktree carries its own `node_modules`, and it goes stale the moment `staging` bumps a
dependency — and a stale one looks exactly like a CSS regression you wrote.** A worktree created
before the Angular 22.1 upgrade still had `@angular/material@22.0.6` installed while `package.json`
and the lockfile both said 22.1.6. Material's form-field rules differ between the two, so every
input in the app and the gallery drew a **3px black underline** instead of a 1px grey one, and
every stroked button a heavy colored border. It reads as "the theme is not loading", and the hunt
goes to `mytheme.scss` — which was fine.

Two things make it findable fast. Compare what is *installed* against what the lockfile says:

```bash
node -e "console.log(require('./node_modules/@angular/material/package.json').version)"
node -e "console.log(require('./package-lock.json').packages['node_modules/@angular/material'].version)"
```

And know that **`require.resolve` walks up**: a worktree under `.claude/worktrees/` with no
`node_modules` of its own silently resolves packages from the repository root's, so two worktrees
can disagree about a dependency's version without either one looking wrong. `npm ci` in the
worktree settles it.

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

**The e2e scripts still look in `/tmp/pmks-playwright` by default**, and every suite honors
`PMKS_PLAYWRIGHT_DIR` to look somewhere else — which can now be the repo itself. The resolver appends
`/node_modules/playwright/index.mjs` to what you give it and imports that *relative to the script*,
so the repo root is `..` and not `.` — `.` resolves inside `e2e/` and fails with a
module-not-found that reads like a missing install:

```bash
PMKS_PLAYWRIGHT_DIR=.. node e2e/locking.mjs     # the project's own copy
```

The `/tmp` install is still what the suites default to, and it carries two packages the project
does not: `gif-encoder` and `pngjs`, which `template-animations.mjs` imports from that install's
own `node_modules` (so that suite needs the `/tmp` install, or a `PMKS_PLAYWRIGHT_DIR` that has them):

```bash
mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright gif-encoder pngjs && npx playwright install chromium
```

**The filmstrip helper's contact sheet needs Pillow, not a Node package.** `contactSheet` in
`e2e/filmstrip.mjs` tiles the frames through `python3` (it tries `python3`, `/usr/bin/python3` and
Homebrew's in turn). When none of them has `PIL` it prints `contact sheet skipped` and returns; the
frames are still in `artifacts/`, and the suite's verdict is its checks. `pip3 install pillow`
under whichever python you run brings the sheets back.

**`/tmp` is cleared on reboot**, so that install disappears and every browser suite starts failing
with a module-not-found. Reinstalling — or pointing `PMKS_PLAYWRIGHT_DIR` at the repo — is the first
thing to try.

**Some suites keep a browser profile in `/tmp/pmks-chrome-*`** (`launchPersistentContext`), and a
stale one can fail a suite for reasons that have nothing to do with the change under test: a dialog
the profile's `localStorage` has earned opens over the canvas, the suite's first click lands on it,
and the panel it then reads has no field of the name it wants -- `Cannot read properties of null
(reading 'click')` at a `setStart` or `setField`. When a cylinder or panel suite dies like that and
the same clicks work in a fresh page, delete the profile directory named in the suite and run again.

**Two suites need more than Chromium.** `playback-loop-indicator` compares the same bar across
Chromium, Firefox and WebKit, and reports three confusing failures without the other two;
`pointer-pairing` runs its checks in Chromium and WebKit. Install the extra engines once:

```bash
cd /tmp/pmks-playwright && npx playwright install firefox webkit
```

**One suite needs a native helper.** `real-mouse-slots` drives the actual system cursor and refuses
to run unless `MOUSECTL` points at a compiled `e2e/tools/mousectl.swift`. It is opt-in; a bare
"Error: set MOUSECTL" is the test declining, not the app breaking.

**macOS has no `timeout`.** A loop written as `timeout 240 node e2e/thing.mjs` fails with
`command not found` and reads as a test failure. Use `gtimeout` from coreutils, or nothing.

**Use `localhost`, not `127.0.0.1`.** The dev server listens on the IPv6 loopback only, so
`http://localhost:4200/` answers and `http://127.0.0.1:4200/` refuses the connection. No e2e script
starts a server of its own: every suite runs against whatever `PMKS_BASE_URL` names, and the
default is `http://localhost:4200`. An old command line or note that says `127.0.0.1` fails to
connect for this reason alone.

**`angular.json` sets no dev-server port**, so `npm start` takes Angular's default, 4200. A second
checkout running its own server — another worktree, or a baseline served beside your change — has
to choose a free port, and the suites have to be told it:

```bash
npx ng serve --port 4300
PMKS_BASE_URL=http://localhost:4300 node e2e/locking.mjs
```

**A new worktree starts from the wrong branch.** Worktrees are cut from `origin/main`, the
repository's default branch, but work goes to `staging` (see
[Deploys](#deploys-domains-and-surrounding-services)). Before the first change in a fresh one, run
`git fetch origin` and `git reset --hard origin/staging`. A new worktree also has no
`node_modules`: run `npm ci`, or symlink the main checkout's.

---

## Running the app

**Reload recovery must belong to the tab.** `last-drawing.ts` writes a session backup and a
persistent latest-visit fallback. An existing tab reads its own session first; reading only
`localStorage.lastDrawing` let editing a second project replace the first project on reload,
with no Undo. Keep the persistent fallback for a later browser visit, but never let it win over
an existing tab's backup. Tabs running an older build need their work saved before updating.

**CAD companion tables share the drawing's origin and start pose.** Keep geometry and tables
inside the same `encodeFromStartPose` boundary and reuse `originShift`. A paused-pose table beside
a start-pose drawing is not a coherent handoff. Cylinder joint rows reference prismatic
connections as well as rigid bodies, so the links table must include those connections; its
`type` column distinguishes them. Mass/inertia keep their stored project units, documented in
the README/JSON, even when the drawing is exported in another length unit.

```bash
npm start          # http://localhost:4200
```

Open it as `localhost`, never `127.0.0.1`, and give a second server its own port; both rules are
under [Environment](#environment).

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

**Three suites rewrite tracked files.** `template-animations` and `template-thumbnails` regenerate
the library cards' images under `src/assets/gifs`, and `readme-shots` regenerates the README's
screenshots under `docs/images/readme`. (`shot` looks similar and writes only to the gitignored
`artifacts/shots`.) Running any of the three dirties the working tree, and a careless `git add -A`
commits a pile of binary files nobody asked for:

```bash
git checkout -- src/assets/gifs docs/images/readme        # after running any of those
```

All three accept `ONLY=` to retake part of the set: a comma-separated list of template ids for the
two card scripts (`ONLY=Jansen_Leg,Pantograph`), and of shot names for `readme-shots`
(`ONLY=hero,templates`).

**Screenshots and reports** land in `artifacts/`, which is gitignored. Look at them; an exit code
tells you a check failed, not what the page looked like.

**`getByText` is a substring match, and the panels and dialogs have hint text.** A short button
label that also appears inside a sentence nearby — a note, a hint, a tooltip — matches twice, and
Playwright's strict mode fails the run rather than picking one. Reach for
`getByRole('button', { name: '…', exact: true })` whenever a label is short enough to turn up in
prose on the same screen.

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

`TabID` is `0` Synthesis, `1` Edit, `2` Kinematic analysis, `3` Force analysis. The number keys
pick the same modes but count from one: keys `1`–`4` select `TabID` 0–3, so pressing `3` opens
Kinematic analysis, and is often less trouble than clicking a tab.

**Prefer the model over the picture.** A check written against joint coordinates survives a theme
change, a re-layout and a pan-zoom animation; one written against SVG markup does not. `playback-timing`
used to compare whole SVG strings and failed a third of the time on the camera settling.

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

**Stashing is the wrong tool once a dev server is watching the checkout**, and in a session where
other worktrees share the stash stack it is dangerous. Serve HEAD *beside* your change instead: a
detached worktree in the scratchpad, `node_modules` symlinked from the main checkout, and a second
`ng serve` on another port. Then run the same suite from that worktree against that port, and a
failure that reproduces there was already there.

```bash
git worktree add --detach /path/to/baseline HEAD
ln -s "$PWD/node_modules" /path/to/baseline/node_modules
(cd /path/to/baseline && npx ng serve --port 4340)
(cd /path/to/baseline && PMKS_BASE_URL=http://localhost:4340 node e2e/the-suite.mjs)
git worktree remove --force /path/to/baseline    # when you are done
```

Run the baseline suite from the *baseline* checkout, so the guards are HEAD's guards too. And do
not edit a source file while a browser suite is running against the dev server: the rebuild reloads
the page under the suite, which then dies with *"Execution context was destroyed, most likely because
of a navigation"* or loses an element it had just found -- a failure that looks like the product's
and is only the live reload.

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

---

## Deploys, domains and surrounding services

- **Production is [app.pmksplus.com](https://app.pmksplus.com)**, and `main` is its branch.
  **Nobody pushes to `main` directly.**
- **Pull requests go to `staging`.** Agents and contributors open theirs against `staging`, never
  against `main`. A release is a pull request from `staging` to `main` that the team opens by hand.
  (A new worktree starts from `origin/main`; reset it to `origin/staging` first — see
  [Environment](#environment).)
- **Automatic publishing to production is paused in Netlify**, so a commit on `main` does not ship
  by itself; publishing is a manual step, and being on `main` does not mean being live. Do not read
  `main` as what students have: production has served a bundle several releases behind it. Grep
  production's own bundle, as below, for something only the release has; a 200 proves nothing.
- **CI runs lint, formatting, tests and the build, but no browser.**
  `.github/workflows/verification.yml` runs `npm ci`, `npm run lint`, `npm run lint:format`,
  `npm test -- --watch=false`, `npm run build` and `git diff --check` on every pull request. A
  repository ruleset makes that `test` check required on `staging` and `main`, blocks direct and
  force pushes to both, and lets only a repository admin override. No e2e suite runs there,
  `e2e/ui-copy.mjs` included: those are run by hand.
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

## Formatting

The rules are in [`code-style.md`](code-style.md#formatting) — Prettier, stylelint, the warning
ratchet and the two capped hubs — and are not repeated here. One operational note that belongs with
the toolchain rather than the rules:

Prettier is pinned in `devDependencies`, so a local run and CI agree. A different Prettier fetched
by a bare `npx` in a checkout without `node_modules` can disagree about a line or two — run
`npm ci` first.
