# Bodies connected by joints

Planning baseline: `bodies-and-joints-plan` at `11fbe05070330dd193ac316ea0de7c64f2a6f1ca`,
September 10, 2026, based on `staging` at `a3cac26a`. This document is the planning deliverable.
Implementation is to be performed by Codex under one subsequent `/goal`, with Fable 5.1
reviews at the checkpoints below. This planning change contains no implementation and does not
authorize publishing. Unless a path starts with `src/`, model/service/component paths are
relative to `src/app/`; e2e and docs paths are repository-relative. Named functions are the navigation anchors; older plans' line numbers are historical.
While planning, the branch advanced to `968a046`, which removed mandatory cross-model review
instructions from AGENTS.md/CLAUDE.md without changing application code. This plan follows that
current policy: Codex performs UI validation itself; only the four user-requested Fable reviews
are mandatory.

## Decisions before implementation — recommended defaults

Use these defaults in a future implementation prompt unless the maintainer overrides them.
Do not leave these as questions for an unattended agent to discover halfway through a migration.

| Decision | Recommended default |
| --- | --- |
| One unattended run or several? | One Codex `/goal` covers **S0–S8**, with nine verified implementation checkpoints and four focused Fable 5.1 reviews. Intermediate milestones are checkpoints, not alternate completion criteria. |
| Is the architectural direction right? | Yes. Persistent physical bodies, body-local geometry, binary joint records, and derived welded groups are the destination. Do not replace the five-point cylinder with another special solver object. |
| Production compatibility | Preserve production revolute drawings and the grounded-slider encoding. Do not write a general converter for unreleased floating slots, Slides, or cylinders. Rebuild development templates and fixtures from their intended mechanisms. |
| New format | Use an explicit `pmks2:` envelope for the native body document. This is a document-format version, independent of package/app version. Keep the old format on the legacy runtime until the native cutover. |
| Pair selection at a multiway pin | Keep one pin glyph, but expose the actual body pair when an operation needs it. Welding two bodies does not automatically weld a third body attached there later. This deliberately replaces today's inherited weld flag. |
| Geometry and dimensions | Give every body a persistent local frame and authored geometry. Support zero or one connection; a connection is not a required shape vertex. Keep project display units; convert to SI at the analysis boundary. |
| Aggregate custom mass properties | Preserve existing explicit overrides on a continuing group. Never copy one aggregate override to several pieces. A true split that cannot distribute an override is refused with one model reason until the author resets it to member-derived values. Do not invent a distribution. |
| Body deletion | Deleting an ordinary selected Link deletes its physical body; “Delete Welded Group” explicitly deletes its members. “Delete Cylinder” deletes the assembly. Cascade previews name affected assemblies and connections. Do not make one ambiguous “Delete Link” silently choose among these meanings in the new UI. |
| Detached ends | An unconnected end is an attachment/tracer on a body, not an R joint to imaginary ground. Keep authoring drafts separate from valid physical joint records. |
| Initial driver support | One independent prescribed coordinate per moving partition, as today. Schema supports angle/travel references and later couplings; unsupported drive combinations get a readiness reason. No new multi-input solver in this migration. |
| Initial P and pin-in-slot scope | Grounded and floating, passive and driven, including both cylinder mounts. No deferral of floating mount slots. A pin-in-slot's angle coordinate exists even if its rotary-drive UI is deferred. |
| Gear UI | Design the extension points now; implement neither gear solving nor a permanently disabled promotional menu row. When gears land, axle spacing **and a ratio** determine pitch radii. |
| UI continuity | Preserve the current grid-selection → Edit panel/context-menu workflow, BLOCKS form composition, vocabulary, theme/palettes, shadows and motion. The migration changes necessary controls and behavior, not the app's design language. The earlier UX sketch is conceptual, not a style specification. |
| Removing unused code | Substantial removal of the superseded runtime is a required deliverable, not optional cleanup. New tests and native code may offset the line-count reduction; report the actual removed systems and remaining compatibility surface. |
| Live UX observation | Use both workflows at S0, S5, S6 and S8: automated Playwright checks and filmstrips, plus standard Codex computer use (`mcp__cua_repl`) in incognito Chrome on the same localhost build. Watch and manipulate the running mechanisms, record observations from each workflow, and fix usability/animation defects even if scripted assertions pass. Neither workflow substitutes for the other. |
| Fable budget | About $40 remains. Use a $35 working ceiling including follow-ups and CLI-reported auxiliary cost, leaving roughly $5 of headroom. Four planned reviews total at most $28 in assigned caps; reserve $7 for necessary follow-ups. Codex self-reviews the other checkpoints. |
| External review authorization | The maintainer explicitly approved sending this repository's content to Anthropic in this task on September 10, 2026. Use that authorization for Fable reviews; do not ask again at each checkpoint. It does not authorize unrelated files, credentials or other projects. |
| Workflow orchestration | Codex owns implementation and integration. Use Fable 5.1 through the Claude Code CLI for independent reviews. No Workflow tool or implementation-agent fan-out is required. |
| Publishing | A release candidate can be completed without publishing. Production publishing is manually paused according to this branch's CLAUDE.md; never push `main`, change Netlify settings, or publish as part of this work. |

These defaults remove routine product ambiguity, not the obligation to stop at an unresolved
correctness failure. A gate that cannot be repaired is a blocked milestone, never permission to
weaken a test or declare the whole migration done.

## Recommendation and execution boundary

This is the right direction now. The recurring defects have the same cause: a physical member's
identity is entangled with a temporary compound's point list. Splitting or extending a weld
rebuilds the object that owns paint, mass properties, force references, slot references, and
selection. Cylinder recognition then has to rediscover physical roles from that mutable graph.
Explicit bodies and attachments remove that source of ambiguity; another layer of cylinder
exceptions does not.

The latest instruction supersedes the original proposal to have Claude implement this or to
stop after a smaller lifecycle release. **Codex implements the whole migration in one goal;
Fable 5.1 supplies independent reviews.** One goal must not mean one unreviewed change or one
final test run. It means one persistent objective spanning the verified checkpoints S0–S8,
with ordinary implementation decisions already resolved here. Continue automatically after
reviews and gates pass; no routine user approval is needed between checkpoints.

This is a broad, high-risk migration. A single goal is feasible as an execution protocol, not
a guarantee that every unexpected mathematical or environment blocker can be solved without
help. The ledger, review checkpoints, separate development route, and green commits below
make interruption/recovery possible without redefining success. Do not claim completion at a
headless kernel, a feature-flagged editor, or a lifecycle-only refactor. The full definition of
done at the end is the goal's acceptance test.

Do not first spend an implementation milestone rebuilding the legacy compound system only to
throw it away. Its recent fixes and regression tests are the behavioral baseline. Consolidate
its transaction/ownership lessons directly into the native model in S4. The legacy runtime
continues to work while native contracts and kernels are tested; cut over the complete editor,
persistence and teaching material together in S6, then remove legacy runtime dependencies.
There must never be two independently writable representations of one open drawing.

The recent lifecycle fixes already preserve several properties and repair slot/weld ordering.
Do not reimplement them from earlier review reports. Characterize the recorded baseline and
carry the intended behavior forward. A historical bug is not automatically still present.

## What the source confirms, and what the older documents no longer describe

| Source / site | Finding and consequence |
| --- | --- |
| `src/app/model/link.ts`, `RealLink`, geometry and angle methods | Links do have stored fields and names, but their generated identity, reference angle, and default shape depend on their joint list. The problem is not literally “no fields”; there is no independent material frame. Reordering endpoints must stop changing physical meaning. |
| `src/app/services/mechanism.service.ts`, `removeCompoundJoints` | Members with fewer than two joints are discarded. A two-body cylinder with one outer R attachment per member cannot be expressed simply by deleting three interior points. |
| `docs/joint-types-plan.md`, §§2.1–2.10 | The block decomposition deliberately avoided this migration. The two-toggle truth table and automatic absorption at a weld are historical product choices, not mechanical requirements. The quoted 284 `.joints` uses is an old inventory, not a current migration count. |
| `docs/cylinder-mount-joints-plan.md`, “Representation decision” | Already identifies two physical bodies plus a P joint as a plausible destination. Its assembly API was a bounded choice for releasing mount editing, not a reason to preserve the graph forever. Its original selective-delete recommendation is superseded by later compound-delete work. |
| `docs/floating-slot-kinematics-design.md` | Loops already have typed, ID-based edges. Do not describe the current loop representation as only letter strings or resurrect the dead IC solver. Some indexing still assumes joint-derived identities. |
| `src/app/model/mechanism/position-solver.ts`, `orderCoupledPartition`, `collectConstraints`; `simultaneous-solver.ts` | Whole-partition constraint solving, branch checks, and analytic second-order terms already exist. Preserve those lessons; this is a change of variables and topology, not the first introduction of numerical solving. |
| `src/app/model/mechanism/bodies.ts`, `assignBodies`; `rigid-bodies.ts` | There is already a derived free-body layer and explicit ground identity. Consolidate it into the new physical-body/solver-body distinction instead of adding a third competing “body” meaning. |
| `docs/phase-3-slide-spec.md`, §9; `force-solver.ts` | P-joint guide couples already landed. The older refusal and proposed future force work are historical. ForceSolver already works with bodies, not kinematic loop enumeration; the migration must preserve its force and moment semantics. |
| `src/app/model/actuator.ts` | Ordered drive information already exists beyond the historical input boolean. Extend this responsibility to a coordinate reference. CLAUDE.md's `mechanism/actuator.ts` path is stale; the file is under `model/`. |
| `src/app/services/transcoding/string-transcoder.ts`, `decodeJoint` | The PRISMATIC bit and absent floating-carrier tail distinguish old grounded sliders. Those are real production documents and merit a small import path. Unversioned payload prefixes are not reliable app-version identifiers. |
| `docs/tips-and-tricks.md` | Several sections preserve earlier decisions and later corrections. In particular the finite-difference rate step is superseded by analytic `secondOrderTerms`; the closed mount boundary is superseded by mount release. Use current code and the later correction, not a heading alone. |

The three known problems are real, with two extensions: (1) property provenance and physical
ownership matter as much as geometry, and (2) playback mutates the editable drawing today, so
separating the document from sampled poses is part of the migration. Stable IDs alone do not
fix an editor that writes a playback pose back as the design.

## Destination: one document, several derived views

Place new pure types under `src/app/model/body-system/` (new directory). Keep small modules:
`body-document.ts`, `body-frame.ts`, `joint-record.ts`, `joint-coordinate.ts`,
`weld-groups.ts`, `assembly-record.ts`, `body-edit-plan.ts`, and `joint-permission.ts`.
Angular services orchestrate these modules; they do not own a second copy of the physics.

### Persistent records

