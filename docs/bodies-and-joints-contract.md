# Native implementation contract

S0 contract at `487d535`; implements the decisions in [the migration plan](bodies-and-joints-plan.md). This document resolves interface choices for S1–S6. It is not evidence that those interfaces have been implemented.

## Record and unit boundary

Use readonly plain records and branded string IDs for Body, Attachment, Joint, Driver, Limit, Force, Assembly and Junction. No ID contains mechanical meaning; labels are separate and may change. The reserved WORLD body is explicit, immutable, has identity pose, no material mass and cannot be deleted. Factories allocate IDs once; copying allocates a complete remap before copying any references. Validation rejects duplicates across each ID namespace, missing owners, non-finite fields and self-connections.

`BodyDocument` contains `version: 2`, units/settings, bodies, attachments, joints, junctions, assemblies, drivers, limits, forces, holds, edit locks, group annotations and synthesis design. Revision is an authority/session property, not a checksum substitute or physical constraint. No solved positions, derived groups, route, selection objects or writable legacy graph appear in the shared payload.

All stored geometry uses the document's declared length unit, **not MODEL_SCALE**. Angles use radians throughout records, including design poses and local directions. Unit metadata names length, mass, inertia and force units independently: legacy centimeters use grams for mass but kg·cm² for stored inertia, so never infer inertia from mass times length squared. The analysis compiler converts these to meters, kilograms, kg·m² and newtons once. The view converts physical length to current SVG/model coordinates. Object/mark scale only sizes marks; it never changes physical stroke, feasibility or mass.

`Pose = {x, y, angle}`; `Point = {x, y}`. Body geometry contains stable local vertices and authored shape (`bar`, `polygon`, `circle`), plus explicit binding metadata for editable endpoints. Attachments reference a body and local point; optional shape-vertex binding means a design edit moves both. An unbound tracer is not a new hull vertex. Ordinary bars retain the existing slender-rod mass idealization (`m L² / 12`), independent of drawn width. An authored disk/polygon has area-based properties. A circle display override is presentation metadata and does not turn a bar into a physical disk. Areal density is not accepted for a centerline bar. A body may have zero connections or one without losing geometry.

Material mass specifications distinguish automatic and explicit mass, inertia and CoM independently. Automatic geometry-derived values are resolved before aggregation. A zero-mass body has a finite display center but no fabricated physical center. Aggregate overrides live on group annotations with predecessor membership and explicit optional mass, inertia and center values (an absent value remains member-derived); they never rewrite material members. Local CoM and its edit-anchor metadata are separate fields.

Legacy compound-owned loads need provenance too. An old root LinkId can own a load without
naming any leaf; the force point may not lie uniquely on one member. Import that load in a
deterministic member's local frame, but also retain its original group membership and each
member's import-time transform relative to that reference as `legacyGroupScope`. That member is a coordinate reference, not a claim about the author's
material choice. While the scope stays rigid its resulting wrench is exact. A split or
deletion that would force a member-ownership choice refuses until the author explicitly
assigns the load to a surviving Link. Reshaping or re-welding that changes a scoped relative
transform requires the same explicit choice; co-membership alone is insufficient. Moving/merging
the intact group preserves the scope. A local-frame rebase transforms this provenance alongside
the load, so a coordinate change does not masquerade as a material change.
The panel must explain this using the same refusal model. Do not guess ownership from the
nearest polygon or drop the load. Native load creation always names a material member and
never creates this import-only provenance. F1 challenged co-membership-only provenance and
led to the relative-frame requirement; F3 must review its transaction and importer behavior.

## Authored project state (S4)

The required `settings` record carries angle/force display units, gravity, static/dynamic force
analysis, major/minor grid and ID visibility, object scale, and signed defaults for *new* drives.
Angular defaults are radians/second; linear defaults and object scale use document length
units. A drive's captured profile remains authoritative after a default changes. Physical
`units` stay separate from display preferences. Unit conversion must transform authored values;
relabeling `units` alone is not an editing operation.

