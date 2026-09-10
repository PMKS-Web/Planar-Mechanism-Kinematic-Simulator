# Native implementation contract

S0 contract at `487d535`; implements the decisions in [the migration plan](bodies-and-joints-plan.md). This document resolves interface choices for S1–S6. It is not evidence that those interfaces have been implemented.

## Record and unit boundary

Use readonly plain records and branded string IDs for Body, Attachment, Joint, Driver, Limit, Force, Assembly and Junction. No ID contains mechanical meaning; labels are separate and may change. The reserved WORLD body is explicit, immutable, has identity pose, no material mass and cannot be deleted. Factories allocate IDs once; copying allocates a complete remap before copying any references. Validation rejects duplicates across each ID namespace, missing owners, non-finite fields and self-connections.

`BodyDocument` contains `version: 2`, units/settings, bodies, attachments, joints, junctions, assemblies, drivers, limits, forces, holds, edit locks, group annotations and synthesis design. Revision is an authority/session property, not a checksum substitute or physical constraint. No solved positions, derived groups, route, selection objects or writable legacy graph appear in the shared payload.

All stored geometry uses the document's declared length unit, **not MODEL_SCALE**. Angles use radians throughout records, including design poses and local directions. Unit metadata names length, mass, inertia and force units independently: legacy centimeters use grams for mass but kg·cm² for stored inertia, so never infer inertia from mass times length squared. The analysis compiler converts these to meters, kilograms, kg·m² and newtons once. The view converts physical length to current SVG/model coordinates. Object/mark scale only sizes marks; it never changes physical stroke, feasibility or mass.

`Pose = {x, y, angle}`; `Point = {x, y}`. Body geometry contains stable local vertices and authored shape (`bar`, `polygon`, `circle`), plus explicit binding metadata for editable endpoints. Attachments reference a body and local point; optional shape-vertex binding means a design edit moves both. An unbound tracer is not a new hull vertex. A body may have zero connections or one without losing geometry.

Material mass specifications distinguish automatic and explicit mass, inertia and CoM independently. Automatic geometry-derived values are resolved before aggregation. A zero-mass body has a finite display center but no fabricated physical center. Aggregate overrides live on group annotations with predecessor membership and explicit optional mass, inertia and center values (an absent value remains member-derived); they never rewrite material members. Local CoM and its edit-anchor metadata are separate fields.

Legacy compound-owned loads need provenance too. An old root LinkId can own a load without
naming any leaf; the force point may not lie uniquely on one member. Import that load in a
deterministic member's local frame, but also retain its original group membership as
`legacyGroupScope`. That member is a coordinate reference, not a claim about the author's
material choice. While the scope stays rigid its resulting wrench is exact. A split or
deletion that would force a member-ownership choice refuses until the author explicitly
assigns the load to a surviving Link; moving/merging the intact group preserves the scope.
The panel must explain this using the same refusal model. Do not guess ownership from the
nearest polygon or drop the load. Native load creation always names a material member and
never creates this import-only provenance. F1/F3 must challenge this compatibility exception.

## Joint shape and ordering

Each joint has ordered `bodyA` / `bodyB` and two explicit local frame records. Each frame stores an AttachmentId for its origin and a local angle for its directed axis. Both attachment owners must match the named bodies. Storing the axis as an angle guarantees normalization; derive vectors with sine/cosine and reject non-finite angles. Rendering stations are separate guide-local metadata, never attachment points used to locate bodies.

- R: two local anchors, `angleZero`; two coincidence equations.
- P: two local directed frames, `angleZero`, `travelZero`; one lateral equation and one continuous relative-angle equation.
- Pin-in-slot: the same two frame/origin records and travel/angle datums; one lateral equation, no fixed-heading row.
- Weld: captured B-in-A rest transform and a chosen display attachment; three rigid equations before condensation.

Choose datums at creation so a newly authored coordinate reads zero unless importing a specific existing datum. Compute P `angleZero` from the two local axis angles, ensuring those axes have the captured relative orientation. The solver must not wrap the angle residual separately at each sample. It uses unwrapped body angles and a fixed integer-turn branch from the accepted pose. A kind conversion captures new datums at the accepted displayed pose and preserves a drive only when the same ordered relative coordinate survives.

Reversing A/B is an explicit operation, not array sorting. R angle changes sign. P/slot travel requires transforming the guide axis and datum into the new guide body; it is not in general achieved by negating a field while keeping the original frame. Reversal tests compare world kinematics and virtual work with the mapped coordinates and effort. A freely rotating pin-in-slot cannot generally exchange carrier/rider while retaining a body-fixed guide; swapping its physical roles is a different mechanism and must not be used as a permutation test.

`JointCoordinateRef = {jointId, coordinate: 'angle' | 'travel'}`. Drivers carry a constant-speed profile initially plus an explicit value/rate/acceleration command interface used by verification. Record shape allows later profiles; unknown executable profile/coupling kinds fail validation. Limits apply to these same coordinates in radians or document length units and compile to SI. Assemblies do not add solver equations.