| Record | Required information / invariant |
| --- | --- |
| `Body` | Opaque stable `BodyId`, display label/name, design pose `(x, y, theta)`, local authored geometry, mass-property specification, and display properties. WORLD is one reserved, immutable body. No identity is formed from attachment labels. |
| `Attachment` | Stable ID, owning BodyId, body-local point and optional local direction, display/trace metadata. Used by joints, tracers, loads, and dimensions. Not itself a kinematic connection. |
| `Joint` | Stable JointId, discriminated kind, exactly two distinct BodyIds, and kind-specific local attachment data. A joint is a massless **entity representing a relationship**; “not an object” must not mean it lacks persistence or selection identity. |
| `JointCoordinateRef` | `{ jointId, coordinate: 'angle' | 'travel' }`, validated against kind. R has angle; P has travel; pin-in-slot has both; weld has neither. Values are derived from a pose, with branch state kept by the solver. |
| `Driver` | Stable ID, one coordinate reference, command/profile, speed/direction and phase. No body chosen by first incident link. Retain the established negative-is-clockwise convention at the units boundary. |
| `CoordinateLimit` | Coordinate reference, lower/upper bounds and units. Cylinder stroke is P travel, not mount-to-mount distance or skin size. Limits are validators/events; this release does not add impact/contact dynamics. |
| `Coupling` | Reserved typed relation between coordinate references, with ratio/sign/phase and carrier context where needed. No gear implementation in this work. Unsupported physical records are decode errors, not ignored fields. |
| `Force` / applied couple | Stable ID, material BodyId, local application point, direction convention (world-fixed or body-fixed), magnitude and units. Weld-group membership never changes its material owner. |
| `Assembly` | Stable ID, kind and explicit member/joint roles. Cylinder has exactly barrel body, rod body, internal P joint, and two outer attachments, with dimensions and skin properties. Assemblies own lifecycle policy, not extra constraint equations. |

A joint stores no independent global point that can disagree with its bodies. The two local
anchors of an R joint transform to the same world point in a valid pose. A P joint has two
local reference frames whose origins need not coincide along the guide. A local reference is
not an invented second visible pin. Keep authoring vertices and attachment markers available
without incrementing joint counts or mobility rows.

Bodies may have zero or one connections. An unconnected body is editable but normally makes
its partition underconstrained; it is not deleted for having fewer than two pins. Frame geometry
can still be drawn as several members welded to WORLD. Do not fuse every grounded point's
incident moving body into ground: one R to WORLD permits rotation; a P to WORLD permits travel.

Choose a body's local frame once, at creation/import. Moving, welding, relabeling, reversing
array order, or adding a tracer cannot redefine it. An explicit change of local frame must
transform all geometry, attachments, CoM and load coordinates together and leave world results
unchanged. Automatic geometry may be regenerated by a shape edit; it is never regenerated by
changing which joints connect to that shape. Default bar drawing can retain its familiar hull
appearance without making the hull the topology authority.

### Binary joint equations

Let body pose be `(r_i, theta_i)`, `R_i` its planar rotation, and `E(x,y)=(-y,x)`.
For an attachment `a_i`, `p_i = r_i + R_i a_i`. For a guide on A, let
`u = R_A u_A`, `n = E u`, and `d = p_B - p_A`. Local axes must be finite and normalized.

| Kind | Holonomic equations | Free relative coordinates |
| --- | --- | --- |
| R | `p_B - p_A = 0` (two scalar rows) | `theta_B - theta_A - angleZero` |
| P | `n dot d = 0`; `theta_B - theta_A - angleZero = 0` on a continuous angular branch | `s = u dot d - travelZero` |
| Pin-in-slot | `n dot d = 0` | `s` and relative angle |
| Weld | `r_B - r_A - R_A t_AB = 0`; `theta_B - theta_A - angle_AB = 0` | None |

Store both members' local P-frame directions, with the chosen relative orientation encoded
at creation; never infer heading from arbitrary attachment order. The angle row must retain
the directed branch, not only a cross product that also vanishes after reversal. Pin-in-slot
has no heading constraint. Axis endpoints are optional editing handles, not required pins.
Offset and oblique slots on a plate become natural local geometry.

On creation, capture rest transforms from the accepted pose. Changing kind preserves the
current pose and captures the new datum: R to weld freezes the current relative angle;
pin-in-slot to P fixes relative heading; P to pin-in-slot frees it. Replacing a weld with R
requires a selected attachment point. It is not “turn the global welded flag off.” Preserve a
driver only if its exact coordinate survives; otherwise the permission result must describe
the required drive removal before committing. Weld is not a fourth toggle on today's 2×2.

### Welded groups and property ownership

Physical bodies never disappear into a compound. Connected weld components are derived solver
bodies, with member-to-group rigid transforms. A consistent weld cycle is redundant; an
inconsistent cycle is a refusal. A component containing WORLD has fixed pose. Internal R/P
rows within a condensed group are checked for consistency/redundancy, and a nonzero prescribed
motion inside that group is invalid, not another numerical unknown.

Separate material properties from group presentation. Color/name overrides for a welded group
are annotations on its membership/provenance; they cannot overwrite the stored color/name of
every member. Select a deterministic presentation successor when a group changes, using
stable IDs and explicit lineage, never `subset[0]`. Document a merge rule: an explicitly
selected target group's presentation wins; without one, choose the larger predecessor group,
then stable ID. A true split restores each member's own presentation; do not copy one group
name to every child. Group IDs are derived view identities, not external ownership keys.

Default physical aggregation is `m = sum(m_i)`,
`c = sum(m_i c_i) / m`, `I_c = sum(I_i + m_i |c_i-c|^2)` in consistent SI units.
Evaluate automatic member properties before summing. A member's custom flag does not make the
aggregate custom. For zero mass, a display center may be defined, but never divide by zero or
pretend it is a measured physical CoM.

Keep imported/existing aggregate overrides explicitly identified as overrides of a specified
group. A topology change that merely reconstructs that group preserves them. Adding/removing
a zero-mass member preserves them. If a massive member change makes the meaning ambiguous,
the edit requires resetting or deliberately re-entering the group override; a true split
cannot silently allocate it. Do not claim that a largest-child heuristic conserves physical
mass or inertia. This refusal comes from the same edit plan as the mutation and has a concrete
“Use member mass properties” resolution. New individual body properties remain editable.

Custom CoM editing anchors and physical CoM are different concepts. A grid-anchored editing
choice controls how a dimension edit positions the CoM in the design; during simulation the
physical CoM is body-local and travels rigidly with that body. Preserve the editing anchor
metadata through rebuilds without turning it into a world-stationary mass during animation.

### Multiway pins and attachments

For n bodies sharing a pin, store an explicit visual junction bundle and n−1 binary R
relationships forming a spanning tree. Choose and persist the hub/body pairing when creating
the bundle; do not change it because labels sort differently. The bundle adds no extra
equations or mass. When removing the hub, re-express the remaining connectivity in one
transaction and remap coordinate references only when their physical meaning is preserved;
otherwise refuse or require choosing a replacement pair. Do not silently retarget a driver.

The one circle opens a panel that names the connected bodies. Ordinary point dragging acts
on the coincidence group. Pair-specific weld, drive, joint type and reaction actions expose
which two bodies they address. Coincident force application points still name their owning
body. Two different joints at the same screen point need cycling/picking, not `.find`.

This resolves a current authoring limitation: two members can be welded while a third is
pinned at their shared location. The old `weldedBoomFixture` can be a coherent algebra fixture
today without being editor-stable. In the native editor the same pair-specific construction
must be drawable and survive reconciliation; keep a separate test that demonstrates that.

### Cylinders and the code they retire

A cylinder's barrel and rod are ordinary physical bodies joined by one P. Its assembly record
supplies bore dimensions, travel datum/bounds, rod-end and barrel-end attachments, and drawing
roles. Those roles are intrinsic; translating past another point cannot swap the barrel ends.
An outer attachment gets an R, weld, P or pin-in-slot connection when attached to another body.
A free outer end remains an attachment. Do not give it an R to WORLD just to retain a pin icon.

Keep assembly protection: generic deletion/type changes cannot dismantle the internal P or
leave half a cylinder. Properties can expose its drive, travel and dimensions through supported
assembly operations. External mounts use ordinary joint permissions. A cylinder can have its
barrel welded to a bracket and its rod on a floating guide; multiple cylinders can share a
visual pin without sharing ownership of their interiors. Both ends welded into one group is
either a consistent rigid assembly or a drive conflict, not a secret cylinder fold case.

| Current responsibility | Native replacement / deletion condition |
| --- | --- |
| `PrisJoint` + `SliderBlock` + coincident `RevJoint` | Typed P or pin-in-slot connection. Retain a real carriage body only when it represents material/other attachments, not to satisfy the old graph. |
| `cylinder.ts` structural/geometry inference, `slide-assembly.ts` recognition | Assembly record lookup and ordinary joint validation. Delete distance-based far-end inference and seal recognition after the final old-document boundary is gone. |
| `cylinder-layout.ts` five-point construction | Body-local cylinder geometry plus P datum and assembly dimensions. Keep useful skin geometry math after separating it from synthetic topology. |
| `cylinder-pose-plan.ts`, `applyCylinderPose`, `normalizeSealedCylinders` | General body edit transaction and assembly dimension constraints. Delete the interior exemption, synthetic-point closure and repair placement; do not delete all-or-nothing edits, locks or branch preservation. |
| `releaseFromCompounds`, `splitCompoundAtRemainingWelds`, `createNewCompoundLinkFromSubset`, `removeCompoundJoints` | Delete/modify body and weld records; derive components. Legacy materialization disappears after no live consumer needs `RealLink.subset`. |
| `reconcileAssemblyWelds`, `rootCarrying`, carrier endpoint recovery | Validate explicit body/attachment IDs. A carrier remains its physical body when welded; losing the actual body removes/refuses dependent connections by the planned cascade. No geometric guess can transfer its slot. |
| `isCylinderLink`, “is ram” / “carries ram,” hidden interior hitboxes | Render roles and selection views from AssemblyId and BodyId. Containment remains a useful view query, but no geometry-based rediscovery or hidden interior joint entities remain. |
| Compound union suppressing barrel/rod leaves, bore suppression | One renderer owns each physical member. Assembly skin decorates those members; a bracket does not inherit a bore because it is in the same group. |
| Own-cylinder fold and merge bans | Typed self-connection, assembly protection, geometry validity and constraint consistency checks. Reaching a physical stop remains a limit. |

Do not delete the old guard specs wholesale. Rewrite `cylinder-weld-guards.spec.ts` to prove the
new boundary: external pair operations allowed; internal assembly destruction refused;
preview/menu/panel/mutation quote the same refusal. Keep the lifecycle regressions even when
their setup no longer contains five points.

## Required removal of the superseded runtime

The expected outcome includes **substantial deletion of obsolete production code**. A permanent
new model layered over the complete old model does not satisfy this migration. The final
repository might not have fewer total lines because the native kernel and regression tests
add code; that is not the useful success measure. Remove responsibilities that no longer
exist, and retain only code with a named live purpose.

At S0 create a removal manifest in the progress ledger: current file/symbol, responsibility,
replacement, callers/templates/tests to migrate, and intended removal checkpoint. At S7 close
every entry as deleted, reused for a specific native responsibility, or retained in the
explicitly bounded production reader/optimization. No “temporary, someday” category at S8.

