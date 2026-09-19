# Joint type as one choice, sliders as one joint, cylinders as a sealed slide

> **Status:** Built — plan of record from September 15, 2026. It replaces the
> bodies-and-joints migration, which lives on the unmerged branch `bodies-and-joints-plan` in
> `docs/bodies-and-joints-plan.md` and was never on `staging`; Stage R retires it.
> **Stages R, 0, 1 and 2 are built:** a joint's type is one choice of four in the Edit panel, in
> the group panel and at the top of the right-click menu, a slider is a single `PrisJoint` carrying
> its own mass and `rotates`, and a cylinder is a record looked up from its seal, with a selectable
> slide and a panel each for its barrel and its rod. Split Joint (D7) is the one deferral and has
> yet to be scoped. Everything here is built on `staging` in ordinary pull requests, on the public
> editor, with the existing solver.

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
| D9 | **A cylinder's slide** is a joint: the square drawn mid-skin. Selecting it shows Joint Type with Prismatic chosen at full ink and the other three refused "inside a cylinder"; **Add Input is live** (the cylinder's drive is this joint's); no Grounded row ("ground an end joint instead" in the menu; the spec drew it as "ground a mount instead", and *mount* is a code word that `docs/ui-vocabulary.md` keeps out of the UI); no Travel field (the stroke is the barrel's length); a **Starts at** field in percent of stroke. |
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

> **Met, with one recorded exception.** `e2e/template-graphs.mjs` is 3978/3978, the MATLAB sixbar
> is byte-identical, and the unit suite runs with nothing skipped. Two rate defects this stage
> introduced were caught in review and fixed in it rather than deferred: the drive row being
> dropped from the system the *rates* are solved through (the scissor lift, and every shape whose
> drive mounts the walk places), and `determineLoops` never recording a ground-to-ground chain one
> edge long (the elliptical trammel, which is that shape only now that a slider is one joint).
>
> The exception is **`Cylinder_Gripper`'s D and Q**, re-pinned in `template-baseline.ts`. That
> machine's simultaneous system is square but rank-deficient — a 2-D nullspace — so least squares
> wanders inside it, and a slider being one unknown rather than two coincident ones makes the
> system a column narrower and the wander land differently. Both old and new values are below the
> 1/1000-unit the URL can carry and both satisfy the suite's own `toBeCloseTo(_, 3)`; they are now
> pinned at the mirror symmetry the drawing actually has rather than at whichever number the
> search settles on, which is what makes them self-enforcing. Nobody owes a further fix: the
> wander is a property of that mechanism, not of this stage.

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

**Decisions taken when Stage 2 was scoped** (September 19, 2026). The section above says what a
cylinder is; these are the questions it left open, answered once so the four packages agree.

