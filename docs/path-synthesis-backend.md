# Four-bar path synthesis backend

> Status: S0–S2 implemented on the local `feature/path-synthesis-backend` continuation.

## Audit and starting point

Draft PR #12 resolves to `feature/path-synthesis`, commit
`4c943fac247bf51ab97ed380d3493a7769633cb7`. On September 12, 2026, fetching
`origin/staging` resolved to `acba1b770a20551b37a9b2f24b459c224c8ed0fc`, already an
ancestor of that PR. No rebase was necessary. The continuation starts at the PR head in its
own worktree; the original branch and unrelated working trees are preserved. Nothing is pushed.

- The frontend stores ordered model-coordinate points in `PathSynthesisDesign`. Closed and
  smooth options and points are already encoded in the S URL section. History stores those URLs.
- The app is Angular, but the numerical domain will use plain TypeScript values, with no
  component, injection, SVG, storage, or browser dependencies.
- `RevJoint`, `RealLink`, and their connection graph represent the normal four-bar. A fifth
  revolute point belonging only to the three-point coupler is an ordinary tracer, not another
  degree of freedom. Existing motion synthesis constructs and inserts these model entities.
- `Mechanism` clones the model, checks mobility and driver readiness, and precomputes motion.
  `PositionSolver` performs crank stepping, circle closure, and rigid tracer transport. It has
  mutable static state and absolute rounding tolerances; it is unsuitable for thousands of
  optimizer trials, but is the final authority for insertion and trajectory verification.
- `simultaneous-solver.ts` solves constraints with damped Newton steps; `hold-solver.ts` solves
  editing constraints. Neither is a bounded parameter optimizer. `utils.matLeastSquares` uses
  normal equations and matrix inversion, which squares conditioning. A small rank-checked QR
  solve is justified for the synthesis-specific linear fit. No numerical dependency is added.
- Existing motion synthesis is a three-pose circle-center construction and candidate enumeration,
  not a path optimizer. Its existing APIs and serialized branch conventions stay untouched.
- PMKSConversion history (`62abecf`, `5aa1e55`, `19596bd`) provides the target editor, presets,
  and Catmull–Rom preview. It provides no complete numerical synthesis backend.

The search uses analytic circle closure, bounded differential evolution plus local coordinate
refinement, and variable projection of linear parameters. Finalists must pass the production
solver. The search yields between generations for cancellation and browser responsiveness.

## Architecture and entry points

All numerical files are under `src/app/model/synthesis/`:

| File | Responsibility |
| --- | --- |
| `path-types.ts` | Serializable requests, settings, constraints, geometry, results and diagnostics |
| `path-target.ts` | Duplicate handling, curve interpolation, arc-length resampling and normalization |
| `four-bar.ts` | Circle closure, whole-interval feasibility and fixed assembly trajectory |
| `linear-fit.ts` | Small rank-checked Householder QR least-squares solve |
| `path-objective.ts` | Linear parameter projection, world bounds and geometric error |
| `bounded-search.ts` | Seeded bounded differential evolution and coordinate refinement |
| `path-engine.ts` | Multiple starts, assembly/direction enumeration and candidate ranking |
| `pmks-path-adapter.ts` | Normal model creation, production verification and finalist selection |
| `path-synthesis.ts` | Synchronous end-to-end `synthesizePath(request, control)` API |

`searchPath` is a generator suitable for an execution adapter or future worker. Its candidates
are marked `production.status = 'unchecked'`. `synthesizePath` returns `best` only after PMKS
verification; the Angular service consumes the same generator cooperatively and calls the same
validator. A caller must never treat the pure search's unchecked output as approved for insertion.
The algorithm has no Angular, DOM or SVG dependency. The PMKS adapter necessarily imports the
existing PMKS model, which currently imports some app services for rendering defaults.

The app passes internal model coordinates throughout (`MODEL_SCALE = 200` model units per
displayed length unit). Formatting and the existing URL codec own that display conversion.
Standalone preprocessing/search can use any consistent length unit, but callers must convert
to PMKS model coordinates before using the PMKS adapter; it does not guess a physical unit.

The service snapshots plain target data and schedules approximately 12 ms work slices, with a
timer yield between them. A slice can exceed that target by one generation. Cancellation is
checked before evaluations. A target fingerprint prevents a result from being applied to a
changed target, including coordinate, interpolation, closure and unit changes. Production
validation remains synchronous and non-reentrant, as the existing solver is.

## Four-bar geometry

`A` and `D` are fixed pivots, `B` is the crank endpoint, and `C` is the coupler/rocker joint.
The three moving lengths are `r2 = |AB|`, `r3 = |BC|`, and `r4 = |DC|`.
Ground length is `g = |AD|`. Every length must be finite and positive.

For the input angle θ in the world frame:

```
B = A + r2 (cos θ, sin θ)
q = D − B                    d = |q|
a = (r3² − r4² + d²) / (2d)
h² = r3² − a²
C = B + a q/d + σ sqrt(h²) Jq/d
```

