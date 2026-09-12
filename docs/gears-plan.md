# Gears in PMKS+: architecture and implementation plan

> **Status:** Partly built — fixed-axis external V1 now includes the computational foundation, solver, persistence, native UI and lifecycle workflows. Later gear families remain planned. Original architecture review: September 12, 2026, through `4c03c712bc1347ca64d744f26e9d6b8abd0ac8bf`. See the [production handoff](gears-production.md) for current scope, verification and the playable application; the [Stage 1/2 report](gears-implementation.md) records the earlier foundation.

The maintainer's scope is ideal circular planar gears driving existing PMKS mechanisms, with
one independent input per connected mechanism. Teeth do not participate in simulation. This
was originally a source-level architecture assessment. The implementation report distinguishes
the tested computational stages from the remaining V1 requirements. Recheck interfaces during
later stages because solver-explanation work is developing independently. Names in the later-stage
implementation map remain proposals unless the report identifies them as implemented.

**Recommendation:** a gear is an attachment to an ordinary rigid link; a mesh is a separate
relationship. Compile fixed-axis gear dependencies into body rotations, then supply their
positions and derivatives to the existing moving-boundary constraint solver. Dependent shafts
never carry `input = true`. No major solver rewrite is needed for this scope, but boundary
construction, mobility, sampling, and document lifecycle require explicit changes.

