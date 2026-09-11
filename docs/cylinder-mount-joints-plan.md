# Cylinder mount joints: implementation plan

> **Status:** Built — steps 1–6 shipped September 8–10, 2026 (`d8721d3` removed the mount ban; `slotWouldFoldACylinder` in `model/drop-target.ts`). Guarded by `e2e/cylinder-mount.mjs`, `e2e/cylinder-mount-render.mjs` and `src/tests/verification/welded-mount-release.spec.ts`.

Planning baseline: `staging` at `c56f757`, September 8, 2026. It was written before any
implementation. Read `CLAUDE.md` and `docs/cylinder-mount-joints-brief.md` first. References
below use paths relative to `src/app/` unless another root is given; function names are the
durable anchors when line numbers move.

## Decision and acceptance boundary

Allow each external mount, `barrelFar` and `rodFar`, to weld into neighboring RealLinks,
carry one external sliding block, and weld to that block. Support both grounded guides and
floating slots on other bodies, including a driven cylinder using either arrangement.
**Floating slots at mounts are included, not deferred.** They already have a representation,
constraint equations, travel checks, and force reactions. Extending the existing simultaneous
path is safer than inventing a succession of cylinder-specific ordering exceptions.

The three interior joints stay closed. Preserve the internal pin weld, sealed slider, slot
endpoints, and cylinder member lengths during simulation. An external mount block is a
different block with a different PrisJoint; it must never inherit `isSealed`.

Allowing the topology does not promise every drawing moves. Two grounded welded bodies can
immobilize a ram; two arbitrary rails can disagree with its axis; a floating assembly can
have an undriven freedom. Existing mobility, actuator, and readiness rules must report those
physical outcomes. Do not impose a cylinder-mount prohibition to mask them.

This plan deliberately defers collision detection, arbitrary interior attachments, multiple
blocks on one pin, new cylinder dimensions, new URL flags, and a general interactive mechanism
constraint solver. Closed-form optimizations for coupled mount arrangements can also wait;
correct simultaneous placement cannot. Conflicting edit requests may be refused atomically
with a model reason, rather than silently deforming welded neighbors.

## Findings that correct or extend the brief

1. `slideAssemblyAt` does **not** require one rider. `model/slide-assembly.ts:44–95` allows
   multiple riders during repair; `describeCylinderStructure` requires exactly one settled
   rider. Keep that distinction. A mount weld normally leaves the internal pin incident on
   one compound rider, so internal recognition can survive.
2. The structural cylinder resolver still uses geometry to choose `barrelFar`
   (`model/cylinder.ts:214`). “No geometry” means it skips validity checks, not that endpoint
   identity is independent of coordinates. Capture roles before a gesture; do not rediscover
   them from bent intermediate positions. Keep the existing distance convention for old URLs.
3. `new-grid.component.ts:2054` explicitly clears `slotCandidate` for mount drags. Removing
   the toggle refusals alone would leave the ordinary drop-onto-slot interaction unavailable.
4. `createCylinderFrom` (`services/mechanism.service.ts:4244`) refuses a welded starting
   mount; the menu repeats that at `context-menu-builder.service.ts:503`. This omitted guard
   must go with a real topology repair, not just a deleted message.
5. `normalizeSealedCylinders` (`mechanism.service.ts:1151`) independently writes the three
   interior positions. It is another compound-deformation path, even after fixing
   `applyCylinderPose`. The latter also repairs neighboring cylinders only one level deep.
6. Simultaneous solving is already implemented: `finishOrder`, `buildSimultaneousSystem`,
   `boundaryDriven`, and `constraintKinematics`. Comments saying “v1 stops” or “Phase 6” in
   the deferred/driven walk are stale descriptions of the whole solver. Conversely, the
   simultaneous constraint builder currently writes Slide orientation only for **floating**
   sliders (`position-solver.ts:830–861`); a grounded Slide routed there lacks that row.
7. The brief's `inverseSlot:2827` location is stale: its implementation is at about 2959.
   Read both its signed-offset explanation and `slideAssemblySource:2041`, plus the actual
   changes in `5052279` and `aa13cb7`. The latter's by-link source uses a constant rigid link
   length; a driven cylinder span is not such a link.
8. Delete behavior is more selective than “delete the compound”: `deleteLink:3505` routes
   to `deleteCylinderTopology:4352`, which unwelds mounts and removes member links while
   preserving surviving neighbors. Preserve that useful behavior, but fix multiple-cylinder
   ownership and collateral unwelding as described below.
9. Grounded ordinary pins can weld now (`model/joint.ts:176`). Old comments near merge and
   weld paths claiming otherwise are stale. “Every other pin can do both” also has ordinary
   exceptions: driven pins, insufficient incident bodies, and invalid slider combinations.