| # | Decision |
| --- | --- |
| S1 | **The slot's order is the role.** `seal.slotJointA` is mount A and `seal.slotJointB` is N; the rod is the one two-joint bar riding the seal and its other end is mount B. Nothing is measured to find a role. Creation already writes the slot in that order. An old payload does not promise it, so the **reader** is the one place the old distance rule survives: on decode each sealed slot is put in order (the barrel joint further from the rod's mount is A), once, before anything asks. |
| S2 | **N and S are derived, the mounts are not.** After every rebuild the axis is A→B, N goes to A plus the barrel's length along it and S to B minus the rod's length. For a drawing that is already straight this writes nothing. It never clamps S into the travel (the reason `normalizedCylinderPose` gave still holds) and never moves a mount. It is two coordinate writes, not an edit: it does not go through `planEdit`, which stays as the transaction every *edit* of a cylinder runs in. |
| S3 | **Barrel and rod have their own lengths.** "Equal by construction" goes, because D11 and D12 change one without the other. The travel is still the barrel's alone (`cylinderStrokeAlong`), the span is S's place along the barrel plus the rod, and a new cylinder is still drawn with the two equal, so every number an existing drawing produces is the number it produced before. The rod has a floor, the stroke, so mount B never retracts past the barrel's mouth. |
| S4 | **A mount dragged past a stop** resizes both members by the same amount, which is today's rule when they are equal. A member holding its length does not resize and the other takes all of it; with both held the mount stops at the stop. |
| S5 | **One angle, two padlocks.** A member holds one thing, like any bar, and the URL's `H` entry stays one per link. Either member holding `angle` holds the cylinder's angle, solved mount to mount as it is today; releasing it from either panel clears both. Fixing the angle writes it on a member holding nothing, the barrel first, so a rod can hold its length while the cylinder holds its angle; with both lengths already held it replaces the length of the member whose padlock was pressed, the way a bar's does. A held `length` is not handed to the hold solver: the layout in S4, D11 and the length edits is what honors it. |
| S6 | **Lengths.** Barrel Length moves N and nothing else, so the stroke and Starts at change with it; it is refused below the length that still holds the head where it stands, and above the one that would take the stroke past the rod. Rod Length moves B; if B is grounded A moves (with N and S); if both are grounded S slides, and the edit is refused when that leaves the travel. A refused length changes nothing and says why through `NotificationService`. |
| S7 | **Dragging S** is Starts at by hand: S follows the pointer along the axis between the stops, and D11's first two rungs decide which end gives. A drag never changes a length, so with both end joints grounded S stays where it is and the number is typed into Starts at instead. Typing its X or Y goes through the same door. |
| S8 | **A Lock** on the barrel, the rod or S is one mark on S and holds all four joints, which is what a lock on the cylinder has always meant and what every shared URL with one says. A Lock on a mount holds the mount. |
| S9 | **Letters.** A new cylinder's mounts take the next two letters, as today, and S the third; N keeps an interior name (`A1`). An old payload's S has an interior name (`A2`), which now reads on the canvas, in a panel title and in an export column. The reader gives such an S the next free letter as the last step of the build and recomputes the ids of the links holding it; nothing else in a payload names S by then. N is never renamed. |
| S10 | **Names.** Barrel = A's name + S's; Rod = S's + B's; Cylinder = A's + B's, as today. |
| S11 | **`isCylinderInterior` was two questions.** *Hidden* is N alone: no hitbox, no letter, no count. *Inside a cylinder* is N and S: placed by the layout, never an anchor for a hold, never welded, merged onto or cut a slot in. |
| S12 | **Dragging a member drags the cylinder**, as dragging the skin always has. Only the selection, the panel and the menu are the member's own. |
| S13 | **The slide's mark.** A slider whose riders cannot turn — the Joint Type Prismatic, floating or grounded, and every cylinder's seal S — is drawn as a cream rounded bar lying along its slot (2.8R by 1.4R, corner 0.25R, `MARK.slide*` in `model/joint-marks.ts`), in place of the `+` it used to wear. A Pin-in-slot slider keeps its circle and a welded *revolute* keeps its `+`, so the mark's shape says whether the riders may turn and its orientation says what they slide along. The mark shrinks with a piston head too short to hold it, never past `MARK.slideHostShare` of that head. **The mark is the joint and the black block under it is furniture**: the block and the head carry the gesture — a click on either still grabs the slider — and every state is drawn on the bar, which takes the joint's fill and color family, the hover class, the selection ring *inside* its own edge (it has one; a `+` does not), the lock badge with no chip, the tutorial ring and `id="joint_<id>"`. Nothing paints the block: the seal's outline path is gone, and S is drawn by the ordinary joint layer above the skin rather than by the skin, leaving N the only joint a cylinder hides (S11). |

> **Met.** Stage 2 was built in six packages — 2a, 2b, and 2c in four parts (canvas, menu, panel,
> mark) — with the removal below as the seventh. No solved number, template payload or fixture URL
> changed anywhere in it, and the transcoder format was never opened. The only thing that moved in
> a baseline is a *name*: the three shipped templates whose seal was stored under an interior name
> have it re-lettered on decode (S9), so `template-baseline.ts` carries one different sample id in
> each. The paragraph under each package says what it built and what it left behind.

