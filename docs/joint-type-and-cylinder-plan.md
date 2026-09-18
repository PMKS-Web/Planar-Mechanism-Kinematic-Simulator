# Joint type as one choice, sliders as one joint, cylinders as a sealed slide

> **Status:** Partly built — plan of record from September 15, 2026. It replaces the
> bodies-and-joints migration, which lives on the unmerged branch `bodies-and-joints-plan` in
> `docs/bodies-and-joints-plan.md` and was never on `staging`; Stage R retires it.
> **Stages R, 0 and 1 are built:** a joint's type is one choice of four in the Edit panel, in the
> group panel and at the top of the right-click menu, and a slider is a single `PrisJoint` carrying
> its own mass and `rotates`. Stage 2 is not started. Everything
> here is built on `staging` in ordinary pull requests, on the public editor, with the existing
> solver.

## Why

The public editor stores a drawing as points with flags and infers the rest from geometry. A
slider was three objects at one point (a `PrisJoint`, a zero-length `SliderBlock`, a coincident
`RevJoint`) until Stage 1, and a cylinder is five joints and three links that `model/cylinder.ts`
re-recognizes by collinearity and `model/cylinder-pose-plan.ts` repairs after every edit. That inference is
where the slider and cylinder bug classes come from, and the two-toggle joint panel (Slider,
Welded) hides the four things a joint can actually be.

This plan does three things in order, each shippable on its own: (0) present the joint's kind
as one four-way choice on today's model; (1) make a slider one joint; (2) make a cylinder a
sealed slide with two named members. The simulation layer is not redesigned: the solver keeps
receiving the points it receives today, produced by a small lowering step where the stored
form no longer contains them.

## The design of record

The UI is settled and drawn at real size in the Claude Design project
`edb9e4a9-b7bd-4257-8f2d-6c82d9fa8a90`, file **`Joint Type Spec.dc.html`** (`Joint Type
Redesign.dc.html` is the exploration behind it; `github.md` there lists the `staging` files each
artboard was built from). Read it with the DesignSync tool (`get_file`) after `/design-login`, or
export it; the glyphs are inline SVG in the spec. It contains: the control and its measurements,
the four glyphs in three inks plus a grounded set, eleven panel states, six menu states.

The decisions it encodes, with the maintainer's answers of September 15 folded in:

| # | Decision |
| --- | --- |
| D1 | **Joint Type** is one `segmented-block` with four values, wrapped into two columns (one added rule, `flex-wrap: wrap` with a 50% basis, and a story). It is the first control under Joint Position in Basic Settings. The values are today's two bits: Revolute = neither; **Pin-in-slot** = Slider; **Prismatic** = Slider + Welded (the phase-3 "Slide": rider rigid with the block); **Welded** = Welded. |
| D2 | **Grounded stays** as the toggle it is, under Joint Type. When Grounded is on, all four glyphs swap to the grounded set. |
| D3 | **Slider Angle** is its own row, under Grounded, present only while Grounded is on and the type is Prismatic or Pin-in-slot. A floating slot has no angle to type: its direction is the carrier's two joints. |
| D4 | The **dangling slider** state is kept as the one inline state: a 15px Material glyph, bold lead "Nowhere to slide.", sentence "Drag it onto a link to cut its slot, or ground it.", the chosen cell in refusal ink. The carrier is still assigned by dropping the joint on a link; there is no carrier picker. |
| D5 | Every other refusal rides the control's hover tooltip; nothing else pops into the layout. A value the joint cannot take is drawn in `--text-disabled`. |
| D6 | **Mass Settings** appears on a joint whose type has a block (Prismatic, Pin-in-slot). In Stage 0 it reads and writes the `SliderBlock`'s mass; from Stage 1 the joint's own. |
| D7 | **Add Input** stays. The spec pairs it with a new **Split Joint** action in a `dual-button` row. Split Joint (the inverse of merging by drop) is **deferred** to its own pull request after Stage 2; until it ships, Add Input renders full-width as today and the menu footer is unchanged. |
| D8 | **Menu:** the four values are a grid at the top of the card (82px) above the ladder; State keeps Grounded, Driven Input, Locked in that order; Traces and the destructive footer are unchanged; a ticked row keeps its check in the right-hand slot and a refusal takes that slot instead. Subtitles stay the public ones (`Pin · Links AB, BG`, `Slider · Link BC`, `Ground pin · Barrel AS`). |
| D9 | **A cylinder's slide** is a joint: the square drawn mid-skin. Selecting it shows Joint Type with Prismatic chosen at full ink and the other three refused "inside a cylinder"; **Add Input is live** (the cylinder's drive is this joint's); no Grounded row ("ground a mount instead" in the menu); no Travel field (the stroke is the barrel's length); a **Starts at** field in percent of stroke. |
| D10 | **A cylinder has one angle.** Barrel Angle, Rod Angle and the slide's Slider Angle are the same value; editing any of them rotates the assembly about the slide joint by default. Standard constraint solver logic applies where if one of the mounts are grounded, it rotates about said joint. |
| D11 | **Starts at** (extension at the design pose): by default the rod mount moves along the axis to satisfy it; if the rod mount is grounded, the barrel mount moves; if both mounts are grounded, a member length changes (the rod's unless it holds its length, then the barrel's); if both lengths are held, or the request cannot be met, the edit is refused with the notification wording for too many constraints and nothing changes. |
| D12 | **Barrel and rod** are named members (`Edit Barrel AS`, `Edit Rod SB`) with Length and Angle as hold fields; Draw as a Disc is greyed; there is no Add tracer point and no Add force on a member (absent, not greyed); Mass Settings as on a link. |
| D13 | **A mount is a pin like any other**: its type is live, it attaches like one, and its delete row names the cascade ("Delete Joint (and Cylinder)"). |
| D14 | **Every count the reader sees** (Lock All, Delete entire mechanism, "and N links") counts visible joints and links, never the solver's hidden points. |
| D15 | Freeze banners, the lock banner, Rename/Lock/Delete, Visual Settings, Distance to Joints are unchanged. |
| D16 | New words, to be added to `docs/ui-vocabulary.md` in Stage 0: Joint Type, Revolute, Prismatic, Pin-in-slot, Welded (as a type), Slider Angle, Starts at, Barrel, Rod, "inside a cylinder", "Nowhere to slide.", Split Joint (deferred). |