Reading guide: [solver design](#3-solver-integration-design),
[V1 scope](#5-v1-scope), [test plan](#11-test-plan),
[implementation map](#16-file-by-file-implementation-map),
[first milestone](#18-recommended-first-vertical-slice), and
[acceptance criteria](#19-concrete-v1-acceptance-criteria).

## Corrections to the earlier plan

Stage 1/2 implementation discoveries:

- The existing position recorder rounds to four decimal places. Geared coupled results retain
  full precision so rounding cannot violate the full constraints immediately after convergence.
  Gear-free recording stays unchanged. The existing nonlinear kernel's length convergence
  threshold is 1e-6; the full-cycle four-bar test uses that established tolerance.
- The pure compiler validates center spacing at 1e-8 relative tolerance. The serialization
  allowance discussed in §10 belongs to a later document-boundary workflow: applying its
  absolute floor to unquantized, small computational fixtures accepted separated pitch circles.
  Future loading must explicitly handle rounding and minimum supported geometry.
- Prescribed gear placement is one operation; the existing zero-unknown route now retains
  an explicit analytic rate path. Full constraint/derivative auditing occurs before committing
  each geared candidate, not merely when graphs are requested.
- Initial limits are 128 gears, 256 meshes and 6,000 total samples, including the starting
  sample. Exact integer arithmetic remains bounded by safe-integer teeth and record limits.
  Steps divide an input turn into an integer number of intervals while keeping the fastest
  gear's increment at or below one degree.
- Per-frame q is stored by Mechanism and indexed by snapshot identity for rate restoration.
  The temporary fixture viewer reads tested samples; it adds no gear editor or URL schema.

| Earlier proposal | Revised decision and reason |
| --- | --- |
| Put mesh residuals directly into the nonlinear solver | Eliminate fixed-axis gear coordinates analytically, then solve the remaining linkage. General angular mesh residuals are a later capability. |
| A center and body reference suffice | Also require a noncoincident reference/attachment joint. Current bodies have no independent orientation coordinate. |
| Compound trains in V1 | V1.1; retain a body-based model that accommodates them without adding editing/layering complexity now. |
| Persist mesh phase separately | V1 derives assembly phase from the authored start pose. Runtime continuous travel and decorative phase are separate concepts. |
| Meshing can reposition gears | V1 validates existing placement; no automatic resizing, fitting, or movement. |
| Reject multiple inputs | Check before `reconcileOneInputPerMechanism`, which currently removes extra flags, and before load reconciliation. |
| Optional tags imply backward compatibility | New readers preserve old documents; the inspected old reader rejects unknown tags as invalid locks. |
| Force support for unrelated machines needs no work | Current force readiness aggregates runnable machines. Per-machine eligibility needs an explicit change. |
| Generic serialization tests are enough | Existing coordinates round to thousandths; define center-spacing and angular precision behavior. |

## 1. Current PMKS architecture relevant to gears

### 1.1 Physical model and input

| Area | Current implementation and implication |
| --- | --- |
| Editable state | [MechanismService](../src/app/services/mechanism.service.ts) owns joints, links, and forces. `updateMechanism` restores the start, normalizes cylinders, partitions, reconciles inputs, and builds/caches simulations. New behavior belongs in narrow modules; the hub delegates. |
| Joints | [joint.ts](../src/app/model/joint.ts): `Joint` extends `Coord`; `RealJoint` adds graph membership, ground/input flags, `driveSpeed`, welding, and edit locks. `RevJoint` has no angular coordinate. Rotation is relative motion between bodies. |
| Prismatic joints | `PrisJoint` stores a guide angle or carrier and slot endpoints. Grounding fixes its guide, not its translation. It cannot stand in for a fixed gear axis. |
| Links | [link.ts](../src/app/model/link.ts): `RealLink` carries point geometry, mass/CoM/inertia, and artwork; `SliderBlock` is a separate kind. Welded roots hold leaves in `subset`. `isCircle` changes appearance only. |
| Rigid bodies | [rigid-bodies.ts](../src/app/model/rigid-bodies.ts) groups links sharing two joints; [bodies.ts](../src/app/model/mechanism/bodies.ts), `assignBodies`, adds slide welds and the world. Group IDs are derived. One shared grounded pin does not fuse bodies. |
| Actuator | [actuator.ts](../src/app/model/actuator.ts), `resolveActuator`, derives a reference body, driven body, and angle/length kind. `describeActuator` requires two incident bodies and a noncoincident `angleReference` for angular drives. Incident ordering matters. |
| Speed | `driveSpeed` is signed rpm for pins, project length/second for sliders. `inputVelocityFor` converts to radians/second or model length/second. Zero means use the default. Direction wording uses [drive-direction.ts](../src/app/model/drive-direction.ts). |
| Partitions | [mechanism-partition.ts](../src/app/model/mechanism/mechanism-partition.ts) joins moving bodies at nongrounded joints. `ownJoints` means ownership; `joints` includes shared frame. Meshes must join partitions without fusing bodies. |

A loose revolute center is not a rotating disc. A one-point `RealLink` around a grounded center
has all its joints grounded and can be classified as world. It also supplies no actuator angle.
This is the body-representation gap that must be resolved before solver integration.

### 1.2 Simulation and analysis

[Mechanism](../src/app/model/mechanism/mechanism.ts) deep-copies a partition and rebinds its
joint/link/subset/force graph, checks mobility and input, precomputes positions, and captures
static solver state for later graph/export queries.

| Stage | Existing behavior |
| --- | --- |
| Mobility | `determineDegreesOfFreedom` uses `3(N-1)-2J1-J2`, with `J2 = 0`. Counts below 1 may be rescued by [mobility.ts](../src/app/model/mechanism/mobility.ts), whose pin/slide Jacobian and second-order tests inspect actual freedoms. |
| Position ordering | [position-solver.ts](../src/app/model/mechanism/position-solver.ts), `determineJointOrder`, starts from ground and the first input. A grounded pin emits `incrementRevInput` for its driven-body points; ordinary geometric operations solve outward. |
| Coupled positions | `routeCoupled` / `orderCoupledPartition` solve unplaced points through [simultaneous-solver.ts](../src/app/model/mechanism/simultaneous-solver.ts), which provides damped nonlinear solving, rank/residual checks, and branch prediction. Prescribed points can be moving boundary data. |
| Admission | `boundaryDrivenSystem` has restrictive shape/square-row checks. The explicit coupled route's `admitCoupledSystem` allows redundant equations with full unknown-column rank and valid starting residuals. |
| Rate routes | [kinematic-solver.ts](../src/app/model/mechanism/kinematic-solver.ts), `solveRates`, first asks `PositionSolver.constraintKinematics`, then uses legacy loop/loopless paths where appropriate. Coupled failures cannot fall back to loops. |
| Boundary rates | `boundaryMotion` recognizes ground and one input's connected points, refusing other prescribed moving points. The kernel `constraintRates` already accepts arbitrary boundary velocity/acceleration maps, including their second-order contributions. |
| Body results | `applyConstraintKinematics` derives angular and CoM rates from point rates. Missing point rates default to zero here, so every moving boundary point must be supplied. |
| Sampling | `findFullMovementPos` uses nominal one-degree input steps, subdivisions, rollback, and reversal. It limits closure to three input turns and 6,000 samples. Rollback has no gear travel state yet. |
| Playback | Elapsed time advances precomputed frames. [drive-profile.ts](../src/app/model/mechanism/drive-profile.ts) already represents a full multi-turn cycle, but infers travel by unwrapping geometry. |
| Graphs/tables | [AnalysisSampleService](../src/app/services/analysis-sample.service.ts) restores per-machine solver state and caches samples. Current angular position is geometry-based, not a general continuous shaft-angle series. Exports share the sampler. |
| Forces | [force-solver.ts](../src/app/model/mechanism/force-solver.ts) builds body force/moment equilibrium, pin/guide reactions, guide couples, and one input effort. There are statuses and diagnostics, but no mesh reactions. Dynamic difference fallbacks cannot supply missing force constraints. |

Position dispatch is a string-valued `desiredAnalysisJointMap`, not a general `SolveType` enum.
A new named operation can fit there without inventing another independent driver type.

### 1.3 UI and lifecycle

| Area | Current seam |
| --- | --- |
| SVG | [new-grid.component.html](../src/app/component/new-grid/new-grid.component.html) has model-frame layers for links, joints, motors, traces, and ghosts. The component handles gestures; [SvgGridService](../src/app/services/svg-grid.service.ts) converts coordinates. |
| Selection | [ActiveObjService](../src/app/services/active-obj.service.ts) has a closed union; [selection.ts](../src/app/model/selection.ts) provides typed joint/link/force references and multi-selection. Gear selection needs plumbing, not just artwork. |
| Actions/properties | [ContextMenuBuilderService](../src/app/services/context-menu-builder.service.ts) builds actions; [EditPanelComponent](../src/app/component/edit-panel/edit-panel.component.ts) and [AnalysisPanelComponent](../src/app/component/analysis-panel/analysis-panel.component.ts) dispatch properties/results. Reuse BLOCKS. |
| Permission | [edit-permission.ts](../src/app/model/edit-permission.ts), [EditPermissionService](../src/app/services/edit-permission.service.ts), [lock-set.ts](../src/app/model/lock-set.ts), and [hold-solver.ts](../src/app/model/hold-solver.ts) distinguish simulation state, edit locks, and dimension holds. |
| Transactions | `capturingPose`, `editingAtStartPose`, `finishStructuralEdit`, and `updateMechanism(true)` are existing seams. [anchor.ts](../src/app/model/mechanism/anchor.ts) stores input coordinate, topology, direction, and branch seed. Its owned-joint topology cannot see a mesh-only change. |
| Save/share | [UrlGenerationService](../src/app/services/url-generation.service.ts) encodes the start. [TopBarComponent](../src/app/component/top-bar/top-bar.component.ts) saves `.pmks` text, reads files through `UrlProcessorService`, and copies share links. |
| Codec | [StringTranscoder](../src/app/services/transcoding/string-transcoder.ts) validates records and optional tags, with checksum/digest. [MechanismBuilder](../src/app/services/transcoding/mechanism-builder.ts) creates objects and resolves references. |
| Undo/recovery | [SaveHistoryService](../src/app/services/save-history.service.ts) stores URL strings; [last-drawing.ts](../src/app/services/last-drawing.ts) keeps the current one in session storage with persistent fallback. History also restores appropriate paused views/selections. |
| Copy/duplicate | Share-to-clipboard exists. No general object clipboard paste workflow was found. `duplicateLink` and [SelectionBatchService](../src/app/services/selection-batch.service.ts) duplicate selections with dependency closure and object maps. |
| Deletion | `deleteJoint`, `deleteLink`, `deleteMechanism`, `deleteAll`, and structural cleanup cascade through existing parts. Deleted IDs can be reused. |
| Tests/examples | [fixture.ts](../src/test-utils/verification/fixture.ts) builds declarative fixtures; [fixture-gallery.ts](../src/test-utils/verification/fixture-gallery.ts) publishes URLs. Library examples live in `component/MODALS/templates/`; tutorial progression uses `model/tutorial-steps.ts` and `services/tutorial.service.ts`. |

## 2. Proposed conceptual/data model

Use a plain `Gear` record attached to an ordinary `RealLink`, and a separate `GearMesh` record.
Do not subclass `RealLink`: several clone/solver paths switch on exact constructors. Do not
add a gear joint type or make a mesh a bar between gear centers.

A V1 host is a simple link with a grounded center `RevJoint` and a distinct, noncoincident,
nongrounded reference/attachment point. Additional ordinary attachment points are allowed.
Creating a standalone gear creates this body and its two points atomically. The off-axis point
is visible and usable as a crank pin/tracer. It is a point on a rigid body, not a fictitious
contact joint. Its distance from center is independent of pitch radius. Idlers also have it.

Attaching a gear to an existing grounded crank reuses its body/points. One shared grounded
center does not transmit rotation between separate links. A connecting rod pinned at the
off-axis crank point is still a different body. A future center-only rotor would require a
broader angular-body-coordinate model, which is unnecessary for this V1.

| Proposed persisted field | Responsibility |
| --- | --- |
| `Gear.id` | Stable identity in a separate gear namespace. |
| `Gear.hostLinkId` | Host address, explicitly remapped during rename/copy; never a derived body-group ID. |
| `Gear.centerJointId` | Center on the host. Ground remains a joint property. |
| `Gear.referenceJointId` | Stable direction point, independent of mutable joint ordering. |
| `Gear.teeth` | Positive integer. |
| `Gear.module` | Pitch diameter per tooth, using model lengths internally and project units in the URL. |
| `Gear.name` | Optional label. Color initially inherits the host. |
| Optional `Gear.toothOffset` | Decorative phase only, if rendering needs it. Omit initially when unused. |
| `GearMesh.id` | Stable relationship identity for selection/deletion/diagnostics. |
| `GearMesh.gearAId`, `gearBId` | Distinct endpoints, canonical order in storage, physically symmetric relationship. |
| `GearMesh.kind` | V1 accepts only `external`; later versions can add internal. |

Derived information: pitch radius/diameter, signed ratio, direction, angles/rates, spacing,
start headings, body groups, adjacency, rank, eligibility, and period. No separate ratio,
shaft-speed, or `compound` flag. Assembly phase is derived from start geometry (§3); no duplicate
mesh phase constant. Later internal gears may need a tooth-side/type property for unmeshed ring
rendering; derive permitted mesh kinds from that or validate consistency rather than allowing
contradictory flags.

Keep document collections in `MechanismService`, with mutations delegated to a new `GearService`.
Pure compilation/validation helpers inject nothing. Hub reconciliation calls pure helpers,
avoiding a service injection cycle.

`hostLinkId` is an address, not identity across topology edits. Capture affected attachments
before discarding objects and supply explicit old-to-new mappings. Reuse duplication maps;
never infer attachment from nearest coordinates or reused IDs. Gear IDs survive renames and
rebuilds; copies get fresh IDs. V1 refuses weld/unweld/merge operations that would ambiguously
split or fuse a gear host, before mutation. Removing the gear attachment permits that unsupported
rewrite. Deletion remains allowed and cascades. V1.1 supplies deliberate leaf/root remapping.

Simulation snapshots own immutable definitions/compiled relations and per-sample travel, with
IDs resolved against snapshot bodies rather than mutable editable references.

## 3. Solver integration design

### 3.1 Dependent coordinates and boundary motion

Let `q` be signed continuous input travel from the authored start, in radians. Compile an exact
signed rational multiplier `a_i` for each gear body, with input multiplier 1:

```text
theta_i = theta_i_start + a_i q
omega_i = a_i q_dot
alpha_i = a_i q_ddot
External mesh A--B: a_B = -(N_A/N_B) a_A
```

This eliminates dependent coordinates; it adds neither independent inputs nor actuator efforts.
For fixed center `c` and a point's start offset `u`, the prescribed motion is:

```text
p = c + R(a_i q) u
r = p - c
v = omega_i (-r_y, r_x)
a = alpha_i (-r_y, r_x) - omega_i^2 (r_x, r_y)
```

`BoundaryMotion` already expresses these maps. Extend the builder, not the rate kernel's
mathematics. The remainder of the linkage can use the same simultaneous position/rate equations.

V1 is forward-driven: the independent input is a grounded revolute input on a gear host and
all gear networks in its partition are reachable from that body through meshes/body membership.
An arbitrary upstream linkage driving an otherwise unprescribed gear network, floating/prismatic
independent inputs in geared partitions, and moving axes are later scope. Existing gear-free
mechanisms retain their current input support.

### 3.2 Alternatives

| Route | Assessment |
| --- | --- |
| Mark output centers as inputs | Incorrect: reconciliation removes flags; solvers pick one input; effort/rate assumptions do not represent dependencies. |
| Scale clocks on independently solved machines | Incorrect integration: no common constraints, validation, or complete coupled analysis. |
| Gear placement followed only by geometric walk | Possible later optimization, but already-known constraints can be missed and legacy rates still assume one input. |
| **Analytic gear boundary + coupled remaining linkage** | **Recommended V1:** reuses numerical kernels, with boundary generalization and full verification. |
| General mesh residuals inside nonlinear solve | Useful for moving centers/unprescribed rotors later; requires angle-branch and derivative infrastructure not needed for eliminable fixed-axis ratios. |

Do not begin by extracting a universal solver framework. Extend the existing emitter/coupled
entry points narrowly. Future transmission compilation may choose analytical or implicit routes.

### 3.3 Proposed execution sequence

```mermaid
flowchart TD
  A[Validate records and host bodies] --> B[Partition with joints and mesh edges]
  B --> C[Check one input and combined mobility]
  C --> D[Compile rational body dependencies]
  D --> E[Choose continuous travel q]
  E --> F[Place all prescribed body points]
  F --> G[Solve remaining linkage points]
  G --> H[Verify all constraints and continuity]
  H --> I[Commit pose and q or roll back]
  I --> J[Analyze using every boundary rate]
```

1. Preflight structural records/input conflicts before reconciliation; partition using meshes.
2. Resolve hosts through `assignBodies`, validate eligibility/mobility, compile the motion plan.
3. Add one operation such as `prescribedGearBodies` to existing string dispatch. It places input
   and dependent bodies once per sample. Legacy input increments must not also write these points.
4. Pass prescribed IDs to the explicit coupled route and reuse `collectConstraints` and
   `solveSimultaneous` for the remaining points. Preserve all gear-free routing.
5. Generalize `boundaryMotion` to the plan, including every host point even when no equation
   mentions it. Fixed revolute centers have zero rates; sliders require their existing semantics.
6. Extend `PositionSolverDriveState` capture/restore with the immutable plan and sample-travel
   access; retain correct per-mechanism restoration for random-access chart/export queries.
7. Preserve an explicit gear/coupled rate route. Failure cannot fall back to legacy loops or zeros.

**Zero unknowns requires an explicit branch.** A standalone pair has every point prescribed.
Verify its constraints and return analytical body/point rates without sending an empty system
to the kernel. The current `nothing-to-solve` path must not lose the route and select the
one-body loopless rate calculation.

**Two writers is an error.** If prescribed bodies claim the same moving point, compare position
and rate values and refuse disagreement; do not let map insertion order choose. Shared fixed
centers alone do not couple rotations.

### 3.4 Complete constraint verification

The current emitter omits equations not touching unknown points. Several prescribed bodies
make that unsafe: a rigid bar between known crank pins can be violated while the reduced solve
succeeds. Retain a full geometric constraint view as well as the reduced numerical system.
The emitter can collect all joints for that view.

At every candidate sample, verify original rigid offsets/distances, pins, slots, and welds,
plus eliminated gear relations. Verify derivative consistency for prescribed-only constraints
too. Initial admission alone is insufficient. Commit only after full residual and existing
branch/continuity checks pass. Otherwise roll back pose and `q`, then subdivide within limits.
A contradictory assembly is a setup failure, not an invitation to jump phase. Genuine isolated
travel limits can use existing reversal semantics; instantaneous reversals have no finite
acceleration and must produce an analysis gap at the event.

### 3.5 Gear chains, cycles, and phase

Build adjacency on bodies, retaining gear endpoints/counts on edges. Traverse once from the
input with reduced rational arithmetic. On revisiting a body, compare its proposed multiplier
exactly. A freely moving closed cycle requires signed ratio product 1. Odd external loops
lock the train; unequal compound loops can too. Report the conflicting edges. Compatible
redundant loops are allowed if geometry and combined mobility hold. Reject duplicate records
separately. Compile in O(bodies + meshes), not recursively per gear per frame.

Prefer reduced `bigint` numerators/denominators or equivalent checked exact arithmetic, converting
to floating point only for bounded sampling. Do not decide topology with a floating-point epsilon.

V1 takes the authored start pose as the assembled timing relationship:

```text
N_A (theta_A - theta_A_start) + N_B (theta_B - theta_B_start) = 0
```

There is no second persisted phase constant. Change timing by unmeshing, repositioning the
body/reference/crank arrangement, and remeshing. A later explicit affine-phase editor must
validate offsets around loops too. In V1, phase references taken from one start snapshot are
consistent by construction; ratio/derivative contradictions still matter. Tooth artwork phase
must never alter linkage timing.

Save `q` with each accepted sample. Recover headings from it and start geometry rather than
repeatedly unwrapping `atan2`. Include it in attempt rollback, per-machine state, reversal, and
interpolation. Backward/random scrubbing reads saved travel, not the last inspected frame's
winding. Only drawing wraps angles. Continuous plots span one full mechanism cycle; restarting
loop playback may explicitly reset the displayed cycle rather than claim unlimited turns.

### 3.6 Period, stepping, and budgets

For body multiplier `p_i/d_i`, complete rotor orientation repeats after `LCM(d_i)` input turns,
including idlers/reference marks. 20T→40T→20T therefore needs two turns despite end ratio +1;
20T→100T needs five. Replace the three-turn assumption for geared partitions only. Check whole
linkage pose/branch closure at multiples of the gear period, with a bounded search for further
multiples. Gear period alone is not proof of linkage closure.

Use nominal input steps no larger than `1 degree / max(1, max(abs(a_i)))`, then existing adaptive
subdivision/branch checks. A rotor-motion bound does not guarantee a nonsingular linkage solve.
Sample duration is actual `delta q / input speed`, not a fixed degree's time. Retain the current
6,000-sample ceiling initially; reject predicted minimum cycles that exceed it and bound retry
work too. Never round ratios or truncate cycles to claim closure.

Include gear dimensions, attachment IDs, and mesh topology in `solveFingerprint`. Cache artwork
separately. Store sample `q` plus a compiled plan rather than redundant gear copies. Benchmark
the pair, five-turn pair, four-bar, and long train before considering workers or larger budgets.

## 4. DOF/constraint treatment

A mesh is one scalar rotational relation between distinct bodies, not a lower pair. Grounded
pins already fix center translations; center distance is V1 assembly validation, not another
independently subtracted mobility row.

For nonredundant assemblies use `M = 3(N-1)-2J1-J2`, one higher pair per independent mesh:

- Two rotor bodies plus world: `3*2 - 2*2 - 1 = 1`.
- Four-bar plus input rotor and one mesh: four moving bodies, five lower pairs, one higher
  pair, giving `12 - 10 - 1 = 1`.

The input commands that remaining freedom. Analytical elimination must not subtract dependent
coordinates as additional physical constraints.

Add angular mesh rows to `mobility.ts`'s body Jacobian and finite-displacement residuals. A
fixed-axis external row has normalized tooth-count coefficients on its two body-angle increments.
Update `constraintsOf`, `rowsFor`, `residual`, and `scaledStep`'s constraint-body traversal,
not just the top-level count.

For geared partitions, ask the full geometry model even when the count says 1. Use its second-order
test to distinguish actual motion from instantaneous freedom, then require one surviving freedom
before applying the input. Graph consistency is separately necessary. Preserve the count/rescue
policy for gear-free mechanisms.

Report no input, multiple inputs, excess freedom, locked mesh cycles, geometric overconstraint,
singular start, travel limits, and resource limits distinctly. A redundant gear loop can remain
1-DOF; a ratio-compatible train attached to incompatible linkage geometry may still be immobile.


## 5. V1 scope

V1 supports fixed-axis external circular gear pairs, idlers, and simple connected trains, with
one grounded revolute input on a gear host. One gear per simple host link in the UI. Each host
has a visible off-axis reference/attachment point. Gears attach to existing simple grounded
cranks and drive four-bars or other linkage topologies supported by the coupled route. Unsupported
attached arrangements produce explicit refusals.

Included: tooth/size editing, automatic signed ratios, rendering/selection, explicit meshing,
animation/scrubbing, position and continuous angular position, angular velocity/acceleration,
linkage point rates, Save/Open/Share/reload, undo/redo, deletion, safe duplication, unit conversion,
validation, and automated tests. A gear-bearing body is analyzed as part of the same mechanism,
not as a separately timed drawing.

**Compound trains belong in V1.1.** Their mathematics fits the body-based graph, but multiple
attachments, layered selection, and leaf/root lifecycle add unnecessary first-release risk.
Do not add a `compound` flag. A standalone rotating pair proves the first milestone; V1 is
complete only after `input → 20T → 40T → existing four-bar crank` works end to end.

## 6. Explicit non-goals

V1 excludes individual tooth contact, involute contact mechanics, backlash, deformation, contact
stiffness, friction, lubrication, efficiency maps, transmission error, vibration, Hertzian stress,
AGMA strength, bevel/worm gears, helical gears requiring 3-D effects, and arbitrary 3-D transmissions.
It does not promise manufacturing geometry or gear-interference clearance.

Later: compound editing, internal gears, rack and pinion, planetary systems, noncircular timing,
automatic synthesis, and automatic placement. V1 also excludes arbitrary linkage-to-gear feedback
networks, moving gear axes, extra independent motors, programmable drive profiles, a new physical
shaft-brake feature, and geared force analysis. Existing non-gear features stay supported.

## 7. Geometry inputs and editing workflow

The maintainer explicitly reaffirmed the [PMKS+ UI gallery introduction](https://docs.pmksplus.com/?path=/docs/introduction--docs)
as guidance for this work. Its [repository source](../src/stories/docs/introduction.mdx)
defines the UI implementation contract:

- Find the existing component in the gallery before building a gear control. Use `input-block`
  for fields, `segmented-block` for choices, and the established action, structure and feedback
  components. Extend a shared block when it lacks a needed capability; add its new state to
  the gallery. Do not copy another panel's markup/styles to create a parallel control.
- Follow the [UI style guide](ui-style-guide.md), [vocabulary](ui-vocabulary.md), and named
  design tokens for layout, wording, colors, radii, shadows and gaps. The gallery renders these
  repository guides; maintain the originals rather than creating a second gear-specific rulebook.
- Provide one story per relevant state: default, disabled with a reason, invalid, and dense or
  long-label cases. Gear fields, mesh refusals and selection states must be reviewable without
  constructing a mechanism to reach them.
- Put block stories in `src/stories/blocks/` and shared-component stories in
  `src/stories/shared/`. Use real component inputs and minimal service stubs from
  `src/stories/support/stubs.ts`; never instantiate the real `MechanismService` in a story.
- Validate branch changes in the local gallery as well as the running app. The hosted gallery
  reflects staging, so it cannot demonstrate an unmerged implementation. The introduction
  describes canvas-entity stories as planned; do not assume that reusable gear artwork exists.

### 7.1 Canonical dimensions

Persist tooth count `N` and module `m`; derive `r = mN/2` and `d = mN`. Module uses model-length
units in memory and project units at the codec boundary, with one `MODEL_SCALE` conversion.
`updateLinkageUnits` converts module as a length once; teeth and ratios are dimensionless.
Conventional metric module is mm/tooth; when showing a project-unit value, label the units.
Diametral pitch is an alternate view, not another stored property (`P_d = 25.4/m_mm` teeth/inch).

For V1, use **Teeth** and **Pitch Diameter** as editable fields, and show module read-only as an
explanatory value. Diameter edits derive module. Tooth-count edits retain module and update
diameter; show the resulting size and required spacing in the edit preview. Do not let those
dependencies be discovered only after committing. An advanced module/diametral-pitch editor can
later edit the same canonical value.

Pressure angle is unnecessary for the ideal position/rate model, so it is not a V1 field or
compatibility claim. Do not impose a manufacturing minimum tooth count as a kinematics rule:
require positive safe integers and explicit software limits. Matching pitch module and center
spacing are the compatibility rules for V1's standard, unshifted external pitch circles. Profile
shift and involute interference are outside this model.

### 7.2 Creation and meshing

1. **Attach Gear** on an eligible grounded crank reuses its host/points. On a center joint with
   exactly one eligible host, offer that host; otherwise require an explicit body selection.
2. **Add Gear** on the canvas creates the body, grounded center, and visible reference point
   through normal placement gestures, as one transaction. The ground mark means a fixed axis,
   not a locked shaft angle.
3. Set Teeth/Pitch Diameter. Draw the reference point separately from the pitch outline so
   crank geometry cannot be confused with gear size.
4. **Mesh With…** selects another gear and previews actual/required spacing, tooth counts,
   signed output/input speed ratio, and direction. Escape cancels without saving.
5. Commit only a compatible mesh. Never move centers, resize partners, or remove inputs
   implicitly. If two previously independent machines both have drivers, name them and require
   removal of one input before connecting the mesh.
6. Set the root input through existing input controls. Dependent gears show **Driven by …** and
   derived rates, with no independent RPM field or motor badge. Playback has one mechanism row.

V1 **validates existing placement**. Normal coordinate editing plus the displayed required
spacing is enough to assemble a pair. A later explicit **Place Meshing Gear** or **Fit Pitch
Size** action can preview automatic geometry changes; proximity will never create a mesh by itself.

### 7.3 Selection, changes, and deletion

| Action | Required V1 behavior |
| --- | --- |
| Select gear | Select its record, highlight host/center, show gear properties. Keep ordinary link selection accessible through the spoke/reference point and panel. |
| Select mesh | Use a small relationship marker or the gear panel's partner row. Show endpoints, ratio, spacing, and **Remove Mesh**. A mesh has no drag position. |
| Edit teeth/diameter | Refuse malformed values. Preview affected meshes; accept valid dimensions even if their existing meshes become incompatible, mark them invalid, and stop that partition until repaired. Never change partners automatically. |
| Move center | Use normal joint/body placement and lock/hold checks. A mesh is not an edit-time distance hold in V1. Invalid spacing blocks simulation, with required distance shown. |
| Move reference point | Edit ordinary host geometry; reference-arm radius is independent of pitch radius. Preserve start timing and continuous travel through the transaction. |
| Remove mesh | Preserve both gears/bodies and repartition once. Newly independent outputs may need a normal input assignment. |
| Delete gear | Remove incident meshes and metadata; preserve the ordinary host and points. This avoids unexpectedly deleting an existing linkage. Delete the link separately to remove that body. |
| Delete center/reference joint | Remove dependent gears/meshes in the same transaction, then existing joint/link deletion. Never rebind to a reused ID. |
| Delete host link | Remove attached gears/meshes, then normal force/orphan cleanup. |
| Delete mechanism/clear | Include every owned gear/mesh; leave no dangling cross-partition references. |
| Duplicate | Copy selected hosts/gears with existing mapping; copy meshes only when both endpoints are copied. Never connect copies back to originals or expand to the whole train unexpectedly. |
| Weld/unweld/merge a gear host | Refuse unsupported rewrites before mutation in V1; removing the gear attachment permits the operation. V1.1 adds explicit remapping. |
| Invalid drawing | Keep inspection, repair, deletion, Save, and Undo available. No animation or analysis of invalid geared partitions. |

Quote `EditPermissionService` and the gear validation model from every surface. Reuse the context
menu and BLOCKS, keyboard focus behavior, phone sheet, and long-press support. No gear-only mode,
new floating toolbar, or duplicate refusal logic in templates.

### 7.4 Paused-pose edits and one undo per gesture

Meshing, tooth/size changes, and attachment edits are structural/geometry transactions, not
cosmetic properties. Reuse `editingAtStartPose` to retain authored timing during such changes;
use `capturingPose` for allowed placement gestures, following mode-specific permissions.

Extend anchor context with gear relationship identity and **continuous travel at the displayed
pose**. Input headings separated by one full revolution may have different output poses; an
input angle modulo a turn and the owned-joint topology string are insufficient. When staging a
host at a displayed pose, transform its edited geometry back through the known `a_i q_display`
rotation before capturing the authored start. Do not reinterpret the displayed heading as a
new phase zero. For ratio edits, restore the authored start first and retain start body headings;
a subsequently restored paused view may legitimately change.

Mesh topology changes invalidate affected compiled/anchor relationship signatures. Capture the
new start explicitly. Undo/redo restores the encoded design; existing paused-view logic then
restores a compatible viewpoint. One operation creates one history entry, even when deleting
many incident meshes.

## 8. Rendering strategy

Use simplified **symbolic SVG teeth/ticks**, a true pitch circle, exact tooth-count label,
center, and a persistent orientation/spoke mark. Draw a dedicated SVG layer under `modelFrame`;
text uses `upright`. Cache path geometry by size/count and transform it by sampled rotation.
Reuse theme tokens and existing hover/selection/refusal conventions.

V1 does not need involute geometry. At high counts or low zoom, render bounded symbolic detail
with the exact `N T` label instead of thousands of segments. The pitch circle is the analytical
size; the symbolic tip outline is not a manufactured contact surface. Do not promise that
approximate teeth never pass through each other. This corrects the earlier plan's unsupported
visual-contact guarantee. A mathematical mesh must not depend on SVG collision detection.

Place a selectable mesh marker near the pitch-contact region and show a center-line overlay
when selected. Show invalid spacing with text as well as visual state. Leave point/link targets
accessible beneath the artwork. Include gear extents in fit-to-view, hit bounds, previews,
start ghosts, and image exports: the gear can be much larger than its host spoke.

V1.1 adds selection cycling/layer indication for compound gears. It does not need an axial
collision solver. V1 CAD exports must identify schematic pitch-circle output explicitly or
refuse geared CAD export; a decorative outline is not an involute fabrication drawing.

## 9. Persistence and backward compatibility

### 9.1 Additive versioned extension

Propose one optional trailing `G1~<payload>` entry containing all gear/mesh records. Its payload
is deterministic unpadded base64url-encoded UTF-8 JSON: no commas, dots, or `*`, stable record/key
ordering. This keeps existing joint and variable-length link records unchanged, retains precision
for new numbers, and versions the new feature locally. Measure URL size in fixtures before
replacing JSON with custom packing; do not change the legacy codec's global number precision.

Store attachments, teeth/module, and endpoint/kind records, not derived ratios, adjacency,
frame arrays, timestamps, or another speed. Start coordinates already encode assembly timing.
The existing checksum/digest covers the extension. No gears means no extension and unchanged
legacy output. The current `*` digest marker must remain absent from encoded payloads.

`GenericTranscoder` carries typed decoded gear data. A proposed narrow `gear-codec.ts` performs
payload validation/encoding; `StringTranscoder` dispatches the tag. `MechanismBuilder` resolves
hosts and reference points after links/subsets exist and before reconciliation. Extend active
selection tags/held selection snapshots for gears and meshes, reserving distinct letters beside
`ACTIVE_TYPE` instead of reusing joint/link/force identities.

### 9.2 Preflight and precision

Validate byte/record limits, version, field shape, finite numbers, integer teeth, unique IDs,
references, host membership, center/reference separation, duplicates, and input conflicts before
changing live state. Unknown versions or malformed topology reject the incoming drawing; never
drop its gears and present a different mechanism as the shared design.

`UrlProcessorService.updateFromURL` decodes before building, but rewinds the old view early and
the builder mutates services. Complete new checks before builder mutation; stage gear graph
construction or restore the previous document/pose if later construction can fail. A failed
load must preserve the prior design/history.

Distinguish structural corruption from a well-formed but invalid assembly. Mismatched spacing
or module may load with readiness blockers for repair. For multiple independent drivers in a
gear-connected partition, choose **preflight rejection** in V1 so reconciliation cannot silently
remove a driver. Normal edits refuse that new connection before modifying the drawing.

Existing `toUrlSafeDecimal` stores joint coordinates to `0.001` project unit. Even full-precision
gear module cannot prevent slightly changed center spacing/reference heading after load.
Canonicalize against the decoded start and use the tolerance policy in §10. Require repeatable
motion within propagated quantization error, not bit-identical floating-point samples across
the first legacy coordinate round trip. Repeated encode/decode cycles must not drift. Never
silently reposition centers or adjust radius to enforce exact contact.

New builds must read all old drawings unchanged. The inspected old reader treats unknown tags
as locks and rejects them, so new gear files are not forward compatible with that build. Verify
this with a baseline codec fixture and use feature deploy-preview URLs for new examples. Older
deployments may differ; do not promise their exact error wording.

### 9.3 Reuse every existing document path

The one encoding serves `.pmks` Save/Open, Share, undo/redo, and reload recovery once the records
are included. Test each entry point because pose/selection handling differs. No gear-only history
or browser-storage namespace. Convert module within `updateLinkageUnits` and the existing unit
change transaction.

Extend `SelectionBatchService`'s existing mappings and closure. Copy gears on copied hosts and
only meshes whose endpoints are both copied. A whole copied train receives fresh IDs and keeps
its internal input; an isolated copied output stays undriven/unmeshed. A duplicate does not gain
a shaft attachment because it lands at coincident coordinates.

## 10. Validation rules and failure behavior

Use one pure module returning structured codes, affected IDs, short reasons, and corrective text.
The loader, editing service, readiness, and solver all consume it. Separate schema/topology checks,
assembly checks, and per-sample numerical validation.

| Case | Outcome |
| --- | --- |
| Zero/negative/fractional/nonfinite tooth count | Refuse commit/malformed load; retain prior value. Never silently floor through the integer encoder. |
| Nonpositive/nonfinite size or overflow | Refuse commit/load; test radius/ratio arithmetic too. |
| Missing center/reference/host | Reject malformed data. Authorized dependency deletion removes gears/meshes transactionally. |
| Center not grounded revolute | Unsupported V1 assembly with a fixed-axis explanation; a grounded slider is not eligible. |
| Coincident center/reference | Refuse: no measurable body orientation. |
| Ambiguous/world/block/unsupported compound host | Require an eligible explicit body; no first-link guess. |
| Coincident gear centers | Refuse an external mesh; a compound shaft is a different future relation. |
| Incompatible module | Refuse new mesh; mark an existing one invalid after valid property edits, with both values shown. |
| Too far apart/incorrect pitch overlap | Refuse new mesh or block current motion; show actual and required spacing. |
| Duplicate, self, or same-body external mesh | Refuse and name the existing relation or rigid-body contradiction. |
| Inconsistent ratio cycle | Identify the locking cycle; never ignore a closing edge. |
| Compatible redundant cycle | Allow only with compatible geometry and one surviving total freedom. |
| Several inputs entering one network | Refuse new mesh before reconciliation; reject conflicting loaded records in preflight. |
| No root input/unreachable gear network | No-input or unsupported-dependency diagnosis; never invent a driver. |
| Gear relation conflicts with linkage | Full mobility/residual failure; no partly updated frame may escape. |
| Singular starting geometry | Existing branch/singularity diagnosis; do not nudge gear phase silently. |
| Excessive/failed step | Roll back positions, boundary history, and `q`; retry/subdivide within limits. |
| Travel reversal | Preserve ratios in both directions; report no finite acceleration at an instantaneous reversal. |
| Period/work limit | Explain required period/resolution and supported budget; no truncated loop. |
| V1 force request | `unsupported-topology` with a gear-specific reason at UI and direct computational/export entry points. |

**Tolerance policy:** module comparison uses a tight relative tolerance for new full-precision
fields, independent of screen zoom/object scale. Center-distance comparison uses a named absolute
floor for coordinate quantization plus a small relative term tied to pitch size. Two rounded
centers can change separation by up to `sqrt(2)*0.001` project unit. Proposed initial allowance:
`0.002` project unit plus `1e-6*max(requiredDistance, actualDistance)`, converted to model units
once. This is a serialization allowance, not physical backlash.

If that floor becomes material relative to a tiny radius, refuse geometry below supported
precision instead of accepting visibly incorrect meshes. Test thresholds in cm, m, and inch
documents with non-axis-aligned centers. Reference-angle uncertainty depends on arm length;
reject nearly coincident references and propagate the remaining error in round-trip tests.
Numerical solver residual tolerances stay scale-aware and stricter than placement/load allowances.

Positive integer tooth counts alone do not bound work. Before release choose and document
explicit limits for records, JSON bytes, symbolic path detail, ratio arithmetic, and samples.
Only the existing 6,000-sample ceiling is fixed by this plan; other limits should be justified
by the first-milestone benchmarks, not invented as physical gear constraints.


## 11. Test plan

Tests below are implementation gates, not results of this planning task. Reuse declarative
fixtures, `buildMechanism`, `buildMechanismAtScale`, and the production load/solve path.
Add fixtures to `FIXTURE_GALLERY`, extend `fixturePayload`, and regenerate
[fixture-urls.md](fixture-urls.md); reviewers must be able to open the exact tested mechanisms.

### 11.1 Required mechanism matrix

| Case | Fixture and independent expectations | Release |
| --- | --- | --- |
| A: pair | 20T → 40T, nonzero authored headings. `delta theta_B = -0.5 delta theta_A`, 60 rpm → -30 rpm; two input revolutions close the complete pose. Absolute angles include their initial offsets. Test both drive signs. | First slice |
| B: idler | 20T → 40T → 20T: output multiplier +1, idler -0.5; complete cycle still needs two input turns. Changing only the idler count, with compatible placement, preserves endpoint ratio but can change cycle length. | V1 |
| C: compound | 20T A → 40T B; 10T C rigid on B's shaft → 30T D. B/C have equal angular increments and rates; D/input = +1/6. Different reference headings on B/C remain constant offsets. | Pure compiler extension test where body grouping is supported; end-to-end V1.1. V1 editor/loader explicitly refuse unsupported compound hosts. |
| D: linkage | 20T → 40T → length-1 crank in a four-bar with ground 4, coupler 3, rocker 3. Verify all points, constraints, velocities, accelerations, branch continuity, and cycle closure. Exactly one input flag. | Mandatory architecture proof following first slice |
| E: persistence | Save/reload URL and .pmks through the real decoder; same authored mechanism, input, gear references, ratios, cycle and motion within documented coordinate/phase precision. Repeated encode/decode stabilizes rather than accumulating drift. | First slice |
| F: lifecycle | Create/mesh/delete/undo/redo are single coherent transactions. Delete center/reference/host; duplicate whole and partial trains; undo invalid states; reuse deleted IDs without reconnecting stale meshes. | First slice plus full V1 coverage |
| G: refusal | Odd external triangle locks; duplicate edge refuses; inconsistent spacing/module refuses; compatible redundant even cycle is not rejected just for being cyclic. Add an ordinary rigid bar between two prescribed crank points that is valid initially but incompatible in motion: reject it through mobility/full-constraint auditing. | V1 |

The four-bar is an independent linkage reference, not an assertion of the gear compiler's own
formulas. Compare its trajectory against the existing ordinary four-bar driven at the output
gear's heading/speed, and against link-length closure and derivative residuals.

### 11.2 Unit, numerical, and integration coverage

| Area | Required checks |
| --- | --- |
| Ratio graph | Reduced rational products; endpoint order independence; nonzero phase; idlers; branched trains; disconnected networks; consistent/inconsistent cycles; large integers and bounded arithmetic. |
| Motion | Analytic pair angles/rates, fixed centers, arbitrary off-axis points. Constant-rpm shaft angular acceleration is zero; centripetal point acceleration is nonzero. A pure provider test with accelerated q verifies the alpha ratio without adding a new user speed-profile feature. |
| Solver boundary | Pair with zero unknown points; closed linkage with unknowns; multiple prescribed bodies; shared prescribed points; complete rate maps; redundant rows; all-prescribed constraints; failure never falls back to legacy loop rates or leaves a partial pose. |
| Derivatives | Centered finite differences at nonsingular interior frames, with step refinement, plus differentiated geometric residuals. Include nonzero four-bar rocker/coupler angular acceleration under constant input speed. Exclude reversal instants from finite-acceleration claims. |
| Mobility | Two-gear count 1; gear-driven four-bar count 1; redundant geometric cases; first-order freedom blocked at second order; multiple independent inputs; physically locked body versus edit lock. |
| Sampling | 20T → 100T needs five input turns, exceeding the legacy three-turn closure bound. Include speed-up ratios, a period exceeding the sample budget, rollback/subdivision, reversing mechanisms, continuous-angle boundaries, and no cumulative drift across repeated playback cycles. |
| State isolation | Two/three independent machines, one geared and one ordinary; out-of-order graph queries, reverse/random scrubbing, separate speeds, merged/split partitions, cached drive-state restoration, and failed solve followed by a good solve. |
| Editing | Tooth/size changes, paused-pose changes, retiming by unmesh/edit/remesh, preserved anchors, host rename, refused weld changes, dependency deletion, locks, selection and duplication. |
| Codec | Old fixtures unchanged; deterministic records; full-precision module; cm/m/inch; diagonal rounded centers; short reference arms; unknown versions; duplicate IDs; dangling references; malformed/oversized payloads; conflicting inputs; failed load preserves drawing and history. |
| Analysis/export | Gear angles use the declared reference and continuous travel; sampled values agree across graph, table, CSV/XLSX. Gear host remains one rigid body. Force requests refuse for the geared partition while a supported neighboring machine remains usable. |
| Rendering | Visible center/pitch circle/reference; correct direction; mesh selection; distinguish arm length from pitch radius; zoom/fit/ghost/export extents; bounded symbolic path detail; keyboard and narrow-screen interactions. |

Use exact rational equality for graph consistency. For small analytic floating-point cases,
target approximately 1e-12 absolute angular/rate error; use existing scale-normalized solver
tolerances for linkage residuals, not one absolute tolerance across all units. Round-trip motion
comparisons include the coordinate/reference-angle error budget in §10. Finite-difference
checks need convergence under step refinement rather than an arbitrary coarse tolerance.

### 11.3 Existing regression suites to retain

Run the suites touched by each stage, broadening only when its changes reach another subsystem:

- Core solver: [app.component.spec.ts](../src/app/app.component.spec.ts) (MATLAB six-bar),
  `constraint-emitter`, `constraint-second-order`, `constraint-rate-scaling`,
  `boundary-joints`, `boundary-driven-branch`, `coupled-routing`,
  `coupled-route-agreement`, `driven-floating-pin`, and `slide-mobility` under
  [verification](../src/tests/verification/).
- State/sampling: `mechanism-partition`, `two-mechanisms`, `three-machines`,
  `solver-sample-rollback`, `solver-branch-acceptance`, `adaptive-sampling`,
  `toggle-subdivision`, `time-based-playback`, `input-toggle`, and `arriving-playhead`;
  [anchor.spec.ts](../src/app/model/mechanism/anchor.spec.ts) and
  [drive-profile.spec.ts](../src/app/model/mechanism/drive-profile.spec.ts).
- Persistence/lifecycle: `template-url`, `template-payloads`, `fixture-gallery`;
  existing `url-drive-speed`, `url-digest`, `url-circular-link`, and
  `url-welded-mount` specs in [transcoding](../src/app/services/transcoding/);
  [save-history.service.spec.ts](../src/app/services/save-history.service.spec.ts) and
  [selection-batch.service.spec.ts](../src/app/services/selection-batch.service.spec.ts).
- Analysis: [analysis-sample.service.spec.ts](../src/app/services/analysis-sample.service.spec.ts),
  [export-flow.spec.ts](../src/app/services/export/export-flow.spec.ts),
  `frame-body-forces`, and `force-power-balance`.

Add a tracked `e2e/gears.mjs` suite and document it in [e2e/README.md](../e2e/README.md).
Keep a filmstrip for motion, including a gear-driven four-bar and a full multi-turn cycle.
Use the runner-specific browser workflow in [AGENTS.md](../AGENTS.md) and the UI-validation
skill, with localhost and a disposable/incognito profile. Inspect the images. Relevant existing
browser regressions include `playback-timing.mjs`, `playback-direction.mjs`,
`playback-loop-indicator.mjs`, `edit-playback.mjs`, `analysis-editing.mjs`,
`multi-mechanism-smoke.mjs`, `multi-select-and-dxf.mjs`, `locking.mjs`,
`mobile.mjs`, `export-flow.mjs`, and `force-analysis-panels.mjs`.
Do not run the entire hour-long browser batch automatically.

## 12. Future force-analysis compatibility

The existing force solver writes planar body equilibrium equations, joint reactions, guide
reactions/couples, and one input torque or force. `ForceAnalysisFrame` already carries rank,
residual, status and diagnostic information; `ForceAnalysisSeries` tracks successful frames
and shared-support results. The present assembly has no gear-mesh reaction column.
Kinematic success therefore does not imply meaningful force results for gears.

**V1 must refuse force analysis for the entire geared partition.** Return
`unsupported-topology` with an explicit reason before assembling equilibrium. Apply this
at `Mechanism.getForceAnalysis` and at public force-solver entry points through an explicit
mechanism capability/mesh context. Existing low-level APIs that receive only ordinary joint/link
arrays cannot infer an external GearMesh collection: update all application callers to pass the
context, including export and worksheet callers. An adapter that discards this context is not
safe for geared mechanisms. Keep legacy gear-free calls compatible.

`MechanismService.buildRequirements` currently aggregates all runnable machines and
`forceAnalysisReady` requires every relevant result. Introduce per-partition eligibility and
selection-aware force/export readiness, so an unsupported geared machine does not prevent
analysis of a supported independent machine. Do not silently omit unsupported results from
an export that explicitly requested that machine. Shared frame/support aggregation must
exclude uncomputed geared reactions and disclose that they are unavailable.

A later force phase should:

1. Add one equal-and-opposite mesh force at the pitch contact, with appropriate moment arms
   on the two rigid bodies. Generalize force-coefficient helpers to accept a contact coordinate;
   do not invent a persistent pin joint at the contact.
2. Extend unknown enumeration, rank/indeterminacy diagnosis, reaction indexing, frame outputs,
   worksheets, and export labels. A dependent gear is not a second independent actuator effort.
3. Use `|F_t| = |T|/r` for the mesh contribution and, for a conventional spur-gear model,
   `|F_r| = |F_t| tan(phi)`. Pressure angle becomes a validated compatible mesh/gear parameter
   at that phase. Full body equilibrium determines net shaft torque when other loads/inertia act.
4. Verify torque magnitudes and signed power, with coordinate conventions declared. In a
   lossless quasistatic two-port transmission, external powers sum to zero:
   `T_in omega_in + T_out omega_out = 0`. Dynamic tests also account for kinetic energy.
   Branching and redundant trains need equilibrium/rank checks; scalar ratio multiplication
   alone cannot determine every internal load.
5. Count host/gear assembly mass, CoM, and inertia once. V1 adds no second inertial body;
   retain current user-entered host properties. Define mass-editing semantics before adding
   geometry-based gear mass defaults.
6. Reuse existing unit-to-SI conversions, frame sampling and force diagnostics, with explicit
   unit tests. Do not add a second scale conversion inside mesh force assembly.

V1's separate mesh entity and explicit host identity provide the future force connection points.
Reserve neither arbitrary tooth-contact data nor unused force fields in the first schema.

## 13. Planetary-extension analysis

The Gear attachment can survive moving centers because ground is a property of the center
joint, not a permanent field baked into Gear. The V1 **compiler**, however, is intentionally
fixed-axis; it must refuse a moving center. A planetary system needs generalized relative-motion
constraints and cannot be implemented by merely removing that guard.

For an external pair whose line of centers rotates through angle psi, the relative relation is:

```text
N_A (omega_A - psi_dot) + N_B (omega_B - psi_dot) = 0
```

An internal pair changes the sign between the two relative terms. Positions need corresponding
phase/assembly equations, and acceleration includes the line-of-centers acceleration. When
the centers are carried rigidly, psi is the carrier angle plus a fixed offset. For more general
moving centers it comes from their geometry and derivatives.

For a conventional sun/ring/carrier arrangement, use the nondividing Willis form:

```text
N_s (omega_s - omega_c) + N_r (omega_r - omega_c) = 0
```

This avoids dividing by a possibly zero ring-relative speed. The ordinary arrangement has two
independent freedoms until another member is constrained. PMKS's one-input policy can remain
by supporting configurations with the other freedom physically fixed. **Grounding the ring's
center does not lock its rotation.** An orientation restraint is required; an editor lock is
not a physical restraint.

Later work must include carrier ownership, moving center placement, ring artwork, internal
mesh geometry, generalized angular constraint rows/Jacobians/second-order terms, mobility,
and force reactions when that mode is enabled. Fixed-axis gear networks can continue using
analytic elimination; moving networks use the generalized coupled route. Keep those lowerings
behind a constraint-compilation interface, not UI-specific mesh traversal.

For standard unshifted compatible gears, internal center distance is the difference of pitch
radii, and a simple planetary tooth set satisfies `N_r = N_s + 2N_p`. These are necessary
geometric checks, not sufficient assembly/interference checks. The later phase must also address
planet spacing and assembly conditions. [KHK internal-gear technical reference](https://khkgears.net/pdf/internal-tech.pdf)

## 14. Synthesis-extension analysis

Current synthesis is a specific three-pose linkage workflow:
[SynthesisBuilderService](../src/app/services/synthesis/synthesis-builder.service.ts) stores
desired end-effector poses, constraints, and owned/written geometry;
[SynthesisSolutionService](../src/app/services/synthesis/synthesis-solution.service.ts) ranks
candidates and inserts a chosen result. [synthesis-candidates.ts](../src/app/services/synthesis/synthesis-candidates.ts)
contains the four-bar candidate mathematics, while
[driver-dyad.ts](../src/app/services/synthesis/driver-dyad.ts) adds a linkage driver where needed.
This is not an existing arbitrary transmission optimizer.

Start future gear synthesis with bounded templates: gear pair → four-bar, compound train →
crank-slider, and rack-and-pinion → linkage after their forward solvers ship. Enumerate discrete
topology/tooth-count choices outside a continuous search for pivots, lengths, size and phase.
Use the same pure constraint compiler, validation, period/work limits, and forward simulation
as hand-built mechanisms. Do not instantiate UI services inside an optimization loop.

Three desired poses alone do not specify motion timing or a unique gear ratio. Introduce explicit
input-angle/time targets, traversal order and a scoring function before presenting gears as an
optimized timing solution. Filter incompatible spacing, unreachable/locked geometry, collisions
if supported, and excessive periods before expensive candidate evaluation.

Previews remain disposable until the existing insertion transaction commits the selected
candidate. Extend synthesis ownership/serialization to generated gears and meshes, so replacing
a synthesized design removes its own relations without deleting later user additions.
V1's stable gear IDs, declared reference points, derived ratios, and pure compilation are the
necessary preparation; a generic topology search framework is not needed now.

## 15. Phased roadmap

| Phase | Capability and new work | Exit gate |
| --- | --- | --- |
| V1 | Fixed-axis external circular gears, one independent root, dependent body motion, ordinary linkage solving, editing/analysis/persistence. | §19, including the closed four-bar proof. |
| V1.1 | Compounds and editing improvements. Multiple gears on one rigid body, explicit same-shaft attachment, safe weld/root/leaf remapping, selection and visual layering. No new independent rotation on the same shaft. | Case C end-to-end; duplication/deletion/round-trip of compound ownership. |
| V2 | Internal circular gears. Tooth-side metadata, same-direction fixed-axis ratio, pitch-radius-difference placement, ring selection/artwork and compatibility checks. | External/internal mixed trains; no claim of tooth interference simulation. |
| V2.1 | Rack and pinion. Dependent linear coordinate `s-s0 = +/-r(theta-theta0)`, rack axis/body definition, existing prismatic constraints, finite travel and length-based artwork. | Rack driving an ordinary linkage with correct linear rates and travel limits. |
| V3 | Ideal gear forces/torques. Mesh reaction unknowns, pressure angle, moment arms, mass policy, SI conversions, rank/power validation, result presentation. | Static and dynamic equilibrium/power tests; supported configurations explicitly listed. |
| V4 | Planetary systems. Moving axes/carrier ownership and relative angular constraints; one-input configurations only unless input policy is separately expanded. | Willis, center motion, full closure/rates and mobility, with force capability gated independently. |
| V5 | Template-based gear-aware synthesis. Discrete integer search plus continuous linkage/placement optimization, timing objectives, preview ownership. | Reproducible bounded candidates validated by the production forward solver. |
| Research | Noncircular/timing gears. Nonlinear travel law, periodicity, compatible pitch geometry and manufacturability/placement research. | Separate research prototype and evidence; no V1 commitment. |

Compounds come immediately after V1 because their mathematics fits the compiled body graph but
their ownership/editing semantics deserve a separate review. Force analysis can proceed after
fixed-axis geometry is stable; planetary force support remains separate from planetary kinematics.

For a future nonlinear law `theta_out = f(q)`, derivatives become
`omega_out = f'(q) q_dot` and
`alpha_out = f''(q) q_dot^2 + f'(q) q_ddot`.
The boundary interface can express these derivatives, but an arbitrary function is not
automatically realizable by a noncircular gear pair. Geometry, periodicity and admissibility
need their own research.

The Disney reference motivates this later direction: its mechanical-character work combines
linkages and gear-based motion timing, including noncircular profiles. It is broader than this
V1 and does not establish that PMKS's current solver already supports those capabilities.
[Disney Research project](https://studios.disneyresearch.com/2013/07/21/computational-design-of-mechanical-characters/),
[paper](https://studios.disneyresearch.com/wp-content/uploads/2019/03/Computational-Design-of-Mechanical-Characters-1.pdf).


## 16. File-by-file implementation map

Existing paths below were inspected. New paths are explicitly **proposed** and should be
created only when their stage starts. Keep computation pure and UI mutations transactional;
do not add a second mechanism service, solver engine, history stack, or file format.

### 16.1 Model, solving, and state

| Existing file | Proposed change and why |
| --- | --- |
| [model/link.ts](../src/app/model/link.ts), [model/joint.ts](../src/app/model/joint.ts) | Reuse ordinary host geometry and RevJoint axes; no gear subclass or contact-joint kind. Audit cloning and reference membership; only add shared attachment support if the transaction implementation actually requires it. |
| [model/rigid-bodies.ts](../src/app/model/rigid-bodies.ts), [mechanism/bodies.ts](../src/app/model/mechanism/bodies.ts) | Reuse physical body identity. Resolve gear hosts after grouping; do not fuse bodies across a mesh. Keep V1 eligibility strict; compound mapping is V1.1. |
| [mechanism/mechanism-partition.ts](../src/app/model/mechanism/mechanism-partition.ts) | Accept mesh connectivity between moving host bodies, include gear IDs/ownership, preserve shared-frame and own-joint semantics. |
| [model/actuator.ts](../src/app/model/actuator.ts) | Preserve the independent actuator; resolve the eligible driven gear host explicitly and diagnose ambiguous incident bodies. A mesh never creates another actuator. |
| [mechanism/mobility.ts](../src/app/model/mechanism/mobility.ts) | Add higher-pair angular rows, residuals and body traversal for geometric rank/second-order checks. Avoid subtracting dependent boundary coordinates twice. |
| [mechanism/position-solver.ts](../src/app/model/mechanism/position-solver.ts) | Compile/use prescribed body motion, emit one named gear placement operation, route remaining points through coupled solving, generalize boundary rates, audit all constraints, handle zero unknowns and rollback gear travel. |
| [mechanism/simultaneous-solver.ts](../src/app/model/mechanism/simultaneous-solver.ts) | Reuse nonlinear/rate kernels. Extract or expose complete constraint/derivative verification helpers as needed; V1 does not require a generic angular unknown or gear-contact solver. |
| [mechanism/kinematic-solver.ts](../src/app/model/mechanism/kinematic-solver.ts) | Consume complete point-rate maps, including analytic gear-only cases; retain refusal on coupled failure. Preserve ordinary link angle conventions. |
| [mechanism/mechanism.ts](../src/app/model/mechanism/mechanism.ts) | Clone definitions/references per snapshot, carry compiled drive state and q samples, geared mobility/readiness, period-aware sampling/closure, force capability context, reversed-drive/cache isolation. |
| [mechanism/drive-profile.ts](../src/app/model/mechanism/drive-profile.ts) | Accept authoritative continuous gear input travel for time/period interpolation; retain geometry-derived travel for ordinary mechanisms. |
| [mechanism/anchor.ts](../src/app/model/mechanism/anchor.ts) | Include gear relationship identity/definition in anchor compatibility and retain the continuous coordinate needed by paused-pose edits. |
| [mechanism/readiness.ts](../src/app/model/mechanism/readiness.ts) | Translate structured gear diagnostics into per-machine blockers and mode-specific capability; no duplicate independent-input count. |
| [mechanism/force-solver.ts](../src/app/model/mechanism/force-solver.ts) | V1 capability guard and explicit context at computational entry points. Mesh equilibrium is deferred to V3. |
| [services/mechanism.service.ts](../src/app/services/mechanism.service.ts) | Own gear/mesh collections, pass them through partition/solve, include them in solveFingerprint, preflight input conflicts, delegate mutations, remap/cascade dependencies, update unit conversion and per-partition force eligibility. |
| [services/analysis-sample.service.ts](../src/app/services/analysis-sample.service.ts) | Add gear angle/omega/alpha sampling from snapshot reference and continuous q; preserve per-machine restoration and shared graph/table/export values. |
| [services/solver-explanation.service.ts](../src/app/services/solver-explanation.service.ts), [mechanism/solver-explanation.ts](../src/app/model/mechanism/solver-explanation.ts), [kinematic-worksheet.ts](../src/app/model/mechanism/kinematic-worksheet.ts), [force-worksheet.ts](../src/app/model/mechanism/force-worksheet.ts) | Explain dependent gear motion honestly; provide the ratio/boundary derivation or a specific unsupported worksheet state. Never display a legacy loop derivation for a result obtained from gear boundaries. Forward force capability context. |

Proposed new computational files:

| Proposed new path | Responsibility |
| --- | --- |
| `src/app/model/gear.ts` | Gear/GearMesh value types and lightweight derived pitch geometry; no service dependencies or SVG. |
| `src/app/model/mechanism/gear-validation.ts` | Schema-independent structural/assembly validation and typed diagnostics shared by loader/editor/solver. |
| `src/app/model/mechanism/gear-drive.ts` | Pure body-graph compilation, rational ratios/cycle checks, period and prescribed positions/rates. Expose an immutable compiled plan; factor arithmetic internally only if warranted. |
| `src/app/services/gear.service.ts` | Gear/mesh creation/property/deletion commands using existing permission and hub transactions. |

### 16.2 UI, rendering, lifecycle, and persistence

| Existing file or subsystem | Proposed change and why |
| --- | --- |
| [services/active-obj.service.ts](../src/app/services/active-obj.service.ts), [model/selection.ts](../src/app/model/selection.ts) | Typed gear/mesh references and selected-state dispatch; maintain stable IDs rather than pretending a mesh is a Link. |
| [model/lock-set.ts](../src/app/model/lock-set.ts), [services/edit-permission.service.ts](../src/app/services/edit-permission.service.ts) | Resolve gear edits to host/dependency locks and existing paused-state permission. Edit locks must not become physical shaft restraints. |
| [services/context-menu-builder.service.ts](../src/app/services/context-menu-builder.service.ts) | Attach/create/mesh/unmesh/remove actions with precise eligibility and refusal text. |
| [services/grid-utils.service.ts](../src/app/services/grid-utils.service.ts), [services/svg-grid.service.ts](../src/app/services/svg-grid.service.ts) | Integrate creation/drag commits and extents through current coordinate conversions and transactions. Placement validation does not introduce a hidden center-distance hold. |
| [new-grid.component.ts](../src/app/component/new-grid/new-grid.component.ts), [new-grid.component.html](../src/app/component/new-grid/new-grid.component.html) | Compose the gear SVG layer and route selection/gestures. Avoid embedding graph compilation or property mutations in this large component. |
| [model-frame.directive.ts](../src/app/model-frame.directive.ts) | Reuse modelFrame/upright behavior, with no alternate coordinate system. |
| [edit-panel.component.ts](../src/app/component/edit-panel/edit-panel.component.ts), [edit-panel.component.html](../src/app/component/edit-panel/edit-panel.component.html) | Compose gear/mesh property controls using existing BLOCKS and units; separate pitch size from attachment-arm geometry. |
| [analysis-panel.component.ts](../src/app/component/analysis-panel/analysis-panel.component.ts), [analysis-panel.component.html](../src/app/component/analysis-panel/analysis-panel.component.html) | Add gear angular results and host navigation using the shared sampler; selected mesh shows relationship/diagnostics, not a fictitious body graph. |
| [services/selection-batch.service.ts](../src/app/services/selection-batch.service.ts) | Extend duplication maps/dependency closure; include internal copied meshes only. |
| [transcoding/transcoder-interface.ts](../src/app/services/transcoding/transcoder-interface.ts), [transcoder-data.ts](../src/app/services/transcoding/transcoder-data.ts) | Typed gear/mesh decoded state and active selection tags. Defaults keep old documents gear-free. |
| [transcoding/string-transcoder.ts](../src/app/services/transcoding/string-transcoder.ts) | Dispatch optional versioned extension inside the existing checked URL envelope; preserve legacy encodings. |
| [transcoding/mechanism-builder.ts](../src/app/services/transcoding/mechanism-builder.ts) | Preflight complete decoded references, build hosts first, then attachments/meshes, before input reconciliation; atomic rejection. |
| [services/url-generation.service.ts](../src/app/services/url-generation.service.ts), [services/url-processor.service.ts](../src/app/services/url-processor.service.ts) | Encode from the authored start; stage valid loads before replacing live state; use the same path for sharing/recovery/files. |
| [services/save-history.service.ts](../src/app/services/save-history.service.ts), [services/last-drawing.ts](../src/app/services/last-drawing.ts) | Reuse URL history/recovery, including gear selection restoration and one transaction per command. No separate gear storage. |
| [top-bar.component.ts](../src/app/component/top-bar/top-bar.component.ts) | Reuse .pmks/share entry points; update only capability/error propagation if needed. No parallel gear file format. |
| [export/export-model.ts](../src/app/services/export/export-model.ts), [export-catalog.service.ts](../src/app/services/export/export-catalog.service.ts), [export-columns.service.ts](../src/app/services/export/export-columns.service.ts), [export-table.service.ts](../src/app/services/export/export-table.service.ts) | Add an explicit gear part/series kind for reference-based continuous angle, omega and alpha. Extend closed unions and sampler dispatch. A gear export row is a result view, not another physical body. Reuse existing CSV/XLSX/report writers and flow. |
| [export/mechanism-svg.ts](../src/app/services/export/mechanism-svg.ts), [export/canvas-svg.ts](../src/app/services/export/canvas-svg.ts), [export/dxf/dxf-export.service.ts](../src/app/services/export/dxf/dxf-export.service.ts) | Include symbolic artwork/pitch extents in image export; CAD either explicitly exports schematic pitch geometry or refuses gear geometry with a clear message. Do not label symbolic teeth as a manufacturing profile. |
| [model/unit-conversions.ts](../src/app/model/unit-conversions.ts) | Reuse length/angle/SI conversion conventions; add focused helpers only where existing conversions cannot express the new fields. |

Proposed new UI/codec files:

- `src/app/component/gear-layer/gear-layer.component.ts`, with its template/style:
  isolated SVG rendering/hit targets, standalone imports and token-based styles.
- `src/app/component/gear-panel/gear-panel.component.ts`, with its template/style:
  selected gear/mesh properties, validation and relationship actions.
- `src/app/services/transcoding/gear-codec.ts`: bounded deterministic G1 payload
  encoding/decoding/schema checks. Leave general URL packing/checksums in the existing codec.

Keep a renderer-only pitch/tooth path helper with the gear layer if needed; mathematical gear
relations must not import it. Add component-gallery stories and focused component specs using
the repository's established story structure during implementation.

### 16.3 Tests and documentation

Add co-located specs for the new pure model/compiler/validation and service/codec files.
Proposed integration suites are `src/tests/verification/gear-kinematics.spec.ts`,
`gear-mobility.spec.ts`, `gear-sampling.spec.ts`, and `gear-lifecycle.spec.ts`;
avoid making one enormous fixture suite cover unrelated responsibilities.

Add `src/test-utils/verification/gear-fixtures.ts` and extend the existing
[fixture.ts](../src/test-utils/verification/fixture.ts) and
[fixture-gallery.ts](../src/test-utils/verification/fixture-gallery.ts) so gear fixtures use
the same production solver and published URLs. Extend the specific existing history, sampler,
codec, export and partition tests listed in §11.

Publish two educational examples through
[template-catalog.ts](../src/app/component/MODALS/templates/template-catalog.ts) and
[template-linkages.ts](../src/app/component/MODALS/templates/template-linkages.ts):
a 20/40 pair and the gear-driven four-bar. Add focused Help content; the existing first-run
[tutorial steps](../src/app/model/tutorial-steps.ts) should keep their current linkage flow.

Update this plan's status as stages ship, [CLAUDE.md](../CLAUDE.md) for actual architecture,
[docs index](README.md), [fixture URLs](fixture-urls.md), [UI vocabulary](ui-vocabulary.md),
and [tips-and-tricks](tips-and-tricks.md) for durable implementation discoveries. Document the
new browser suite in [e2e/README.md](../e2e/README.md). Implementation PRs target staging and
name their relevant tests, browser filmstrips and limitations in the existing PR template.

## 17. Architectural risks and mitigations

| Risk | Mitigation / proof required |
| --- | --- |
| Single-input assumptions hidden in boundary/rate ordering | One compiled body-motion plan, no dependent input flags; pair plus closed-linkage proof; inspect every boundary rate and disable legacy fallback. |
| Reduced solve silently drops constraints between prescribed points | Maintain the full assembly constraint view and verify every accepted pose and derivative, including zero-unknown cases. Add the contradictory crank-pin bar fixture. |
| Gear mesh counted as a pin/bar or eliminated coordinates counted twice | Higher-pair angular mobility model, graph rank and geometric second-order tests; verify analytic DOF examples independently. |
| Absolute angles confused with angular increments | Persist explicit center/reference IDs; authored headings supply offsets. Ratio applies to increments, not absolute world headings. |
| Wrapping and incomplete loop period | Store unwrapped q per sample; rational period includes every shaft, verify full linkage pose/branch, bound fastest-body step. |
| Dependency ordering/cycles | Compile once from the one root; exact ratio cycle checks, deterministic diagnostics and no edge silently skipped. |
| Gear drawn on a link without rigid attachment | Gear references an actual host body; ordinary center pin alone does not weld bodies. Show the reference arm and host selection. |
| Compound ownership and link ID churn | V1 simple-host restriction; explicit mutation/copy maps and deletion cleanup; V1.1 body ownership/layering review. |
| Closed linkage overconstraint or singularity | Geometric mobility plus full residual/derivative audits and existing branch continuity. Reject or roll back, never force a phase jump. |
| Global static solver state leaks across machines or failed trials | Snapshot compiled plan and q state, restore on analysis queries, include rollback and interleaved multi-machine tests. |
| Paused edits redefine the start accidentally | Existing anchor transactions extended with mesh topology and continuous travel; tests edit at several phases and repeat undo/redo. |
| Format compatibility and malformed load corruption | Optional versioned extension, structural preflight/staged restore, exact IDs, old fixture tests, bounded payload parsing. |
| Coordinate quantization invalidates a saved assembly | Named unit-aware spacing/heading tolerances and minimum supported geometry; diagonal round-trip tests, no silent resizing. |
| Performance/large ratios | O(V+E) compilation, bounded integer arithmetic/period/samples, cached SVG, measured ceilings; clear refusal instead of truncated motion. |
| Pitch radius confused with link length | Separate fields, reference arm, pitch-circle labels; size edits never stretch attached linkage geometry. |
| Plausible but incorrect force or worksheet output | Per-partition capability guards and explicit context through direct APIs/exports; supported neighboring mechanisms retain analysis. |
| Current interfaces change during implementation | Begin each staged PR by checking the mapped seams against its base; retain numerical fixtures as the contract. |

The largest risk is the first two rows together: the numerical kernel can handle prescribed
boundaries, but orchestration can omit constraints or rates and still display plausible motion.
A pair animation alone cannot expose that failure.

## 18. Recommended first vertical slice

The proposed first slice is correct: **20T grounded input gear → 40T grounded output gear →
an ordinary rigid attachment link**. Make it a real document-to-analysis path.

Use this explicit fixture in project units:

- Input axis A = (-3, 0), reference B = (-2.5, 0), host AB.
- Output axis C = (0, 0), reference D = (cos 60°, sin 60°), host CD.
- A/C are grounded revolute centers; only A is the input, at +60 rpm.
- Teeth 20 and 40, common module 0.1, pitch radii 1 and 2, center distance 3.
- Output reference arm length is 1, deliberately different from its pitch radius of 2.
- Output angle starts at 60° and changes at -30 rpm; the full cycle takes two input
  revolutions, or two seconds at this speed.

Deliver rendering and selection, numeric tooth/size controls, one explicit mesh, analytic
position/rate propagation, animation/scrub, graph/table samples, URL/.pmks/history round-trip,
deletion, validation, force refusal and tests A/E/F. Changing teeth can make this fixed placement
invalid; show the required spacing and let the user repair it. No automatic repositioning.

This slice specifically proves the analytic **zero-unknown** branch, data lifecycle, and motion
display. Before approving the solver architecture for broader V1, add the required second
fixture: extend CD with ground F = (4, 0) and links DE/EF of length 3, choosing E from the upper
circle-intersection branch. This is the crank-1/ground-4/coupler-3/rocker-3 four-bar. Its ground
axis C stays nondriven; A remains the sole independent input. Compare it with the existing
four-bar solver at the gear output speed/phase.

Suggested small, reviewable implementation stages:

1. Pure types, validation and ratio compiler with tests; no exposed partial feature.
2. Snapshot/partition/mobility/boundary integration, pair and four-bar fixtures, complete
   constraint auditing, rate/rollback/period tests. This is the architecture gate.
3. Versioned codec and atomic lifecycle, including old document tests and paused anchors.
4. Gear creation/selection/rendering/properties and analysis/export through current UI.
5. Full V1 trains/idlers, diagnostics, example library, visual filmstrips and scoped regressions.

The first end-to-end milestone comprises stages 1–4 for the two-gear case; stage 2's closed
four-bar check is deliberately early so a flaw is found before broader UI work.

## 19. Concrete V1 acceptance criteria

V1 is ready only when all of the following hold:

- A user can create or attach two eligible circular external gears, choose valid tooth counts
  and sizes, mesh existing compatible centers, and drive a crank/four-bar from the dependent
  gear as one partition with exactly one independent input.
- Idlers, branches and simple fixed-axis trains work; ratios, directions, phase offsets,
  nonzero-reference geometry, complete periods and continuous angular results are correct.
  Unsupported compounds/moving axes/internal meshes are refused explicitly.
- Position, angular velocity and angular acceleration agree with the analytical gear laws;
  all ordinary host/attachment/linkage point rates are complete and geometrically consistent.
  No force-transmission result is implied.
- Coupled solving checks the full assembly, rejects incompatible prescribed-only constraints,
  and handles both zero and nonzero unknown sets. Failures restore all pose/travel state and
  cannot silently fall back to an incompatible solver route.
- Mobility/readiness distinguishes no input, too many inputs, unsupported dependency, excess
  freedom, locked/overconstrained assembly, invalid geometry and numerical limits.
- Playback respects actual speed, reversal, independent machine clocks and full multi-turn
  closure; sampled graphs/tables/exports and random scrubbing agree without angle jumps.
- Every gear/mesh edit, dependency deletion, permitted host rename, duplication, undo and redo
  preserves identity and one coherent transaction, including edits at paused nonzero poses.
- Old URLs remain readable unchanged. New gear URLs, saved files and recovery states reproduce
  the authored design/motion within documented precision. Malformed loads preserve the prior
  document and history; older readers are not promised support for gear extensions.
- Pitch size, reference arm and mesh relationships are visually distinct, selectable and
  usable at narrow widths. Symbolic artwork rotates correctly and remains bounded in cost.
- Gear UI follows the gallery contract in §7: existing blocks/tokens/vocabulary are reused,
  shared blocks are extended where needed, and relevant states have locally reviewed stories.
- Geared force analysis is explicitly unavailable at UI, worksheet, sampler/export and direct
  computational boundaries; unrelated supported machines retain appropriate force analysis.
- Tests A, B, D, E, F and G pass; V1 rejects the unsupported end-to-end compound case C.
  Relevant legacy solver/lifecycle/analysis regressions pass. Gear fixtures have published URLs;
  browser behavior has a reviewed filmstrip and tracked suite.
- Measured record/byte/detail/arithmetic/geometry limits and numerical tolerances are recorded;
  exceeding supported work refuses clearly. No frozen tab, invalid number, silent truncation,
  hidden center adjustment or unbounded period search is accepted.
- Documentation and UI state the ideal fixed-axis external-gear scope and later capabilities
  accurately. Required repository checks pass before any implementation push.

**Planning handoff:** the recommended architecture needs meaningful additions to orchestration,
state and lifecycle, but not a replacement of PMKS's nonlinear position or derivative kernels.
The pair followed by the closed four-bar is the evidence needed to validate that judgment.


Production V1 implementation and validation are recorded in [gears-production.md](gears-production.md).