10. `boundaryDrivenSystem:885` explicitly rejects `onLine` and `fixedAngle`, and requires a
    square residual count. Sending a crank-driven mount cylinder there is insufficient;
    extending admission is required, as detailed in the solver section below.

## Representation decision: an assembly API over the existing graph

Keeping five objects in storage is not the main problem. Letting every consumer independently
discover and edit those objects is. Introduce a derived `CylinderAssembly` API (the expanded
Cylinder descriptor can implement it) with explicit external mount ports, internal membership,
member leaves and roots, pose proposals, and render roles. The service owns its structural
index; the edit planner, renderer and solver consume it. UI code must stop making cylinder
operations by writing a subset of the five joints.

| Option | Consequence | Recommendation |
| --- | --- | --- |
| Keep ad hoc inference and add exceptions | Lowest initial diff, but duplicates role, movement, and render ownership decisions again. | Reject; it leaves the known failure pattern in place. |
| Derived assembly API, five-member graph retained | Explicit two-port editing/rendering with existing URL, analysis, and force compatibility. | Use for this task. This is a structural refactor, not just guard removal. |
| Persist a Cylinder entity and lower it to solver bodies | Stable intrinsic mount identity, but requires legacy import, URL migration, history, fixtures, exports, selection, and property ownership changes. | Reasonable future direction, not necessary for these mounts. |

An eventual persisted entity should describe two bodies connected by a prismatic constraint,
with two external attachment frames. It must not become one rigid solver body: extension is
relative motion between barrel and rod. A lowering adapter could produce today's five objects
while the solver evolves toward body transforms. Design the derived API so that migration can
replace its source without changing every UI caller.

No new persisted ID is needed now: the sealed slider ID identifies the assembly within a
snapshot/history state. The resolver must still reject ambiguous legacy structures; role
snapshots prevent endpoint guessing mid-edit. A persisted entity could eliminate the remaining
import-time distance convention later. Do not add an unversioned cylinder record to this codec.

## One boundary model and the refusal audit

Introduce a pure operation-permission module, for example `model/joint-operation-permission.ts`.
It takes the joint, requested operation/state, and precomputed cylinder structures and returns
`undefined` or a typed `{ code, short, long }` refusal. Reuse existing actuator/topology predicates;
do not copy their logic into templates. Expose structural role queries separately:
`cylinderMountsAt`, `cylinderInteriorsAt`, and member/owner queries. A joint may belong to several
cylinders; **any interior membership wins** for protected operations. Membership alone is never
the test for prohibiting a mount operation.

| Site | Change | Boundary that remains |
| --- | --- | --- |
| `grid-utils.service.ts:229`, `canToggleWeld`; `:263`, `weldRefusal` | Remove mount ban/message. Derive eligibility and reason from one operation answer. | Reject interior weld changes, including unwelding the internal pin. PrisJoint itself cannot weld; driven pin cannot acquire a weld; require something to fuse. |
| `mechanism.service.ts`, `toggleWeldedJoint`, `weldTopology`, `unweldTopology:7167` | Enforce public-operation answer before mutation; preserve internal repair entry points. | `structuralCylinderAt` protecting the internal pin stays. Do not replace it with broad `cylinderAt`, which would block external unwelding. |
| `drop-target.ts:124`, `:362`, code/message `welded-mount` | Remove both cylinder weld bans and retire code/message after migrating tests. | Same joint, PrisJoint, two blocks, own carrier, own cylinder, shared-link collapse, redundant merge, ambiguous input, and edit-permission rules stay. |
| `mechanism.service.ts:2777`, `mergeJoints` | Keep interior guard; move/share its cylinder boundary with the live candidate model. Preflight resulting weld topology. | Interior merge is refused from either direction; no partial unweld/merge if the final weld cannot be rebuilt. |
| `mechanism.service.ts:4703`, `toggleSlider` | Narrow sealed-slider refusal to interiors through the operation model. Guard drop/multi-edit entry points too. | External block removal must not remove the sealed block. Ordinary driven-pin/add-block and malformed-block rules apply. |
| `context-menu-builder.service.ts:584` | Replace locally written Slider reasons with the shared answer. Weld row already delegates. | Same model answer as execution; removal and addition can differ. |
| `multi-edit.service.ts:291`, `:330` | Delegate desired-state checks for both operations, including unwelding. | Preflight all changed targets before any mutation. Current early return for group unweld must not bypass interior protection. |
| `edit-panel.component.ts:665–676`, `:753` | Remove/rename misnamed `isCylinderMount`; disable from shared operation result and show its reason. | Use `emitEvent: false`; edit permissions and locks remain outer authorities. |
| `createCylinderFrom:4244`, menu `:503` | Permit welded external start/end joints; absorb new barrel/rod into the intended compounds before normalization/save. | No interior start/end, self-collapse, second block, or ambiguous input. Preview and commit quote the same attachment model. |
| `new-grid.component.ts:2054`, mount drag route | Enable ordinary slot candidate discovery/commit alongside mount pose handling. | Reject slot on the same resulting rigid body; Alt/snap priorities follow ordinary pin dragging. |

