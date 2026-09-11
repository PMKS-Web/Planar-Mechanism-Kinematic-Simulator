# Native constraint derivation

Working derivation for S2/S3, before implementation. This is not a claim of solver verification.
It uses the record conventions in [the contract](bodies-and-joints-contract.md). F1 must settle
those conventions before the implementation depends on them; F2 reviews the implementation
and independent numerical examples.

## Frames and unknowns

A moving welded group has three unknowns `(x, y, theta)`. A member's stored transform in
that group is constant. Compose each local attachment and guide axis into the group frame
once; the following formulas then apply to group-local points without introducing synthetic
pins. A group containing WORLD is fixed. An internal relationship still has its residual,
coordinate, drive and limits checked even if its unknown columns disappear.

All quantities below are physical SI values and angles in radians. Let `E(x,y)=(-y,x)`.
For one ordered pair, define:

- `a = R_A a_local`, `b = R_B b_local` (rotated offsets, not world positions).
- `p_A = r_A + a`, `p_B = r_B + b`, `d = p_B - p_A`.
- `u = R_A u_local`, `n = E u` (guide carried by A).
- `v = v_B + omega_B E b - v_A - omega_A E a` (full relative point velocity).
- `k = -omega_B² b + omega_A² a` (relative centripetal acceleration).

The full velocity is needed in `v`: unknown and prescribed boundary rates both contribute.
A boundary body is not an independently writable WORLD pose. Whole-partition solving will
normally include a grounded crank among the moving unknowns and prescribe its joint angle;
the row formulas also support an explicitly prescribed moving boundary when one is used.

## Rows and first derivatives

For a point-coincidence vector row `F = d`, the blocks for `[x_A,y_A,theta_A]` and
`[x_B,y_B,theta_B]` are `[-I, -E a]` and `[I, E b]`.

For the lateral row `F = n dot d`, the blocks are:

| Block | x | y | theta |
| --- | --- | --- | --- |
| A | `-n_x` | `-n_y` | `-u dot d - n dot E a` |
| B | `n_x` | `n_y` | `n dot E b` |

For the travel coordinate `s = u dot d - travelZero`, the blocks are:

| Block | x | y | theta |
| --- | --- | --- | --- |
| A | `-u_x` | `-u_y` | `n dot d - u dot E a` |
| B | `u_x` | `u_y` | `u dot E b` |

The angular coordinate/heading is `theta_B - theta_A - angleZero`; angular columns are
`-1,+1` and translation columns are zero. When A/B name material members of groups, add the
constant member-angle offsets. Do not wrap the heading residual separately at each sample:
the accepted continuous angle branch supplies the turns.

R contributes the two coincidence rows; P contributes lateral and heading; pin-in-slot
contributes lateral alone. An angular drive contributes its coordinate minus `c(t)`; a
travel drive contributes `s-c(t)`. The command partial is therefore `-1` in its drive row.
Unlike the old point-based `drivenAngle` row, this angular coordinate needs no sine/cosine
of the command, so it introduces no mixed pose/command derivative.

A weld's uncondensed rows are `r_B-r_A-R_A t_AB` and
`theta_B-theta_A-angle_AB`. Condensation removes their motion unknowns but not their
physical load path. S3 must recover member/weld reactions using uncondensed physical wrench
equations where needed, rather than pretending a condensed internal row still has a useful
multiplier in the position system.

## Second derivative without a differencing step

Write `0 = J qddot + F_c cddot + gamma`, with boundary acceleration terms included when
boundary columns are separate. The velocity-only terms are:

| Row | gamma |
| --- | --- |
| Coincidence vector | `k` |
| Lateral `n dot d` | `n dot k - 2 omega_A u dot v - omega_A² n dot d` |
| Travel `u dot d - travelZero` | `u dot k + 2 omega_A n dot v - omega_A² u dot d` |
| Heading / angle | `0` |
| Uncondensed weld translation | `omega_A² R_A t_AB` |

These follow from `udot=omega_A n`, `ndot=-omega_A u`, and the product rule twice.
The terms multiplying angular acceleration already belong to the theta columns of J;
adding them to gamma again would double-count them. The point velocity `v` includes rotation
of both attachment offsets, so replacing it with origin velocity loses offset-guide and
Coriolis terms. With separate boundary columns, solve
`J_q qddot = -gamma - J_b bddot - F_c cddot` after evaluating gamma along the combined velocity.

