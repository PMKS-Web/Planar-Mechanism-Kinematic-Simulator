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

## Transactional unit conversion

`convert-units` converts the whole authored document in one history entry. Length, mass,
inertia and force factors are independent; density scales by mass/length², and a couple by
force×length. Convert geometry, material and WORLD attachments, weld translations, guide
stations/datums, travel profiles/bounds, cylinder dimensions, CoM and imported load-scope
transforms, holds, synthesis placement, backdrop and camera dimensions. Angles and stable
references stay unchanged. Object scale is a marker **length in document units** and scales
with camera span; it never supplies a physical constraint or mass dimension.

A batch allows one destination unit system. All other dimensional operands use that
destination, independent of the conversion operation's position in the array. Compare
locks, holds, lineage and CoM editing against the converted source, then validate the final
candidate normally. This permits representation changes without waiving physical edits.
Invalid units or any refused operation roll back the entire batch.

The shared settings start-only permission applies. Pure conversion preserves elapsed time,
direction and synchronization while scaling travel clock anchors/commands, including fixed
coordinates that belong to no moving partition. Actual geometry/drive edits in the same
batch still invalidate affected clocks. Undo restores the exact prior document and local
state. Native UI precision and coverage-warning checks remain S5 obligations.

## Joint shape and ordering

Each joint has ordered `bodyA` / `bodyB` and two explicit local frame records. Each frame stores an AttachmentId for its origin and a local angle for its directed axis. Both attachment owners must match the named bodies. Storing the axis as an angle guarantees normalization; derive vectors with sine/cosine and reject non-finite angles. Rendering stations are separate guide-local metadata with their own material owner and frame, never attachment points used to locate bodies. Reversing P equation order cannot hand its visible guide to the other member. A pin-in-slot
guide must belong to A, since its rider can rotate independently.
A guide display record retains its material owner even when it has no authored rail extents.
Its optional `station` and `normalOffset` locate artwork along the frame axis and its left
normal; both default to zero and scale with document length units. `from`/`to` must either
both be absent or form a finite increasing pair. These are drawing metadata, never physical
joint coordinates or travel bounds. An axis edit re-expresses an offset display origin about
the physical guide origin before turning it, preserving both offset components and leaving
the referenced attachment (including its trace, lock and other connections) untouched. A
cylinder's internal P stores a station at the barrel mouth; cylinder dimension edits must
maintain that station in the assembly's material frame.

`guide-axis` and `guide-axes` author world headings at the captured displayed pose. The carrier
and its welded material remain fixed; connected bodies follow rigidly at the captured signed
travel. A batch changes coupled guides together, while independent components retain separate
numerical origins. Existing travel prescriptions persist; passive coordinates acquire no
stored driver. Explicit axis edits transport the same signed travel anchor to the new axis,
including reversed P pairs. This exception does not apply to arbitrary joint-record changes.
Continuation exhaustion, incompatible locks/holds or a refused settled document cancel the
whole edit. The intermediate constraint sets describe a design change, not playback of the
original mechanism; the final pose must satisfy its physical relationships and travel bounds.


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
center resolved at that attachment's final pre-deletion placement and fall back to the body's
frame; do not transfer the anchor to another pin.
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

`cylinder-dimensions` owns that proposal: barrel length, rod length, bore, rod diameter and
physical stroke are supplied in destination document units. Positive finite dimensions must
satisfy rod diameter < bore, stroke < rod length ≤ barrel length, independently of display
scale. The operation preserves the captured signed extension, all IDs, outer attachment local
points and weld rests. It stretches each member's authored bar about its outer attachment,
updates bound vertices and the two internal P origins, and maintains the barrel-mouth station.
Unbound material attachments and loads retain their local records. Existing center-of-mass
edit anchors are remapped by the same final transaction as other geometry changes.