## Weld group compiler

Compile connected weld components in stable ID order. Derive member-to-group transforms by traversing captured weld transforms; check every already-visited edge against the derived transform to distinguish a consistent redundant cycle from an incompatible one. Choose WORLD as frame when present; otherwise the smallest stable member ID. Choosing a frame affects coordinates, not physical ownership. Sorted membership forms a cache/view key, not a persistent BodyId.

Each group exposes material IDs and transforms, fixed status, resolved mass/CoM/inertia, and presentation lineage. Compile other joints through these transforms. A joint internal to one group contributes no unknown motion but its equations and any nonzero driver still need consistency checks. Do not discard an internal P's travel bound.

Changing groups updates annotations transactionally. An explicit target wins on merge; otherwise largest predecessor then stable ID. A split restores material presentations. Group mass overrides refuse a massive membership change or true split until explicitly reset; continuing membership and zero-mass additions/removals preserve the override. No subset enumeration order decides physical properties.

## Compilation and sample contracts

`compileDocument(document)` returns validation/refusal or one immutable ownership index, weld mapping and partitions. WORLD/frame components may be sampled by several partitions without joining their moving bodies. Keep ownership separate from sample availability. Loose material gets an underconstrained partition/readiness result, never garbage collection.

Each `CompiledPartition` owns its unknown ordering, boundary map, equation rows, coordinate evaluators, scaled Jacobian system, driver, limits and material result mapping. Unknowns are `(x, y, angle)` per moving solver group. Row/column scaling is reversible and recorded; force multipliers use the physical unscaled rows. Sparse local row blocks may assemble dense matrices initially, but no global mutable route or rate map is allowed.

Position results are discriminated: accepted pose/command/branch state, or `branch`, `travel`, `unsolved`, rank/admission refusal with diagnostics. A failed attempt leaves continuation state untouched. A returned success has converged residuals, directed branch agreement, all passive/driven limits and finite values. A cut/iteration cap can refuse; it cannot manufacture success.

Rates use the same accepted rows. Evaluate `J`, command partials and the analytic quadratic term along the full velocity (boundary included); add prescribed acceleration explicitly. Witness and CoM rates derive from local geometry and solved body twist/acceleration. Rates on a refused/singular sample are unavailable, not zero or a previous result.

`SimulationSnapshot` contains per-partition samples/times and typed maps for body poses/rates, attachment world points/rates, joint coordinates/reactions and driver efforts. A sample's identity and availability accompany every result. Display sampling may interpolate only compatible accepted neighboring poses; it cannot alter design geometry. Existing graph, CAD and table adapters read this contract and never mutate it. No new UI consumer reads legacy letter-key maps.

## Transaction boundary

`planBodyEdit(document, revision, command, context)` is pure and returns structured refusal or a candidate document, exact effects/cascade, selection remap, invalidated partitions and captured base revision. Permission previews invoke the same command preflight; they do not carry private rules. `commitBodyEdit` checks revision and replaces authority exactly once, with one history entry and one notification batch. A stale preview is replanned. Refusal/no-op creates no partial writes or empty Undo entry.

Commands distinguish material design edits from rigid pose edits, joint-kind changes, coordinate travel edits and metadata edits. They include body/cylinder creation, attachments, connection bundles, pair weld/unweld, group/assembly/body deletion, loads, holds/locks and explicit geometry dimensions. The deletion closure is determined before touching any record. Deleting a relationship leaves its bodies/attachments; deleting a cylinder takes both members and its internal P, plus incident connections and loads, without taking other welded members.

Multiway R bundles persist a hub and spanning tree. Removing a hub requires re-expressing the surviving coincidence tree and preserving every surviving drive's actual body pair, not just its JointId. If that cannot be done without changing the coordinate, return a drive-removal/refusal result. Welding one selected pair never absorbs another body added later at that marker.

History stores validated document snapshots plus local selection metadata and per-machine anchor/display state. Shared encoding stores only authored document state. Decoding validates a full candidate before replacing the current document or recovery backup. Native/legacy route selection happens before loading; there is one authority per editor instance. S6 makes native default; S7 removes the old editor and temporary adapters.

## Self-review questions carried into implementation

- Do axis datums and input signs survive a local-frame rebase and a reordered binary R/P?
- Does every force keep a material BodyId after group changes, including forces at shared visual pins?
- Does an internal joint in a condensed group still reject a conflicting drive or limit?
- Can a one-connection cylinder member keep geometry with no invented second pin?
- Can the panel/menu select a specific pair under one marker, and does history restore that identity?
- Can a paused edit preserve both the chosen input anchor and an unrelated machine's clock without writing a sampled pose into the document?
- Do removal and performance evidence cover complete consumers rather than a passing private kernel?

F1 reviews the concrete S1 records/validator/group compiler against this contract. F2 reviews numerical implementation; F3 reviews transactions and ownership; F4 reviews the integrated result and removal evidence. No speculative review has been spent on this document.