Check these against independent curved paths that have nonzero accelerations, not only a
straight-line perturbation. Also check every column by central differences for test purposes,
including offset local frames, unequal angular rates, a moving guide and nonuniform command.
Production derivatives use the analytic rows, not those test differences.

## Scaling, rank and physical efforts

Keep physical J and row identities. Position/rate solves may use recorded row/column scaling,
but recovered multipliers must be converted back before interpreting forces and moments.
A travel row produces a force conjugate to meters, and an angle row produces a torque
conjugate to radians. Compare virtual work and input power after any A/B reversal.

Choose numerical scale from the partition's referenced constraint geometry, not distant
unreferenced tracers or another machine. Avoid normal equations for rank decisions: they
square the condition number. Rank, consistency and convergence are separate checks. Enough
rows is necessary but does not prove full column rank; full rank does not prove a small
residual. An iteration or subdivision cap can only refuse, never manufacture success.

For a body's CoM/witness local point `c`, use `p=r+R c`,
`pdot=v+omega E R c`, `pddot=a+alpha E R c-omega² R c`.
No angular acceleration is recovered by dividing arbitrary endpoint components. Each
accepted sample owns its rates and branch state; a refused attempt publishes neither.

## Numerical frames and continuation

The compiled material/group frames remain independent of a partition's numerical origin O.
For a constant group-local offset h, the numerical origin is `r_n = r + R h - O`, the
attachment becomes `a_n = a - h`, and theta is unchanged. Moving group origins are already
near their constraint geometry; fixed boundary origins are relocated near O too, so a WORLD
anchor at a large coordinate does not reintroduce cancellation. Then
`p_world = O + r_n + R a_n`. Continuation stores `r_n`, never a world pose rounded by adding O.
World reconstruction is only an output boundary. The S2 test at translation 1e9 failed with
global correction and passes with this frame; no convergence threshold was relaxed.

S3 must carry the same frame change through rates and wrenches:
`v_n = v + omega E R h`, `a_n = a + alpha E R h - omega² R h`.
For a wrench reported about the old origin, `M_old = M_n + cross(R h, F)`.
A frame change cannot turn a transported P guide moment into an independent reaction couple.

`bodyMobility` removes drive rows, obtains the tangent nullspace of scaled J, and checks
`J xddot = -gamma(v)` for its basis directions and their pairwise sums. A sole tangent
direction obstructed at second order is an isolated pose (the two stretched rods test).
With multiple tangent directions, an obstructed basis does not prove isolation: compatible
mixtures may exist, so report singular/undetermined rather than zero mobility. An unobstructed
redundant system is labeled second-order compatible, not a proof against all higher-order
singularities. Admission still requires one controlled freedom, a full-rank driven system,
consistent drawn rows and all bounds. Singular starts retain a refusal.

Continuation predicts with dx/dc, corrects against the commanded rows and subdivides a step
whose correction is too far from its prediction. Limits are checked on settled candidates;
private substeps are discarded together if the requested advance fails. Rank-reduced local
correction is allowed only on continuation from an admitted regular start, retaining its
previous tangent through an isolated singular sample; it does not relax initial admission.
The parallel-branch test crosses exact collinear poses over multiple turns.

A numerical refusal alone is not an input limit. `findBodyFold` follows the undriven regular
curve with an arc-plane equation, brackets a change in the sign of dc/ds, and evaluates
`d²c/ds² = J_c xddot + gamma_c` from analytic rows. It reports a physical input fold only if
the passive Jacobian still has rank n-1, the extremum is nondegenerate in the requested
direction, the requested command lies beyond it, and the inspected curve poses satisfy
coordinate bounds. Both limits of the rocker-input fixture agree with its independent
triangle formula. Iteration/cut exhaustion without this evidence remains branch/unsolved.
This fold diagnostic is not an accepted sample or a mutation of the prior continuation.


## Rate-system implementation and consistency

`solveBodyRates` uses the compiled physical row gradients and the same position scaling. It
solves the scaled rectangular system twice, using one pivoted QR factorization:
`Jq qdot = cdot - Jb bdot`, then `Jq qddot = cddot - Jb bddot - gamma(qdot,bdot)`.
The command term is present only in rows carrying a command ID. Boundary poses and both
orders of boundary rates must be supplied explicitly; there is no implied moving-frame zero.
The answer includes those prescribed groups. A missing input, invalid pose, rank deficiency
or inconsistent derivative system returns a refusal containing no motion map.