Optional `synthesis` contains up to three ordered target poses in document lengths/radians,
end-effector length/reference, search options and pivot region. Generated body/joint IDs and
attachment IDs with their original world positions retain replacement provenance. A deletion
prunes only previously existing references that actually disappear and marks the result partial.
It must not repair away nonexistent references supplied by a malformed command. No selected row,
armed placement gesture, cached candidate list or old point-graph object enters this record.

Optional `view` contains camera center/span and a shipped backdrop asset with center, width,
rotation, opacity and label. A camera span is the model length across the shorter usable viewport
side; the other side follows the viewport aspect ratio. Shared backdrop references are bounded
`assets/backdrops/<name>.<image extension>` paths, never data URLs, remote URLs or traversal.
Asset loading remains a UI concern. Local photo data, snap preferences, global trace/CoM toggles,
active selection and playback clocks remain local. Shared camera/backdrop coordinates use the
same document units and start frame as the drawing.

The shared model schema and 8 MiB UTF-8 envelope budget apply to accepted edits as well as
loading; an edit cannot knowingly produce a document that its codec refuses to save.

Project edits use the same transaction/history boundary. Synthesis-only authoring works in
Synthesis mode. Document settings quote `SETTINGS_AT_START_ONLY`; metadata changes do not
restart clocks. Gravity/force-mode changes invalidate force results, including in mixed batches,
without using that broader invalidation to restart an unrelated machine.

## Joint shape and ordering

Each joint has ordered `bodyA` / `bodyB` and two explicit local frame records. Each frame stores an AttachmentId for its origin and a local angle for its directed axis. Both attachment owners must match the named bodies. Storing the axis as an angle guarantees normalization; derive vectors with sine/cosine and reject non-finite angles. Rendering stations are separate guide-local metadata with their own material owner and frame, never attachment points used to locate bodies. Reversing P equation order cannot hand its visible guide to the other member. A pin-in-slot
guide must belong to A, since its rider can rotate independently.

- R: two local anchors, `angleZero`; two coincidence equations.
- P: two local directed frames, `angleZero`, `travelZero`; one lateral equation and one continuous relative-angle equation.
- Pin-in-slot: the same two frame/origin records and travel/angle datums; one lateral equation, no fixed-heading row.
- Weld: captured B-in-A rest transform and a chosen display attachment; three rigid equations before condensation.

Creation refuses coincident bar vertices and off-line P/slot origins; a travel datum cannot
compensate for lateral error. R origins must coincide. These checks do not require a body to
have any connections.

Choose datums at creation so a newly authored coordinate reads zero unless importing a specific existing datum. Compute P `angleZero` from the two local axis angles, ensuring those axes have the captured relative orientation. The solver must not wrap the angle residual separately at each sample. It uses unwrapped body angles and a fixed integer-turn branch from the accepted pose. A kind conversion captures new datums at the accepted displayed pose and preserves a drive only when the same ordered relative coordinate survives.

Reversing A/B is an explicit operation, not array sorting. R angle changes sign. P/slot travel requires transforming the guide axis and datum into the new guide body; it is not in general achieved by negating a field while keeping the original frame. Reversal tests compare world kinematics and virtual work with the mapped coordinates and effort. A freely rotating pin-in-slot cannot generally exchange carrier/rider while retaining a body-fixed guide; swapping its physical roles is a different mechanism and must not be used as a permutation test.

`JointCoordinateRef = {jointId, coordinate: 'angle' | 'travel'}`. Drivers carry a constant-speed profile initially plus an explicit value/rate/acceleration command interface used by verification. Record shape allows later profiles; unknown executable profile/coupling kinds fail validation. Limits apply to these same coordinates in radians or document length units and compile to SI. Assemblies do not add solver equations.

## Weld group compiler