Keep broad cylinder membership for lifecycle protection, deletion discovery, cylinder selection,
and part naming where that is the actual question. Keep `isCylinderInterior` hiding exactly the
three interior hitboxes. Keep `setSliderGround`'s sealed-slider protection (around 4652): the
internal slider cannot leave its bore, but an external mount slider is not sealed. Keep
prohibitions on adding tracers/attachments to the cylinder's interior member leaf. A neighboring
leaf in the same compound is still an ordinary editable leaf.

Audit `weldWouldPinTwice`, `canBeWelded`, actuator refusals, and lock refusals when composing the
operation answer. A grayed row must quote the same preflight used by the mutation. Enabling a
mount toggle while hiding a deeper unconditional mount refusal is not completion.

## Replace leaf guessing with explicit member ownership

Replace `twoJointLeaf` with a resolver that returns **both** a member leaf and its top-level
owner. Extend the derived Cylinder descriptor with `barrelRoot` and `rodRoot` (RealLinks), while
keeping `barrel` and `rod` as the skin/property leaves. Nothing new is persisted.

Resolve the barrel leaf by the exact two slot endpoint IDs; resolve the rod by a two-joint
RealLink leaf containing the internal pin. Traverse subsets recursively, including a plain root
as its own leaf. Require a unique candidate; do not use `.find()` to choose among ambiguous
members. The closed interior makes a unique rod expected in valid topology. Distinguish an
unsealed non-cylinder from a malformed sealed structure so bad input does not silently expose
the interior. Repair transient multi-rider welds before resolving settled cylinders.

Keep roots out of skin geometry: a ternary bracket must not become the barrel silhouette or
change which endpoint is the mount. External coincident PrisJoints live in SliderBlocks, not
in the member leaf, so they do not participate in `barrelFar` distance selection. This resolves
brief case 9 without another proximity heuristic.

Use recursive containment for ownership/deletion queries (`cylinderOfLink` and `...In`), with
plural results where roots can contain several members/cylinders. Distinguish “this leaf is a
cylinder member” from “this root contains cylinder members.” A first-match root must not make
all neighboring leaves lose their menus or disappear under the skin. Audit the render/hitbox
filters, `link-holds.ts`'s leaf-ID maps, body labels, selection, and cylinder panel mass writes
(`refreshCompoundMasses` near `mechanism.service.ts:2649`). Keep angle holds attached to the
barrel leaf and discover them inside compounds.

Invalidate descriptors on structural revision, and capture fresh ownership after merge/unweld.
Joint IDs are stable only until a merge; use live object identity within a snapshot and IDs for
serialized references. Reconcile carrier roots with `reconcileSlots` after the graph rebuild.
Never keep old concatenated link IDs in pose plans across a topology commit.

## Compound-safe editing: proposal first, one commit

Extract a pure pose-planning helper usable by `GridUtilsService` and the service normalizer.
Suggested result: `{ placements, affectedRoots, affectedLeaves, movedIds }` or a typed refusal.
Inputs include a snapshot of all coordinates, cylinder roles/lengths, member ownership, locks,
holds, and the requested cylinder pose. Keep snapshots immutable until the proposal validates.

For each cylinder, compute two transforms from the snapshot:

- Barrel transform: pivot at old `barrelFar`, translate to proposed `barrelFar`, rotate old
  `barrelFar → barrelNear` direction to proposed direction.
- Rod transform: pivot at old `rodFar`, translate to proposed `rodFar`, rotate old
  `rodFar → pin` direction to proposed direction.
- For any carried point `q`, use `q' = mount' + R(q - mount)`. Carry every joint in that
  side's owner root and each coincident external block partner. Internal slider follows pin.
  Do not traverse arbitrary revolute neighbors as if they were welded.

For an unchanged size this rigid transform places the member endpoints too. Travel edits and
mount drags past a size stop intentionally resize barrel/rod: transform neighboring leaves
rigidly about the mount, then override **only** the cylinder-owned near endpoint/internal pin
with the layout result. Do not scale the bracket. Reject if another protected member or body
constraint owns an endpoint that this size change would independently move. A root containing
both barrel and rod has conflicting rigid prescriptions for extension; it does not gain a
new freedom because the editor knows how to resize a cylinder.

`placeCylinder` should add these proposals, not write five coordinates. `applyCylinderPose`
should snapshot once, build the complete proposal, validate it, then commit once. Capture force
and custom center-of-mass frames for roots **and** leaves before the first write. Transport
force application points once using their owning frame; retain the existing local/global force
direction semantics. Recompute leaf paths and automatic mass properties, then compound
aggregates. Reuse `reframeDeformedLink` for ordinary revolute neighbors genuinely deformed by
an edit, not as a substitute for carrying a welded root. Deduplicate force objects that occur
through both root and subset collections.