Consistency uses each row's term magnitude plus a floating-point allowance proportional to
its norm and the scaled solution norm. Without the latter, a mathematically zero angular
rate contaminated by elimination round-off was incorrectly refused on an oblique carriage.
There is no absolute one-unit floor: conflicting commands of 1e-12 and 1.01e-12 are refused
at both derivative orders. The moving-boundary fixtures exercise nonzero acceleration along
the constrained rows and the angular/linear rate transformation at a relocated boundary
origin. An unreferenced boundary at extreme position/rate scales does not enter the matrices,
quadratic terms or scaling; its prescribed output remains available.

A single offset revolute pair also exposed a position-conditioning issue: coincident anchor
points differed only by round-off, but that difference became the mechanism's length scale.
The scale uses within-group anchor spans, guided axial separation and referenced moving-origin
lever arms; it never uses the mismatch of a pin’s two anchors as a physical dimension. An absolute WORLD anchor is not such a lever arm. Existing large-translation,
small/large-scale and independent reference position checks pass with this correction.

These are the initial native rate primitives, not the complete S3 sample, force or cycle
implementation. The stop-event contract in `bodies-and-joints-contract.md` remains to be
implemented and tested before playback intervals may be published.

## Moving-group force primitives

Let `w` be the required constraint wrench about each numerical group origin, with its two
force components in N and moment in N·m. The physical Jacobian supplies `Jᵀ lambda = w`.
With the position system's `Js = Dr J Dc`, solve `Jsᵀ lambda_s = Dc w` and recover
`lambda = Dr lambda_s`. Length-row multipliers are forces; angle-row multipliers are couples.
`bodyRowBlocks` preserves the separate A/B derivatives before any same-group sum, so reaction
ownership is not lost when both members condense to one numerical body.

`groupForceLoads` computes, once per moving group,
`w = [m a_C, I_C alpha + r_C × m a_C] - w_applied`, where `r_C` is measured from that numerical
origin. Gravity acts at the resolved group CoM. Explicit aggregate mass properties replace
member-derived group totals only at this stage; they do not silently redefine individual
material inertias. Each authored load is carried through its material frame. A world vector
keeps its direction; a body vector rotates with that material body. An applied couple is
converted with force-unit × length-unit factors, independently of its application point.

The independent loaded-rod check uses a 2 m, 2 kg slender rod with `I_C = 2/3 kg·m²`, pinned
at one end. At `omega = 3 rad/s`, `alpha = -0.5 rad/s²`, its inertial pin torque is
`(I_C + m*1²)*alpha = -4/3 N·m`. Its energy derivative is `I_pin*omega*alpha = -4 W`.
A 10 N downward world load at the tip contributes `-20 cos(theta) N·m`; a body-downward
load contributes `-20 N·m`. Gravity contributes `-2 g cos(theta) N·m`, and the applied
positive couple contributes `+3 N·m`. These terms determine the tested support force,
drive torque and power independently of the solver. SI, centimeter/gram and inch/pound
records, rebased material frames and a welded group with an explicit mass/CoM/inertia
are checked against the same physical arithmetic.

The default equilibrium solve exposes only identifiable row efforts. A nullspace component
on a row makes that effort unavailable; choosing one QR pivot basis is not a physical load
split. The explicit `evenest` policy retains the existing shared-support convention and
labels its values accordingly. It minimizes the norm in the normalized physical coordinates
above (forces and couples divided by the referenced length have compatible scale), using
an augmented QR with ridge root `1e-4` and three residual refinements. This preserves the
existing damping/refinement policy without normal equations. The equilibrium residual is
measured against loads alone, with limits `1e-8` for unique efforts and `1e-3` for the stated
shared-support approximation. A tiny unsupported load still fails; large canceling reactions
cannot enlarge that denominator. Nearly coincident supports remain bounded through the
exact coincidence. Internal condensed relationships remain unavailable under either policy.

The force-series producer selects one support policy for all supplied samples, keeping an
isolated singular pose distinct from persistent support redundancy. It does not prove that
the supplied samples constitute a complete cycle. Internal material recovery is described
below; complete fixed-frame ownership across clocks is described in the fixed-context section.

## Recovering material reactions inside a welded group

Member balances use the same `bodyLoadWrenches` law as the external group balance. Let O be
the group's numerical origin at the current sample. For every material member m, form
`b_m = [m a_C, I_C alpha + r_OC × m a_C] - w_applied,m - w_external,m`, with all moments about O.
External row wrenches are assigned to the material IDs on the joint record, not to whichever
member happens to name the condensed group. WORLD has no material balance equation.