Compile connected weld components in stable ID order. Derive member-to-group transforms by traversing captured weld transforms; check every already-visited edge against the derived transform to distinguish a consistent redundant cycle from an incompatible one. Choose WORLD as frame when present; otherwise the smallest stable member ID. Choosing a frame affects coordinates, not physical ownership. Sorted membership forms a cache/view key, not a persistent BodyId. Every rest producer,
including import and kind conversion, must use one consistent unwrapped body-pose set. A
cycle that differs by 2π is refused: wrapping a rest with atan2 would change relative
coordinate branches even though the rotation matrix matches.

The geometry-only `compileWeldFrames` remains available independently of mass/driver errors,
so unrelated invalid fields do not hide a load-scope change. `compileWeldGroups` returns typed
property/annotation refusals instead of throwing. Group pose/member translations remain in
document units; resolved mass centers are SI in the group axes. Use `groupPoseSI` to transform
those centers to world SI. A zero-mass group displays the unweighted mean of member display
centers (WORLD alone uses the origin), while its physical center remains null.

Each group exposes material IDs and transforms, fixed status, resolved mass/CoM/inertia, and presentation lineage. Compile other joints through these transforms. A joint internal to one group contributes no unknown motion but its equations and any nonzero driver still need consistency checks. Do not discard an internal P's travel bound.

Changing groups updates annotations transactionally. An explicit target wins on merge; otherwise largest predecessor then stable ID. A split restores material presentations. Group mass overrides refuse a massive membership change or true split until explicitly reset; continuing membership and zero-mass additions/removals preserve the override. No subset enumeration order decides physical properties.

## Compilation and sample contracts

`compileDocument(document)` returns validation/refusal or one immutable ownership index, weld mapping and partitions. WORLD/frame components may be sampled by several partitions without joining their moving bodies. Keep ownership separate from sample availability. Loose material gets an underconstrained partition/readiness result, never garbage collection.

Each `CompiledPartition` owns its unknown ordering, boundary map, equation rows, coordinate evaluators, scaled Jacobian system, driver, limits and material result mapping. Unknowns are `(x, y, angle)` per moving solver group. The analysis compiler may translate
a derived group frame toward its referenced constraint attachments, carrying member transforms,
anchors and SI mass centers together. This is numerical preconditioning, never an edit to
a material frame. Unreferenced tracers and display geometry cannot choose that origin. Row/column scaling is reversible and recorded; force multipliers use the physical unscaled rows. Sparse local row blocks may assemble dense matrices initially, but no global mutable route or rate map is allowed.

Position results are discriminated: accepted pose/command/branch state, or `branch`, `travel`, `unsolved`, rank/admission refusal with diagnostics. A failed attempt leaves continuation state untouched. A returned success has converged residuals, directed branch agreement, all passive/driven limits and finite values. A cut/iteration cap can refuse; it cannot manufacture success.

Rates use the same accepted rows. Evaluate `J`, command partials and the analytic quadratic term along the full velocity (boundary included); add prescribed acceleration explicitly. Witness and CoM rates derive from local geometry and solved body twist/acceleration. Rates on a refused/singular sample are unavailable, not zero or a previous result.

`SimulationSnapshot` contains per-partition samples/times and typed maps for body poses/rates, attachment world points/rates, joint coordinates/reactions and driver efforts. A sample's identity and availability accompany every result. Display sampling may interpolate only compatible accepted neighboring poses; it cannot alter design geometry. Existing graph, CAD and table adapters read this contract and never mutate it. No new UI consumer reads legacy letter-key maps.

## Cycle controller and stop events (S3 implementation contract)

The position advance proves the accepted **endpoint** and checks the private candidates it
visits. It is not yet a continuous playback interval. Keep that distinction visible in the
sample API: a successful `advanceBodyCommand` alone is insufficient to publish an interval
that might cross a passive limit and return inside it.

The cycle controller must retain one numerical frame and continuation per partition. It must:

1. Probe motion on the current directed branch and keep intermediate candidates private.
   A sample/iteration/cut budget is an `unsolved` outcome, never a reversal or a successful
   truncated cycle. Refusal discards candidate positions, times and rates together.