**2a. Record and derivation (files: `model/cylinder.ts`, `model/slide-assembly.ts`,
`model/cylinder-pose-plan.ts`, `services/transcoding/*`).** Replace role inference
(`resolveCylinder`, `sealedCylinderAt`, collinearity tolerance) with a lookup from the seal;
replace pose repair (`normalizeSealedCylinders`, `applyCylinderPose`) with derivation of N from
A, the barrel length and the angle. The reader keeps accepting old sealed five-point payloads and
folds them (after 1a's fold there are four joints; N is read and re-derived). Keep
`cylinderMembers`, the skin geometry and the stops as pure geometry.

> **Met.** `cylinderAtSeal` is the one lookup and reads the roles off the slot's own order;
> `derivedInterior` replaced the repair pass, and for a cylinder that is already straight it writes
> nothing. The record's fields are the plan's, and `isCylinderInterior` became the two predicates
> S11 asks for, every caller keeping the N-or-S one until the square became selectable in 2c.

**2b. Editing semantics (files: `services/grid-utils.service.ts`, `services/mechanism.service.ts`,
`model/hold-solver.ts`, `edit-panel`).** One angle (D10): editing Barrel Angle, Rod Angle or the
slide's Slider Angle rotates A–N–S–B about the slide joint S, or about a grounded mount when one
is grounded (if both are, the angle is fixed and the edit is refused). Starts at (D11) with its
tiebreak order and refusal.
Lengths: Barrel Length moves N (and the stroke); Rod Length moves B, unless B is grounded, in
which case A moves, with the same held-length and refusal rules as D11. A dragged mount keeps
today's behavior (extension changes; the skin stretches at the stops). All of this is one
transaction with one undo entry and the refusal wording from `docs/ui-vocabulary.md`.

> **Met, with one addition the decisions forced.** `model/cylinder-edit.ts` answers each typed or
> dragged edit with a pose or a refusal, and `runEdit` makes every one of them a single undo entry
> that changes nothing when refused. "Equal by construction" went with it (S3): the travel is the
> barrel's alone and the span is the seal's place along it plus the rod, so a new cylinder is still
> drawn with the two equal and every number an existing drawing produces is the number it produced
> before. The addition is the four refusal codes the ladder needs — `cylinder.angle-refused`,
> `cylinder.start-refused`, `cylinder.barrel-length-refused`, `cylinder.rod-length-refused`.

**2c. UI (files: `component/new-grid/*`, `edit-panel`, `context-menu-builder`,
`services/slider-mark.service.ts`).** The square is selectable and is joint S (D9); Barrel and
Rod panels (D12); mounts (D13); counts (D14); the cylinder's menus as drawn ("inside a cylinder",
"ground an end joint instead", "Delete Joint (and Cylinder)"). Selecting a member selects the member,
not the cylinder; the existing "Edit Cylinder" panel is retired. Gate: `e2e/cylinder-mount.mjs`,
`cylinder-mount-render`, `cylinder-drag`, `cylinder-panel`, `cylinder-skin`, `cylinder-end-on-joint`,
`context-menu`, `joint-type`, plus a new `e2e/cylinder-members.mjs` for D10, D11 (every tiebreak
branch and the refusal), D12 and D13, with filmstrips of a full out-and-back cycle.

