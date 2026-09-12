<!-- Title: one imperative sentence saying what changed and why, the shape the commit log has.
     Base branch: staging. Delete any section or line below that does not apply. -->

## Why

<!-- The problem or the ask, in a sentence or two. Link the board card or issue if there is one. -->

## What changed

<!-- What a reviewer should look at. Say which commits are moves rather than changes. -->

## How it was verified

<!-- No e2e suite runs in CI, so name the ones you ran and what you looked at. -->

- `npm run lint`, `npm run lint:styles`, `npm run lint:format`, `npm test -- --watch=false` and `npm run build` pass locally.
- e2e suites run against a dev server on this branch: `e2e/….mjs`
- A screenshot is attached, or a **filmstrip** for anything that moves or responds to a drag.

## UI checklist

<!-- For a change a reader can see. The rules are in docs/ui-style-guide.md. -->

- [ ] Every refusal reason comes from the model that enforces the rule. No rule is restated in a template.
- [ ] Every new or changed word is checked against `docs/ui-vocabulary.md`, and `e2e/ui-copy.mjs` passes.
- [ ] The spelling is American English, in identifiers and in copy.
- [ ] Built from the blocks. A new or changed block state has a story, and `node .storybook/tools/sweep.mjs` passes against the running gallery.
- [ ] One gesture is one undo, and nothing clamps silently.
- [ ] Layout checked below 600px (`e2e/mobile.mjs`) and with reduced motion on.
- [ ] Every control is reachable and usable from the keyboard, and shows focus when it has it.

## Docs

- [ ] `docs/tips-and-tricks.md` has a note for anything that cost me time.
- [ ] `CLAUDE.md` still describes the app after this change.
- [ ] `package.json` version raised (release pull requests only).