The command's anchor is the barrel outer attachment by default, or explicitly the rod outer
attachment. That point stays at its captured displayed location. The connected material solves
rigidly around it; preserving the anchored member's heading is preferred when feasible, so
an off-axis welded bracket cannot make a free cylinder rotate merely by changing the numerical
least-motion metric. If the connections require a turn, the physical constraints determine it.
Existing drives, holds and original locked-point locations constrain the whole solve. Passive
internal travel uses an edit row, not a new stored drive. Settled bounds/locks/holds still apply,
and failure cancels the complete transaction. Re-anchoring retains a surviving driven extension
and its paused clock through dimension changes. These are dimension-design proposals, not
physical playback intervals through the original shape.


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
enforce whole-body locks and held dimensions, including captured paused frames. Live gesture
continuation and the complete command matrix remain pending.

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
answer rather than actively clamping pointer motion. Dimension/axis commands, paused
coordinate reparameterization, branch-continuous live gestures and native UI evidence
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
physical connections or material poses; those commands use the constrained re-anchoring path below. World
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
the full command/lifecycle matrix remain required before cutover.

### Constrained paused edits and anchor recovery

`planPosedBodyGeometry` stages the same canonical transaction against the captured display.
`reanchorBodyEdit` then compiles the changed drawing and identifies every affected partition,
including old and new membership after a topology edit. Each surviving input retains its
original coordinate anchor when its ordered physical coordinate is unchanged (or explicitly
sign-reversed). New or reparameterized coordinates reset explicitly. Unaffected bodies restore
exact authored poses; unrelated clocks, including stationary inputs outside movable partitions,
remain exact. All accepted record changes and local frames still form one Undo entry.

`reachBodyAnchor` first continues backward to the original command through the ordinary interval
validator. An angular stop on that route alone does not establish infeasibility: a full rebuilt
cycle can reach an equivalent angle around the other side of a newly introduced passive gap.
Search its command crossings, using old material geometry as the assembly seed. New material
has no old pose to match. The chosen whole-turn adjustment must be coherent across welded
members and non-command angle rows (P joints); fixed boundary angles do not move. The driven
relative angle sets the difference between the two groups' turn counts. Validate finite
unwrapped angular limits and all constraint rows after changing that representation.

Once the canonical anchor has been recovered, rebuild its cycle and locate the proposed display
by both physical material pose and travel direction. The elapsed time comes from this edited
cycle, not the old sample index. Equivalent cycle angles return matching unwrapped material
frames and commands together; the next edit must see a consistent display. A nonlooping window
uses its signed speed and the direct validated interval; it cannot silently become a cycle or
jump through a passive stop. If that policy cannot represent the proposed display, recovery is
unsolved and the accepted displayed pose becomes the new start with an explicit notice.

A proved missing coordinate in a completed cycle is `unreachable`; exhausted continuation,
failed cycle construction or failed clock/branch matching is `anchor-unsolved`. A changed
input coordinate or unavailable motion has its own status. Removing the last input emits `drive-removed` when surviving material adopts the paused
pose as its start, even though no driver remains to own a reset clock. None silently promotes a sampled
pose to an authored anchor. `bodyAnchorNotice` supplies the future UI's shared explanation.
Stopped inputs at their unchanged start do not require a finite-speed cycle. These notices
and the captured paths are local transaction/history data, not shared document records.

Validate surviving locks in the displayed domain, where the edit occurs. Re-anchoring is rigid
simulation transport and must not make an editing lock prohibit ordinary motion. Validate
constraints/limits in both final authored and displayed documents, and transport angle holds
back to the stored material frame. Invalid or overconstrained topology still refuses atomically.
This supports the tested bound-bar/four-bar edits, welded-carriage geometry, bracket insertion,
positive/negative and return-leg clocks, and passive-gap examples. Coordinate pose/dimension
commands, active travel projection, the full lifecycle/service matrix and UI integration remain
required S4/S5 work; this is not a completed native editing release.

### Drive and working-limit commands

`add-driver` captures the selected joint coordinate from the current candidate pose. New IDs
come from the transaction identity, so previews and commits agree. `driver-speed` and
`remove-driver` target an explicit DriverId; they never infer a pair or retarget a drive.
Adding a second drive to the same coordinate refuses through the shared coordinate rule.
Other multiple-input combinations remain valid editable records with the existing unsupported
motion-readiness result. Speeds use signed radians/second or document length/second; the UI
unit boundary retains the familiar speed/direction controls.