2. Inspect every coordinate limit, including passive ram strokes and limits internal to a
   welded group. Use coordinate derivatives from the analytic rate system with unit command
   speed and zero command acceleration. Search interior stationary points as well as endpoint
   crossings; adaptive subdivisions must be able to reveal an excursion whose endpoints both
   satisfy the bound. Do not treat same-side endpoints as evidence of a clear interval.
3. Bracket the first crossing in the requested direction and refine it on the same continued
   branch. Keep the bound ID/side, command, safe-side pose and localization residual. An
   extremum touching a bound and returning inside is not a reversal. Coincident events must
   be independent of limit enumeration. Ambiguous or unresolvable event searches remain
   unavailable; do not silently accept them when a refinement budget expires. Numerical
   event detection does not constitute a formal interval proof of an arbitrary nonlinear path.
4. Reverse only at a proved coordinate crossing or the input-fold evidence described in the
   equation notes. `branch` is retried with subdivision; `unsolved` does not establish a
   physical limit. Handle an initial pose already at a bound without a zero-duration loop.
5. Preserve the known return branch. A stop pose may have a singular command Jacobian;
   it must not be fed back through singular-start admission or given invented rates. The
   controller can reuse accepted geometry in reverse order for an exact retrace and continue
   the unexplored side from its stored regular state. A velocity discontinuity at reversal
   has no finite acceleration or dynamic-force result in this model; impact dynamics are
   outside this migration. Keep that unavailability distinct from ordinary interior samples.
6. Record command, time, direction, pose status and rate/force availability per sample. A
   failed candidate cannot stand in for a published sample, and no previous rate map may be
   reused. Reconstruct material/witness geometry from body-local records; interpolation must
   not turn those records into independently moving points. Native renderer integration must
   verify intermediate frames, not only the solver's stored endpoints.

Required cycle probes before S3 closes: a limit crossed and reentered between safe endpoints;
a stationary touch that remains feasible; a tighter passive stop before the driven ram's
stop; simultaneous bounds in reversed order; outward/inward commands from a stop; positive
and negative requested speeds; exact retracing of a rocking cycle; a full-rotation branch
through an isolated singular sample; refusal followed by recovery without stale rates; and
two partitions sharing WORLD with independent clocks. Keep position-versus-rate availability
explicit at folds and reversals. The five worked examples and full numerical/force gates
remain required in addition to these controller tests.

## Transaction boundary

`planBodyEdit(document, revision, command, context)` is pure and returns structured refusal or a candidate document, exact effects/cascade, selection remap, invalidated partitions and captured base revision. Permission previews invoke the same command preflight; they do not carry private rules. `commitBodyEdit` checks revision and replaces authority exactly once, with one history entry and one notification batch. A stale preview is replanned. Refusal/no-op creates no partial writes or empty Undo entry.

Commands distinguish material design edits from rigid pose edits, joint-kind changes, coordinate travel edits and metadata edits. They include body/cylinder creation, attachments, connection bundles, pair weld/unweld, group/assembly/body deletion, loads, holds/locks and explicit geometry dimensions. The deletion closure is determined before touching any record. Deleting a relationship leaves its bodies/attachments; deleting a cylinder takes both members and its internal P, plus incident connections and loads, without taking other welded members.

Multiway R bundles persist a hub and spanning tree. Removing a hub requires re-expressing the surviving coincidence tree and preserving every surviving drive's actual body pair, not just its JointId. If that cannot be done without changing the coordinate, return a drive-removal/refusal result. Welding one selected pair never absorbs another body added later at that marker.

History stores validated document snapshots plus local selection metadata and per-machine anchor/display state. Shared encoding stores only authored document state. Decoding validates a full candidate before replacing the current document or recovery backup. Native/legacy route selection happens before loading; there is one authority per editor instance. S6 makes native default; S7 removes the old editor and temporary adapters.

## Property commands and edit references (S4)