Required removals include the synthetic slider/block graph; cylinder interior discovery,
five-point pose repair and fold exceptions replaced by native constraints; mutable compound
rebuilding and slot-carrier recovery by shared endpoints; duplicate cylinder ownership/skin
queries; old joint-list-derived identity/orientation consumers; replaced toggle/menu/drag
handlers, hidden hit targets, obsolete styles and dead exports. Remove unused imports,
obsolete helpers, dead IC code if still present, stale fixture scaffolding, and dependencies
that lose their final caller. Rewrite regression specs against the new boundary rather than
throwing away the behaviors they protect.

Useful geometry math, numerical linear algebra, Newton–Euler logic and correctly typed loop
or closed-form routines can be reused. A retained optimization must be a pure private solver
implementation over native inputs; it cannot keep the old editable Joint/Link/SliderBlock
object graph alive behind a renamed adapter. The production URL reader retains a decoded
record schema, not the old MechanismService or whole five-point runtime. Keep MATLAB/reference
data and behavior tests even where their old fixture-construction helper is deleted.

The S7/S8 deletion gate requires a caller/import/template search, a build after removals,
passing behavior tests, and a report of removed production files/lines and remaining adapters
with their actual consumers. Do not count commented-out code as removal, equate an unused
export with proof that a template never uses its behavior, or chase an arbitrary negative
line count by deleting tests. No code remains solely to make a staging-only old URL open.

## Solving, rates, mobility and forces

### Position and mobility

Compile a document snapshot into per-partition body poses, condensed weld groups, typed
constraint rows, coordinate evaluators, drivers, limits and result mappings. Partition through
moving bodies and relationships; WORLD can be shared without joining independent machines.
Keep the distinction between a machine owning a part and sampling a shared frame part.

The native numerical solver has three unknowns per unconstrained planar solver body, rather
than two per point. R, P, pin-in-slot, weld and driver rows come from the equations above.
Use analytic Jacobians, consistently scaled rows/columns, and a rank-revealing solve. Redundant
consistent rows are legal. Admission requires sufficient independent rows for the prescribed
motion, full relevant column rank, and a consistent drawn pose, not merely a square matrix.
Count mobility without the driver, then verify that the chosen driver removes the intended
freedom. Preserve the geometric/second-order distinction between redundant mechanisms and
false infinitesimal freedom at a tangency.

SE(2) transforms make reflection of one rigid body's points impossible. They do not prevent
a linkage from jumping assembly branch. Keep directed joint heading checks, unwrapped angles,
orientation/witness checks and continuation for the mechanism as a whole. A failed sample
rolls back pose, input progress, branch state and all reported rates. Refusal remains typed:
`branch` is retried with bounded subdivision of the **commanded continuation**, `travel` is
handled as a limit/reversal under the drive policy, and `unsolved` is not called a physical
stop without evidence. Exhaustion reports a reason; no cap accepts an unsettled pose.

Singular starting poses for boundary-driven mechanisms remain unsupported in this migration,
with a stable readiness reason. Keep supported toggle continuation from nonsingular starts.
Adding a general singular-start or multi-input continuation algorithm is separate work.

Reuse the existing continuation and linear algebra where appropriate; do not build a new
monolithic solver. During comparison, an isolated legacy adapter may lower supported native
R drawings to the old solver, with temporary auxiliary points inside that adapter. It is an
oracle/optimization boundary, never persistent topology or visible pins. Route selection is
fixed before a cycle. No mid-cycle switch to the loop solver after a numerical refusal.
Do not retire the old R path until the native route passes the MATLAB and performance gates.

### Rates and acceleration

Differentiate the very same constraints that accepted the positions. For all pose coordinates
`x` and command `c`, solve `F_x xdot + F_c cdot = 0`, then
`F_x xddot = -(F_xx[xdot,xdot] + 2 F_xc[xdot] cdot + F_cc cdot^2 + F_c cddot)`.
With prescribed boundary coordinates, move `J_b bdot` and `J_b bddot` to the right-hand side;
the quadratic term includes both unknown and boundary velocities and their cross terms.
The acceleration of a moving boundary is not hidden in the quadratic term.

Retain analytic second-order evaluation, now in body coordinates. Do not reintroduce a global
finite-difference displacement scale. Verify derivatives using independent paths with both
nonzero velocities and nonzero accelerations, not only straight-line perturbations. Include
command acceleration and moving carrier rotation. Finite differences are test oracles over a
range of step sizes, not the production acceleration implementation.

For a body-local witness `a`, report
`v_p = v_r + omega E R a` and
`a_p = a_r + alpha E R a - omega^2 R a`.
This gives attachment and CoM rates without reading two arbitrary joints. Angular acceleration
is the solved `alpha`; no cross-product correction containing a centripetal term belongs in it.
Carry route and continuation per Mechanism instance; shared static state must not leak between
machines. An unavailable sample has unavailable results, including ground seeds if that is
the result policy; all graph/export readers must use availability-aware accessors.

### Forces are a migration, not a new force law

Use the existing Newton–Euler/free-body responsibilities in `force-solver.ts`, with native
body identities and joint reactions. A physical body has mass/inertia; a joint has none.
For the unscaled physical constraint rows, `J^T lambda` is the generalized reaction wrench.
If the numerical solver scales rows, transform multipliers back before displaying forces.

R transmits two in-plane force components. Pin-in-slot transmits one normal force. P adds a
reaction couple to that normal force. Weld transmits a full wrench if retained explicitly;
condensation hides internal weld reactions. Do not invent unique internal reactions for a
redundant weld cycle. Preserve the existing documented treatment of indeterminate supports
where applicable and distinguish unavailable internal member reactions from zero.

Moment reference points matter. On a P joint with `d = s u`, a normal reaction at the two
different reference origins cannot be represented by opposite forces plus opposite moments
at those origins without the lever-arm term. With row `n dot d`, the A-axis rotation contributes
`-s` to its angular derivative (in addition to attachment offsets); `J^T` transports that
moment correctly. Test the wrench about one common world point and test virtual power, not
only “equal and opposite” numbers in two local frames.

Compute inertia forces from body-local CoM acceleration, gravity and applied loads in SI.
Do not allow the legacy grams/model-coordinate storage convention to leak into the native
equations. Driver effort is conjugate to its coordinate: torque for radians, force for travel
in meters. Verify `effort * coordinateRate` against power and energy derivatives for loaded
mechanisms, including rotating carriers. Keep results at material bodies and joint pairs;
aggregate group views are derived. No fluid, friction, compliance, collision or impact model
is part of this migration.

## Preserve PMKS+'s interaction philosophy and visual style

This is a model migration with necessary UX changes, not a visual redesign. Before planning
this addition, the current selection service, Edit panel/template, context-menu builder and
renderer, BLOCKS controls, global theme, palette and motion definitions were inspected at
`51add00`. Use those actual components as the reference, not the earlier schematic mockup's
simplified colors, layout or wording. A new native entity does not require a new navigation
system, inspector window or interaction metaphor.

| Preserve | Concrete source / implementation rule |
| --- | --- |
| Grid-first selection | `services/active-obj.service.ts`, `model/selection.ts`, `component/edit-panel/edit-panel.component.html`, `services/context-menu-builder.service.ts`. Click/tap identifies the object; the Edit panel and right-click/long-press menu offer edits of that same object. Keep their target, highlight, values and permission answers synchronized. Pair selection for a multiway joint extends this flow inside the existing panel/menu. |
| Click selects, drag tunes | Preserve `ActiveObjService`'s distinction between the gesture target and the object the analysis panel is about. Dragging another point while watching a graph must not replace that graph. Preserve existing multi-selection, deselection, keyboard and touch behavior. |
| Panel composition | Reuse `component/BLOCKS/panel-section`, `editable-title`, `collapsible-subseciton`, `input`, `dual-input`, `hold-field`, `state-input`, `toggle`, `button`, `segmented` and `radio`. Use the existing title/actions, labeled blocks, brief explanatory text, help marks, units and grouped inputs. Extend shared blocks where needed rather than rebuilding bespoke fields in the native joint panel. Do not fix the legacy subsection directory spelling as part of this work. |
| Stable context menus | The builder's established group order is Attach, State, Machine, then the destructive footer. Within an object kind, unavailable actions stay in their learned location and gray with the model's reason. Preserve the documented multi-selection/synthesis exceptions. A type-specific connection menu may have new rows, but menu and panel must offer the same operation and result. |
| Readable unavailable states | Preserve `panel-section`'s `panelAttached`, `panelLive` and inert-body behavior: explain the refusal without hiding the selected object's information or disabling unrelated live properties. Retain compact inline reasons and the existing tooltip behavior. |
| Typography and colors | `src/mytheme.scss` uses Roboto, Material indigo primary and amber accent; ordinary panel copy uses the existing 14px/18px body style. `model/joint-colors.ts` owns the six indigo/teal part colors, warm joint families and amber `SELECTION_RING`. New glyph kinds reuse these identity/hover/selection semantics; do not invent a new color per joint kind, recolor the product, or turn the conceptual mockup's cyan into a new theme. |
| Surfaces and shadows | Reuse `src/styles.scss`: `--card-surface`, `--card-radius` (10px), `--card-gap` (12px), `--card-shadow`, and the 5px `--border-radius` used by accent-topped panels. `panel-section` already has its 5px primary accent edge. `left-tabs.vars.scss` owns layout gaps and shadow clearance. Context menus deliberately use Material elevation 16 above the cards. Keep these distinctions; no new shadow/radius system or clipping of card shadows. |
| Controls and motion | Inputs already use compact Material fields and unit suffixes; `segmented-block` uses a measured sliding thumb (180ms, `cubic-bezier(0.4,0,0.2,1)`). Subsections and context menus use short 150ms ease-in-out transitions; collapsible panels use 200ms. The phone sheet uses a measured-height 240ms `cubic-bezier(0.2,0,0,1)` slide. Reuse the components and reduced-motion behavior, not independently copied timing constants. No new bounce, spring, flourish or whole-panel replacement animation. |
| Physical animation | Preserve elapsed-time playback, speed/direction and continuous motion. UI easing must never alter a mechanism's physical timing or make its glyphs lag behind the body pose. Selection must not resize a cylinder or make its skin jump. |
| Product vocabulary | Keep familiar terms such as Link, Joint, Cylinder, Add Input, Remove Input, Input Settings, Input Speed, Fixed Length and Fixed Angle wherever their meaning survives. `Body`, `Driver`, `JointCoordinateRef`, WORLD and solver partitions are implementation terms, not a mandate to rename every visible label. Introduce Prismatic, Pin-in-slot, connected pairs and explicit deletion scopes only where they explain a real new choice. Use short, concrete American English and the same action names in help, menu and panel. |
| Overall layout | Preserve the top mode strip, left object panel, canvas, bottom playback/view controls, right drawer, and responsive bottom sheet. No broad layout, typography, icon-system, theme or dark-mode project is bundled into the migration. |