`add-limit` supplies a named joint coordinate and finite ordered bounds; `limit-bounds` and
`remove-limit` target an explicit LimitId. Multiple working limits on one coordinate are
intersected by the existing solver. Editing one cannot change the first matching record
instead. A cylinder's intrinsic `strokeLimit` is protected from these generic mutations;
its dimension command owns that record. A separate working limit on the internal P is allowed.
Final validation refuses a bound that excludes the edited displayed pose. If it excludes only
the original anchor, the ordinary re-anchoring policy provides a proved reset and one history
entry, preserving the cylinder's physical stroke record.

Paused speed changes retime the same physical pose on the rebuilt motion. A sign reversal
reverses the currently selected leg, while a pure coordinate sign change preserves physical
direction. An input resuming from zero speed takes the new signed speed’s direction. Undo restores both the prior speed and display clock. Shared save/reopen keeps
the authored anchor and new speed, with local playback starting at time zero. Drive/limit
restructuring retains the analysis-mode start restriction; speed edits have the captured
paused-frame mapping. Every playing/missing-frame refusal quotes the shared permission model.
Axis edits, cylinder dimensions and full service/UI dispatch
remain required; these commands alone do not complete S4.

### Exact coordinate pose edits

`move-coordinate` names an existing R angle, P travel, or pin-in-slot angle/travel and an exact
value in radians/document length units. It changes physical poses without changing geometry,
attachments, weld rests, assembly dimensions or coordinate datums. Passive coordinates do not
gain permanent drives. An existing drive on the selected coordinate keeps its ID/speed and
captures the accepted value; every other prescribed coordinate remains constrained.

`body-edit-model` supplies the same centered, scaled rigid-group variables used by design-point
edits, with local geometry variables disabled. `body-edit-rows` is shared physical/hold/lock
logic; the point-specific wrapper adds its two positional goals. Exact coordinate continuation
adds one scalar goal instead. Small normalized command increments and bounded pose corrections
retain the local solution; exhaustion refuses the entire transaction. Locks, held angles,
force handles, welds and all cylinder members participate without interior shape exemptions.

Each edit segment probes passive bounds at interior points and derivative-bracketed extrema.
Loose sketches use the minimum-norm edit tangent, since a unique physical motion need not
exist. The scalar Hermite refinement criterion is shared with the motion interval search.
Regular one-degree-of-freedom partitions additionally use `inspectBodyInterval` for physical
fold/interior-stop detection and final assembly-branch agreement. Failure on that path cannot
fall back to an unchecked sketch endpoint. Neither adaptive search claims an interval-arithmetic
proof; exhausted probes/corrections refuse, and no partial placement is published. Pointer
clamping/contact feedback and continuous multi-event gesture state remain required work.

At a captured paused pose the same re-anchoring policy restores the authored start and keeps
the requested coordinate on the selected motion leg. A changed display/clock is a real history
change even when the recovered authored document is exactly unchanged; the authority emits one
revision/event and Undo restores the prior displayed pose and clocks. Shared URLs retain the
authored start and exclude those local clocks. Missing/playing frames quote the shared model.

### Copying material and its references

`copy-bodies` names material BodyIds, a world translation in document units, and an explicit
`includeGround` choice. Duplicate selections are deduplicated. Selecting either cylinder
member includes the complete cylinder; it does not absorb an unselected welded bracket.
Connections whose material endpoints are both included are copied. An R bundle retains the
coincidence between selected riders even when its original hub is absent. A drive on an
omitted relationship is not transferred to a newly named pair.

`planBodyCopy` extracts that material, allocates the complete typed ID map first, then
`copyBodyRecords` remaps every included reference. Vertex IDs are scoped by material;
shape bindings, custom CoM edit axes/anchors, group frames, load scopes, holds, locks, guide
display frames, pin bundles, cylinder roles, drivers and limits all use the same maps.
With ground included, WORLD itself is shared but its copied attachment points receive new
IDs and the placement offset. Welds to WORLD recapture the translated rest in either pair
order. Copied material never retains an attachment or material owner from the original.

Mass, inertia, forces/couples, local geometry, presentation and signed coordinate values
are preserved. Copying part of a custom aggregate or an ambiguous imported force scope
refuses rather than choosing a distribution/owner. A complete copied group captures the
visible fallback name/paint before new opaque IDs can choose a different member. A singleton
group's explicit override also survives. Grounded copies share the existing WORLD weld
group's presentation lineage, not a second contradictory annotation. An aggregate override
on that shared WORLD group requires resetting to member properties before copying.