`internalForcePartition` assigns each material an equilibrium frame at O. These frames are
only moment references for a force matrix; they do not create another set of kinematic
poses, persistent bodies, joints or geometry. Each internal R/P/slot row retains its original
A/B derivative blocks and local geometry, with the two group IDs replaced by the original
material IDs. This matters even for an internal pin that adds no motion constraint after
condensation: it can make a weld's force indeterminate.

A weld supplies three reaction channels, with A/B blocks `(-Fx,-Fy,-M)` and `(Fx,Fy,M)` about
that same O. Referring a full wrench to O is valid even when the weld's two authored attachment
points differ; no coincidence assumption replaces its captured rigid transform. The resulting
material equilibrium matrix is solved in unique mode. Nullspace participation makes a reaction
unavailable. Thus a cycle of redundant welds has no invented internal split, while a bridge
from that cycle to a loaded leaf still has a determinate wrench. WORLD-connected welds are
included and their material equations recover a fixed bracket's support load.

Before presentation, transport each side from O to its own material origin:
`M_member = M_O - r_O,member × F`. Forces remain world-oriented SI components. Moments at the
two different material origins are generally not opposites. The off-axis loaded-bracket test
checks both transport to a common origin and zero net internal power using each origin's
actual velocity. It covers static/dynamic loads, nonzero angular acceleration, SI/inch units,
reordered construction arrays and a rebased bracket origin.

A second solve can receive an almost-zero balance after subtracting opposing known external
loads. Checking that residual only against the canceled remainder would reject a valid
zero-load weld. The member load compiler retains magnitudes of contributing load/inertia
terms; recovery adds the known external reaction magnitudes. `solveBodyEfforts` accepts this
explicit arithmetic scale to add a `128*epsilon` rounding allowance in its normalized
coordinates, with no one-unit floor. The reported residual remains the raw residual, and
`roundoffAllowance` records the separate normalized allowance. A four-bar with an unloaded
welded leaf proves this is necessary: removing the allowance refuses its zero reaction;
adding an actual 1e-10 N imbalance still refuses, and a following valid call recovers.

External support policy and internal weld uniqueness remain separate. If an external reaction
is unavailable, member recovery returns `external-reaction`; it does not set that reaction
to zero. An explicitly chosen external evenest split can supply known boundary values, but
recovered internal results retain the `evenest` label to disclose that dependence. The internal
solve still does not regularize a weld cycle. If approximate external support values do not
balance the members at the internal solve's precision, recovery remains unavailable rather
than inventing an additional material load distribution.

An aggregate mass/CoM/inertia override does not specify how changed inertia is distributed
among several materials. Dynamic member balances with such an override return
`aggregate-properties`. Static balances need no inertia distribution: an inertia-only
override is harmless; mass/CoM overrides matter if gravity is present. With gravity off,
static member forces remain computable. A group with only one material (WORLD excluded) has
no distribution ambiguity and uses its complete group override. An active imported group
load whose provenance names multiple materials returns `load-owner`; its external group
wrench remains available. Neither refusal erases the material records or invalidates the
external group force answer.

These functions recover one supplied group's forces at one sample. The force-frame layer
below publishes moving partitions; the fixed-context producer combines their material
reactions. Component-level availability and the S6 consumer cutover remain pending.

## Force frames, boundary power and series policy

`solveBodyForceFrame` publishes material-pair wrenches, driver efforts and group balances with
one revision/partition/index/time/command/direction stamp. Pair moments refer to each named
material body's origin; group balances refer to the numerical origin in that sample's solve
frame. The latter are computational records, not unqualified material moments for a chart.
The immutable map facade has no mutation methods, and its `forEach` callback receives the
facade rather than its private backing map. New result records are recursively frozen without
freezing the producer's pose maps or stamp.

For a physical row with multiplier lambda, virtual work gives power
`lambda * (J_q qdot + J_b bdot)`. Passive rows have zero total coordinate rate; a driven row
has the prescribed coordinate rate. Summing the moving group's balance therefore gives
`P_applied + sum(lambda_driver * cdot) - sum(lambda * J_b bdot) = dT/dt`.
The published boundary term is the negative of work delivered to prescribed bodies, so it is
positive into the moving partition. Statics checks the same equation without `dT/dt`; a
static solve with no valid rates still has forces but no power. A dynamic reversal returns
no force maps because the rate discontinuity has no finite acceleration in this model.

