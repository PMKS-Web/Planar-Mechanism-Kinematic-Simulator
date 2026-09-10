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
