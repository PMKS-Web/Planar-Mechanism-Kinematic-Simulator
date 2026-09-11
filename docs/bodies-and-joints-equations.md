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

WORLD weld membership is not the only way to hold a body fixed. A material bar with two
distinct ground pins has no motion, and independent machines attached to that bar must not
be joined into one clock. `fixedBodyGroups` iteratively marks a group fixed when its passive
rows to already-fixed groups have a consistent drawn pose and a full-rank three-column
Jacobian. It uses local solve frames and the existing physical row/column scaling; command
rows are excluded. This changes only derived fixedness, never material/weld membership or
the identity and force channels of the support joints. Retained fixed rows, drives and limits
still pass fixed admission, now in a locally conditioned frame.

Full rank against already-fixed neighbors is a sufficient local isolation test. A body with
zero instantaneous speed somewhere in a moving mechanism does not satisfy this test merely
because it is at a turning point. Coincident redundant ground pins retain rank two and allow
rotation. The implementation does not yet discover every possible collectively rigid
multi-body foundation with no individually fixed member; that case remains an explicit
partition audit before S3 closure, not a claim of general rigid-core decomposition.

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

This producer returns one complete all-fixed context. A refused required clock currently
refuses that context as a whole; it does not erase any already-published moving-machine
frame. Before S3 closure, add component-level fixed availability so an unrelated failed
foundation cannot hide an independently valid fixed material result. The full simulation
snapshot/cycle controller must also select and retain fixed support policy consistently;
this per-context function is not itself a cycle or a UI adapter.