One transaction selects the copied assemblies/material and creates one Undo entry. A later
joint-kind operation in the same batch must retain the copied pin bundle as well as the
original. Source synthesis ownership, targets, camera and settings stay with the project;
ordinary copies do not become additional generated synthesis results.

A paused copy is placed from the captured display and starts its new drive at that pose.
Original authored poses and clocks remain exact when their material, incident physical
connections, relevant boundary points, drives, limits and holds have not changed. Adding
material to a shared fixed group may invalidate force analysis without changing that motion.
The re-anchoring path tests these physical records before unnecessarily solving the old
anchor again. A change to the original geometry still follows normal anchor recovery.

### Clipboard capture and paste between drawings

`captureNativeClipboard` reads the selected material from one validated authored/displayed
snapshot, closes cylinder ownership, and serializes an isolated native drawing through the
existing bounded, checksummed codec. Unselected material, project settings, synthesis targets
and ownership, camera and backdrop are excluded. Copy makes no history entry or notification.
Its immutable payload survives source edits/deletion; failed capture preserves the prior
clipboard. Copying away from the start requires a current display frame. It is a read action
and may capture an accepted frame while playback runs.

`paste-bodies` carries the decoded source drawing and a destination-unit placement offset.
The canonical transaction validates the clipboard, converts its physical records into the
current destination units, and uses the same complete ID map as ordinary copy. Every paste
allocates fresh identities. The destination's units/settings/view/synthesis remain its own.
Previews retain the captured clipboard in their command; committing a stale preview replans
against the latest destination, including its unit system, without rereading a changed buffer.
The placement offset is interpreted in those destination units. A live placement gesture must
reuse its command ID across previews and cancel/restart if its coordinate display units change.

An isolated clipboard can retain a complete WORLD-welded group's custom aggregate and
presentation. Pasting into an empty fixed frame preserves those properties. Joining an
existing fixed fabrication uses its presentation lineage. An incoming custom aggregate may
survive when the old frame has no override and all its members have zero mass **and** zero
inertia; its custom center is mapped into the retained group's actual frame before the late
group-property stage. Real added inertia or two competing overrides require an explicit reset.
No override is split, combined numerically, or silently discarded.

`NativeBodyDocumentService.copy`, `previewPaste` and `paste` expose this path; commit,
selection, re-anchoring, history and notifications use the same authority as other edits.
Pasting while paused preserves an untouched destination machine's exact clock; a newly pasted
input starts at the clipboard's captured pose with time zero. Corrupt/inconsistent payloads
and permission refusals leave the destination and clipboard unchanged.

The service-level clipboard integration is implemented. Platform clipboard access, keyboard/
context-menu placement and the native browser/UI evidence remain S5 work.

## Self-review questions carried into implementation

- Do axis datums and input signs survive a local-frame rebase and a reordered binary R/P?
- Does every force keep a material BodyId after group changes, including forces at shared visual pins?
- Does an internal joint in a condensed group still reject a conflicting drive or limit?
- Can a one-connection cylinder member keep geometry with no invented second pin?
- Can the panel/menu select a specific pair under one marker, and does history restore that identity?
- Can a paused edit preserve both the chosen input anchor and an unrelated machine's clock without writing a sampled pose into the document?
- Do removal and performance evidence cover complete consumers rather than a passing private kernel?

F1 reviews the concrete S1 records/validator/group compiler against this contract. F2 reviews numerical implementation; F3 reviews transactions and ownership; F4 reviews the integrated result and removal evidence. No speculative review has been spent on this document.


## S4 gesture, persistence and production-import handoff

`NativeBodyDocumentService.beginGesture` captures one command ID, revision, display and
clock set. `advance` produces a private `BodyEditPlan`; the grid must render that draft
without installing it in the authority. `finishGesture` publishes one event and one history
entry; Cancel publishes neither. A document replacement, edit/history revision, displayed
pose or clock change invalidates the gesture; selection changes alone do not. A gesture from
another editor cannot commit here. Replay is bounded to 1,000 accepted subcommands and 256
substeps per pointer event. Exhaustion is a refusal, not permission to teleport to the cursor.
S5 should coalesce high-frequency pointer input and measure this replay cost before exposing
long drags; there is no native DOM wiring in S4.