The rotating-carrier carriage checks nonzero boundary power independently. With its carriage
pin constrained to y=1 and its carrier heading theta, `x=cot(theta)`, `s=csc(theta)`,
`vx=-omega/sin(theta)^2`, and
`ax=2*cos(theta)*omega^2/sin(theta)^3-alpha/sin(theta)^2`.
For carriage mass 2 and inertia 0.3, the guide normal is `N=-2*ax/sin(theta)` and its couple
is `0.3*alpha`. Prescribing the carrier makes incoming boundary power
`(s*N+0.3*alpha)*omega`, equal to the carriage energy rate
`2*vx*ax+0.3*omega*alpha`. Solving the full driven carrier adds its pin inertia term
`3*alpha` to the crank torque. Both views are checked against these expressions.

`solveBodyForceSeries` first tries unique efforts at every supplied sample. If a strict
majority has external effort nullity and no free equilibrium direction, it recomputes the
entire series with the evenest policy before publishing. Internal condensed rows do not
trigger the policy. Failed samples remain unavailable under either policy; mixed revisions,
partitions or non-increasing sample order refuse the series. The eventual cycle controller
must supply the complete accepted series and retain each sample's provenance.

## Material frames fixed by passive joints

WORLD weld membership is not the only way to hold material fixed. The single-body test
still marks a body when consistent passive relations to known ground have rank three. This
preserves independent valid foundations beside faulty attached branches. When that propagation
stalls, `fixedBodyGroups` now tests connected passive candidate sets, excluding command rows.
It uses the same local solve frame, row/column scaling, QR rank and residual tolerances.

For a candidate C, retain only rows whose two endpoints lie in C or known fixed boundary.
A consistent Jacobian of full column rank 3|C| proves its drawn pose locally isolated: a
full-rank square subset has an isolated zero by the inverse function theorem, and the remaining
rows also hold. Mark those groups fixed without changing material/weld ownership. A deficient
candidate is pruned by removing every body with a nonzero component in any scaled nullspace
basis vector. Rebuild the rows after removing those bodies, and repeat. The 1e-8 null-component
cutoff selects candidates only; no candidate is accepted without the independent full-rank
and residual checks. Every iteration either removes a body or returns; no iteration cap can
silently certify a body. The outer propagation stops when no new group is proved fixed.

A crank-rocker at its turning point illustrates why the repeated proof matters. The rocker
has zero instantaneous velocity while crank and coupler move. After those moving bodies and
their rows leave the candidate, the rocker has only its ground pin, rank two, and stays
movable. This also holds when its ground pins belong to a collectively rigid foundation.
Singular isolated structures with deficient first-order rank are not certified by this method;
a collinear two-bar foundation remains subject to ordinary admission. Inconsistent candidates
remain unclassified, with all their original rows retained for admission. This is a sufficient
regular-rigidity test, not a nonlinear proof for every singular structure.

Two worked passive cores test beyond individual-body and pair shortcuts: a triangle with two
material bars pinned at (0,0), (4,0), and a common apex (1,2); and a platform on three RR struts.
The latter's strut directions yield vx=0, vy+2ω=0, vx+vy−2ω=0 at the platform, forcing all three
platform rates to zero and then fixing the struts. Both carry independent cranks and retain
all physical support channels. Rebase, scale, unit and enumeration checks preserve the two
clocks and material identities. A nonzero command on a fixed core still refuses as fixed-drive.

For the loaded triangle with gravity zero and two 10 N downward crank-tip loads, let H=(Hx,Hy)
be the apex force on the left bar and θL,θR the crank headings. Moments about each ground pin
give Hy−2Hx=5+10cosθL and 3Hy+2Hx=−15+10cosθR. Thus Hy=2.5(cosθL+cosθR−1),
Hx=(Hy−5−10cosθL)/2, with ground forces (−Hx,10−Hy) and (Hx,10+Hy). The component snapshot
matches these forces and the apex moments transported to each material origin; removing either
crank sample refuses this shared foundation instead of publishing a partial balance.

A per-machine force frame publishes its reaction on the shared material frame. Its ground
supports and internal frame welds return `frame-context`: their complete reactions need
the loads from every attached clock plus the frame's own loads. Distinct sample times on two
machines cannot silently select one machine as the owner of the whole frame.