The new joint kind selector belongs in the familiar settings blocks. Pair labels should use
recognizable names such as Barrel, Rod, Link AB or the author's name, not opaque BodyIds.
Use the existing pick-one control where labels fit; when a pair list needs more room, extend
the established field pattern without squeezing unreadable labels into four tiny segments.
A derived group selection may add explicit scope choices while preserving the familiar
selected-object title and actions. For ordinary members, keep the visible word “Link” even
though the native type is `Body`.

This orientation is preparation, not another standalone implementation milestone or a paid
review. Before the first visible migration change, revisit a representative object in the
running localhost app: select it, edit through the panel, perform the equivalent menu action,
expand/collapse settings, hover/focus a field, play/pause and inspect the phone sheet. Keep
baseline frames in S0's artifacts. At S5/S6/S8 compare those same flows in the native editor,
including shadows, spacing, palette, wording, focus, transitions and reduced motion. Fix
unnecessary visual drift even if the underlying operation is correct. Code removal targets
superseded mechanism logic; reusable presentation components are assets to preserve.

## Editing, rendering and the joint grammar

`BodyDocument` is the design authority. A `SimulationSnapshot` supplies solved body poses for
display; animation must not rewrite design geometry. A paused-pose edit is mapped through the
existing anchor policy and body transforms into one accepted design transaction. Keep current
analysis-mode restrictions on restructuring away from the anchor; use `edit-permission.ts`
and its service rather than reviving a blanket “analysis cannot edit” rule.

Distinguish pose edits from geometry edits explicitly in the command model. A rigid-body drag
or P travel drag changes poses/coordinates; it cannot change a body's local shape. A dimension
edit or the existing design-point drag may change authored geometry and the local attachments
bound to that geometry, subject to holds. Give automatic bars explicit endpoint-to-shape
bindings so their familiar length editing survives; a tracer or an unbound connection does
not automatically become a hull vertex. Keep those bindings as design metadata, independent
of the binary joint graph. Do not run a length-changing design edit through a solver that
freezes the very length being edited, or let a pose solve resize a body to satisfy an edit.

For a multiway R design drag, collect every coincident attachment in the bundle, propose
changes only to the incident editable geometry/poses, then solve remaining edit constraints
and validate the whole plan. Holds, locks, cylinder intrinsic dimensions and weld rest
transforms constrain that proposal. Adding a connection alone leaves authored geometry
unchanged. Test ordinary two-pin length changes, a held length, a free tracer on a plate,
a three-way pin and a welded off-axis witness. If the requested target conflicts, refuse the
whole drag; never deform a welded neighbor merely to satisfy the cursor.

Every edit returns either a complete plan (new records, removed IDs, affected selections,
preview description, invalidated samples) or a structured refusal. Compose playback permission,
locks/holds, joint/assembly rules, driver rules and geometry consistency at this boundary.
The canvas, drag ring, menu, panel and group operation all display that same result. Recheck
the plan's revision at commit. A stale preview must be replanned, never partially applied.

| Surface | Behavior to implement |
| --- | --- |
| R | One circle at coincident attachments; grounded support marks indicate WORLD. A free attachment uses a distinguishable unconnected marker/description, not a false grounded R. |
| P | Rectangle aligned with the guide, placed at a stable guide-local visual station or the cylinder mouth. A P requires overlapping axes, not overlapping material polygons. For separated bodies, show the guide connection without moving the datum to whichever overlap is nearest. |
| P drag | Capture the starting coordinate and pointer projection. Pointer displacement along the current guide proposes travel; the permission/edit solver supplies the accepted pose. On a fixed barrel the mouth glyph may remain stationary while the rod moves: show a moving travel handle/ghost and live value during the gesture. Do not store glyph position as joint position. |
| Pin-in-slot | Circle attached to the rider, channel attached to the carrier's authored axis. The circle translates and may rotate relative to the guide; do not draw P's fixed-heading semantics. |
| Weld | A `+` at the chosen attachment, connected to the selected body pair. A nearby independent R may still need a circle. Joint selection must reveal the pair at a multiway pin. |
| Selection / panel | Typed `SelectionRef` for body, joint, force, attachment and assembly, plus derived group selection. Joint properties show connected bodies, permitted coordinates, driver/limits and conversion choices; body properties show material geometry and mass. Never use an `instanceof RealJoint` test as the complete selectable universe. |
| Menu and drop ring | Same kind icon, names and refusal result as the panel. “Mesh as gears” later resolves two specific R joints with a common carrier; a pin bundle alone is not enough information. |
| Holds and locks | Locks constrain allowed edits of the selected body/attachment; grounding is a physical joint to WORLD. Length/angle holds refer to stable local geometry or explicit dimensions. Welding must not erase leaf holds or turn an edit lock into a simulation constraint. |
| Group actions | Preflight all targets, deduplicate by stable identity, then commit once. Never apply the first targets and refuse the last. Copy/paste remaps every internal reference once and preserves WORLD only for deliberate ground connections. |
| Delete | Plan the exact closure first: selected members/group/assembly, incident connections, owned loads and now-unreferenced metadata. A connecting neighbor stays unless it is explicitly in that closure. Deleting a cylinder removes both members even when they occupy different welded groups; unrelated group members survive. |

A cylinder member cannot be deleted in isolation: offer the explicit “Delete Cylinder” action
and its complete cascade, while generic member deletion quotes the assembly protection reason.
Do not silently escalate a body action to deleting an assembly.

Deleting a relationship does not delete the material at its attachment. Deleting a body deletes
its own attachment markers and incident connections, not the far end of a neighbor's bar.
This makes the existing lone-point question explicit: standalone construction markers can be
removed by their own action, while material attachments on surviving bodies remain. Never use
“fewer than two remaining joints” as a garbage collector for native bodies.

One renderer produces material geometry; another renders relationship marks; assembly skins
decorate the relevant members. Keep cylinder barrel/rod coloring independent of an attached
bracket's group highlight. Do not union the bore into the bracket. Use the existing y-up
`modelFrame` / `upright` conventions and screen/model conversion service. Glyph stroke widths
and hit targets follow zoom/accessibility rules; guide alignment follows body rotation, not
screen axes. Pick priority must support coincident glyphs, touch targets, keyboard selection
and force handles without making an invisible synthetic joint steal a click.

Grid, menu, panel and drag ring must show the same grammar at oblique headings, reversed axes,
both welded mounts, both external block types, selection on/off, zoomed views and playback.
Filmstrip mouth drags and moving guides: a single screenshot cannot establish that ownership
and coordinates stay correct through motion.

## Structural transaction and lineage acceptance

The native planner takes one document snapshot and command, computes the complete doomed set
before mutation, then validates surviving body/joint/assembly records and the derived weld
components. Return an explicit effect list and selection mapping with the plan. Delete, weld,
unweld, merge/attach, slot-drop, all six link-creation gestures, cylinder creation, bulk edits,
load attachment and history restoration must use this boundary. Decode validates a candidate
whole document before replacing the current one. Assembly normalization may validate explicit
roles; it must not silently move or manufacture native interior points.

Create **new** `src/app/model/body-system/body-lifecycle.spec.ts`, with reusable native fixture
builders under `src/test-utils/verification/`. Build through actual editing commands, then
save/reopen. The test matrix must include:

- Three cylinders sharing an outer junction; deletion of one cylinder, of that junction, and
  of a selected welded group. Determine all incident assemblies before deleting anything.
- One welded group containing different members of different cylinders; deleting a cylinder
  removes its opposite member from a different group without deleting that group's bracket.
- Two groups joining, one group splitting into two groups, a group losing one member, and a
  group leaving only individual bodies. Force ownership and aggregate overrides follow the
  specified policy in each case.
- Two bodies sharing a pair of points while only one owns a slot; deleting or unwelding the
  carrier never hands its slot to the other. Moving the actual carrier into another welded
  group keeps its slot and local axis without any repair search.
- Custom group color/name and mixed automatic/custom member properties, nonzero mass/inertia,
  offset/custom CoM with grid/attachment editing anchors, circular material geometry, force
  application at a shared pin, member holds, locks, traces and valid local selection.
- A body's last R connection removed while its geometry and loads survive; dangling draft
  markers remain distinguishable from valid joints. A deleted body cannot leave a force whose
  BodyId no longer exists.
- Accepted and refused bulk operations, stale preview revision, idempotent validation, one
  history entry per commit, zero events/history changes on refusal, and undo/redo from a
  paused pose with an unrelated independently clocked machine present.

Permute root/body arrays, joint arrays, member insertion, construction direction and labels
independently. Enumerate all orders for the small three-member cases; reversing one array
alone is not enough. Assert exact retained material, joint connectivity, values and ownership,
not the shape of a replacement constructor call. Verify live selection remapping separately
from the shared URL, which does not promise to serialize selected UI objects.

Use the existing `welded-mount-identity`, `welded-mount-release`, `welded-mount-drawing`,
`services/cylinder-mount-topology.spec.ts`, `services/slot-lifecycle.spec.ts`,
`services/transcoding/url-weld-force.spec.ts`, `url-welded-mount.spec.ts`,
`url-com-anchor.spec.ts`, `url-locking.spec.ts` and `url-part-color.spec.ts` as the lifecycle
regression set. At S0 identify the actual current behavior and unresolved defects; at S4 port
behavioral assertions to native commands. Keep legacy tests passing while that runtime remains
active. New failure probes must fail for the intended reason when the corresponding defect
is deliberately reintroduced, not just because a decoder or admission gate failed earlier.

## Persistence, old production drawings, history and exports

Use a codec facade that dispatches before parsing: `pmks2:<payload>` means the version-2 native
schema; an unversioned payload enters the bounded legacy production reader. Encode the version
inside the checked envelope as well, or cover the prefix in the checksum. Include schema
validation, size/count limits, finite values, unique IDs, all references, joint-kind fields,
assembly roles and unit metadata before replacing the open document. An unknown version or
unsupported physical record leaves the current drawing intact and reports an actionable error.
Do not mistake corruption for a grounded slider or silently strip a coupling.

The native payload contains bodies/local geometry, attachments, binary joints and bundles,
assembly records, drivers/limits, material property modes, forces, holds/locks and document
settings. Store IDs and source data, not cached groups, sampled poses, solver routes or DOM
selection objects. Canonicalize record ordering for stable URLs; round-trip precision must
meet the solver gates. Compress only after a readable typed representation and its tests work.

Keep a small, isolated import for unversioned **production** drawings:

1. Freeze representative actual 2.0.3 payloads in compatibility fixtures: R four-bar/six-bar,
   compound/weld if present in production, loaded drawing, and grounded `Slider_Crank`.
   Treat the release version information as supplied deployment context, not something inferred
   from today's package.json. Verify old feature coverage against the production-era source
   and payloads during S0; do not assume that only the built-in template can contain a slider.
2. Decode the old syntax with the existing reader, then explicitly map supported R links to
   bodies and shared pins to binary relationships. Choose local frames once. Preserve old
   labels, loads, units and supported authored properties. A multiply grounded rigid member
   can become frame only when its constraints warrant it.