`move-body` names a body, a captured material-local grab point, and a world target. Its
transient solver attachment never enters the resulting document. All material in the reached
component moves through rigid poses; local shape, weld rest, ownership, loads and IDs stay
intact. `move-coordinate` supplies physical travel/angle and carries the same rigid bodies.
Exact fields refuse out-of-range values. Pointer goals can project onto hard equations and
active travel bounds, with inward motion releasing the active constraint on the next solve.
The active-set projection promises a feasible local answer, not the global closest point on
an arbitrary nonlinear configuration space. An inconsistent active set is refused.

The gesture splits requests in the grabbed material's scale (WORLD markers use their incident
material), retains accepted continuation and clips an unsolved segment with bounded bisection.
Coordinate motion uses the S3 interval/fold/stop kernel. Rigid pointer candidates additionally
check the most-changed available joint coordinate with that kernel and the edit interval
validator. Loose sketches use the constrained edit metric; they do not acquire a claim of
unique physical motion. Shape-edit point commands remain design edits, distinct from rigid
body gestures. UI acceptance still requires S5's native filmstrips and hit targets.

`save` always returns the checked canonical `pmks2:` payload. `load` dispatches native prefixes
before production parsing, validates a whole candidate, then replaces the authority in one
`load` event with a fresh history/local clock set and a monotonically increased revision.
A refused read, permission or consistency check leaves the prior document/history/selection/
display/revision and backups intact. Loading a different drawing is not an undoable edit.
The platform-facing UI must surface returned refusals and `recoveryStatus`.

`NativeBodyRecovery` takes injected session/persistent storage; S5 attaches the browser's
stores only after choosing the native route. Version-1 envelopes containing native payloads
use separate `pmks2:tab-drawing:v1` and `pmks2:last-drawing:v1` keys. A valid tab wins; a corrupt,
unsupported or unavailable tab can fall back to a valid persistent drawing, with rejected
sources reported. Recovering does not overwrite either backup. Successful edits/history/load
save authored source data, not selected DOM objects or sampled poses. Storage denial/quota
failure is reported separately from a successful model transaction; it cannot roll that
transaction back. Old legacy keys remain untouched and are never fed to native recovery.

The production reader retains only decoded records from `StringTranscoder`, not runtime
`Joint`, `Link`, `MechanismBuilder` or solver instances. It is bounded to 1 MiB input and 1,000
records per legacy table. A strict syntax check surrounds the legacy numeric parser, whose
unknown-digit tolerance must not silently alter geometry. Supported production 2.0.3 syntax
covers R pins, multiway pin trees, material links, ordinary one-level compounds/welds, loads,
units/settings and grounded P carriages. A production block's mass and inertia belong to a
real native material carriage with WORLD–P–carriage and carriage–R–rod; P remains massless.
Group overrides remain group overrides. A compound load keeps its frozen ambiguous material
scope until an owner is chosen. Deleting its reference leaf while other scoped material
survives requires owner resolution or explicit force deletion, even after mass is reset.

Frozen S0 four-bar, three six-bar, slider-crank and authored compound/load bytes are the
compatibility evidence. Modern slot/Slide/cylinder records and extension tails are refused
with a rebuild message; this is deliberately not a general staging converter. The old length
checksum cannot detect all same-length corruption; strict syntax/reference/physics validation
adds protection but cannot reconstruct a lost content digest. Native saves use their own CRC.
Old explicit mass/CoM values are retained; native automatic geometry uses the native material
model. The initial frame has angle zero and its geometry carries the old drawn orientation.


A combined move/delete command resolves material and group CoM edit anchors at the pre-deletion placement,
while the old frame and even a doomed attachment are still available. Only then does lineage
change the coordinate frame. A body-relative center rides the material, a grid center stays
fixed, and an attachment-relative center receives that attachment's displacement before a
lost reference falls back to body-relative editing. Unchanged frames retain exact coordinates.
A refused gesture event restores its prior draft, even if a non-clamp refusal follows accepted
substeps; release can never commit that hidden partial event.

Unchanged world-angle holds recover their exact source records on both direct and constrained
paused edit paths. A singleton WORLD annotation is valid; grounded paste merges into it using
the destination presentation and the same aggregate-property policy as other fixed groups.
Partial copying of a legacy load scope refuses for either selected side, regardless of which
member happens to carry the load's reference frame.
