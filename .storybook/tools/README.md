# Gallery tools

Plain Node scripts, run from the repository root. None of them is part of a build.

- `sweep.mjs` — visits every entry a running gallery lists in `index.json` and fails on a
  console error or a story that renders nothing. `SB_URL=http://localhost:<port>` for a gallery on
  another port. The check to run after touching a block.
- `import-path.mjs <from> <to>` — the shortest chain of static imports between two files under
  `src/app` (paths relative to it). This is how the service → component cycles that broke the
  gallery were found; see `docs/code-style.md`, "A service never imports a component".
- `cycles.mjs [max]` — every static-import cycle under `src/app` that passes through a component
  file, shortest first. The base of this work had 65; two remain, both through
  `RightPanelComponent`'s statics (`export-panel` and `tutorial-panel`). A new one is a bug.
- `token-usage.mjs` — every token in `src/styles/_tokens.scss` with how often it is used outside
  that file, least-used first.