Replace the one-level `others.forEach` with dependency closure over affected roots and cylinders.
When a root carries another cylinder's mount, propose that cylinder's layout using its original
length and both proposed mount positions. Expand until no new dependency appears; resolve
shared joints by agreement within the edit tolerance, not last writer wins. Visit IDs alone
are insufficient: a revisited root may receive a conflicting pose. For a compatible cycle the
same proposal closes; for incompatible proposals return a model refusal and keep the previous
accepted pose. Do not repeatedly resize or apply incremental transforms until numbers converge.

All paths need this boundary: direct cylinder drag, mount drag, rotation about a locked mount,
Travel/Starts-at fields, ordinary `dragLink`, shared-mount drag, group move, and
`normalizeSealedCylinders`. Normalization must not silently straighten a welded root from
already-deformed coordinates. For valid proposals it is an idempotent check. For decoded data,
plan any allowed repair from one snapshot and preserve neighbor geometry; report incompatible
sealed structure rather than clearing its seal or tearing the body.

Expand movement consequences before evaluating locks/holds. A locked remote bracket joint can
block a cylinder drag even though none of the original five joints has a mark. A locked mount
can still permit rotation when all consequences agree. Ground defines simulation constraints;
do not introduce a new blanket editing lock on ground. Match ordinary slider-edit semantics
for relocating a grounded guide and re-seating a floating block, but include the final reseat
in the proposal and validate again so it cannot move a mount after cylinder placement.

Commit rounded coordinates once (current editing precision is six decimals), reseat/rebuild
derived data once, and save one history entry at the existing gesture/structural boundary.
Use `capturingPose`/anchor restoration for paused edits; never rebuild from the displayed pose
and accidentally reset only the mount while leaving its block there.

## Position solving: preserve constraints before optimizing order

There are two different problems: locating a point on a guide, and locating a rigid body whose
orientation constrains the cylinder. A sealed cylinder with welded mounts is not necessarily
a two-force member, and its mount distance alone does not locate that body correctly.

### Safe initial routing

Retain the existing inexpensive two-mount/interior walk for plain cylinders. For a partition
containing an external mount weld or external mount block, initially route its coupled moving
system through the existing simultaneous solver **before** generic steps claim its cylinder
interiors. Use all non-ground-pin coordinates in that partition as unknowns, including grounded
PrisJoints (the guide is grounded, the point travels). Only independently prescribed input-body
coordinates and actual grounded pins become boundary data. Keep other partitions independent.

For a grounded crank or grounded slider input, emit the existing input placement for its whole
rigid driven body, including welded/coincident partners, and solve the remaining coordinates
against that moving boundary. For a cylinder, floating pin, or floating slot drive, register
the command and let the system own it. Reuse `drivenConstraint`, `boundaryDrivenSystem`, sample
subdivision, history, and rate differentiation. Do not advance a cylinder command both in a
mount primitive and in the simultaneous step.

This is intentionally broader than `finishOrder`'s current pending-only fallback. A wrong
closed-form step can claim every point and leave no pending joint, while violating a weld.
No later solver would then check it. Give each coupled point one authoritative writer. Solver
ordering must be independent of joint IDs, draw order, link array order, and mount direction.

### Constraint-builder work required

1. Keep compound root rigidity (`distance` plus `rigidOffset`), block coincidence, floating
   `onLine`, fixed guide `onFixedLine`, and floating Slide `fixedAngle`. Use noncoincident
   reference joints for a body's frame. Include a floating angle row if **any** of its four
   endpoint references touches an unknown; the current early test omits the carrier endpoints.
2. Add a grounded Slide heading constraint, e.g. `fixedDirection { a, b, dir }`, using a
   nonzero rider vector and its initial heading. Its normalized cross-product residual fixes
   heading modulo the initial assembly branch; preserve direction with continuity/branch
   checks so a 180-degree jump is not accepted. Implement residual, Jacobian, rate behavior,
   and `boundaryJoints` handling together. Do not fabricate ground joints to express an angle.
3. For the internal Slide, the rider reference may belong to a compound and need not be
   collinear with the barrel. Preserve its captured relative angle; the rod leaf and root
   rigidity establish the cylinder geometry. Never assume that root `joints[1]` is `rodFar`.
4. Validate every cylinder after every proposed sample: positive span, original barrel/rod
   lengths, correct opposite-side branch, interior coincidence/collinearity, and allowed
   head travel. `withinStroke` currently checks only the driven cylinder, and
   `ridersAreInTheirSlots` deliberately skips sealed sliders. A passive cylinder solved
   simultaneously therefore also needs an explicit travel check. Validate before accepting
   `pendingSpan` or history; restore the entire failed sample and reverse at limits.