## Combining a fixed foundation's force context

`solveFixedBodyForces` accepts a revision, mode, SI gravity and selected per-machine force
frames. `fixedForceInputs` requires exactly one selected frame for every machine whose rows
act on fixed material. A pin acting directly on WORLD has no material balance and does not
add a required clock. Samples may have different times: the context stores all the sample
identities rather than choosing one as a global time. Duplicate frames, missing required
samples, mixed revisions/modes/gravity and unavailable incident reactions are explicit
refusals. Per-machine force frames now carry gravity as immutable calculation provenance.

For every incident joint, take the wrench on its fixed material side about that material's
origin. Pass these SI wrenches directly into the group's/member's load calculation. Do not
create persistent force records or convert the wrench to document units and back. Keep
contributions separate until `bodyLoadWrenches` can retain their magnitudes before
cancellation. Group equilibrium now passes that arithmetic scale into the same existing
round-off allowance used by member recovery.

The fixed-force matrix has the non-WORLD fixed weld groups as equilibrium unknowns and WORLD
as boundary; all retained fixed rows remain force channels. No kinematic pose is advanced.
Solve the external group reactions under the explicitly selected support policy, then recover
each group's member reactions, including WORLD-welded material. Its own balance is static
even when the attached machines supplied dynamic reactions: zero fixed-body acceleration
needs no distribution of an overridden moment of inertia. Gravity can still require a mass
or CoM distribution, and imported load-owner ambiguity remains explicit. An unavailable
reaction acting directly on WORLD is not a missing load on a material member.

Internal weld cycles are still solved in unique mode. An evenest external support split, or
a moving-machine reaction already conditional on that split, labels subsequent available
fixed reactions `evenest`; it does not make an internal weld cycle identifiable.

The two-clock pinned-frame test derives the support split independently. For frame unit axis
u, normal n, length L=4, and the total applied foundation wrench `(F,M)` about the first pin,
the evenest tangential reaction at each support is `-dot(F,u)/2`. The second normal reaction
is `-M/L`; the first is `-dot(F,n)+M/L`. F and M include the frame's weight/applied load plus
each crank's centripetal reaction and motor counter-torque at its own selected angle. SI and
inch/pound documents, rebased material origins and reversed enumeration yield the same
physical reactions. Replacing the two pins by one WORLD weld gives the unique wrench
`(-F,-M)` at that pin. Omitting the machine contributions fails both hand answers.

This diagnostic producer returns one complete all-fixed context. Consumers use the
component-level producer below so a missing sample does not hide an unrelated foundation.
The full simulation snapshot/cycle controller must still select and retain fixed support
policy consistently; these per-context functions are not themselves a cycle or a UI adapter.

## Fixed material components and numerical moment references

`solveFixedForceComponents` is the fixed-force entry point for the simulation snapshot.
`fixedForceComponents` connects fixed material through every actual fixed joint, excluding
WORLD as an intermediate material vertex. Two WORLD welds can therefore have independent
force contexts, even at the same visible point; adding a weld or P directly between their
material joins the contexts. The snapshot carries a material-to-component index, per-component
calculation provenance/refusals and the material-pair joint results. A generic `frame-context`
joint refusal retains its detailed cause on the component result.

Each component requests only its own incident clock samples. Missing, refused, duplicated or
mixed-provenance samples affect that component alone. Support policy is also selected per
component and retained in the result. `fixedForceProjection` keeps the original numerical
frames, members and owned support rows; it restricts WORLD's material members and recalculates
their material mass with the shared aggregation helper. This is a `ForceDocument` view of
units/material/joints/loads/annotations, deliberately not a complete editable/persistable
`BodyDocument`. It creates no persistent bodies or force records and does not alter the source.

A group mass/CoM override spanning independent foundations has no specified distribution
under gravity. Both affected components return `aggregate-properties`; a third independent
carriage can still report its own hand-derived support force/couple. With zero gravity and
zero fixed-body acceleration the cross-component mass override contributes no load. An active
imported load whose provenance spans components returns `load-owner` on those components,
rather than assigning it solely to the reference body. An actual material joint joining the
foundations keeps the complete coupled force problem instead of applying this split.