3. Map a grounded slider to a carriage body, a P from WORLD to the carriage, and the R from
   carriage to connecting rod. The relationship is massless; any material carriage's mass
   must be preserved. A zero-mass synthetic legacy carriage can remain zero mass. Collapsing
   that construction to a pin-in-slot is an optional proven optimization, not the importer.
4. Explicitly reject unreleased floating-slot, sealed-cylinder and unsupported Slide structures
   in the legacy import boundary. Keep a useful message explaining that development links
   need rebuilding. Do not reject ordinary production welds just because they used the same
   welded bit; recognize the supported structure, not only the flag.

No conversion command for arbitrary staging URLs is required. The legacy parser can remain
isolated for production compatibility after the old runtime classes and graph solvers are
removed. Reimplement it as decoded records rather than keeping a second editing model alive.
Save every imported drawing back in native format. Opening it in an older build is unsupported;
do not claim backward compatibility with older decoders.

`SaveHistoryService` currently uses URLs. Route history through the native codec/snapshot
facade before switching the editor; one transaction makes one history entry. Selection is
not generally a shared-URL property today: preserve valid local selections across edits and
undo with history metadata or remapping, without accidentally making active UI state public
document state. Test redo after selection changes. Version tab-local recovery and the
persistent last-drawing fallback (`last-drawing.ts`); a tab's own session still wins. A stale
unsupported development backup must not replace a valid new drawing or trap startup in a loop.

Analysis exports use BodyId, JointId and coordinate kind, with labels as separate columns.
Preserve blank values for unavailable rates. CAD geometry and companion tables must use the
same start pose, origin shift and units. Native P connections belong in a joint table, not as
fake massive links. Migrate SVG/DXF semantic metadata, selection exports, CSV/XLSX, reports,
force reaction/couple channels and tutorial progression; these are acceptance requirements,
not cleanup after shipping.

## Gears later: extension without a new body model

For two R joints whose axles are carried by body C, the external-gear constraint is
`r1 (theta1-thetaC) + r2 (theta2-thetaC) = phase`.
An internal gear uses the corresponding opposite sign. These are relative angular coordinates,
not two absolute body angles. If the joints' stored A/B ordering gives the opposite sign, the
coordinate mapping supplies it explicitly. A moving welded carrier uses its derived rigid
transform; matching a screen location or both joints being grounded is not the identity test.

Put this future row in a coupling compiler, after body/joint rows and before drivers. A rack
uses a travel coordinate and a rotational coordinate with a radius factor; a belt supplies its
own sign/ratio. Dimensional validation belongs here. A driver still prescribes one coordinate;
the coupling does not create a second driver. Coupling redundancy/conflicting phases are rank
and consistency questions, not a joint-kind flag.

The proposed gear interaction is sound with two corrections. Select two **specific revolute
relationships**, resolving multiway-pin ambiguity, and ask one model whether they have a
common carrier and distinct axle positions. Then obtain the ratio (default equal gears if the
future product chooses that). For external gears with `rho = r2/r1 > 0` and axle distance `d`,
`r1 = d/(1+rho)` and `r2 = rho*d/(1+rho)`. Distance alone leaves infinitely many radius pairs.
Internal gears use a radius difference instead of a sum and require their own kind. Do not
draw two arbitrary circles and later infer a physical ratio from their colors or array order.

## Ordered implementation and gates

### Gate conventions

At every numbered step: run its named unit specs through Angular's harness, then
`npm run build`, its named browser suites, and `e2e/ui-copy.mjs`. Browser names below mean
`e2e/<name>.mjs`; existing verification spec basenames mean
`src/tests/verification/<name>.spec.ts` unless another directory is stated. New specs are
explicitly marked **new**. Paths introduced under `body-system/` below are **new**.

Use `npm test -- --watch=false --include=<spec-path>` for focused development, not bare Vitest.
Run the full unit suite at S3, S6 and S8; do not remove numerical checks
because a fixture constructor changed. Run browser suites sequentially per server, using
`PMKS_BASE_URL=http://localhost:<owned-port>` and the Playwright setup in tips-and-tricks.
Inspect screenshots/filmstrips, not only exit codes. Each UI step includes Codex's own live observation and inspection under the current CLAUDE.md;
there is no additional mandatory model review beyond F1–F4.

Baseline failures require a same-check, same-environment comparison at the recorded base.
Old reports of phase1-drag or interaction-sweep counts are not a waiver for this branch.
Record exact failures and attribution. A newly reached failure is not automatically unrelated
just because some other fixture failed before. Do not normalize snapshots or raise numerical
tolerances to conceal a changed mechanism.

### Live localhost observation is a separate gate

Automated checks, DOM counts and screenshot assertions do not replace looking at the app in
motion. At S0 establish the baseline in a running local dev server; at S5 inspect the native
development route; at S6 and S8 inspect the native default. Open that localhost page through
the browser tools, verify the served revision/route, manipulate the controls and watch actual
motion. Do not substitute a hosted preview, conceptual mockup, or precomputed plot for this.
Use the assigned `localhost` port even if a stale skill example hardcodes 127.0.0.1:4200.

**Use both workflows at S0, S5, S6 and S8 (user decision, September 10, 2026).** Run the
automated Playwright checks and filmstrips, then use standard Codex computer use
(`mcp__cua_repl`) in incognito Chrome for live UX spot checks on the same build. Playwright
does the bulk of repeatable testing; native computer use exercises selection, the Edit panel,
context menus, drags and playback through ordinary user actions. Record which workflow
produced each observation in the progress ledger. Both were exercised successfully on
localhost before implementation. This is not a measured token-cost benchmark: the practical
reason for the split is compact, repeatable scripted checks plus direct interaction review.
If computer use is unavailable, keep the missing check explicit and continue independent
testing; do not silently substitute a Playwright result for both workflows.

For each observation session, use the actual editor to create or open the representative
mechanisms, play at ordinary speed, pause/seek, drag, select, undo and redo. Capture short
sequences/contact sheets or recordings at enough intermediate frames to inspect the motion;
view those frames yourself. Observe at least two complete cycles for looping mechanisms,
including extension and return for cylinders. Observe a stop/refusal sequence as well. Do
not merely wait while animation runs and inspect only its start/end screenshots.

Look for visual ownership errors, reversed assemblies, changing skins/colors, marks that
wander or pop at reversal, a stationary P mouth that is confusing to drag, pointer/handle
separation, obscured mounts, rotating guide alignment, mixed pin/weld selection, trace/force
jitter, and playback timing. Include horizontal and oblique guides, a rotating carrier,
off-axis witnesses, two independently clocked machines, zoom and a narrow viewport. Say
what looked wrong or what specifically stayed coherent; “the animation ran” is not evidence.

Record URL/port, commit and route, fixture/creation steps, watch duration/cycles, observations,
artifact locations and follow-up fixes in the ledger. If a motion or interaction looks wrong
while scripted assertions pass, fix it and keep a regression reproducer. These sessions are
part of Codex's own validation and do not spend Fable credits. Repeat the affected live flow after a visual or kinematic fix.

### S0 — Freeze native contracts and migration inventory (Codex self-review)

**Scope:** use the UI continuity reference above for a brief baseline orientation, then
proposed body-system type/coordinate interfaces, a checked inventory of live
`.joints`, joint-letter keys, `instanceof`, subset and shape consumers; production legacy
payload fixtures; test-utils fixture builders. Write the contract before parallel edits.

Classify each use as topology, material geometry, attachment, render mark, selection, or
analysis result. Specify adapter boundaries and which implementation owns each output.
Resolve production-only import coverage against the release source. Confirm template and
gallery inventory in the appendix; the current branch has 43 public template IDs and 66
gallery entries, plus three dev drawings. Freeze hand/MATLAB expected data and baseline timing
distributions before replacing fixture construction.

**Gate:** existing `app.component.spec.ts`, `fixture-gallery`, `template-payloads`,
`template-url`, `coupled-route-agreement`, `force-power-balance`;
browser `template-open`, `template-graphs`, `drag-perf`; build and ui-copy. No new public
behavior. Codex self-reviews the contracts here; the first Fable review follows the concrete
record/constraint implementation at S1, rather than paying twice to review the same design.

### S1 — Implement bodies, joints and welded-group compilation (Codex; F1 review)

**Scope:** new body-system records/frame/coordinate/weld-group modules; a pure document
validator and fixture factory. Adapt `model/rigid-bodies.ts` and `mechanism/bodies.ts` behind
an interface only after the pure compiler passes. Do not cut over the active editor yet.

**New specs under `model/body-system/`:** `body-frame.spec.ts`, `joint-record.spec.ts`,
`weld-groups.spec.ts`, `body-property-ownership.spec.ts`, `multiway-pin.spec.ts`.
Assert zero/one-connection bodies, local-frame changes, offset axes, pair-specific welds,
grounded R versus P, consistent/inconsistent weld cycles, multiple slots on one carrier,
material ownership after splitting, and permutation invariance with opaque IDs. Evaluate
mass properties with independent arithmetic and each project unit system.

**Gate:** new specs plus existing `model/rigid-bodies.spec.ts`, `coupled-mount-bodies`,
`slide-mobility`, `slot-mobility`, `uniform-body-links`; browser `two-mechanisms`,
`cylinder-mount`; build and ui-copy. These browser checks guard the still-active legacy app. F1 reviews the concrete representation
and conventions before S2 depends on them.

### S2 — Native position, mobility and continuation (Codex self-review)

**Scope:** new `body-system/constraint-compiler.ts`, `body-position-solver.ts`,
`body-mobility.ts`; extracted reusable linear algebra/continuation from
`mechanism/simultaneous-solver.ts`, `position-solver.ts`, `mobility.ts`, `mechanism.ts` and
`mechanism-partition.ts`. Keep a narrow result adapter for comparison, not another editor.

**New specs:** `body-constraints.spec.ts`, `body-position.spec.ts`, `body-mobility.spec.ts`,
`body-continuation.spec.ts` under body-system. Test equation/Jacobian signs at oblique and
offset frames, full-rank rectangular systems, redundant constraints, rank loss, multi-machine
WORLD sharing, branch retry and rollback, passive travel limits, long angle sweeps, and
translating/rotating coordinate-frame invariance. A one-pin rod must retain its shape/heading.

**Gate:** new specs; `app.component.spec.ts`; existing `coupled-mount-examples`,
`coupled-route-agreement`, `solver-sample-rollback`, `solver-branch-acceptance`,
`boundary-driven-branch`, `near-toggle-continuation`, `toggle-subdivision`, `reversal-retrace`,
`redundant-constraint`, `redundant-parallel-crank`, `wide-swing-rocker`,
`square-rod-tangency`, `two-slots-one-carrier`; browser `phase2-floating-slot`,
`phase3-slide`, `cylinder-mount`, `playback-direction`; build and ui-copy.

For adapter agreement, retain the existing 1e-3 positional ceiling against old solver results
where used, and the original MATLAB 0.01 expectations without relaxation. Normalize units
and sample the same commanded coordinate/branch. Record maximum errors as well as test
pass/fail. Large coordinate translations, uniform rescaling and altered object-mark scale
must not change physical feasibility. Display scale must not set stroke limits.