5. Validate external floating mount sliders with ordinary finite-slot bounds as well. Keep
   those separate from cylinder head travel and from unbounded grounded guides. Self-carrier
   checks must compare resulting rigid bodies, not merely a leaf ID.
6. Reuse constraint rates for these coupled cases, including grounded-input boundary cases;
   `constraintKinematics` currently returns early without cylinder/pin drive state. Extend
   that dispatch deliberately or prove the existing loop path gives complete correct rates
   with tests before retaining it. Compare against position derivatives and fixed-body
   identities, including zero angular rates for grounded Slides.
7. Extend `boundaryDrivenSystem` admission for enhanced mount partitions: remove its blanket
   floating-constraint rejection there. Replace square-row equality with sufficient rows,
   full column rank for determined motion, and consistent residual checks, accepting redundant
   rows through the existing least-squares machinery. Insufficient rank must still report an
   undriven/unsupported result, never an arbitrary free pose. Test an externally crank-driven
   floating mount cylinder and redundant parallel mount guides. Initially scope admission to
   the assembly/partition classification so unrelated unsupported floating arrangements do not
   acquire untested support accidentally.

The simple new closed-form option is a driven cylinder with one known anchor and an unwelded
mount on a known guide: solve `|Q0 + t*u - A| = s(t)` by circle-line intersection; record both
mount pin and block together, then place the interior. For a floating guide, both carrier
references must actually be placed first. This optimization may follow the simultaneous
implementation; the existing driven-mount circle-circle routine must not treat the mount's
coincident PrisJoint as an external constant-radius reference.

For welded mounts, use a body pose as the placement unit. A body reached first externally can
locate its mount and constrain the cylinder axis; a cylinder reached first can place a free
body from the member frame, only if no independent guide/reference contradicts it. A dependency
cycle goes to simultaneous solving, not repeated overwrite of interior joints.

The precedents explain what to preserve: `slideAssemblySource` distinguishes a **placed** member
from a seeded grounded sliding point, excludes internal references in its by-link case, and
measures its slot case from a point on that slot. `orderSlideAssembly` translates the whole
body. `inverseSlot` rotates the whole carrier about any known pin with its signed offset and
branch held from t=0; it explicitly excludes carriers whose own Slide weld forbids that swing.
Do not weaken that exclusion or feed a commanded cylinder span into the constant-link source.

## Grid visuals and interaction contract

Use the existing visual language: circular pivot, plus-shaped weld marker, black slider block,
grounded rails/hatch, floating channel, and fused Slide plate. No new “cylinder mount” glyph is
needed. The cylinder keeps its barrel/head/rod appearance and two visible mount labels. Its
three interior joints stay hidden, including the internal pin's ordinary weld glyph; the
existing head detail is not an external mount marker.

| Mount state | Appearance and meaning at either end |
| --- | --- |
| Ordinary pivot | Existing circle at the skin end, neighboring link behind it; the cylinder side can turn on the pin. |
| Welded bracket | Existing weld plus at the mount; bracket meets the corresponding cylinder-side silhouette without an ordinary bar drawn beneath the skin. They move rigidly together. |
| Unwelded slider | External black block centered on the mount, circle above it, cylinder side attached there; block translates and cylinder can rotate. |
| Welded slider | External block and corresponding cylinder-side/neighbor outline use the fused plate treatment; plus replaces circle. Heading is fixed relative to the guide. |
| Floating mount slider | Same pin/block or weld/plate on a visible external carrier channel; no ground triangle or world hatch. The guide moves with its carrier. |
| Dangling mount slider | Cylinder remains visible; external block gets the existing red dangling outline above its plate. The missing guide does not break the seal. |

At the barrel mount compose only barrel-side geometry with that bracket/block; at the rod mount
compose only rod-side geometry. Never union barrel and rod across the telescoping interface,
even when both mounts have welds. Preserve the head's existing overlap. A root containing both
sides is an immobilized topology, not permission to erase the cylinder visually.

### Current render hazards and required changes

Read `services/slider-mark.service.ts`: `marks:236`, `fuseSharedPlates:282`, `cylinderMark:358`,
`markFor` around 445, `groupPlate:556`, and `riderOutline:609`. Canvas sites are
`new-grid.component.ts`: `skinnedLink:5101`, `slotStack:5114`, `platedLink`, `isSkinned:5186`,
`isCylinderInterior`, and `linkPathWithChannels:5707`. The template draws slot items around
608, the entire cylinder afterward at 769, and mount hitboxes/markers above them around 1020.

There are two concrete hazards beyond simply showing a weld plus:

- `skinnedLink` suppresses exact leaf IDs, while `riderOutline`/`groupPlate` use a root's full
  `d`. A member inside a compound can be drawn as both an ordinary bar and a skin. Substituting
  a broad cylinder-membership suppression would instead hide the neighboring bracket.
