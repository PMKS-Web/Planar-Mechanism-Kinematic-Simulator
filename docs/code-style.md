# Code style

What we ask of code in this repository, and why. It is short on purpose: most of it is a handful
of decisions the codebase has already paid for once, written down so nobody pays again.

Three things hold the line, in order of how much they catch:

- **Review**, against this page.
- **`npm run lint`** (ESLint, `eslint.config.mjs`) — a few targeted rules, listed
  [at the end](#what-the-linter-enforces).
- **Prettier** (`.prettierrc`) for layout, checked by `npm run lint:format`. Nobody should argue
  about layout in a review.

Both run in CI on every pull request, and a pull request cannot merge into `staging` or `main`
until that check passes. A repository ruleset enforces it; only a repository admin can override,
and that is for emergencies.

---

## One responsibility per file

**A file does one thing. Split it when it does two, never to fit a number.**

This replaces an older rule, "keep classes under ~200 lines", which nothing here followed. Measured
on this branch, 93 of the 187 non-spec TypeScript files in `src/app` are over 200 lines, 53 are
over 400, and the two hubs are far past any count: `services/mechanism.service.ts` is about 7,800
lines and `component/new-grid/new-grid.component.ts` about 6,500. A rule that half the code
breaks teaches readers to ignore rules.

A line count is also the wrong question. Cutting a file in two to get under a number produces two
files that each make sense only with the other open. The solvers show it best: a position solve is
one algorithm, and spreading its cases over several files to satisfy a count makes it harder to
read and easier to break.

So:

- **Split when a file does two things.** A service that both works out a refusal and draws the
  message for it is two files. A 900-line solver that only solves is one.
- **Never split one algorithm across files** to make a count.
- **About 400 lines is a prompt, not a limit.** When a file passes it, ask whether it has picked up
  a second job. If it has not, leave it alone.
- **Keep functions short.** A function is the unit a reader holds in their head at once. A long
  one is almost always several steps that each deserve a name.

`max-lines` warns at 800 non-blank, non-comment lines. The warning never fails the build: it is
there so that growth in a hub is visible in a diff, not so that someone splits a file to make it go
away.

## The two hubs only delegate

`services/mechanism.service.ts` and `component/new-grid/new-grid.component.ts` are where
everything used to go, which is how they got to their size. **They take no new behavior.**

- A new rule, calculation or decision goes into a model (`src/app/model/`) or a service with a
  narrow interface. The hub calls it.
- Moving an existing piece out is welcome when you are already working in it. Keep that move in
  its own commit, so the review sees a move and a change separately.
- If a change seems to need a hub's private state, that is usually a sign the state belongs to the
  new model too.

## Invariants

Each of these is a mistake that has already shipped at least once. The file named is the one to
read.

**Refusals come from one model, and are quoted, never restated.** Whether an edit is allowed is
answered by `model/edit-permission.ts` (through `services/edit-permission.service.ts`). The
specific refusals have one home each: `describeActuatorRefusal` in `model/actuator.ts`,
`weldRefusal` in `services/grid-utils.service.ts`, and `locksHolding` in `model/lock-set.ts`. A
menu row, a panel strip and a drag gate all ask these and show what they say. Writing the rule a
second time is how the menu and the panel came to disagree.

**Rotation direction goes through `model/drive-direction.ts`.** Negative speed is clockwise, and
`turnsClockwise(speed)` / `speedTurning(clockwise, magnitude)` are the only places that know it.
Do not write `speed < 0`; eight hand-written copies once existed, and one had it backwards. The
linter rejects it.

**Owning a part is not solving it.** In `services/mechanism.service.ts`,
`indexOfMechanismContaining` (and `mechanismContaining`) answers "whose part is this": whose input,
whose clock. `indexOfMechanismSolving` (and `mechanismSolving`) answers "whose samples hold this",
which also counts the frame a machine shares with its neighbors. Analysis reads values, so it asks
the second question. Asking the first one is how a rail's end pins drew empty charts.

**Being the ram is not carrying one.** Also in `services/mechanism.service.ts`: `cylinderOfBar(link)`
asks whether this bar *is* part of a cylinder, and is what anything that names or opens a body
wants. `cylinderAt(obj)` asks whether anything under it *belongs to* a cylinder, and is what a
delete, drag or selection wants so it does not tear one apart.

**Every undoable edit ends in `updateMechanism(true)` or `save()`.** Undo and redo are a list of
URL states (`services/save-history.service.ts`). An edit that does not save is an edit that undo
silently skips.

**The URL codec is a compatibility surface.** `services/url-generation.service.ts`,
`services/url-processor.service.ts` and `services/transcoding/` read links people have already sent
to students. Change the format only by adding to it, and keep old links decoding.

**New mechanisms go in `FIXTURE_GALLERY`**, in `src/test-utils/verification/fixture-gallery.ts`,
not inline in a spec. The gallery publishes each one as a URL in `docs/fixture-urls.md` (refresh it
with `npm run fixture-urls`), so a reviewer can open a failing mechanism instead of rebuilding it.

**The drawing is y-up; the screen is y-down.** Drawing layers wear the `modelFrame` directive and
are written in model coordinates. Anything that must read the right way up, such as text, wears
`upright`. Both are in `src/app/model-frame.directive.ts`. Do not flip a sign by hand.

**American spelling, in identifiers too.** `center`, `color`, `gray`, `neighbor`, `analyze`.
`colourOf` and `colorOf` are two functions nobody meant to write, and a codebase with both answers
half of every search. `e2e/ui-copy.mjs` fails on British forms in user-facing text; it is run by
hand, not in CI, so run it when you change words. The full word list is in
[tips and tricks](tips-and-tricks.md#spelling-american-everywhere).

## Comments explain why, not how

The code says what it does. A comment says why it had to be that way: the constraint, the bug it
avoids, the alternative that was tried and failed. Most files open with a paragraph explaining the
decision behind them. Match that.

- Good: "Taken from the sign of the recorded velocity, because comparing positions read every
  ground-first mechanism as reciprocating."
- Not useful: "Loop over the joints and check each one."

When you change code, update its comment. A stale "why" is worse than none.

## Naming

Standard Angular naming:

- **Files** are dash-delimited with a type suffix: `foo-bar.service.ts`,
  `foo-bar.component.ts`, `foo-bar.directive.ts`, `foo-bar.spec.ts`.
- **Classes** carry the matching suffix: `FooBarService`, `FooBarComponent`, `FooBarPipe`.
- **Selectors** use the `app-` prefix: `app-foo-bar`.
- Components are standalone and declare their own `imports`. There is no `NgModule`.

Name a thing for what it means to a reader of the domain, not for how it is stored. A joint's
visible name, not its internal id; `turnsClockwise`, not `isNegative`.

## Formatting

Prettier owns layout: 100-character width, single quotes, 2-space indent (`.prettierrc`).

- `npm run lint:format` checks `.ts`, `.html` and e2e `.mjs`, and CI fails a pull request on it.
  `npx prettier --write <file>` fixes a file. Prettier is pinned in `devDependencies`, so everyone
  gets the same output.
- `.scss` is not checked yet: a few stylesheets predate the config. It joins the check once they
  are formatted.
- Markdown is excluded on purpose (`.prettierignore`). Prettier realigns every table cell and
  rewrites emphasis, so a one-line doc edit becomes hundreds of changed lines.
- The TypeScript and HTML under `src/` were reformatted in one commit. That commit is listed in
  `.git-blame-ignore-revs`. To make `git blame` skip it locally, run once:

  ```bash
  git config blame.ignoreRevsFile .git-blame-ignore-revs
  ```

  GitHub's blame view reads the file without any setup.

## What the linter enforces

`npm run lint` runs ESLint over `src` with the TypeScript parser. **No recommended rule set is
enabled**: the linter guards the invariants above and nothing else. Warnings do not fail the
script; errors do.

| Rule | Level | What it catches | Exempt |
| --- | --- | --- | --- |
| `no-restricted-syntax` | error | `speed < 0` or `x.driveSpeed < 0`. Use `turnsClockwise`. | `model/drive-direction.ts` |
| `no-restricted-imports` | warning | A file under `src/app/component/` importing `position-solver`, `kinematic-solver`, `force-solver` or `loop-solver` from `model/mechanism/`. Components get solved values through the services. | Spec files |
| `max-lines` | warning | A file over 800 lines, not counting blank lines and comments. | Spec files |

The solver-import rule is a warning because three components already import a solver: two only for
the `ForceAnalysisMode` and `ForceReactionIndex` types, and `analysis-graph.component.ts` to reset
`KinematicsSolver`'s static state. Do not add new ones. When you remove the last one, raise the rule to an
error.

If a rule is wrong for one line, disable it for that line only and say why after `--`:

```ts
// eslint-disable-next-line no-restricted-syntax -- a sign change, not a direction
```

A disable without a reason will not pass review. If you find yourself writing the same reason
twice, the rule or the code needs to change instead.

`src/test-data`, `dist` and `node_modules` are not linted.