`body-properties` changes a material's label, presentation and mass specification.
`group-properties` targets an exact final weld membership and changes only its annotation;
member values remain intact. It runs after structural lineage so a new override cannot be
copied into the wrong successor. `reset-group-mass` remains the explicit pre-lineage resolution
for an ambiguous split/merge; a property edit on a vanished group does not retarget itself.
`attachment-properties`, `label`, `lock` and `hold` share the same transaction and refusal
boundary. Property changes reject identity fields rather than letting a spread rename records.

An explicit CoM carries `editAnchor: 'body' | 'grid' | { attachmentId }`. A member anchor must
belong to that material; a group anchor must belong to one of that group's materials. Physics
still uses the stored local `point`. If an existing editing attachment is deleted, retain the
physical center and fall back to the body's frame; do not transfer the anchor to another pin.
A newly supplied invalid anchor does not qualify for that fallback. Canonical design geometry
and pose operations now map these references in one settled transaction. A body-relative
center follows the geometry centroid and a stable named vertex pair (`editAxis`, captured on
first deformation). A polygon's later longest pair or reordered vertices cannot choose a new
frame. Losing the named direction rebases the reference without moving the center. Grid and
attachment references retain world-axis offsets during edits; simulation still carries the
resulting local point rigidly. An explicit center property in the same command wins over this
remapping. Shared codecs validate and preserve the vertex references; copy must remap them.

`body-geometry` replaces local shape and updates explicitly bound attachments;
`attachment-position` changes one canonical local point and its bound vertex/other markers;
`body-poses` supplies complete material poses without changing local shape. Final validation
refuses a partial disconnected proposal, changed weld rest relation, violated hold/lock or
cylinder travel bound. These are canonical transaction primitives; the `move-point` command
below plans a connected proposal through them. Displayed-frame re-anchoring is still required;
these operations temporarily use the shared start-pose permission until that boundary exists.
Generic shape/attachment edits cannot change a cylinder's intrinsic member geometry, mounts
or internal P references; cylinder dimension edits must own that complete proposal.

`MaterialBody.locked` protects its pose, shape and surviving attachment positions even with
only one connection. An attachment lock protects only that point, so a body may rotate about
it. Locks do not add physical constraints or prevent deletion, mass or color edits. Holds
validate authored endpoint lengths/directions against the settled proposal and likewise do
not enter the motion solver.

A load retains optional lock state and presentation (color, arrow length in document units,
and the heading in its chosen reference axes when its vector is zero). Arrow size/direction
metadata does not become a physical force. `force-properties` switches axes without rotating
the physical vector; `force-owner` preserves the world application point, vector and free
couple while assigning an explicit material owner and clearing an import-only ambiguous
scope. With a current displayed frame, world-direction inference uses the displayed owner
transforms. Without one, a posed conversion quotes the shared start-pose refusal; a paused
clock alone is not evidence of which material transform the reader is looking at.

Locks are checked against settled surviving positions at the end of every transaction.
A force lock protects its application and direction handles, while magnitude, color, label
and couple remain editable. Deleting or explicitly unlocking an object is allowed. Point
locks protect world attachment positions. The canonical geometry and connected point commands
enforce whole-body locks and held dimensions; displayed-frame gestures remain pending.

All record effects remain available to history/analysis consumers, but `bodyMotionRecord`
selects only coordinate/geometry/topology data for clock invalidation. Mass, load, annotation,
trace and edit-mark changes must not reset a displayed motion clock. Physical analysis may
need recalculation while the motion and its elapsed time stay unchanged.

### Connected point proposals

`move-point` names one AttachmentId and an authored world `target`. Its default `exact` mode
must reach that coordinate; `project` treats it as a pointer goal on the locally available
motion. A projected answer may seed an exact correction but cannot replace exact success.
The original command stays in the preview so a stale commit solves against current topology.
All resulting geometry/pose operations share the outer transaction, final validation and Undo.