- An internal sealed Slide and an external welded rod mount share a rider root.
  `fuseSharedPlates` groups them **before** the canvas filters skinned marks. If the hidden
  internal mark leads the group, the external plate can disappear; if the external mark leads,
  the plate can contain the hidden internal block. Joint order must not decide this.

Add a derived render plan with explicit visible fragments and semantic hit targets. Resolve
cylinder roles before ordinary slider mark generation. Exclude the sealed internal mark from
ordinary rider claiming and plate grouping, not merely template filtering; retain its dedicated
head drawing. Give external marks an outline provider that expands compound leaves, replaces
cylinder members with their **side-specific skin shapes**, and retains neighboring leaves.
Group external plates by actual rigid group with a deterministic leader and deduplicated
fragments/blocks. Merge intersecting groups fully rather than leaving first-mark ownership.

Compose welded side/neighbor geometry using existing Boolean path utilities. Keep a single
outside stroke and nonoverlapping clipped fill regions for differently colored members, so
leaf colors survive without doubled alpha or repainting a cylinder from the first external
mark's color. The two skin-side colors remain independent. Unwelded contact intentionally
layers block below cylinder side and circle above both; never union across that pivot.

Use `drawDepths`/`slotStack` carrier → external block → rider ordering for cylinder fragments
too, with dependencies preserving head/rod/barrel overlap. The current rule “all cylinders
above all sliders” cannot handle every external carrier/rider combination. Keep joints,
selection rings, dangling outlines, and arrows above their relevant bodies. If visual overlap
dependencies cycle, use stable ID order within that cycle; that drawing convention must not
affect the solver. Collision handling stays deferred.

Keep hatch world-fixed, rails in their guide frame, and floating channels in their carrier
frame. Reuse `sliderMarks.frame` and model-frame transforms; no second y flip. Cut only external
channels into ordinary visible carriers. The internal bore stays hidden even when its carrier
root also contains a neighboring leaf with a visible slot.

### Hit testing and state feedback

The circle/plus wins at the mount point regardless of the coincident PrisJoint's array order.
The external block's shoulder uses the ordinary slider-control target (its paired mount pin),
opening the **external** guide controls, never the cylinder's internal slider. A duplicate
PrisJoint circle must not steal the hit. Keep the transparent pin hit area for welded pluses
and touch use.

Clicking barrel, rod, or head still selects the cylinder and opens its panel. Clicking a
neighboring bracket selects that leaf. A shared plate's local block area selects the external
slider/mount. Add separate transparent semantic hit paths when the visible union is one path;
do not select `plate.links[0]` for every region. A root containing two cylinders needs two
separate cylinder targets. Decorations remain `pointer-events="none"`.

Cylinder selection outlines the skin, mount selection outlines its circle/plus, and bracket
selection highlights its leaf. A movement preview includes all carried fragments without
selecting them all. Preserve lock badges, refusal rings, traces, inert analysis colors and
multi-selection. Cylinder input shows head drive arrows; external guide input shows guide
arrows. Broad membership cannot distinguish those inputs.

### Visual test gate

Before opening public controls, test render-plan fragment ownership, unique external plates,
hidden internal marks, semantic hit targets, and joint-order permutations. Inspect filmstrips
for both mounts in every state above, at full extension/retraction, oblique floating slots,
different bracket colors, small cylinders, shared mounts, and two external blocks on one body.
Assert no ordinary bar shows through the skin, no plate disappears, no double-alpha seam,
no internal bore appears, and no rail rotates with an unwelded cylinder. Click mount, block
shoulder, skin, and bracket and verify each panel/menu target. Repeat at two zoom levels and
a narrow viewport, preserving contrast and screen-sized selection strokes. Check dragging and
animation as well as rest poses. This is render composition work, so implement it alongside
the edit/ownership stages and complete it before build step 5 removes the old guards.

## Mobility, bodies, forces, and lifecycle

**Bodies/mobility: no new cylinder-specific fusion is needed.** Inspection confirms
`assignBodies` (`model/mechanism/bodies.ts:27`) supplies every `assemblyBodyIds` group to
`groupRigidBodies`, which merges transitively. An ordinary mount weld produces one RealLink
root; an external Slide fuses that root with its external block. The internal Slide independently
fuses rod root and internal block. `bodiesAt` adds the floating carrier or WORLD at each
PrisJoint, and `mobility.ts:324` uses these assignments and the measured `slotAngle`.
Adding the same bodies again in a cylinder branch would double-count constraints. Confirm
this by asserting body identities and expected DOF for independent fixtures, including a
zero-mobility incompatible welded ram and a redundant parallel-guide case.