### S3 — Native rates, forces and result schema (Codex; F2 equation review)

**Scope:** new `body-system/body-rates.ts`, `joint-wrenches.ts` and typed result interfaces;
`mechanism/kinematic-solver.ts`, `force-solver.ts`, `mechanism.ts`, `model/actuator.ts`,
`mechanism/drive-profile.ts`; result adapters for existing analysis consumers.

**New specs:** `body-rates.spec.ts`, `joint-wrenches.spec.ts`, `body-power.spec.ts`.
Use the five independent examples listed below, nonuniform drive speed/acceleration, a
moving boundary whose acceleration projects nontrivially into a row, large rate ratios,
unreferenced remote points, and coincident visual pins with different body ownership.
Test the P reaction's transported moment at separated origins. Reactions must not be doubled
when redundant welds are condensed. Refused poses report no previous sample's rates.

**Gate:** full unit suite including `app.component.spec.ts`, `constraint-second-order`,
`constraint-rate-scaling`, `boundary-joints`, `driven-cylinder-kinematics`,
`driven-floating-pin`, `driven-floating-slot`, `driven-slider-block`, `slide-forces`,
`slot-forces`, `cylinder-forces`, `welded-mount-forces`, `force-power-balance`,
`frame-body-forces`; browser `force-analysis-panels`, `force-units`, `template-graphs`,
`export-flow`; build and ui-copy. S0–S3 done means a verified native computational kernel,
not a released editor. F2 reviews position, mobility, continuation, rates and force conventions
together before S4 depends on this kernel. Codex supplies independent derivations and focused
probes first, so the review can concentrate on uncertain/high-risk parts.

### S4 — Native document, transaction, codec and history (Codex; F3 lifecycle review)

**Scope:** `body-document.ts`, `body-edit-plan.ts`, `joint-permission.ts`, assemblies;
`mechanism.service.ts`, `grid-utils.service.ts`, `url-generation.service.ts`,
`url-processor.service.ts`, `save-history.service.ts`, `services/transcoding/`,
`last-drawing.ts`, `model/edit-permission.ts`, `model/lock-set.ts`, selection models.
Add new `body-document-codec.ts` and `legacy-production-reader.ts` in transcoding.

Implement native create/read/update/delete through one authority, using the structural
transaction and lineage contract above. Replace repair with validation. If an untouched
surface needs a temporary legacy-shaped view, expose it read-only and route commands back
to the native authority. Track every remaining writer in the S0 inventory.

S4 builds the native service/codec/history facade and a test harness; it does not switch the
public editor. S5 develops the native editor behind a development-only route flag, selected
before a drawing is loaded. Each editor instance has exactly one document authority. Never
convert a live legacy drawing into a partially native view in place. Native test payloads and
native history live only on the native route; existing public templates/suites keep the legacy
route until their native counterparts are ready. Switch design/simulation pose ownership
with that route, so playback cannot write the native design.

At S6, all templates and consumer paths are native and the route becomes the default; run the
full integrated gates there. S7 removes the development flag and old public runtime. Do not
leave a fallback that silently opens an unsupported native drawing with old semantics.

**New specs:** `body-edit-plan.spec.ts`, `joint-permission.spec.ts`,
`services/transcoding/body-document-codec.spec.ts`, `legacy-production-reader.spec.ts` and
history integration assertions. Test all joint kinds, production import, unsupported and
corrupt payloads without document loss, native canonical round trips, sessions, copy/remap,
multiway drives, deletion closures and branch-neutral paused-pose editing.

**Gate:** new native lifecycle/transaction/codec/history specs and native versions of the
regression set above, `cylinder-edit-transaction` and `cylinder-weld-guards`; keep legacy
versions passing while that route is active. Existing browser regressions on the legacy route: browser `edit-undo`,
`unit-undo-view`, `posed-editing`, `analysis-editing`, `locking`, `link-holds-angles`,
`two-mechanisms`, `export-flow`; build and ui-copy. The native service harness must test the
same paused-edit/history sequence without depending on unfinished UI. S5 supplies its native
filmstrip. This checkpoint is not evidence that native browser editing is complete. F3 challenges the
transaction, ownership and persistence contract before the native UI writes through it.

### S5 — Joint interaction and grid cutover (Codex live UI review)

**Scope:** `component/new-grid/`, `component/edit-panel/`, `component/context-menu/`,
`context-menu-builder.service.ts`, `slider-mark.service.ts`, `model/joint-marks.ts`,
`active-obj.service.ts`, `multi-edit.service.ts`, `selection-batch.service.ts`,
`model/drop-target.ts`; body/assembly rendering helpers. New glyph helpers should live outside
the grid hub and return typed marks/hit targets from the accepted document/view.

Replace the two-toggle interpretation with joint kind/pair properties. Implement P travel
dragging and free attachment creation, pair-specific welds, explicit delete scopes and group
selection. Cylinder creation constructs two bodies/P once; skins cannot create topology.
All preview/commit paths use S4 permissions. Include keyboard/touch, deselection, force
handles, locks/holds and editing from analysis modes. No hidden five-point fallback.

Unit controls must preserve meaningful precision for nonzero marker lengths across cm/m/in.
The S4 incognito reference check found that a 0.27 cm Object Size displayed as 0.00 after
switching to meters, and a size/coverage warning appeared despite unchanged on-screen size.
Do not inherit these legacy defects. Native acceptance must cover conversion and Undo/Redo
with unchanged framing, marker proportions and physically equivalent settings; coverage
advisories must reflect settled screen coverage rather than the unit label or raw magnitude.

**New specs:** `body-joint-marks.spec.ts` and `body-joint-interaction.spec.ts`; new browser
`body-joint-editing.mjs` and `body-joint-render.mjs`. Existing browser gates:
`context-menu`, `context-menu-modes`, `disabled-toggles`, `creation-previews`,
`phase4-build-from-scratch`, `phase4-gestures`, `cylinder-mount`, `cylinder-mount-render`,
`cylinder-drag`, `cylinder-panel`, `cylinder-skin`, `cylinder-end-on-joint`,
`multi-select-and-dxf`, `keyboard-shortcuts`, `mobile`; build and ui-copy. Existing regression
suites continue on the legacy route until ported; the two new suites and native ports explicitly
select the native route and load native fixtures. Run ui-copy against both rendered routes.
Do not call a legacy-only passing suite evidence for native behavior. At S6 every named suite
must run against native default; remove obsolete setup assumptions only alongside replacement
native assertions. The native paused edit/history filmstrip deferred from S4 is required here.

Required filmstrips: every joint kind at horizontal/oblique headings; P drag at a fixed mouth;
P drag on a rotating carrier; mount weld/unweld at either cylinder end; external grounded and
floating mount slots; a multiway R with only two welded members; accepted/refused bulk edit;
undo/redo and zoom. Show a full cylinder out-and-back cycle rather than comparing only the
first and last frames, which are the same pose. Codex must inspect the live interactions and
intermediate frames itself; do not send another paid review request for this checkpoint.

### S6 — Analysis, export, tutorial, templates and default cutover (Codex self-review)

**Scope:** `component/analysis-panel/`, analysis services and graphs, `services/export/`,
`component/synthesis-panel/`, `services/synthesis/`,
`component/MODALS/drawing-export/`, `tutorial.service.ts`, `model/tutorial-steps.ts`,
`component/tutorial-panel/`; template and fixture files listed below. The integration owner
alone changes the two hub files. Complete these consumers against the stable record/result
contracts, then make the native route the default in one integrated cutover.

Finish coordinate and reaction labeling, body/local attachment tables and CAD semantics.
Route synthesis results through the native body/joint creation commands; preserve target
poses, selected dyads, drive direction and synthesis-design persistence. Its mathematical
construction may still use points internally without becoming a second editable graph.
Rewrite tutorial progression against constructed body/joint facts, including undo. Rebuild
each template/fixture from mechanical intent; preserve reference answers, timing, forces,
traces and camera/backdrops. Rebuild the dev object gallery to expose all new entities and
ambiguous hit targets, not a translated screenshot of synthetic joints. Generate payloads
only from the rebuilt fixtures, then manually update the non-generated template block.
Self-review the complete native route before changing the default, then rerun the gate
with the default switch applied. Preserve semantic assertions when porting e2e setup from
old payloads; a check is not satisfied by continuing to serve the legacy editor.

**Gate:** full unit suite including `fixture-gallery`, `template-payloads`, `template-url`,
`services/export/dxf/semantic-dxf.spec.ts`, `gallery-round-trip.spec.ts`,
`services/export/export-flow.spec.ts`, `model/tutorial-steps.spec.ts`,
`services/synthesis/synthesis-driveable.spec.ts`, `synthesis-insert-direction.spec.ts`,
`services/transcoding/url-synthesis-design.spec.ts`, `services/last-drawing.spec.ts`;
browser `template-open`, `template-graphs`, `template-backdrops`, `force-analysis-panels`,
`force-labels-and-legend`, `force-units`, `analysis-setup`, `export-flow`,
`release-export-ui`, `tutorial`, `synthesis-redesign`, `multi-select-and-dxf`, `two-mechanisms`,
`multi-mechanism-smoke`; build and ui-copy. Use `template-animations` with `ONLY` for changed
representative families and inspect generated assets before keeping them. Filmstrip all
five worked examples, the new object gallery and one tutorial construction/undo sequence.

### S7 — Remove the old runtime and verify performance (Codex self-review)

**Scope:** close the removal manifest above and remaining S0 inventory; old
Joint/Link/SliderBlock runtime classes and adapters,
old cylinder recognition/pose repair, compound materialization, old loop consumers not used
by any retained optimization. Keep the isolated production reader's record schema. Update
CLAUDE.md, relevant historical-plan status notes and tips-and-tricks so the next agent does
not restore a deleted representation to fix a stale test.

Delete only after replacement tests name the same behavior. Remove the dead IC path if still
present rather than porting it. A retained closed-form optimization must accept native records
through a bounded adapter and satisfy the same result/branch/rate contract; no public code
may depend on its auxiliary point IDs. End with one document, one ownership index and one
constraint semantics; derived caches carry document/pose/paint revision keys.

**Gate:** native specs and original verification suite; browser `drag-perf`, `playback-timing`,
`playback-direction`, `playback-stepping`, `input-settings-and-playback`, `template-graphs`,
`cylinder-mount-render`, `body-joint-editing`, `body-joint-render`; build and ui-copy.
Measure cold precompute, warm edit, drag p50/p95, sample count and memory on the same hardware,
same fixtures and unit/mark settings as S0. Never compare only per-sample cost after reducing
sample density. Default budget: no more than 2× baseline end-to-end precompute or drag p95,
and no newly introduced sustained drag p95 over 50 ms on the reference gallery. A measured
baseline already above that threshold must not worsen. If this gate fails, optimize or keep
the milestone unreleased; do not change the budget inside the unattended run.

