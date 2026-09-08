# Brief: let a cylinder's mounts weld and carry sliders, like any other joint

## The ask

A cylinder's two **mounts** — `barrelFar` (mount A, the end the barrel pivots about) and `rodFar`
(mount C, the rod's outer end) — are today the only pins in the app that cannot be welded into a
compound and cannot be given a sliding block. Every other pin can. The restriction was a
simplification taken when the sealed cylinder shipped, not a statement about mechanisms: a real
hydraulic ram is very often trunnion-mounted on a slide, or bolted rigidly into a fabricated
body. We want to lift it.

**Scope is the two mounts only.** The three interior joints — `barrelNear` (buried inside the
barrel), `pin` (the welded rod/block pin), `slider` (the `PrisJoint` in the barrel's bore) — are
the cylinder's own mechanism and stay closed. `pin` is *already* welded; that weld is what makes
the part a Slide, and it must not be confused with the new one.

## The part, in one paragraph

A cylinder is not a class. It is five joints and three links arranged a certain way, recognized
structurally on demand, with one bit of persisted state: `PrisJoint.isSealed`. `Cylinder` is an
interface describing a recognized arrangement — `src/app/model/cylinder.ts:20`.

```
barrelFar ──────── barrelNear      barrel  (the carrier link; the slot is cut along it)
              [ pin ≡ slider ]     block   (zero-length SliderBlock, pin welded to slider)
                  pin ─────── rodFar       rod     (the rider link)
```

- `slider` is a floating `PrisJoint` whose carrier is the barrel and whose slot runs `barrelFar` →
  `barrelNear`.
- `pin` is a `RealJoint` with `isWelded = true`, bound to `slider` through the zero-length block.
  That is a **Slide** (`src/app/model/slide-assembly.ts:88`, `slideAssemblyAt`).
- Sealed ⇔ skinned, always. The geometric collinearity test still runs and keeps the drawing
  honest, but only a sealed assembly is drawn as a ram.

Recognition splits deliberately into two halves:

- `describeCylinderStructure` — `src/app/model/cylinder.ts:178` — members and mounts, **no geometry
  asked**. Every permanence guard, drag route, delete cascade and normalization pass uses this, so
  the part stays recognized even while its geometry is momentarily wrong mid-drag.
- `describeCylinder` — `src/app/model/cylinder.ts:234` — adds the collinearity and length checks.

Membership lookups (`cylinderOfJointIn`, `src/app/model/cylinder.ts:318`) match **any of the five
joints**, via `cylinderJoints` at `src/app/model/cylinder.ts:305`. This matters: several call sites
named "mount" actually test membership, and will need narrowing.

## Every place that enforces the restriction today

### Weld

| Where | Line | What it does |
| --- | --- | --- |
| `services/grid-utils.service.ts` | `canToggleWeld`, **229**; the mount branch at **234–243** | Returns `false` for a mount that is not already welded. Unwelding stays allowed. |
| `services/grid-utils.service.ts` | `weldRefusal`, **263**; mount branch **274–280** | The sentence: *"A cylinder is one sealed part, so its joints cannot be fused into a neighboring body. Attach a link here instead."* |
| `services/context-menu-builder.service.ts` | Welded row, **610** | Quotes `weldRefusal`; no rule of its own. |
| `component/edit-panel/edit-panel.component.ts` | **665–668** | Enables/disables the panel's weld control from `canToggleWeld`. |
| `services/multi-edit.service.ts` | `weldRefusal`, **291** | Group weld; defers to `grid.weldRefusal` per joint. |
| `model/drop-target.ts` | `refuseJointMerge`, **72**; mount check **124–129** | A merge that would carry a weld onto a mount returns `'welded-mount'`. |
| `model/drop-target.ts` | **362–370** | The same rule live during a drag, for the red ring. |
| `model/drop-target.ts` | **15**, **41** | The `'welded-mount'` code and its message. |

### Slider

| Where | Line | What it does |
| --- | --- | --- |
| `services/context-menu-builder.service.ts` | Slider row, **584**; refusal **589–593** | Refused for **any** cylinder joint (`sealed = cylinderAt(joint)` at **442**), not only mounts. |
| `services/mechanism.service.ts` | `toggleSlider`, **4703–4713** | The model-level refusal, `'cylinder.sealed-slider'`. Also any cylinder joint. |
| `services/multi-edit.service.ts` | `sliderRefusal`, **330** | Group version, same breadth. |
| `component/edit-panel/edit-panel.component.ts` | `isCylinderMount`, **753** | **Misnamed** — it is `cylinderAt(selectedJoint)`, so it is true on all five joints. Drives the panel's slider control at **670–676**. |

## The machinery that already anticipates this — and where it stops

This is the most important section. `cylinder.ts` was written with welded mounts in mind and then
deliberately fenced off.

- **`twoJointLeaf` — `src/app/model/cylinder.ts:154`.** Exists for nothing else. A mount welded into
  a neighboring link absorbs the barrel (or rod) into a compound `RealLink`; the member bar survives
  as a `subset` leaf, and the skin has to keep describing that bar rather than the whole compound.
  `describeCylinderStructure` calls it for both rod (**192**) and barrel (**195**).
  Its own doc comment says: *"Nothing in the app can currently produce that, and this is defense
  rather than a supported shape."*
- **The named gap.** That same comment names why it is not finished: **`applyCylinderPose` moves the
  cylinder's own five joints and no others**, so a compound's remaining joints would be left behind
  and the body recomputed as though it had deformed.
  - `applyCylinderPose` — `src/app/services/grid-utils.service.ts:1094`
  - `placeCylinder` — `src/app/services/grid-utils.service.ts:1135`
  - `dragCylinderMount` — `src/app/services/grid-utils.service.ts:1009`
- **`src/tests/verification/cylinder-weld-guards.spec.ts`** pins both guards on purpose. Its header
  says: *"If either rule is relaxed, that is a deliberate decision to finish the compound path, and
  this file is where it says so."* This task **is** that decision. The spec must be rewritten, not
  deleted — it should keep pinning whatever the new boundary is.

**There is no equivalent groundwork for a mount carrying a slider.** That side is greenfield.

## The solver path

Position solving treats a sealed cylinder as one part placed **from its two mounts**, so the mounts
must be placed first by the ordinary walk.

- `registerSealedCylinders` — `src/app/model/mechanism/position-solver.ts:1102`. Called from
  `determineJointOrder` (**557**) before anything else, so a cylinder never gets solved joint by
  joint.
- `orderDrivenCylinderMount` — **1227**. For a *driven* cylinder: places the mount the ram pushes,
  from the other mount plus a reference on the driven mount's own body. Note **1245–1252**: the
  reference must come from the mount's own body, not back through the cylinder.
- `orderSealedCylinderInterior` — **1287**. Once both mounts are known, one step places
  `barrelNear`, `pin` and `slider` together.
- `sealedCylinderInterior` — **1353**. Derives the interior each sample and refuses the pose when
  the rod has run out of the barrel, which the walk reads as a travel limit and reverses at.
- `drivenCylinderMount` — **1330**.

Two structures adjacent to this task, both changed in the last two commits (`5052279`, `aa13cb7`) —
read their doc comments, they are the closest precedent for what a mount-as-slider needs:

- `orderSlideAssembly` — `src/app/model/mechanism/position-solver.ts:1959` — and
  `slideAssemblySource` — **2041** — which now has three ways to locate a welded slide assembly on
  a grounded guide: a member already placed, **a link reaching onto it**, or a slot cut into it.
- `orderCarrierFromBlock` / `inverseSlot` — **1864** / **2827** — which now swing a slotted carrier
  about any known pin of it.

Bodies and mobility do **not** special-case cylinders at all: `assignBodies`
(`src/app/model/mechanism/bodies.ts:27`) fuses a Slide's rider and block through
`slideAssemblies`, and that is the whole of it. A welded mount would fuse further by the same
existing rule, which is likely correct with no change — worth confirming rather than assuming.

## Serialization

Nothing to design. `isWelded` is already a per-joint flag in the codec, and a slider is already
expressed as a `PrisJoint` plus a block, both round-tripping today.

- Flag layout — `src/app/services/transcoding/string-transcoder.ts:45`, packed at **57–66**, read at
  **119–149**.
- `isSealed` validity check — `string-transcoder.ts:669`.
- `MechanismBuilder` — `src/app/services/transcoding/mechanism-builder.ts:60`.

**The compatibility surface is the risk, not the format.** A URL written by an older build must
still decode, and a URL written with a welded mount will not open on production until this ships.

## Edge cases worth thinking hard about

Not exhaustive, and not all necessarily real — deciding which are real is part of the job.

**Welded mount**

1. `applyCylinderPose` leaving the rest of a compound behind (the named gap above).
2. Two cylinders sharing a mount, with the mount welded — `cylindersAt`
   (`services/mechanism.service.ts:4213`) already returns several, and `new-grid.component.ts:2054`
   re-poses all of them on a drag.
3. A mount welded to a joint that is *also* another cylinder's mount.
4. Link id churn: link ids are concatenated sorted joint letters, and welding rebuilds them. The
   barrel/rod leaves keep their identity through `subset`; check every id-keyed cache
   (`PositionSolver`'s maps are keyed by joint id, which is stabler).
5. `reconcileAssemblyWelds` and `reconcileSlots` (`services/mechanism.service.ts:2679`) — the
   repair passes that keep a Slide's flags honest. A second weld at a mount must not be mistaken
   for the Slide's own weld, or repaired away.
6. Delete cascade: deleting a compound that swallowed a barrel deletes the whole assembly
   (`services/mechanism.service.ts:3505`). Still right? Probably, but confirm.
7. `slideAssemblyAt` requires `riders.length === 1` (`slide-assembly.ts`, resolved at **44–73**);
   `describeCylinderStructure:184` refuses otherwise. Welding a mount adds links to the *mount*, not
   to the pin, so this should hold — verify.
8. The drag ring and drop rules (`model/drop-target.ts`) currently refuse welded targets at mounts
   from both directions; decide what replaces that.

**Mount carrying a slider**

9. A mount that is a slider gains a `PrisJoint` and a block. Does `describeCylinderStructure` still
   resolve? The mount is found via `rod.joints` / `barrel.joints`, so probably yes — but
   `barrelFar` is chosen by distance from `rodFar` (**214–219**) and a block at the mount adds a
   coincident joint.
10. A **grounded** slider at a mount vs a **floating** one (slot cut into another moving link).
    The floating case is materially harder and may be worth deferring — say so explicitly if so.
11. Ordering: today the walk must reach both mounts before the interior. A mount on a slider is
    placed by `circleLineIntersectionPoints` or by the simultaneous system; a *driven* cylinder
    whose mount also slides is a new combination.
12. A mount that is both welded and a slider — i.e. a Slide at the mount, which is the arrangement
    the last two commits taught the solver to place.
13. `isCylinderInterior` (`model/cylinder.ts:364`) lists `barrelNear`, `pin`, `slider` as having no
    hitbox. A mount's new block must be selectable, and must not be confused with the cylinder's
    own block.
14. Force analysis: `force-solver.ts:511` notes that in a sealed cylinder the reaction frame is the
    barrel. A mount reaction against a slider guide is a new case.
15. Panel/menu naming: `isCylinderMount` (misnamed) and the Slider refusals currently cover all
    five joints. Interior joints must keep their refusal while mounts lose theirs, so the two
    questions have to be separated.

## Constraints to respect

- **Never push to `main`.** Work on `staging`.
- No lint target. Prettier 100-col/single-quote; **format only files you edit** — about 50 files
  predate the config.
- American English throughout, in identifiers as well as prose. `e2e/ui-copy.mjs` fails the build
  on British forms in anything a user can read.
- Every refusal quotes one model. The menu, the panel and the drag ring must not each carry their
  own copy of a rule — see the "Every grayed row quotes the model that enforces it" note in
  `CLAUDE.md`.
- New mechanisms go in `FIXTURE_GALLERY` (`src/test-utils/verification/fixture-gallery.ts`) and
  `npm run fixture-urls` regenerates `docs/fixture-urls.md`; a spec fails if it is stale.
- Node ≥ 22.22. `npm test -- --watch=false` runs the suite (Vitest, Jasmine style). `npx vitest`
  does **not** work — see `docs/tips-and-tricks.md`.
- The `§ cylinder N` references in code comments point at a spec that **does not exist as a file**
  in this repo. Do not hunt for it; read the comment that cites it.

## Existing tests that will move

Unit (`npm test -- --watch=false --include='<path>'`):

- `src/tests/verification/cylinder-weld-guards.spec.ts` — **the file that says this decision was
  taken deliberately.** Rewrite it to pin the new boundary.
- `src/app/services/cylinder-lifecycle.spec.ts` — asserts `'welded-mount'` at **401–402**.
- `src/tests/verification/cylinder.spec.ts`, `cylinder-travel.spec.ts`, `cylinder-forces.spec.ts`,
  `cylinder-angle-hold.spec.ts`, `cylinder-naming.spec.ts`, `driven-cylinder.spec.ts`,
  `driven-cylinder-kinematics.spec.ts`
- `src/app/model/cylinder-layout.spec.ts`
- `src/app/services/transcoding/url-sealed-cylinder.spec.ts`

E2E (`PMKS_PLAYWRIGHT_DIR=/tmp/pmks-playwright PMKS_BASE_URL=http://localhost:4200 node e2e/<suite>.mjs`),
each ~1–5 min; the full batch is about an hour, so do not run it wholesale:

- `e2e/cylinder-attach.mjs`, `e2e/attach-cylinder.mjs`, `e2e/cylinder-drag.mjs`,
  `e2e/cylinder-panel.mjs`, `e2e/cylinder-skin.mjs`, `e2e/cylinder-end-on-joint.mjs`,
  `e2e/phase4-cylinder.mjs`, `e2e/phase5-driven-cylinder.mjs`
- `e2e/context-menu.mjs`, `e2e/multi-select-and-dxf.mjs` for the menu and group paths

Note: several e2e suites keep a persistent Chrome profile in `/tmp/pmks-chrome-*`. A stale one
fails a suite for reasons unrelated to the change — delete the directory the suite names before
trusting a failure. See `docs/tips-and-tricks.md`.

## What "done" looks like for the planning pass

A plan someone can implement without re-deriving any of the above: which refusals go, which stay
and why, what replaces the `twoJointLeaf` half-measure, how `applyCylinderPose` learns to carry a
compound, what the solver ordering needs for a mount that slides, which edge cases are in scope
versus deliberately deferred, and the order to build it in so the suite stays green at each step.