> **Met, in four packages rather than one, and with one decision taken along the way.** The
> *canvas* made the black block joint S's own marker, hitbox and drag, gave the barrel's path and
> the rod's path a selection each, and lettered a new cylinder's two end joints before its seal —
> an old payload's interior-named seal being re-lettered as the last step of the build (S9). The
> *menu* gave the slide, the two end joints and the two members a card each and retired the
> whole-cylinder card, every refusal quoted from the model that enforces it and every count a
> reader sees going through `MechanismService.visibleJoints`. The *panel* retired Edit Cylinder for
> a Barrel panel, a Rod panel and the slide's own, with Travel becoming the barrel's Length and the
> three masses each their own part's. The fourth is **decision S13**, which the maintainer asked for
> once the square had become a joint: a slider whose riders cannot
> turn is drawn as a cream rounded bar lying along its slot, the bar is the joint and the black
> block under it is furniture.
>
> **Two exceptions are recorded rather than fixed.** The library thumbnails (`src/assets/gifs`)
> and the README shots (`docs/images/readme`) still show the old `+` and bare-head marks; retaking
> them rewrites tracked binaries and is the maintainer's call. The DXF keeps its cross at a slide
> deliberately (`semantic-dxf.ts`): line art has no fill for a bar to be.

**2d. Removal.** Delete what no caller needs: role inference, pose repair, the five-point
construction in creation (creation builds A, N, S, B directly), hidden interior hitboxes, the
"is ram / carries ram" queries. Rewrite `cylinder-weld-guards.spec.ts` to the new boundary. Update
`CLAUDE.md` and the reference documents the change reaches; note in
`docs/cylinder-mount-joints-plan.md` that its "future direction" row is now built.

> **Met.** Role inference and pose repair had already gone in 2a and the Edit Cylinder panel's own
> writers in 2c, so what was left was the vocabulary around them: the model-level membership
> helpers no caller had left (`cylinderOfJoint`, `cylindersOfJointIn`, `cylinderMounts`,
> `isCylinderMount`, `cylinderMountsAt`), `MechanismService.cylinderOfLink` — a third name for the
> identity question — and `toggleCylinderInput`, which the panel and the menu had both stopped
> using once the drive became the slide's own. `cylinder-pose-plan.ts`'s eight exports with no
> outside caller are file-private. `cylinderAt` (carrying) and `cylinderOfBar` (identity) both stay:
> a welded end joint is exactly what makes the two differ.
>
> Three things went further than the list. **The letter rule was written twice** — once in
> `MechanismService.determineNextLetter` and once, deliberately, in the URL builder — and is now
> `model/joint-letters.ts`, asked by both and unit-tested on its own. **`MARK.arrowTail` and
> `MARK.slideAlongHalf` were both 1.4 by coincidence**, which is the only reason a driven slide's
> arrows meet its mark; `joint-marks.spec.ts` pins the pair. And the Edit panel kept **a second
> door to the drive**: a `jointForm` control named `input`, bound to nothing since Add Input became
> a button on `adjustInput`, writing the flag straight onto the joint and rebuilding *without* an
> undo entry. `e2e/posed-edit-audit.mjs` is what found it, on the slide of `Cylinder_Boom`;
> `input-toggle.spec.ts` now pins both directions of the one door that is left.
>
> `cylinder-weld-guards.spec.ts` is rewritten to the boundary S11 draws: what is refused is
> welding, unwelding, sliding, merging onto and slotting **N or S**, what is allowed is everything
> on an end joint, and each assertion reads the refusal off the model rather than spelling it out.
> Documents updated: `CLAUDE.md`, `docs/README.md`, `docs/short-notes.md`, `docs/domain-facts.md`,
> `docs/ui-vocabulary.md`, `docs/ui-copy-audit.md` and `docs/cylinder-mount-joints-plan.md`. The
> instruction here used to name `docs/tips-and-tricks.md`, which was split into
> `environment.md`, `ui-gotchas.md`, `domain-facts.md` and `short-notes.md` long before this stage;
> `notification-inventory.md` is deliberately untouched, because it is the record of the snackbar
> as it was and not an inventory of what the app says now.

## Order and what each stage must not do

R → 0a → 0b and 0c in parallel → 1a → 1b and 1c in parallel → 1d → 2a → 2b → 2c → 2d. Stage 0
must not touch the codec. Stage 1 must not change any solved number. Stage 2 must not keep a
second cylinder representation alive beside the seal. Split Joint comes after 2d, as its own plan
section when it is scoped.