**Force solver: existing equations cover the added joint types; do not replace them with a
cylinder-specific two-force approximation.** It does not represent Slides exactly as mobility
does: the equilibrium model retains block force rows and introduces a guide couple for each
Slide (`force-solver.ts:391`). `rootBody:652` recursively resolves compound ownership. A floating
guide couple acts on rider and carrier with opposite signs; a grounded guide reacts against
the world. The input force reaction at `:511` resolves the barrel's root, which also covers a
welded barrel. An unwelded external block needs ordinary guide reaction, not a new couple;
welding it adds the external Slide couple separately from the cylinder's internal one.

No new reaction formula is indicated by this audit. Required tests must establish equilibrium,
equal-and-opposite internal forces/couples, correct compound moment arms, external guide
normal direction, and correct actuator effort under a transverse bracket load. Include dynamic
mass/inertia and custom CoM after weld/unweld. If those expose aggregation or missing-rate
defects, fix root/property/rate plumbing; do not invent a force law for mount cylinders.
Revise any universal “two-force member” wording: that applies to the appropriate pin-ended,
unloaded idealization, not a body bolted to a bracket that can transmit a moment.

`reconcileAssemblyWelds` already distinguishes Slides and ordinary compounds and repairs
multiple riders before stripping flags. Preserve external welds while retaining the internal
pin weld. Test both orders (slider then weld, weld then slider), removal, and second neighboring
link attachment. Call repair before normalization so temporary rider multiplicity cannot make
the sealed structure disappear.

Deletion should remove the selected cylinder's member leaves/internal block and interior joints,
preserving external blocks and neighboring leaves. Do not broadly unweld all survivors at a
shared mount: capture desired surviving welds, remove the members, and rebuild surviving valid
compounds/Slides. “Delete joint” additionally removes that mount and its ordinary incident
topology. “Delete compound” must explicitly name all cylinder casualties if it means removing
the entire root; clicking a cylinder skin keeps the selective cylinder operation. Use plural
ownership to compute the whole casualty set before mutation, never recursive first-match
deletion. Test three cylinders in a chain and two in a shared root; one rebuild/history entry.

The existing codec carries all required flags, subsets, blocks, and carrier references. Keep
the encoding unchanged. Test old payload decode and new payload encode/decode, including
compound repair, force ownership, holds, multiple mount blocks on distinct pins, undo/redo,
and a merge that replaces a slot endpoint ID. A new fixture URL must target a build that includes
the feature; do not publish production links as if old production already supports it.

## Edge-case disposition

| Brief cases | Decision and proof obligation |
| --- | --- |
| 1: compound left behind | Required. Test every extra joint, attached force, custom CoM, leaf shape and length through translate/rotate/resize. |
| 2–3: shared/welded cylinder mounts | Required. One proposal closure, all cylinders resolved once, same answer regardless of enumeration; incompatible cycle refuses atomically. |
| 4: ID churn | Required. Weld/merge/unweld/reload must leave no stale carrier, selection, force, hold, or cached cylinder root. |
| 5: repair passes | Required. Preserve separate interior and external weld meanings; malformed transient multiple riders repair before recognition. |
| 6: cascade | Required with selective deletion and explicit whole-root casualty semantics above. Preserve unrelated attachments and valid welds. |
| 7: one rider | Real transient concern, not an inherent incompatibility. Settled compound is one rider; multiple transient riders are already supported by Slide recognition. |
| 8: drop rules | Required in both directions and live ring/commit parity, including shared mounts belonging to more than one cylinder. |
| 9: coincident new block | No new ambiguity if leaf/root separation is correct. Test exact coincidence and permuted joint order; do not add distance-based block filtering. |
| 10: floating slot | Included. Use coupled constraint path, finite external travel, carrier-relative angle for external weld; no fixed-world shortcut. |
| 11–12: driven, sliding, welded | Required for each mount and both together, driven externally and by the cylinder. Include actual nonmoving examples as negative tests. |
| 13: hitboxes | Required. Two visible mounts, selectable external blocks, no interior hitbox, neighboring compound leaf still selectable. |
| 14: force reaction | Required. Confirm existing equations with nonzero transverse load and guide couple; do not retain universal two-force expectation. |
| 15: UI role naming | Required. Separate all-members, mounts, interiors, and containing-root queries; all gray reasons from one model. |

Additional required cases: three-or-more-cylinder propagation; a locked remote compound point;
held angle inside a subset; resizing a ram without scaling its bracket; guides at oblique angles;
floating carrier also in another Slide; a root containing both sides of one cylinder; merges
that would make an external slot ride its own fused body; tangency/parallel guides/zero span;
passive cylinder reaching travel first; paused editing in a second independent partition;
multiple cylinders in one compound's rendering and deletion; and repeated resize/undo/reload
without accumulated drift. Degenerate or physically inconsistent mechanisms need honest
readiness/solver failure and intact editable topology, not fabricated motion.

## Build order and green test gates

Keep production-facing refusals until the support they protect is ready. Add fixtures by
constructing valid topology through the fixture helpers in the early stages; do not temporarily
make public edits unsafe to get tests running. Each numbered step is an independently reviewable
commit with its tests passing before the next step.