A WORLD-only welded foundation also needs a nearby moment reference. Otherwise a small
bracket at coordinates of order 1e9 solves moments of order 1e10 and subtracts them to present
a material moment of order 1. `fixedForceBalance` now supplies a nearby material origin to
`createBodySolveFrame`; its ordinary position-solver callers retain the previous default.
This alone cannot recover local precision already lost in a cached WORLD center of mass.
`memberForceLoads` therefore reconstructs material mass geometry in the numerical frame, then
applies a single-material group override using that same local frame. A body-local custom CoM
stays local until the force calculation, rather than being rounded through WORLD first.

The distant-bracket probe derives force and moment from its local force arm and CoM, in SI
and inch/pound units, with and without an override. The original calculation missed Fx by
about 3.8e-6 N; choosing a nearby origin alone still missed the moment by about 4.4e-7 N·m.
Both corrections pass the unchanged 1e-9 decimal-place assertions at offsets 0 and 1e9.


## Directed interval checks and cycle publication

`inspectBodyInterval` adds the missing interval layer above `advanceBodyCommand`. It keeps
one admitted numerical frame and privately removes coordinate bounds from continuation, so
it can evaluate the far side of a crossing. It still applies all pose/branch constraints.
The public result is a clear endpoint, a localized coordinate stop or proved geometric fold,
or an explicit branch/unsolved refusal. Private outside poses never become cycle samples.
An already-invalid starting bound refuses rather than becoming a new stop event.

At a regular pose, solve the analytic body rates with command speed 1 and acceleration 0.
For any passive coordinate g, its probe slope is grad(g)·x′ and its second derivative is
`grad(g)·x″ + gamma_g(x′)`. `bodyCoordinateMotion` also serves future coordinate sample readers;
it includes both body frames and the rotating guide terms. Directly commanded coordinates
have probe slope 1, and a coordinate internal to one rigid group has slope 0 even when other
parts' instantaneous rates are unavailable.

Regular interval leaves limit commanded/individual body angular change to 0.1 scaled units.
Midpoint values and slopes are compared with the endpoint cubic Hermite interpolant; an
unbracketed predicted derivative root forces subdivision. Real derivative sign brackets in
each half locate interior stationary points using continued poses, and every lower/upper
bound is tested at the ordered knots. Thus a carriage x=R cos(theta) cannot cross a stop and
reenter unseen merely because both requested endpoints are safe. A maximum touching the stop
and returning inside stays clear. Crossing refinement retains the last inside pose and checks
its bound residual, with coincident contacts evaluated at that same selected pose and sorted
by stable limit ID. Contact localization does not depend on limit enumeration.

A shallow stop exposed why event probes need more accurate poses than ordinary drawing
samples. With a maximum only 1e-7 beyond the bound, the previous 1e-10 normalized pose residual
moved the computed crossing angle by about 4.28e-7 radians. Event probes now polish to 1e-13;
`relaxBodyPosition` keeps its ordinary 1e-10 default. The unchanged eight-decimal crossing-angle
assertion passes. This is local event refinement, not a global relaxation of solver tolerances.

At a proved input fold, command derivatives may diverge. The final geometric leaf instead
uses the oriented nullspace tangent of the still-regular passive curve for endpoint slope
signs and refines until scaled translations/angular changes are at most 1e-5. These slopes
are private event evidence, never published velocities. Nonbinding coordinate limits remain
checked at the fold; a tighter passive bound wins earlier. Budgets (4096 probes, depth 40 by
default) return unsolved; exhausting a search is not a physical reversal. This adaptive
sampling and local curve treatment is numerical evidence, **not a formal interval-arithmetic
proof for arbitrary nonlinear motion**. Keep adversarial extrema/branch tests in the S3 gate.

`buildBodyCycle` explores each direction from the original admitted state. An angular branch
can close only after a complete commanded turn and a body-pose closure check (angles modulo
2pi, translations in the numerical frame). A bounded rocking cycle explores both stops,
then reuses accepted geometry in reverse order. It never readmits a singular stop or solves
an arbitrary new return branch. Time increments by absolute command travel / absolute speed;
negative speeds choose the first direction without changing elapsed-time sign. Initial stops
own the cycle seam and do not insert zero-duration duplicate samples. A sample/turn budget
refuses the cycle entirely instead of publishing a truncated loop. Unbounded linear motion or
one-sided nonperiodic travel does not become an invented periodic animation.