The planner distinguishes editable local points from rigid material. Binary R closure moves
all attachments at the requested pin. Holds and explicit vertex bindings discover related
geometry; joints discover the bodies whose poses may follow. WORLD is a boundary rather than
a bridge to other machines. An explicitly requested WORLD attachment can move, matching a
draggable ground anchor; unrelated ground attachments and the WORLD frame stay fixed.
Welded material and cylinder intrinsic geometry move through complete rigid-group poses.
A bar with a length hold between its actual two bound vertices also carries its material
rigidly, including off-axis witnesses. Holds on unbound points do not rigidify unrelated shape.
Unbound free tracers on welded material remain editable without moving the group.

The edit rows use exact first derivatives through both local geometry and rigid transforms.
They express R coincidence, P lateral/directed-angle constraints, pin-slot lateral constraints,
authored drive values, CAD length/direction holds, point locks and force-handle locks. Welds
are condensed before solving. Translational variables use a geometry-derived length, and
rigid-group translation is measured at a geometry-derived center so arbitrary material-frame
origins do not choose the motion. Rank tests refuse a target with no local freedom. Bounded
correction and projection refuse on exhaustion instead of publishing an unfinished result.

Projection checks allowed directions when a zero slope could be a maximum (for example, a
pointer across the diameter of a held circle). This is local projection, not a global nearest
point guarantee or completed gesture continuation. Travel bounds still validate the settled
answer rather than actively clamping pointer motion. Coordinate/dimension commands, paused
mapping, branch-continuous live gestures, independent-clock integration and native UI evidence
remain required S4/S5 work before this capability replaces the public editor.

### Displayed properties and local frame history

`NativeBodyDocumentService.setSimulationView` captures a `BodyEditFrame` through the authority.
The snapshot's revision and complete source document must match; every runnable partition
needs an explicit sample selection. Capture converts the existing native readers' SI material
poses and commands to document units, retains each selected time and direction, and keeps
the authored anchors and sync choices. An admission-refused drawing remains at its design
pose. Capture changes no authored record, revision or Undo entry. Changing local clocks
invalidates the captured frame; selecting another object with the same clocks does not.

Properties, force-frame/owner conversions and unbound, unconnected point edits can map directly
through that frame. `body-posed-property-edit.ts` invokes the same canonical transaction in
displayed material coordinates, including lock/hold validation, and restores the exact authored
body poses and initial driver values. It refuses a proposal that also changes body geometry,
physical connections or material poses: that requires the pending re-anchoring solver. World
angle holds are transported into the displayed frame for the edit and back for storage;
unchanged holds retain their exact original records. The outer effects and history describe
the canonical document, not the temporary displayed candidate.

Accepted direct mappings retain all clocks, even if moving a free tracer invalidates its
analysis samples. History retains the displayed material frames alongside local state and
restores them with the new revision on Undo/Redo. Shared serialization still contains only the
authored document and reopens at its starting pose. A stale preview keeps its original command
and replans against the authority's current frame, including a seek with no document revision
change. The service exposes the frame and includes it in change events; it does not yet own
simulation scheduling or the public renderer. Native live interaction/filmstrip evidence and
the full branch-neutral geometry/topology re-anchoring path remain required before cutover.

## Self-review questions carried into implementation

- Do axis datums and input signs survive a local-frame rebase and a reordered binary R/P?
- Does every force keep a material BodyId after group changes, including forces at shared visual pins?
- Does an internal joint in a condensed group still reject a conflicting drive or limit?
- Can a one-connection cylinder member keep geometry with no invented second pin?
- Can the panel/menu select a specific pair under one marker, and does history restore that identity?
- Can a paused edit preserve both the chosen input anchor and an unrelated machine's clock without writing a sampled pose into the document?
- Do removal and performance evidence cover complete consumers rather than a passing private kernel?

F1 reviews the concrete S1 records/validator/group compiler against this contract. F2 reviews numerical implementation; F3 reviews transactions and ownership; F4 reviews the integrated result and removal evidence. No speculative review has been spent on this document.