### S8 — Final integration/release gate (Codex; F4 integration review)

**Scope:** fixes only, documentation and release evidence. Run full unit suite, build,
ui-copy and the union of named S browser suites against the final integrated commit. This
one deliberately broad final pass is justified; do not run the full browser directory at
every preceding step. Include all five hand-derived mechanisms and the complete template
open/graph inventory. Native-only storage must survive new tabs, reload, history, share and
export/import. Verify supported production URLs separately from manually rebuilt dev URLs.

F4 reviews integration and removal/compatibility risks, using the F1–F3 findings and resolutions
so earlier derivations do not need another exhaustive paid review. Codex inspects the running
editor, marks, tutorial, exports and filmstrips directly. Reports must
name any intentionally unavailable case. No known correctness failure affecting the new
representation can be carried as “the old suite also had failures.” Prepare a release
candidate and handoff; do not publish it or push `main`.

## Five worked examples: what counts as independent evidence

Keep the scenarios in `src/test-utils/verification/coupled-mount-fixtures.ts`, but express
their native construction through the same commands as the editor. Publish new drawable
entries in `FIXTURE_GALLERY`; a solver-only constraint set is not UI integration evidence.
Each expected answer is a function of fixture constants and commanded input only. It may
not read the solved body angle, solved slot direction, fitted radius or previous solver run.

| Example | Required independent assertions |
| --- | --- |
| Ram driving an axial carriage | With fixed guide heading `u`, `p(s)=p0+s u`; velocity `sdot u`, acceleration `sddot u`, constant carriage/rod heading, correct barrel/rod separation and bounds. Add a transverse load to check guide normal and couple. |
| Oblique guide intersection | Derive the intersection from fixed/commanded line equations and the ram's geometric span; choose and name the signed square-root branch where two intersections exist. Differentiate that scalar expression. Test near tangency, true infeasibility, finite travel stop and reversed axis labels separately. |
| Ram on a translating bracket | Superpose the prescribed bracket translation and relative extension; every off-axis bracket witness gets the same translation and zero angular rates. Apply nonzero boundary acceleration that has a nonzero projection into a constraint row. Test that omitting that term fails. |
| Rotating floating carrier | Use prescribed `theta(t)` and travel `s(t)` to derive `p=r+R(theta)(a+s u0)`. Assert the `2 omega sdot E R u0` Coriolis term and angular/centripetal terms, with both nonzero command accelerations. Use an offset boundary point so boundary acceleration cannot be orthogonal to every row. |
| Welded bracket with off-axis witness | Derive bracket pose from the mechanical construction and compute witness `p=r+R(theta)a`, velocity and acceleration explicitly. Nonzero witness offset catches a flipped body and missing angular acceleration. Add a load at that witness; compare moment balance and input power. The third body at a coincident R must remain pinned if only two are welded. |

All five assert body shape/handedness, every joint row, correct coordinate branch, all passive
and driven travel bounds, position/velocity/acceleration, availability on refusal, and exact
body/joint/DOF counts. Repeat after creation-order permutations, A/B direction reversal with
sign conversion, save/reopen and undo/redo. Check multiple interior samples, stops and return
motion. Sample derivatives on nonuniform command profiles too. Preserve existing trusted
numeric tolerances; use dimensionally stated absolute/relative tolerances for new rates and
forces and justify them from the formula/conditioning before looking at solver output.

## Templates and fixtures to rebuild

This is the baseline inventory, not permission to silently omit new entries added before
implementation. Read the exported collections again at S0 and append any additions. Use
`e2e/template-payloads.mjs`'s shared reader and `assertTemplatesParsed()` for browser sweeps;
do not copy its parsing into another script.

**Public template source:** `src/app/component/MODALS/templates/template-linkages.ts`;
catalog metadata: `template-catalog.ts` in that directory. The 11 manually maintained IDs:

- `4-Bar`, `Watt_I`, `Watt_II`, `Stephenson_III`, `Slider_Crank`, `Locked_Four_Bar`.
- `Cylinder_Gripper`, `Aircraft_Landing_Gear`, `Hood_Hinge`, `Excavator_Bucket`, `Car_Steering`.

The 32 library IDs, generated via `src/test-utils/verification/template-fixtures.ts`:

- `Whitworth_Quick_Return`, `Scotch_Yoke`, `Cylinder_Boom`, `Radial_Engine`.
- `Chebyshev_Straight_Line`, `Windshield_Wiper`, `Elliptical_Crank`, `Jansen_Leg`.
- `Backhoe_Bucket`, `Scissor_Lift`, `Shaper_Quick_Return`, `Pedaling_Leg`, `Oscillating_Fan`, `Pumpjack`.
- `Punch_Press`, `Derrick_Crane`, `Toggle_Clamp`, `Offset_Load_Rocker`, `Bell_Crank`, `Flywheel_Engine`.
- `Elliptical_Trammel`, `Peaucellier`, `Pantograph`, `Double_Butterfly`.
- `Crane_Two_Loads`, `Three_Machines`, `Walking_Pair`, `Straight_Line_Pair`, `Pumping_Field`.
- `Landing_Gear`, `Four_Bar_Inversions`, `Slider_Crank_Inversions`.

**Dev source:** `src/app/component/MODALS/templates/dev-templates.ts`:
`Dev_All_Mechanism_Types`, `Dev_Object_Gallery`, `Dev_Render_Stress`.

**Gallery source:** `src/test-utils/verification/fixture-gallery.ts`, all 66 current names:

1. Punch press
2. Derrick crane
3. Toggle clamp
4. Rocker with an offset load
5. Hydraulic cylinder
6. Cylinder-driven boom
7. Aircraft landing gear
8. Cylinder-driven gripper
9. Parallel gripper
10. Gripper on rails
11. Gripper the cylinder closes
12. Backhoe bucket
13. Toggle press
14. Scissor lift
15. Shaper's quick-return drive
16. Slider-crank whose rod comes square to the guide
17. MotionGen gripper
18. Gripper with the redundancy removed
19. Radial engine, five cylinders
20. Chebyshev straight-line linkage
21. Windshield wiper
22. Jansen leg
23. Elliptical crank
24. Inverted slider-crank
25. Whitworth proportions
26. Slotted lever pinned off its slot
27. Guided rod pushed by a link
28. Slotted lever with a rod that cannot tilt
29. Inverted slider-crank with a load
30. Four-bar with a slotted coupler
31. Scotch yoke
32. Scotch yoke with a tracer
33. Scotch yoke guided at the far end
34. Elliptical trammel
35. Four-bar driven at its coupler-rocker pin
36. Leg on a bicycle crank
37. Oscillating fan
38. Walking-beam pumping unit
39. TeachingLab four-bar
40. TeachingLab four-bar, locked except the crank
41. TeachingLab slider-crank
42. Slider-crank with a tracer
43. Stephenson III
44. Watt I
45. Crank on the edge of Grashof
46. Four-bar with four equal sides
47. Parallelogram with a third parallel crank
48. Rocker that swings more than a turn
49. Crank holding its length
50. Two four-bars
51. Engine with a flywheel
52. Crane carrying two loads
53. Three machines, three drives
54. Peaucellier-Lipkin linkage
55. Pantograph
56. Double butterfly linkage
57. Drag link
58. Bell crank
59. Elliptical trammel, driven
60. Screw jack
61. Loader bucket
62. Four-bar inversions
63. Slider-crank inversions
64. Walking pair
65. Approximate and exact
66. Pumping field

Rebuild the underlying constructors in `fixtures.ts`, `slot-fixtures.ts`, `force-fixtures.ts`,
`library-fixtures.ts`, `feature-fixtures.ts`, `classic-fixtures.ts`, `inversion-fixtures.ts`,
`workshop-fixtures.ts`, `ensemble-fixtures.ts` and `coupled-mount-fixtures.ts` under that
test-utils directory. Update `fixture.ts`, `solve.ts`, `rates.ts`, `compare.ts` and `suites.ts`
only where their input/result contract changes. Do not rewrite reference data under
`src/test-data/verification` to agree with new output. Add the five new native worked examples,
the three-ram lifecycle example, the pair-specific weld example and a one-connection body to
the gallery. Every verification mechanism added during this work gets a reviewable URL.

Run `npm run fixture-urls` and `npm run template-payloads` after rebuilding. The latter changes
only the generated library block; the first 11 templates and three dev payloads still need
explicit rebuilding. Preserve catalog IDs, names, speed/direction, loads, traces and backdrop
alignment. Verify both force-capable and unloaded examples; an unloaded template's force
readiness refusal is expected, not a reason to insert a fictional load.

## HOW CODEX SHOULD IMPLEMENT THIS — WITH FABLE 5.1 REVIEWS

Codex owns implementation, commits and integration. Fable 5.1 is an independent reviewer via
the Claude Code CLI, not the implementation owner. This section supersedes the attachment's
Claude/Opus implementation-agent recipe. Use the current Codex task's configured model;
there is no need to change models or create other user-visible tasks.

The complete `/goal` objective is:

> Implement S0–S8 of docs/bodies-and-joints-plan.md in this task's authorized feature branch.
> Preserve the existing interaction philosophy, shared UI components, visual style, motion and
> vocabulary while replacing the point-centric runtime with persistent bodies and binary joints,
> including the native editor, solver/rates/forces, versioned persistence, supported production
> imports, rebuilt templates and fixtures, and legacy-runtime removal. Obtain Fable 5.1 reviews
> at F1–F4 within the $35 Fable working budget, resolve actionable findings, and satisfy every
> applicable gate and the final definition
> of done. Keep verified checkpoint commits and an execution ledger; continue automatically
> between checkpoints. Do not stop at a kernel or a partial editor. Do not publish or push main.

Do not start a second goal for a review or checkpoint. Do not mark the goal complete until S8
passes. Context compaction or an interrupted process does not change the objective: recover
from the ledger and continue the same migration. This document's defaults authorize routine
choices; a new incompatible requirement or an actual external blocker must be reported,
not answered by quietly changing the goal.

### Persistent execution ledger and code ownership

Create `docs/bodies-and-joints-progress.md` in S0. Record the starting hash, current step,
last verified commit, current working diff, outstanding findings, exact check commands/results,
review transcript locations, artifacts and next action. Update it at every verified checkpoint
and before an interruption/compaction when possible. Keep detailed logs in gitignored
`artifacts/bodies-and-joints/<checkpoint>/`; commit concise review resolutions and gate status
in the ledger so recovery does not depend on an ephemeral CLI conversation.

Implement S0 → S1 → S2 → S3 → S4 sequentially. S5 UI and S6 consumer/fixture work share stable
S4 contracts, but the default is still one Codex implementation owner. Independent read-only
Fable review may run while Codex works on unrelated verification or documentation; do not edit
files under review before a returned finding has a stable base to reference. Do not build a
later step on an unresolved core contract.