The cycle's pose maps, tangents, stop records and sample array are immutable copies.
`bodyCycleInputs` adds revision/partition/index/time/command/direction stamps, immutable command
and motion maps, and recomputes rates at each regular sample with its signed physical speed.
At a reversal the rate result is explicitly unavailable; dynamic force frames report reversal,
while statics may still be evaluated. At an isolated singular sample with a retained geometric
branch, rank refusal does not erase position or leak a previous rate map. The next regular
sample gets a fresh solve. A cycle cannot be stamped for a different partition.

The document-wide snapshot and its readers are described below. They retain these sample
availability rules rather than borrowing values across frames.

An additional probe found that a nonbinding passive angle limit still refused at an isolated
singular **non-fold** pose (134 probes, unsolved). These samples do not have the fold's regular
one-dimensional passive tangent. They now use a small geometric enclosure when derivative
probes are unavailable. The leaf must have translation/angle radii at most 1e-5 scaled units,
and every bound must lie outside an enclosure expanded to twice the observed radii. For angle,
variation is bounded by the sum of the two angular radii. For travel u·d, use
|u'·d'−u·d| <= |d'−d| + |u'−u| |d|, including both anchor rotations. This bounds the coordinate
inside that local pose box without assigning a velocity. As with other adaptive leaves, the
sampled curve's enclosure is numerical evidence rather than a global interval proof. A
nearby bound does not pass this clearance test. The tracked regression clears the nonbinding
limit, still finds a stop 1e-7 radians before the singularity, and keeps analysis rates
unavailable at the singular pose. Full-turn cycle tests now cover both limited and unlimited
variants; a bound that cannot be cleared or localized still yields unsolved, not a reversal.

## Immutable simulation snapshots and selected clocks

`buildSimulationSnapshot` compiles one design revision, admits and precomputes each moving
partition independently, and owns deep immutable copies of its design, numerical frames,
poses, rate results and force series. Read-only Maps cannot be mutated through a cast.
The editable source is neither frozen nor aliased. Failed admission/trajectory results stay
on their partition; they do not erase another machine's samples.

`selectSimulationView` requires a matching revision and an explicit index for each selected
clock. Missing, invalid or refused selections never default to index zero. It combines exactly
those selected force frames for fixed-foundation equilibrium. A foundation requires all of its
incident machine samples; unrelated foundations remain independent. Its support policy is
chosen once from fixed geometry (or an explicit per-component override), not from whichever
clock sample is currently displayed. Full column rank plus redundant external rows selects
the conditional evenest policy. Internal weld cycles are still indeterminate.

Material and attachment readers compose the retained numerical group pose with the member's
local frame. Position alone adds the world origin at the presentation boundary; point rates
remain in the numerical frame:

- p = o + R(theta) r
- v_p = v_o + omega E R(theta) r
- a_p = a_o + alpha E R(theta) r - omega² R(theta) r.

Their local point argument uses document length units; returned positions, rates and wrenches
use world-oriented SI. `simulationMaterialCenter` uses intrinsic member properties;
`simulationGroupCenter` uses the compiled aggregate, including its explicit override.
An override never rewrites raw material properties. Zero mass has no physical center.
WORLD is a computational collection of foundations, not one user-facing aggregate center.
An arbitrary material witness remains available when its mass is zero.

Coordinate readers transform both pair anchors into the retained solve frame before
evaluating value, gradient and analytic gamma. A rotating carrier's P travel and a horizontal
slot independently give s = csc(theta) - csc(theta0) and
x = cot(theta) - cot(theta0). For constant angular speed w:
s' = -w cos(theta)/sin²(theta),
s'' = w²(1+cos²(theta))/sin³(theta),
x' = -w/sin²(theta), x'' = 2w² cos(theta)/sin³(theta).
The snapshot tests compare all of these directly with the published values at each sample.

## Explicit nonlooping analysis duration

The existing `Mechanism` does not publish open-ended slider travel: its sample/work budget
eventually refuses a path as `cycle-never-closes` (`mechanism.ts`, loop budget after the seam
checks). Native unbounded travel need not become a fictitious out-and-back cycle to be useful.
`buildBodyMotionWindow`, requested by an explicit snapshot path duration, checks the same
continuous intervals as a cycle and ends at the first proved physical stop or the requested
time. A time endpoint is labeled `duration`; it retains signed rates and dynamics, with no
reversal marker or automatic loop. A physical stop is labeled `stop` and retains the normal
unavailable reversal rates. Exhausted work/sample budgets publish no partial trajectory.
The window API is implemented; choosing and exposing its duration in the native transport
still belongs to S5/S6. The current editor has not switched to it.