## Rules for whoever runs this

- **Branch from `origin/staging`; every package is a pull request against `staging`.** Never push
  `main` or `staging`. One package per PR, each green on CI and on the suites its section names.
- The public editor's current behavior is the contract except where a decision above changes it.
  Everything a reader sees must match the spec artboards; when the spec and the app's existing
  block disagree, the block wins and the spec is corrected, never a new stylesheet.
- Every new block state gets a story and the gallery sweep passes (`node .storybook/tools/sweep.mjs`).
  New colors are tokens. Words come from `docs/ui-vocabulary.md`. `npm run check` before every push.
- Verify in the running app with Playwright and look at the screenshots; a filmstrip for anything
  that moves. Add what you found to a tracked `e2e/*.mjs` suite. Do not run the whole e2e batch;
  run the suites the package names.
- Update `CLAUDE.md`, `docs/short-notes.md` and `docs/README.md` in the PR that changes what they
  describe. Regenerate `docs/fixture-urls.md` and template payloads when a fixture changes.
- These packages are sized for Opus agents working in parallel on disjoint files; the orchestrating
  session reviews diffs, runs the full unit suite and pushes. Fable is not required.

## Stage R — retire the bodies-and-joints migration (one docs PR)

`staging` no longer carries the provider seam (reverted in PR #23), so nothing on staging depends
on the migration. Retire it in one PR:

- `docs/bodies-and-joints-plan.md`, `docs/bodies-and-joints-progress.md`,
  `docs/chrome-provider-seam.md`, `docs/native-ui-parity-plan.md` (where present on staging):
  status line → *Retired, September 15, 2026*, one paragraph pointing here and saying why
  (the migration is superseded by this plan; the branch and its verified solver stay as reference).
- `docs/README.md`: move those entries under a "Retired" note; add this plan under Design records.
- `CLAUDE.md`: remove any sentence about the native route, provider tokens or S5–S8.
- On GitHub: close PR #13 with a comment naming this plan; keep `bodies-and-joints-plan`,
  `backup/pr13-before-seam-20260914` and `backup/bodies-and-joints-before-staging-20260913`.
- Memory/agent notes: nothing else.

## Stage 0 — the choice, on today's model

No model or codec change. The four-way control writes the existing `slider` and `weld` form
controls that `EditPanelComponent` already binds (`jointForm`), and `MechanismService.toggleSlider`
/ the weld toggle keep doing the work. Ships as three PRs.

**0a. Glyphs and the block (files: `src/assets/icons/`, `src/app/app.component.ts` icon
registration, `src/app/component/BLOCKS/segmented/`, `src/stories/blocks/`).**
Lift the nine line-art glyphs (Revolute, Prismatic, Pin-in-slot, Welded, each floating and
grounded, plus Split for later) from the spec's inline SVG into `assets/icons/joint-*.svg`,
stripped of metadata, 24px box, 2px strokes, `currentColor`; register them beside the other
SVG icons. Give `segmented-block` a wrapping mode (two columns, 50% basis, 32px rows, 2px gap,
glyph 20px + 8px gap, label 12.5px, chosen cell `--surface` with the spec's shadow, disabled
cells in `--text-disabled` with a tooltip) and one story per state: four options wrapped,
chosen/not chosen/refused, grounded set. Gate: gallery sweep; `npm run check`.

**0b. The panel (files: `component/edit-panel/edit-panel.component.{html,ts,scss}`,
`docs/ui-vocabulary.md`).** Replace the Slider and Welded toggles with Joint Type: value derived
from the two bits, writes go through the existing toggle paths so a change of type is one undo
entry (two bits flipping at once must still be one entry: batch them in one structural edit).
Slider Angle becomes its own row (D3). The dangling warning becomes the inline state (D4). Mass
Settings shows for a block (D6, reading the `SliderBlock`). Refusals from `gridUtils.sliderRefusal`
and the weld refusal move onto the control's tooltip and the refused cell. Add Input unchanged
(D7). Gate: `e2e/disabled-toggles.mjs`, `cylinder-panel`, `phase4-build-from-scratch`, `mobile`,
`ui-copy`; a new `e2e/joint-type.mjs` that walks a pin through all four values on a grounded and a
floating joint and asserts the bits, the undo count and the panel rows per state.

**0c. The menu (files: `services/context-menu-builder.service.ts`,
`component/BLOCKS/context-menu/*`, `src/stories/shared/context-menu.stories.ts`).** Add a
"choice grid" element to the menu model and renderer (2×2, keyboard-reachable inside the CDK
menu, one story), place it at the top of a joint's card, remove the Slider and Welded rows from
State, keep the rest (D8). Gate: `e2e/context-menu.mjs`, `context-menu-modes`, `keyboard-shortcuts`.

## Stage 1 — one joint per slider

**What changes in the model.** A slider becomes a single `PrisJoint` in `joints[]`: links attach
to it directly; it carries `mass` (the block's) and `rotates` (true for Pin-in-slot, false for
Prismatic, which is today's Welded bit on the coincident pin). `SliderBlock` and the coincident
`RevJoint` are removed. The carrier, slot joints, slot angle, dangling and well-formed rules on
`PrisJoint` stay as they are.

**1a. Model and codec (files: `model/joint.ts`, `model/link.ts`, `services/transcoding/*`,
`model/mechanism/mechanism-partition.ts`).** A prismatic joint entry gains mass; the block link
entry and the pin entry are no longer written. The reader accepts the old form (PRISMATIC bit +
block link + coincident pin) and folds it, and the checked-in production fixtures under
`src/test-data/verification` and `src/test-utils/verification/fixture-gallery.ts` must decode to
identical geometry. Undo replays URLs, so the fold must be exact.

> **Built with no version bump, by structural recognition instead** (decided in the pull request
> for 1a). The old form is named by what its records *are* — a piston link record joining a
> prismatic joint to a coincident pin — rather than by a discriminator, so a new payload needs no
> new version and every old one folds. The cost is one-directional: an **older** build handed a
> new payload stops reading a joint record after `driveSpeed` with no arity check, the digest
> still matches, and it drops the mass token — opening a grounded slider with a bar hanging off
> it and no block. That is a wrong drawing rather than a refusal, and it is why `docs/fixture-urls.md`
> now says every slider row needs a Stage 1 build. `src/test-data/legacy-payloads.ts` freezes the
> seventeen payloads the last release before Stage 1 actually emitted, and a spec decodes each
> against its regenerated twin.

**1b. Solver and forces (files: `model/mechanism/loop-solver.ts`, `position-solver.ts`,
`kinematic-solver.ts`, `force-solver.ts`, `rigid-bodies.ts`, `bodies.ts`).** Loops now pass
through the prismatic joint rather than a block link; the point-on-line constraint and the
Slide's orientation coupling are the same equations. The block's mass becomes a point body at
the joint in the force solver. Gate: `app.component.spec.ts` (MATLAB sixbar), the verification
tables, `fixture-gallery` and `template-payloads` specs, `e2e/template-graphs.mjs`,
`playback-timing`, `force-units`, `analysis-editing`: every number identical to before.

**1c. Canvas, panel, menu, deletion (files: `component/new-grid/*`, `services/slider-mark.service.ts`,
`model/joint-marks.ts`, `services/grid-utils.service.ts`, `services/mechanism.service.ts`
weld/slider/delete paths, `edit-panel`, `context-menu-builder`).** One mark per slider (the block
glyph), one hitbox, one letter; the two-marks-at-one-point ambiguity is gone by construction.
Delete cascades and counts count the one joint (D14). Mass Settings reads the joint. Gate:
`e2e/phase4-gestures.mjs`, `phase1-drag`, `creation-previews`, `locking`, `link-holds-angles`,
`edit-undo`, `posed-editing`, `joint-type`.

**1d. Fixtures, templates, docs.** Regenerate `docs/fixture-urls.md` and template payloads;
`e2e/template-open.mjs` 11/11; `CLAUDE.md` model section (Links: no `SliderBlock`; a slider is a
`PrisJoint` with mass and `rotates`); `docs/short-notes.md`.

## Stage 2 — the cylinder as a sealed slide

**What a cylinder is after Stage 1.** Barrel link A–N (N its inner end), rod link S–B, and S a
prismatic joint (`rotates: false`) riding the barrel's slot, sealed. The seal is the existing
`isSealed` bit on S. A **cylinder record** is derived, not stored: `{ seal: S, barrel, rod,
mountA: A, mountB: B, start }` where `start` is S's position along the barrel at the design pose
as a fraction of the stroke (the barrel's length less the head clearance, `cylinderStroke`).
N is owned by the seal: hidden, unlettered, no hitbox, its position derived as A plus the barrel
length along the axis; it exists for the solver only.

**2a. Record and derivation (files: `model/cylinder.ts`, `model/slide-assembly.ts`,
`model/cylinder-pose-plan.ts`, `services/transcoding/*`).** Replace role inference
(`resolveCylinder`, `sealedCylinderAt`, collinearity tolerance) with a lookup from the seal;
replace pose repair (`normalizeSealedCylinders`, `applyCylinderPose`) with derivation of N from
A, the barrel length and the angle. The reader keeps accepting old sealed five-point payloads and
folds them (after 1a's fold there are four joints; N is read and re-derived). Keep
`cylinderMembers`, the skin geometry and the stops as pure geometry.

**2b. Editing semantics (files: `services/grid-utils.service.ts`, `services/mechanism.service.ts`,
`model/hold-solver.ts`, `edit-panel`).** One angle (D10): editing Barrel Angle, Rod Angle or the
slide's Slider Angle rotates A–N–S–B about the slide joint S, or about a grounded mount when one
is grounded (if both are, the angle is fixed and the edit is refused). Starts at (D11) with its
tiebreak order and refusal.
Lengths: Barrel Length moves N (and the stroke); Rod Length moves B, unless B is grounded, in
which case A moves, with the same held-length and refusal rules as D11. A dragged mount keeps
today's behavior (extension changes; the skin stretches at the stops). All of this is one
transaction with one undo entry and the refusal wording from `docs/ui-vocabulary.md`.

**2c. UI (files: `component/new-grid/*`, `edit-panel`, `context-menu-builder`,
`services/slider-mark.service.ts`).** The square is selectable and is joint S (D9); Barrel and
Rod panels (D12); mounts (D13); counts (D14); the cylinder's menus as drawn ("inside a cylinder",
"ground a mount instead", "Delete Joint (and Cylinder)"). Selecting a member selects the member,
not the cylinder; the existing "Edit Cylinder" panel is retired. Gate: `e2e/cylinder-mount.mjs`,
`cylinder-mount-render`, `cylinder-drag`, `cylinder-panel`, `cylinder-skin`, `cylinder-end-on-joint`,
`context-menu`, `joint-type`, plus a new `e2e/cylinder-members.mjs` for D10, D11 (every tiebreak
branch and the refusal), D12 and D13, with filmstrips of a full out-and-back cycle.

**2d. Removal.** Delete what no caller needs: role inference, pose repair, the five-point
construction in creation (creation builds A, N, S, B directly), hidden interior hitboxes, the
"is ram / carries ram" queries. Rewrite `cylinder-weld-guards.spec.ts` to the new boundary. Update
`CLAUDE.md` and `docs/tips-and-tricks.md`; note in `docs/cylinder-mount-joints-plan.md` that its
"future direction" row is now built.

## Order and what each stage must not do

R → 0a → 0b and 0c in parallel → 1a → 1b and 1c in parallel → 1d → 2a → 2b → 2c → 2d. Stage 0
must not touch the codec. Stage 1 must not change any solved number. Stage 2 must not keep a
second cylinder representation alive beside the seal. Split Joint comes after 2d, as its own plan
section when it is scoped.