Codex is the sole writer of `mechanism.service.ts`, `new-grid.component.ts` and its template,
the codec facade and native solver/result interfaces. No implementation-agent fan-out is
needed to make this one goal. If later expressly authorized, bounded worker tasks can cover
pure glyph helpers, template construction, or mechanical result consumers in isolated
worktrees; their changes still pass through Codex's integrated gate. Never delegate ownership
of both a numerical derivation and its independent expected-answer review to the same worker.

### Four focused Fable checkpoints and a bounded credit budget

The user has approximately **$40 of usage credits remaining for this migration**. Treat that
as a ceiling, not a target to spend. Use a **$35 working ceiling**, leaving roughly $5 for
estimation/CLI overhead and the uncertainty of an approximate balance. Do not buy credits,
change accounts or switch models to get around it. Codex self-reviews every S checkpoint;
Fable is reserved for four independent reviews where another reader is most valuable.

| Review | Gate / assigned maximum | Focus |
| --- | --- | --- |
| F1 | After S1, before S2; **$5** | Concrete body/attachment/joint records and equations, multiway pair identity, weld cycles, group versus member properties, one-connection bodies and legacy mapping contract. Review the actual records once instead of reviewing a speculative design and then the same design again. |
| F2 | After S3, before S4; **$10** | Native position/rank/branch/limit semantics and rollback, analytic acceleration including moving boundaries and command terms, P reaction wrenches, row scaling and units. Supply Codex's independent derivations and adversarial tests; ask for counterexamples and missing terms. |
| F3 | After S4, before S5; **$7** | Transactions, three-ram deletion cascades, weld/split/merge ownership, mass/CoM/force provenance, stale previews, selections, native/history/recovery codecs and production grounded-slider import. Enumerate changed identity and ownership, not just the happy path. |
| F4 | At S8, before goal completion; **$6** | Integrated cutover, all teaching material accounted for, real editor versus fixture bypasses, exports/tutorial, remaining hidden point assumptions, adapter removal, performance evidence and unresolved earlier findings. Read earlier review resolutions rather than re-deriving every already-reviewed equation. |

Assigned caps total $28; the remaining **$7 within the $35 ceiling** is reserved for a necessary
focused follow-up or a new high-risk uncertainty. Unspent caps remain unspent; do not run
extra reviews because credit remains. Ordinary implementation, lookup, UI copy, mechanical
sweeps, clear bug fixes and test interpretation belong to Codex. Do not send one review per
file or one request per failed test. Batch related questions at the planned checkpoint.

Maintain an `anthropicReviews` ledger with checkpoint, CLI session ID, exact reviewed hash and
file list, assigned cap, CLI `total_cost_usd`, cumulative cost and remaining working budget.
Count the total CLI cost, including any auxiliary-model cost reported by the CLI, not only
the Fable line. Account for earlier migration calls where their cost is known; label unknown
cost as unknown rather than zero. Confirm the available balance at launch if it has materially
changed; otherwise use the supplied approximate budget and the headroom above.

Use `--max-budget-usd` with the lesser of the checkpoint cap and the unallocated remaining
working budget. The flag is a guard, not a guarantee that billed usage is exact to the cent;
leave headroom and read actual cost after every call. If an early call consumes less, retain
sufficient budget for the remaining required reviews before allocating any follow-up. If a
review reaches its cap, keep its completed findings and do not automatically start the same
request again. Narrow unresolved questions or preserve the gate as pending if the budget
cannot support a valid review. Never count a budget-truncated answer as approval.

Keep input bounded: a concise review brief, relevant contract sections, checkpoint diff,
explicitly named source/test files and results. Do not paste the entire conversation, every
artifact or the whole repo. Source access is authorized, but reading everything is wasteful.
Ask for findings only, normally within 800 words, with severity, file:line, a concrete
counterexample and the violated invariant. If no finding exists, a short explicit conclusion
is enough. No recursive agents or tool-driven implementation by the reviewer.

The user's authorization to send this repository's content to Anthropic is already explicit.
Do not request permission again for routine in-scope reviews. It excludes credentials,
unrelated workspace files and other projects. Fable 5.1 availability was tested successfully
during planning; do not repeat a paid availability check before every checkpoint. A later
usage-limit/auth response is an external blocker, never a passed review or permission to
substitute another model.

Use the following Fable invocation with a per-review cap and JSON cost reporting. For example:

```bash
git diff <verified-base>...HEAD | claude -p --model fable \
  --max-budget-usd <checkpoint-cap> --output-format json \
  --allowedTools "Read Grep Glob" -- \
  "Review this checkpoint diff and the explicitly named related files against the supplied contract. Focus on the checkpoint questions. Report actionable correctness findings only, with severity, file:line, a counterexample and the violated invariant, within 800 words. Do not invoke codex, claude, or grok."
```

Use the actual F1–F4 questions and file allowlist in the prompt. Read `result`, `is_error`,
`total_cost_usd` and `modelUsage`; the availability check resolved `fable` to
`claude-fable-5-1`. Do not silently accept another model. A review of uncommitted changes
needs the working diff/named files, since `<base>...HEAD` cannot see them. Never grant
Write/Edit/Bash tools in a noninteractive review. Network/keychain access may require an
escalated run; repository disclosure for these reviews is authorized.

An empty or tool-only result is not approval. Inspect the completed session's persisted
transcript first before spending credits on another request. Claude stores these under
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`; read completed assistant text from
`.message.content` entries whose `type` is `text`. Do not dump credentials or unrelated
sessions. Only rerun with stream-JSON/verbose after diagnosing a real output issue
and allocating its cost. Save completed findings and their disposition in the progress ledger.

Fix actionable correctness/data-loss findings and prove each with a regression test before
crossing its gate. If a finding is mistaken, record a concrete counterexample/invariant that
refutes it. Codex can validate a straightforward repair without another Fable call. Use the
follow-up reserve when a repair materially changes the physical-model contract, introduces
new equations, or leaves a genuinely unresolved high-risk disagreement. No routine paid
re-review after every fix. Codex performs its own UI review; the current CLAUDE.md no longer
requires a separate cross-model UI review. Do not recreate that requirement in the workflow.

### Browser and integration discipline

Read CLAUDE.md, tips-and-tricks and the UI validation skill. Use American English throughout;
comment why; format only touched files. Run the named suites rather than the entire browser
directory at every step. Verify source paths/test basenames before a scripted batch.

Use an owned dev-server port and disposable browser profile, with
`PMKS_BASE_URL=http://localhost:<port>`. Verify HTTP readiness and a marker from the expected
build, not the tail of a serve log. Do not edit source served by a running suite. Check the
Playwright and filmstrip dependencies before attributing a launch failure to the app.

Keep baseline/reviewer work read-only or in clean isolated worktrees based on an explicit
hash. A new worktree may start on main without dependencies; inspect HEAD/status and create
its task branch at the supplied hash before installing dependencies. Never reset a dirty or
shared checkout. Do not use bare `git stash`; the stack is shared. Preserve existing untracked
files and stage explicitly. Do not push this branch unless separately requested.

Some suites rewrite tracked assets: `template-animations`, `template-thumbnails`, `readme-shots`
and `shot`. Use `ONLY` where supported, inspect diffs, and retain only intentional artifacts.
Restore only files generated by your own run; never broadly restore `src/assets` or `docs`.
Filmstrip output directories are cleared on each capture, so use a distinct directory per flow.

At UI gates inspect the live localhost UX and your own filmstrips under the current CLAUDE.md.
Review the actual native route, not a passing legacy page served from another checkout.
The four Fable calls are the only mandatory external reviews; keep all other review work local
to Codex unless a high-risk question justifies a budgeted follow-up. Keep final check output
tied to the integrated commit.

After each gate and review resolution, commit the coherent step, record the commit and next
step in the ledger, then continue the same goal. If a review fix touches a previous contract,
rerun its dependent checks before advancing. No routine user confirmation between checkpoints.

### Failure recovery inside the one goal

Classify failures as environment, regression, intentionally replaced behavior, or baseline
defect. Reproduce suspected baseline failures at the recorded base in a separate checkout/port.
An intended behavior change requires a stronger replacement assertion for the new contract;
deleting a test, resetting an expected answer or raising its tolerance is not a repair.

Keep a minimal failing probe and fix the smallest responsible unit. Rerun the failed check,
then its checkpoint gate. After two unsuccessful attempts at the same cause, stop repeating that approach. Codex first
isolates and re-derives the failure; use a focused Fable diagnosis only for an unresolved
high-risk question and only within the reserved budget. A diagnosis that changes a core
contract returns work to that checkpoint and invalidates dependent gates; it does not start
a new goal. Continue useful independent work during a pending review, but do not cross its gate.

If Fable or another required external dependency is unavailable, retry a diagnosed
transient failure and complete independent checks. Leave the review gate pending; never count
silence as approval. Preserve the last verified commit and the current diagnostic work, update
the ledger with the exact blocker and restart instruction, and report honestly if external
help is needed. Use the host's actual goal-state rules when marking an external block; do not
claim success because time/context is running low. The only successful stopping point is S8.

## Out of scope and final definition of done

Out of scope: gear/rack/belt implementation; collision, backlash, friction, hydraulic fluid or
compliance; general impact/contact dynamics; multi-input motion planning; a new singular-start
algorithm; broad production URL breakage; general staging-document conversion; an IC-solver
revival; a complete CAD editor; unrelated CSS/formatting cleanup; deployment or publishing.

Not out of scope: floating guides at mounts; pair-specific multiway pins; one-connection
bodies; mass/CoM/force ownership; locks/holds/history; native URL versioning; all listed
templates/fixtures; selection, tutorial, analysis, exports and visual integration.

**The full migration is done only when** a cylinder consists of two persistent physical bodies
and one internal P, every live connection is a typed binary relationship, welds derive groups
without rebuilding material identity, and no consumer needs hidden joints to define a body.
The UI continuity contract is met: necessary new controls fit the existing selection/panel/menu
workflow and styling. The removal manifest is closed, superseded runtime/handlers are deleted, and every retained
compatibility or optimization module has a named live consumer.
All creation and edit paths use one document transaction and one refusal model. Native URLs,
history and supported production imports preserve the intended drawing. The five worked
examples, MATLAB comparisons, force/power checks, fixture gallery, selected e2e suites,
filmstrips, recorded live localhost observations, build, ui-copy and independent reviews pass at the integrated commit within the
stated performance budget. The release report names the final integrated commit, review resolutions and verification
evidence. Goal completion does not require publishing to students.


## Planning validation status

This plan was checked against the current model, lifecycle, codec and solver sites. All 66
baseline gallery names, the 43 public template IDs, the three dev IDs and the existing named
gate paths were checked. No implementation or application test/build run is claimed by this
document-only change.

At the user's request, the substantive planning review was stopped and only a minimal Fable
availability check was completed. The CLI returned `FABLE_OK`, resolved to
`claude-fable-5-1`, and reported `total_cost_usd = 0.073899`. Session:
`1e1aa8aa-e65e-4f52-957b-56ef372e594e`. This establishes availability, not approval of the plan.
The maintainer authorized sending repository content to Anthropic and enabled usage credits.
No substantive Fable plan-review findings are claimed; F1–F4 belong to implementation.