`J(x,y) = (−y,x)` rotates a vector counterclockwise by 90°, and `σ ∈ {−1,+1}`
is the oriented assembly sign. The equations are the intersection of circle `(B,r3)` with
circle `(D,r4)`. No intersection, coincident centers or near-zero height produce an explicit
invalid result. The algorithm does not use a target point to choose a circle root.

The coupler's local x-axis is `e = (C−B)/r3`, with origin at B. Its point is:

```
P = B + u e + v J e
```

`u` and `v` are actual lengths, not fractions of BC. P may lie on a rigid extension of BC.
The UI's normal PMKS representation is a three-point coupler body BCE, with E the tracer P.

## Assembly continuity and sweep feasibility

The assembly sign remains constant for the entire request. It is checked at every emitted
pose. Away from tangencies, the oriented-circle formula is continuous, so it cannot jump
between the two roots. Traversal through a singularity is deliberately refused in this stage;
the code does not guess whether a physical linkage should cross or reverse there.

It is not sufficient to check only the comparison samples. Over the requested input interval,
with ground orientation φ:

```
d(θ)² = g² + r2² − 2 g r2 cos(θ−φ)
|r3−r4| < d(θ) < r3+r4
```

The extrema occur at the interval endpoints or `θ = φ + kπ`. Checking those locations certifies
the inequalities over the whole interval. The minimum clearance to either boundary must exceed
`1e−5` times the longest link/ground dimension. Circle height also has a relative near-tangent
check. These are geometric numerical tolerances, not force or transmission-angle design limits.

This admits finite non-Grashof sweeps. A full revolution must pass the same whole-interval
test; there is no unconditional Grashof filter. The closed seam is included in this certificate
even though comparison samples omit a duplicate final point.

## Target preprocessing and correspondence

At least three distinct finite points are required. Adjacent points within `1e−8` of the
bounding-box diagonal are collapsed; a duplicate closed endpoint is removed. Repeated
non-neighbor points are counted and preserved because they can represent path crossings.

The interpolation choice matches the editor: polyline, or uniform Catmull–Rom with clamped open
neighbors and wrapped closed neighbors. Each cubic is sampled in 64 subintervals to approximate
its cumulative arc length, then resampled by arc length. This is a numerical approximation,
not an exact cubic arc-length integral. Diagnostics expose the cumulative subdivision lengths
and total length; 64 evaluation samples are the default, independent of control-point count.
The bounding-box diagonal L is measured from control points. The centroid is the mean of the
arc-length-resampled comparison points, preventing dense user-entered regions from dominating
translation and conditioning. Internal coordinates are `(P − centroid)/L`; results are transformed
back to world coordinates. Near-zero size and world magnitudes that cannot resolve the path are
rejected. Changing the density of Catmull–Rom control points can still change the curve itself.

The first strategy is explicitly `correspondence.kind = 'equal-input-angle'`:

```
open:   θ_i = θ0 + direction × sweep × i/(N−1)
closed: θ_i = θ0 + direction × 2π × i/N
```

Both input directions are searched by default. θ0 optimizes the phase relative to the first
ordered target point; the target order is never independently permuted during a trial.
This is *not* free-timing path synthesis. An arbitrary known mechanism travels at nonuniform
path speed at constant crank speed; its arc-length-resampled path is generally not an exact
zero-error target under this correspondence. Verification therefore compares returned
trajectories, not recovery of original dimensions, and reports nonzero engineering error.

## Parameterization and variable projection

The canonical ground is `(0,0) → (1,0)`. The nonlinear vector is:

```
[log(r2/g), log(r3/g), log(r4/g), θ0 relative to AD, open-path sweep]
```

Closed paths omit the sweep variable. Positive ratios are guaranteed by exponentiation.
The six remaining linear coefficients are projected out of each trial. For canonical B and
unit coupler axis e, solve the least-squares system:

```
P_target ≈ t + a B + b JB + c e + d Je
```

The six unknowns are `(tx,ty,a,b,c,d)`. Each target point contributes the two rows:

```
[1 0 Bx −By ex −ey]
[0 1 By  Bx ey  ex]
```

The similarity has scale `s = hypot(a,b)` and orientation `atan2(b,a)`. Its world geometry is:

```
A = centroid + L t
D = A + L(a,b)
rj_world = L s rj_canonical
u_world = L (a c + b d)/s
v_world = L (a d − b c)/s
θ0_world = θ0_canonical + atan2(b,a)
```