1. **Role and ownership model, no behavior release.** Add plural roles, unique recursive member
   resolution, root references, and shared operation results retaining old public mount bans
   temporarily. Test both sides, nested/flat subsets, shuffled arrays, external block identity,
   ambiguous sealed structures, and multiple cylinders in a root. Existing guard specs stay
   green. Add fixtures to `src/test-utils/verification/fixture-gallery.ts` and regenerate URLs.
2. **Transactional edit planner behind existing gates.** Implement compound transforms,
   dependency closure, conflict handling, property transport, normalizer integration and locks.
   Test noncollinear brackets and custom force/CoM positions against explicit rigid-transform
   expectations; size edits change only intended leaf dimensions. Test shared chains/cycles,
   remote locks, holds, no-op normalization, and no mutation on failure. Run cylinder layout,
   lifecycle, angle-hold, travel, and drag service specs.
3. **Constraint completeness and coupled routing.** Add grounded Slide heading and all-reference
   dependency detection, route enhanced mount partitions before partial walk placement, validate
   every cylinder's travel, and complete rates. Test new constraint residual/Jacobian agreement
   against numerical differentiation, then independent analytic mechanisms: a ram driving an
   axial grounded carriage; an oblique guide intersection; a ram on a translating bracket;
   a rotating floating carrier; and a welded bracket with an off-axis witness point. Assert
   all root distances/orientations, block coincidence, slot offsets, speed/acceleration agreement,
   complete rates, continuity, travel reversal, and return to initial pose. Permute construction
   order. Retain MATLAB six-bar, offset-pivot-lever, guided-rod-on-a-link, and locomotive tests.
4. **Topology and lifecycle readiness.** Make direct attachment to welded endpoints transactional;
   repair compounds/slots before normalization; preserve survivor welds on selective deletion;
   check hypothetical merge result before unwelding. Exercise all mutation orders using test
   entry points while public old guards remain. Assert exactly one history entry and round-trip
   topology/properties. Compare `assignBodies`/DOF with hand-counted examples, and run static and
   dynamic force fixtures described above. Avoid changing body or force equations unless a
   demonstrated failure requires it.
5. **Release the boundary and rewrite the guard contract together.** Remove the old bans and
   `'welded-mount'` code; wire menu/panel/group/slot-drop/create paths to the shared answers.
   Rewrite `src/tests/verification/cylinder-weld-guards.spec.ts`, retaining its filename and a
   header saying this is the deliberate completion of compound support. Its new positive tests
   must add a real neighboring link (a free mount alone still has nothing to weld), weld both
   mounts, and legally merge a welded elbow in both directions. Assert actual subset ownership,
   recognition and carried extra-joint coordinates, not only `canToggleWeld === true`.
   Add positive external slider/Slide and unweld/removal tests, plus negative tests for all
   three interiors across direct service, group, and merge entry points. Check the internal
   seal and weld survive every operation. Replace the old lifecycle `'welded-mount'` assertion
   at about 401 with successful preserved topology, and retain unrelated refusal tests.
6. **Visual and integration gate.** Extend a targeted cylinder mount E2E flow covering toggles,
   gray reasons, live drop ring, grounded/floating mount slot drops, skin versus neighboring
   leaf selection, undo/redo, paused editing, and a second partition. Capture filmstrips for
   compound drags and animation (extra bracket joint and external block visible), inspect them,
   and obtain the UI review required by `CLAUDE.md`/the UI validation skill. Run the relevant
   cylinder-attach/attach-cylinder, cylinder-drag/panel/skin/end-on-joint, phase4/phase5,
   context-menu, and multi-select suites named in the brief; no wholesale hour-long E2E batch.
   Finish with the full unit suite and production build plus the repository UI-copy check.

Use `npm test -- --watch=false --include='<spec path>'`, not bare Vitest. Existing specs also
include `cylinder.spec.ts`, `cylinder-travel`, `cylinder-forces`, `cylinder-naming`,
`driven-cylinder`, `driven-cylinder-kinematics`, `model/cylinder-layout.spec.ts`, and
`services/transcoding/url-sealed-cylinder.spec.ts`. Assert solver residuals at its numerical
tolerance and coordinate identities at its four-decimal output precision; URL round trips
need codec quantization tolerance. Do not weaken travel or rigidity tolerances to pass tests.

New verification mechanisms belong in `FIXTURE_GALLERY`; run `npm run fixture-urls` in the
same change. Use a fresh disposable browser profile, `localhost`, and the documented Playwright
location. Format only edited files; Markdown is intentionally ignored by Prettier. Use American
English in new text and identifiers, and comments explaining why. Work and commit on `staging`;
never push `main`. This planning commit does not require runtime tests because it changes only
this document; the gates above are obligations of implementation, not claimed results.
