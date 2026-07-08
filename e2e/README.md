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

- `full-tour.mjs` — broad tour: panels, templates, settings, share URL, help, mobile viewport
- `deep-interactions.mjs` — deep grid interaction: add links, drag joints, right-click menus
- `focused-interactions.mjs` — focused workflows (four-bar build, animation, analysis)

## Running

Prerequisites: dev server on http://127.0.0.1:4200/ (`npm start`) and a
Playwright install at `/tmp/pmks-playwright`
(`mkdir -p /tmp/pmks-playwright && cd /tmp/pmks-playwright && npm i playwright`).
Playwright is deliberately **not** a devDependency — it would bloat Netlify
deploy installs, and these scripts are normally run by a GPT-5.5 subagent
(see `SKILLS.md` and `.claude/skills/ui-validate/SKILL.md`), not CI.

```bash
node e2e/focused-interactions.mjs
```

Environment overrides:

- `PMKS_URL` — app URL (default `http://127.0.0.1:4200/`)
- `RUN_PREFIX` — prefix for screenshot/report filenames
- `PMKS_PLAYWRIGHT_DIR` — Playwright install dir (default `/tmp/pmks-playwright`)
- `PMKS_CHROME` — Chrome executable (default `/Applications/Google Chrome.app/...`)
- `PMKS_HEADED=1` — show the browser window (headless by default)

Each run launches Chrome with a disposable profile under `/tmp` (never your
real browser session) and writes screenshots plus a `*-report.json` (console
errors, crashes, element counts per checkpoint) to `artifacts/screenshots/`,
which is gitignored — outputs are throwaway, scripts are tracked.

Interaction gotcha baked into these scripts: the app places joints from tracked
`mousemove`, not click coordinates — always hover/move to the target before the
finalizing click, and prefer the Edit panel's HTML controls over the SVG
context menu (its hitboxes drift at some viewports).