A collapsed similarity or rank-deficient linear fit is invalid. QR avoids the normal-equation
conditioning loss. This reduction leaves only four or five nonlinear unknowns, while allowing
general placement, orientation, scale and rigid coupler offset. Variable projection is an
established method for separating linear and nonlinear fit parameters; see the
[NIST overview](https://www.nist.gov/publications/variable-projection-nonlinear-least-squares-problems).

Default search ratios are 0.08–4 of ground. Default world bounds are ground 0.05L–8L, moving
lengths 0.02L–8L, coupler offset at most 8L, and pivots within a box extending 8L from the centroid.
Open sweeps default to 15°–342°. The request can prescribe tighter world length limits, a pivot
box, ratio limits, offset limit and sweep interval. Closed sweeps must be exactly 2π.
Projected geometry outside these bounds is rejected, not silently clamped. This first implementation
does not solve constrained linear least squares; consequently a rejected unconstrained projection
can hide a feasible but worse fit on a constraint boundary. That is an explicit search limitation.

## Optimization and error reporting

Bounded DE/rand/1/bin uses independently initialized populations, seeded local random numbers,
binomial crossover 0.85, and a differential weight sampled per generation from 0.5–0.9.
Out-of-bounds offspring coordinates are resampled inside the bound. Each run finishes with
bounded coordinate pattern refinement, halving its step when it cannot improve. This is a small
implementation, with no new dependency; compare the algorithm descriptions in the
[SciPy reference](https://docs.scipy.org/doc/scipy-1.14.0/reference/generated/scipy.optimize.differential_evolution.html).

Defaults: population 36, 140 generations, up to 90 refinement iterations, two starts per
assembly/direction, and a strict 48,000 total objective-evaluation budget. The best feasible
candidate from each independent run is retained and ranked. Every random decision comes from
the request's 32-bit seed; elapsed wall time is diagnostic and does not terminate a search.

```
e_i = ||P_generated_i − P_target_i||
RMS = sqrt(sum(e_i²)/N)
maximum = max(e_i)
normalized RMS = RMS/L
objective = normalized RMS²
```

Invalid trials receive infinite optimization cost and a counted rejection reason. They have
no invented engineering error. Feasible candidates have penalty zero; their error metrics
contain only geometric distance. `converged` means the verified fit meets the requested RMS
threshold (default 0.025), not proof of a global optimum or a stationary point. Otherwise the
result distinguishes iteration/evaluation limits, cancellation, invalid settings, insufficient
points, degenerate targets, no feasible candidate, and production rejection. A search failure
is not a proof that no linkage exists.

## Production validation, conversion and persistence

For every finalist:

1. Create independent `RevJoint` A/B/C/D/E and `RealLink` AB/BCE/CD objects. Wire every joint's
   links and neighbors, ground A and D, drive A, and enable E's traced curve.
2. Construct a normal `Mechanism`. Its mobility, readiness and full feasible-cycle solve must pass.
   Compare its actual animation frames over the requested traversal with the analytic C/P
   positions at each frame's measured input angle. Reject an early reversal or branch mismatch;
   the finer verification walk must not hide a failure at normal animation spacing.
3. Reset and order the same ordinary graph with the normal `PositionSolver`. Step the requested
   monotone interval, including its exact final endpoint, in increments no larger than 0.5°.
4. Compare production B, C and E against the analytic evaluator at every commanded angle.
   Maximum disagreement must be at most `max(0.003, 2e−5 L)` in model/world units. The absolute
   floor accommodates PMKS's four-decimal position rounding. The actual tolerance and worst
   disagreement are reported. Extremely small geometries can fail the production model even
   if normalized analytic optimization succeeds.
5. Retain the best passing candidate. A failed finalist remains in diagnostics with its reason,
   but can never be offered by the service as an insertable best result.

Production position fields are borrowed only synchronously and restored in `finally`, including
private data fields, so the current drawing's solver state is not replaced by preview validation.
The existing solver remains unchanged. This compatibility boundary depends on the current static
solver representation; a future instance-based production solver should replace this isolation.

Insertion allocates five currently unused joint letters, appends the ordinary entities, and
calls `updateMechanism(true)` once. It does not replace other machines or claim motion synthesis's
ownership IDs. Repeated insertion presses are reserved before the deferred loading callback.
Creation, Undo/Redo and sharing use the existing normal mechanism codec. Target encoding stays
unchanged. Results, solver settings and the fitted input interval are not persisted yet. A created
driver starts at 10 RPM in the selected direction and is editable through the normal controls.

## Verification and next stage

`path-engine.spec.ts` covers preprocessing, invalid targets, exact whole-interval feasibility,
both branches/directions, a non-Grashof partial sweep, metric separation, rank rejection,
determinism, transformed targets, open targets, known-mechanism recovery, adapter structure,
production trajectory agreement and static state restoration. Reference mechanisms are published
in the fixture gallery. `e2e/path-synthesis-backend.mjs` covers the end-to-end engineering
workflow, including preservation of an existing machine, cancellation, insertion, history and
normal animation. The result block has eight gallery states and uses existing action/section blocks.

The next stage should implement a **monotone free-timing correspondence** while preserving the
same physical trajectory and production-validation gates. It should compare equal-input-angle
and free-timing results on a benchmark set of full-cycle and partial known mechanisms. Then
expose meaningful bounds and candidate comparison before adding another topology.

Deferred: six-bars, slider-cranks, arbitrary topology, Burmester construction, force/stress or
multiobjective optimization, ML, simultaneous synthesis of several mechanisms, collision/clearance
design, prescribed precision-point angles and nonuniform weighting. Search is heuristic; default
bounds may yield mechanisms large compared with their traced curves. Singular passages are
conservatively excluded. The generated preview connects 64 samples with lines, and the UI exposes
one best candidate; API results retain one per independent run. Worker execution, persisted search
settings and partial-interval animation are subsequent work, not claims of this implementation.
