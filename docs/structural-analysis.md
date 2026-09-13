# Structural analysis: S0 through S5

> **Status:** Built — S0/S1 (`79a8ef0c`), S2 (`f97d275a`), S3 (`04d06680`), S4 (`f15696bc`), S4.5 solved-geometry precision (`f0bbb013`), and S5 sampled-cycle orchestration on `feature/structural-analysis`, based on staging. Each milestone is a separate commit. Stress UI and advanced engineering checks remain future work.

## S5: sampled-cycle stress envelopes

**This is a maximum over explicitly requested solved samples. It is not a continuous-time
maximum or a bound between samples.** Each sample uses the unchanged S1/S2 equilibrium,
S3 member recovery, and S4 nominal elementary-beam plane-stress calculations. S4's spatial
conservative bound applies within that sample; taking its maximum over time samples does not
bound unexamined times. `coverageKind: 'sampled'` is part of every result.

### Sample and driver audit

The audit at `f0bbb013` established these boundaries before choosing the S5 adapter:

| Existing source | S5 interpretation |
| --- | --- |
| `Mechanism.joints`, `links`, `forces` | Matching solved-frame arrays for one explicitly selected mechanism/partition. No UI state and no implicit `mechanisms[0]`. |
| `timeNum` | Actual sampled times in seconds. Read directly, never derive time from index or presume uniform spacing. Invalid/missing time becomes a snapshot gap with `null` time. |
| `inputAngularVelocities` | Legacy name also used for linear input rates. Reversals can change its sign within a cycle. It is not a stored absolute input angle. |
| `driveProfileOf` | Transport coordinates are normalized; angular transport integrates rates with its own display sign. S5 needs a dimensional driver coordinate, not transport fraction or the selected member's orientation. |
| `resolveActuator` / `angleReference` | Identify the actual input joint's ordered reference/driven body pair and consistent reference pins. S5 reads relative geometric angles using those fixed pin IDs. |
| Angular samples | Canonical angle is in `[-pi, pi]` radians. Unwrapped angle accumulates adjacent geometric differences in **full solved order**, before selecting/reordering requested indices. Adjacent changes must be less than pi, as in current PMKS sampling. The initial geometric angle is retained. |
| Prismatic samples | A grounded input reports displacement in meters from its initial position along its slot direction, explicitly labeled as displacement, not cylinder extension. Floating prismatic coordinates are `unavailable` with a reason in S5. Structural snapshot support still refuses sliders. |
| `withReversedDrive` / `framesRunBackwards` | Reverse playback shares geometry and sampled times while negating rates. S5 geometry labels stay at those same poses. A reversed explicit index sequence retains descending sampled times; it does not create a new playback clock. |
| Typical cycles | The precision crank has 361 samples, the Stephenson III example has 199 and reverses, and the branch-swapping square-rod slider crank has 721 samples over two turns. No blanket 0–360° assumption is valid. |
| Endpoint closure | Compare every endpoint joint by ID with relative geometric tolerance `1e-8` of the starting bounding-box diagonal. This is reporting only, not a solver or S3 tolerance. Geometric closure does not prove periodic loading, acceleration, or stress. |

Sequence metadata records forward/reverse/explicit order, whether every solved index is covered,
endpoint-pose duplication, geometric closure (`closed`, `open`, `unknown`), and detected drive
reversal. Reversal is unknown for arbitrarily reordered samples or unavailable coordinates.
Subsets and repeated indices are legal; endpoint duplication is reported and **never removed**.
An open sequence can still have complete coverage of its requested samples.

### Architecture and request

`cycle-results.ts` defines framework-independent contracts. `cycle-analysis.ts` walks an ordered
sample list with a lazy `readSample` provider and delegates each stage. `cycle-envelope.ts`
aggregates compact results and histories. `pmks-cycle-metadata.ts` reads drive/time/closure
metadata; `pmks-cycle-analysis.ts` adapts explicit PMKS samples. The Angular
`StructuralAnalysisService.analyzeCycle` is a thin delegation seam. No production UI is added.

The pure provider supplies a configuration, load case, and (for dynamics) one motion state per
root body. This supports independently prescribed analytical verification without Angular or
PMKS singleton maps. PMKS dynamics uses `snapshotPmksMemberMotion` and its isolated analytical
acceleration route. Neither path estimates acceleration by differencing positions.

Example using the published [held structural crank](fixture-urls.md), parameterized at
2 rad/s with its 2 kg, 2 m uniform rod and authoritative `I = 2/3 kg m²`:

```ts
const result = analyzePmksCycle({
  mechanism: selectedMechanism, // Explicit partition supplied by the caller.
  sampleIndices: selectedMechanism.joints.map((_, i) => i),
  lengthUnit: LengthUnit.METER,
  coordinateSpace: 'project', // Use 'model' for app / URL-decoded objects.
  member: {
    kind: 'straight-prismatic', id: 'beam-AB', bodyId: 'AB',
    startJointId: 'A', endJointId: 'B',
  },
  mode: 'dynamic',
  section: { kind: 'rectangle', widthM: 0.01, heightM: 0.02 },
  material: { name: 'Test steel', yieldStrengthPa: 250e6 },
  loading: { kind: 'saved-load-case', loadCase: { name: 'No applied load', loads: [] } },
  recovery: { massDistribution: { kind: 'uniform-line', memberId: 'beam-AB' } },
  materialPoints: [
    { id: 'top-middle', xi: 0.5, eta: 1, side: 'right' },
  ],
});
```

All 361 samples succeed. For this no-gravity example, independent integration gives
`N(x) = 8 - 2x² N`, `V = M = 0`. Every sample has attained maximum von Mises stress
40,000 Pa at `x = 0` on the member-interior side, conservative FoS approximately 6,250,
and midpoint normal stress 30,000 Pa. The last sample is retained at approximately
pi seconds and unwrapped driver angle 2pi radians. Floating roundoff can distinguish
nominally equal maxima; exact numeric ties choose the first sample in request order.
Every sample's witnesses remain available for inspecting repeated physical maxima.

### Loads, provenance, and gaps

`loading` is an explicit union:

- `saved-load-case`: resolve the same saved case at each pose. Global points stay in world
  coordinates; link-relative points travel with their body; global and follower directions
  use the existing load-coordinate resolver. A world-fixed point can leave the supported
  member and correctly produce an S3 gap.
- `pmks-forces`: call `loadCaseFromPmksForces` with the **matching frame's forces**, every
  sample. Native local forces already carry that frame's transformed point and direction.
  Converting frame zero once and reusing that global case would freeze both incorrectly.
  Gravity is optional and explicit on this loading variant.

Mass, CoM and inertia remain authoritative PMKS root properties. Dynamic line inertia and
uniform-line gravity still require the existing S3 distribution consistency check. S5 does
not infer material density as new mass, repair quantized custom inertia, change tolerances,
or decompose compound links. A real URL round trip of custom `I = 2/3` yields legacy `0.667`;
the cycle then reports S3 `mass-distribution-mismatch` gaps. The codec is unchanged.

Every result includes requested analysis options. Successful samples retain S4 provenance
(mode, gravity, mass/inertia model, motion source, section and properties, stress model),
material availability, load-case name/gravity, and S3 closure residual. The aggregator checks
these provenance values across successes and explicitly marks heterogeneous results; it
withholds a combined yield criterion in that case. Material and section are explicit request
values, not silently taken from another body or a UI selection.

Every requested position has a record with `sequenceIndex`, original `sampleIndex`, time,
and drive metadata. Failure records retain stage (`setup`, `snapshot`, `equilibrium`,
`member-loads`, `stress`), original code/message, and upstream equilibrium diagnostics when
available. Adjacent failures in **request order** form gaps containing their individual records.
No stage fabricates zero stresses. History gaps remain gaps. Provider exceptions are isolated
to their sample so later requested samples still run.

`complete` means all requested samples succeeded, `incomplete` means some did, and `failed`
means none did or setup was invalid. Coverage includes counts, fraction and percent. An
incomplete result can expose an envelope over **successful requested samples only**; neither
that envelope nor its yield result certifies the missing samples. Empty/all-failed requests
have a null envelope. Missing yield strength does not turn valid stresses into failures:
stress coverage can be complete while yield/FoS remains unavailable.

### Envelopes and material histories

The envelope keeps maximum tension, compression, absolute normal, absolute shear, attained
von Mises, and conservative von Mises separately. Each attained winner contains its sample
metadata and the full S4 witness: member/body ID, `xM`, side, `yM`, signed stress components,
principal stresses, internal loads and provenance. Compression magnitude and its signed
stress are distinct, following S4's existing convention.

The conservative winner carries the S4 upper bound, method, spatial gap, subdivision count,
and yield criterion. Its `attainedWitness` is explicitly an attained point **at the bounding
sample**, not a fictitious position where the bound is attained. Conservative yield aggregation
selects the greatest utilization; with consistent material this also gives the minimum
conservative FoS. It propagates S4's finite/unbounded-zero-demand/exceeds-numeric-range states
without inventing a finite number. `envelope.yield.governing.criterion` contains these values.

A material point is `(xi, eta, side)`, where `xi=x/L` is in `[0,1]` and `eta=y/c` is in
`[-1,1]`. Side is mandatory at concentrated loads/couples. Each history retains signed normal,
signed transverse shear, both ordered principal stresses, nonnegative von Mises and N/V/M at
the same material point at every successful sample. A moving critical stress station is a
different observable and is tested separately.

Statistics report signed minimum, maximum, range, midrange and half-range amplitude over
successful entries, preserving their original time/index order and gap records. Midrange is
`(max+min)/2`, **not** a time-weighted mean. These are descriptive histories only: no rainflow
counting, fatigue allowable, mean-stress correction, endurance prediction or life estimate.

### Validation and performance

S5 tests cover the complete precision-crank pipeline; quarter-cycle analytical checks and
repeated maxima; static global/follower loading; independently integrated centripetal and
angular-acceleration stresses; top/center/bottom signed histories; moving critical stations;
concentrated-couple sides; invalid samples and a singular/toggle gap; missing material;
heterogeneous provenance; bound/FoS propagation; native local/global forces; manual S2/S3/S4
comparison; frozen input/result graphs and repeatability; real legacy URL custom-inertia
rounding; and reversing, two-turn, prismatic and reordered metadata. All geometries reuse
existing published fixtures; no new geometry or gallery URL is required.

`cycle-performance.spec.ts` measures snapshots, S2, S3, S4, three fixed points, aggregation
and the entire PMKS cycle separately across three warm batches. Set `PMKS_BENCHMARK_CYCLE=1`
to write `artifacts/s5-performance.json`. Timing is diagnostic and never a machine-speed gate.
It retains only S4 summaries/witnesses, fixed points and diagnostics, not configurations,
equilibrium matrices, full rate maps, or S3 polynomial diagrams. Histories and envelope
winners reference sample data in memory; ordinary JSON serialization repeats those references.
Storage grows with samples and requested points. Serialization size is not a heap measurement.

Measured on Windows / Node 24.21, with the benchmark running alone after warm-up (three
batches, median shown):

| Operation | 361 samples, ms | Per sample, ms |
| --- | ---: | ---: |
| Analytical snapshot | 23.767 | 0.06584 |
| S2 equilibrium | 6.758 | 0.01872 |
| S3 recovery | 6.232 | 0.01726 |
| S4 member extrema | 33.117 | 0.09174 |
| Three fixed points | 7.837 | 0.02171 |
| S5 aggregation | 2.498 | 0.00692 |
| End-to-end PMKS cycle, independently timed | 77.128 | 0.21365 |

End-to-end range: 75.476–77.343 ms. Separate timings include their own instrumentation
and checks, so their sum need not equal the independently timed end-to-end path. During
concurrent test/build work the same benchmark took approximately 193–215 ms; these are
measurements, not latency guarantees. Ordinary JSON output with three histories occupies
4,751,746 bytes (about 4.53 MiB); shared witnesses are repeated in serialized JSON. S5 runs
sequentially and needs no worker or parallel execution to meet this measured scale.

Fresh baseline and final verification:

| Check | Result |
| --- | --- |
| Full suite at unchanged `f0bbb013`, before S5 | 2,711 passed, 3 failed; 252 files |
| S0–S5 + precision + structural persistence + fixture gallery | 231/231 passed; 21 files |
| New S5 tests | 20/20 passed across five suites, including the standalone performance run |
| Final full suite (includes kinematics and position regressions) | 2,731 passed, 3 failed; 257 files |
| `npm run check` | Passed; 15 allowed lint warnings, styles and formatting passed |
| Production build | Passed; component-size and CommonJS warnings |
| Storybook build | Passed; chunk-size/tooling warnings |
| `force-analysis-panels.mjs` | 15/15 passed |
| `force-units.mjs` | 20/20 passed |
| `solved-precision.mjs` | 8/8 passed; playback, start-pose drag and paused-pose drag filmstrips inspected |
| `git diff --check` | Passed |

The same three full-suite failures occurred before and after S5: MotionGen's reference jaw
gap is `1.036629237211164` against `>2.3`; its reference joint discrepancy is `1.051501`
against `<0.0001`; the stylesheet fence counts 99 raw rgba colors against a ceiling of 87.
These remain unresolved baseline failures. S5 does not change their production code or tests.
One indentation line in `solved-precision.spec.ts` was formatted; its assertions and behavior
are unchanged. Reports and images are retained under ignored `artifacts/s5-*`,
`artifacts/solved-precision`, `artifacts/force-units`, and `artifacts/screenshots/s5-force-panels-*`.
Codex had no available live browser surface; the tracked suites ran disposable browser
profiles at `http://localhost:4355`. Their screenshots and filmstrips were inspected directly.

Added production files: `cycle-results.ts`, `cycle-analysis.ts`, `cycle-envelope.ts`,
`pmks-cycle-metadata.ts`, and `pmks-cycle-analysis.ts`, all under `src/app/model/structural`.
Added tests: `cycle-analysis.spec.ts`, `pmks-cycle-analysis.spec.ts`,
`pmks-cycle-metadata.spec.ts`, `cycle-performance.spec.ts`,
`services/transcoding/url-structural-cycle.spec.ts`; shared setup is in
`test-utils/verification/cycle-verification.ts`. Modified files are the thin
`structural-analysis.service.ts`, the one precision-test indentation line, this document,
`docs/README.md`, and `docs/tips-and-tricks.md`.

### Next milestones and integration boundary

**Stress UI:** assign section/material explicitly; select a partition/member and static or
dynamic mode; show coverage gaps before presenting FoS; offer signed stress contours with
clear units/legend; jump to the critical sample and its `x/side/y`; scrub the solved cycle;
plot attained stress, conservative bounds and FoS separately. Never interpolate a plot through
a failed sample or label the sampled envelope as continuous-time proof.

**Engineering checks:** add section choices and pin/bearing checks with the required geometry
and allowables first. Add buckling only with explicit effective length/support assumptions.
Fatigue can use these fixed-point histories after loading periodicity, cycle counting and
material/mean-stress models are specified. Compound-link decomposition and beam/frame FEA
require an explicit structural topology and boundary conditions, not inference from drawn
polygons. They belong in separate milestones.

S5 leaves the CoM branch and the main checkout's overlapping solver edits unmerged. Its contract
with that future integration remains: authored automatic/custom mass properties have one
authority; solved motion rigidly transports CoM and preserves mass/inertia. Changes to those
properties can intentionally change stress or trigger S3 refusal, so rerun full-cycle tests
when integrating. No S5 solver, mass-property formula, or CoM UI edit is needed here.

## Precision Hardening Before S5

### Coordinate lifecycle audit (before implementation, `f15696bc`)

| Boundary | Representation and policy |
| --- | --- |
| Authored drawing | `Coord` stores JavaScript Numbers. `MechanismService` rounds entered/new joint coordinates to three raw-coordinate decimals; grid/angle snapping is an editing decision. Preserve those behaviors. |
| Model scale | The app multiplies project lengths by `MODEL_SCALE=200`; verification fixtures can explicitly use project coordinates. This is a unit conversion, not decimal quantization. |
| Solver input | `Mechanism` deep-copies the drawing. `PositionSolver.setUpInitialJointLocations` rounds the working copy to four decimals. `settleInitialPose` also rounds its computed, private sample-zero pose. |
| Input stepping | `incrementRevInput` computes `atan2(previous endpoint - pivot) + revoluteSampleStep` with full-precision trigonometry, then rounds both endpoint and pivot to four decimals. There is no rounded angle field, but endpoint quantization feeds the next angle. Prismatic stepping also rounds. |
| Constraint solutions | `recordJointPosition`, the paired circle/line slider point, and rigid tracer reconstruction round to four decimals. Simultaneous constraint iterations otherwise retain Numbers. Derived force points round to three decimals. |
| Stored samples | `Mechanism` clones `jointMapPositions` directly into each sample. Thus the solver's quantization becomes authoritative geometry for kinematics and structural snapshots. |
| Root reconstruction | Each sample's `RealLink`, including compound leaves, references that sample's joints. Mass and `massMoI` are copied unchanged. |
| CoM transport | `transportPoint` retains the reference point's along/normal coordinates and rotates them using a normalized sampled axis. It correctly preserves its reference offset, whereas rounded endpoints change apparent member length. No mass-property recalculation is appropriate here. |
| Structural analysis | S2 uses authoritative rigid-body properties. S3 additionally requires uniform-line geometry to reproduce CoM and inertia; its strict refusal is correct. S4 propagates that refusal. Keep all these APIs and tolerances unchanged. |
| URL/history | `generateUrlQuery` temporarily encodes the start pose through `encodeFromStartPose`, then restores playback. Samples are regenerated, not serialized. Legacy numeric fields (including authored mass, CoM and inertia) use base-N thousandths; S0 structural metadata has its separate precision-preserving extension. No codec change is part of S4.5. Legacy rounding can still make a custom uniform mass model inconsistent after reload. |
| Cache/equality | `solveFingerprint` reads constructor inputs (authored joints, roots, loads, settings), not derived sample arrays. Pose recall and closure use explicit solver thresholds. `Coord.equals`/`looselyEquals` are interaction tolerances, not storage precision. The canvas's six-decimal edit signature is an interaction boundary. Preserve them. |
| Display | Analysis/export cells use `roundNumber(...,4).toString()`; fields, labels, cursor and grid format separately. Preserve all visible precision and snapping. |

History: `cf066690` (May 2022) changed solved-coordinate storage from three to
four decimals as part of UI/emitter cleanup. It documents the decimal policy,
but supplies no engineering invariant requiring quantized solver state. Existing
stroke, concentric, tangent, seam, and pose-recall thresholds also encode branch
and motion policy; removing decimal storage does not authorize changing them.
Sample spacing/count planning uses integer rounding intentionally and stays intact.

Coordination audit: local `feature/mass-inertia-explanation` at `23bb9687` extracts
automatic mass calculations into `mass-properties.ts` and explains their geometry.
Its formulas and custom-property authority are retained; it does not change
`position-solver.ts`, `mechanism.ts`, or `link.ts`. S4.5 should complement that work:
compute mass properties from the authored body, then rigidly transport them. Do
not infer physical mass from rendered rounded outlines or recompute inertia per
playback frame. Shared documentation may need a textual merge. The combined
branches have not been integration-tested; after integration, verify automatic
and custom properties through playback, paused edits, and URL reload.
The main working checkout on `feature/analysis-results-table` also has uncommitted
changes in `position-solver.ts` and `mechanism.ts`. That is separate integration
overlap, not a CoM-branch conflict; those files were read only and left untouched.

### Implementation and measured results

S4.5 removes decimal quantization from the position solver's derived joint and
force-point writes, including working-map initialization, revolute/prismatic
stepping, circle/line output, tracers, and its private settled initial pose.
`Mechanism` reconstruction, CoM transport, mass, inertia, structural APIs and
all S3 consistency tolerances are unchanged. `mechanism.ts` only changes stale
precision comments. Display/export formatting and authored snapping are unchanged.
Input angle commands and sample planning are unchanged; removing rounded endpoint
feedback removes their artificial phase drift.

Full-suite verification exposed one additional numerical issue: the existing
coincident-circle branch predictor extrapolated a Cartesian chord and projected
it onto a circle. At exact coincidence that has cubic phase error even for
constant angular velocity (0.00531455 raw units in the 1000-unit square test).
It now continues observed angular motion about a grounded pivot; the existing
Cartesian fallback remains for moving pivots. This is upstream continuation of
an already singular solve, with unchanged contact thresholds, not structural
coordinate repair or a claim of unique equilibrium. Existing assembly-mode tests
and new square tests at project/model scales pass; the singular structural
toggle still refuses analysis.

Measurements compare `f15696bc` with S4.5, Node 24.21 on the same Windows host.
`solved-precision.spec.ts` records raw samples and times when
`PMKS_PRECISION_PHASE=before` or `after` is set. Ordinary CI runs assert the
invariants without needing local artifacts. The phase option records the old
failures without asserting the new precision contract on old production code.

| 2 m, 2 kg rod, project meters | Before | After |
| --- | --- | --- |
| Sample-30 midpoint/CoM error (m) | 2.1301023133e-5 | 0 |
| Sample-30 uniform-inertia error (kg m²) | 2.8401666667e-5 | 0 |
| Full-cycle maximum length drift (m) | 5.8791635886e-5 | 4.4408920985e-16 |
| Full-cycle maximum midpoint/CoM error (m) | 2.9395817943e-5 | 2.4825341532e-16 |
| Full-cycle maximum uniform-inertia error (kg m²) | 3.9195000000e-5 | 3.3306690739e-16 |
| S3 dynamic recovery accepted | 5/361 (1.385%) | 361/361 (100%) |

The final cycle's maximum analytical endpoint error is 5.03e-14 m. Sample 30's
zero residual is an observed floating-point result, not a zero-error promise.
Mass and inertia are checked unchanged on every root and compound leaf, and
CoM-to-pin distances are checked independently of midpoint agreement.

All unit/space combinations use the same physical 2 kg rod at lengths
0.02 m, 2 m, and 200 m. Each has 361 samples. After the fix every entry below is
361/361 at every size (6,498/6,498 altogether).

| Unit / coordinate space | Before: 0.02 m | Before: 2 m | Before: 200 m |
| --- | --- | --- | --- |
| Meter / project | 4 | 5 | 13 |
| Meter / model | 5 | 29 | 361 |
| Centimeter / project | 5 | 13 | 361 |
| Centimeter / model | 36 | 361 | 361 |
| Inch / project | 1 | 1 | 277 |
| Inch / model | 11 | 361 | 361 |

Across those 18 cases, maximum length drift is 5.69e-14 m, midpoint error
4.02e-14 m, inertia error 4.55e-12 kg m² (the 200 m rod), analytical position
error 5.19e-12 m, and normalized S3 section-closure residual 7.11e-17. The
dimensionless errors stay at floating-point scale; no unit-specific tolerance
or mass-property adjustment is used. The eccentric dynamic crank and deliberately
malformed pure mass models still return `mass-distribution-mismatch`.

### Motion and constraint regression

The following distances are in each fixture's raw coordinate units (project
units except the model-scale MotionGen fixture). Coordinate difference means
maximum Euclidean displacement between matching before/after joint samples.
Closure residual means maximum rigid pin-pair distance-constraint violation
and shared-pin coincidence error, including compound leaves; it does not use
a trivially telescoping vector sum. Shared-pin coincidence is zero throughout,
so the measured closure residual equals the length drift in this table.

| Fixture | Samples before = after | Max coordinate difference | Length drift / closure before | Length drift / closure after |
| --- | --- | --- | --- | --- |
| Structural crank | 361 | 3.39939e-4 | 5.87916e-5 | 4.44089e-16 |
| Teaching four-bar, with tracers | 361 | 2.03394e-3 | 2.07203e-3 | 1.53211e-14 |
| Stephenson III six-bar | 199 | 3.60802e-3 | 7.10891e-5 | 1.06581e-14 |
| Bell-crank compound | 361 | 3.40349e-4 | 6.86316e-5 | 2.22045e-15 |
| Eccentric dynamic crank | 361 | 3.39939e-4 | 5.87916e-5 | 4.44089e-16 |
| Teaching slider-crank | 361 | 2.40307e-3 | 6.95217e-5 | 5.32907e-15 |
| MotionGen gripper | 1 | 0 | 0 | 0 |
| Equal-sided four-bar through folds | 361 | 1.12963e-3 | 5.87916e-5 | 8.88178e-16 |

Joint ordering and timestamps are exactly equal before/after for all eight.
The six-bar's 199 samples are its existing reversing cycle, not a lost full
revolution. MotionGen remains a solver refusal with only its initial pose;
its zeros are not evidence of validated motion. The largest CoM-to-pin drift
afterward is 2.28e-13 raw units in the four-bar with distant CAD-specified CoM.
Independent analytical crank trajectories and the existing MATLAB, slider,
assembly, and force suites provide checks beyond the before/after comparison.

### Changed expectations and compatibility

- `member-adapter.spec.ts` and `member-stress.spec.ts`: the specific sample-30
  refusal was a regression witness for upstream quantization. It now succeeds
  through unchanged S3/S4 code. Genuine mismatch/refusal cases remain intact.
- `pmks-dynamic-state.spec.ts`: the fresh baseline exposed an order-dependent
  assertion that a shared rate map began empty (it contained nine entries).
  The test now captures its actual contents and asserts they remain unchanged.
  This strengthens the isolation contract without changing runtime behavior.
- `welded-force.spec.ts`: historical sample-1/2 torque constants included
  quantization (sample 1: 3.0096 becomes 3.0098 N m). They are replaced by
  comparison with the separate S2 equilibrium assembly at the precise pose;
  four-decimal export formatting and the initial 2.9396 N m check remain.
- `docs/fixture-urls.md` and `template-linkages.ts`: only the walking pair changes.
  `ensemble-fixtures.ts:posedAt` intentionally authors its second leg from a
  solved half-cycle frame. Its precise solution changes joint N's encoded y
  by 0.001 project units and the NOP CoM y by 0.001, plus checksums. Regenerated
  through the existing tools, not hand-edited; old URLs still decode. No new
  mechanism or URL format was introduced.
- The new legacy URL regression uses a 3 m rod variant whose mass properties
  fit the existing thousandths format exactly. It regenerates identical precise
  samples, preserves authoritative inertia, passes S3 at sample 30, re-encodes
  identical bytes, reuses the solve cache, and adds no history entries.

### Performance

Seven batches of 20 operations after five warmups, median milliseconds per
operation, isolated Angular runs against identical harnesses. The single position
step includes restoring its initial working map. Generation includes construction,
position solving, and sample/root allocation; snapshots are timed separately.
S3 recovery is benchmarked at sample zero so both versions perform successful work.

| Operation | Before (ms) | After (ms) |
| --- | --- | --- |
| Position step | 0.00377 | 0.00133 |
| Solve + generate crank cycle | 1.7552 | 1.5327 |
| Solve + generate six-bar cycle | 1.9499 | 1.9421 |
| Analytical kinematic snapshot | 0.06774 | 0.05166 |
| S2/S3 motion adapter snapshot | 0.09266 | 0.05573 |
| S2 dynamic equilibrium | 0.02816 | 0.01413 |
| S3 member recovery | 0.03234 | 0.01453 |

No measured performance regression. These short timings include host/JIT noise;
unchanged S2/S3 code also measured faster, so this is not a claimed general
speedup. Raw batch ranges and measurements are in ignored `artifacts/s45-timing-*.json`.

### Verification and decision point

The fresh full-suite baseline at `f15696bc` had 2,705 passes and four failures:
two MotionGen reference-data expectations, the raw-RGBA count (99 versus 87),
and the shared-rate-map assumption corrected above. The final full suite reports
2,711 passes and three failures (250 passing files, two failing files): only the
same two MotionGen expectations and the RGBA count remain. This includes all
S0–S4, MATLAB/kinematics, positions, history, persistence and fixture-gallery tests.
The four dedicated precision tests also pass in an isolated final run. Production
and Storybook builds pass; lint/style/format checks pass with the existing 15 lint
warnings, and `git diff --check` is clean. Browser checks use disposable Playwright profiles
because Codex computer use reported no enabled browser surfaces. Force panels
pass 15/15, force units pass 20/20, and the new precision suite passes 8/8.
Its playback, start-drag, and paused-drag filmstrips were inspected. The first
playback recording caught a development reload during artifact generation;
the suite now rejects navigation while filming and its final recording is continuous.
`posed-editing.mjs` reports 56/58 on both S4.5 and a separately served untouched
`f15696bc`: the same two existing strict start-marker assertions fail, with
identical values, and no browser errors.

S5 may build on the validated uniform straight-member stream while continuing
to fail closed per sample. This does not make every PMKS mechanism structurally
admissible: singular/toggle conditioning, approximate simultaneous constraints,
unsupported compound member interpretations, legacy URL property quantization,
and inconsistent authored mass properties remain explicit limitations. No cycle
envelopes, cycle FoS, fatigue, or S5 UI are implemented here. The earlier S3/S4
sections below retain their historical precision findings; S4.5 resolves their
solved-coordinate limitation for the validated cases above.

## S4 section audit and implementation contract

Before S4 implementation, the audit inspected `cross-section.ts`,
`structural-properties.ts`, `member-results.ts`, `member-diagram.ts`,
`member-load-recovery.ts`, and their tests. Only rectangle and solid circle are
implemented. Both are centroidal symmetric sections; centroid y=0 is implicit.

| Section | Dimensions | Area A | Centroidal out-of-plane I | Extreme fiber c | Modulus Z |
| --- | --- | --- | --- | --- | --- |
| Rectangle | width b out of plane, height h along +n | b h | b h³/12 | h/2 | I/c |
| Solid circle | diameter d, radius R=d/2 | pi d²/4 | pi d⁴/64 | R | I/c |

All dimensions are meters. `sectionProperties` already rejects unsupported
types, nonpositive/nonfinite dimensions, and derived property overflow/underflow.
S4 reuses it without interpreting rendered link outlines. S0 material validation
also remains authoritative; absent yield strength makes a criterion unavailable,
not the material-independent stress field invalid.

Section coordinate y runs along S3's +n. On the A-side exposed +e face, normal
traction is sigma=N/A-M y/I and transverse traction is
tau=-k V/A (1-(y/c)²), with k=3/2 for a rectangle and 4/3 for a circle.
Thus positive sagging M compresses the top fiber, and integral(tau dA)=-V,
the signed +n component of S3's cut shear. The circle formula is the elementary
width-averaged beam distribution through depth, not a full two-dimensional
elasticity solution at every point on its curved circumference.

Extrema must include both sides of S3 events and section-interior candidates.
Use real stationary roots for section depth and polynomial interval candidates;
bound the remaining two-variable von Mises search using Bernstein polynomial
subdivision with an explicit attained value, upper bound, and convergence limit.
A nonconverged search returns a diagnostic, never a sampled engineering maximum.

## S3 geometry audit and conventions (implementation contract)

The audit inspected `link.ts`, `compound-link-path.ts`, `uniform-body.ts`,
`structural/configuration.ts`, `pmks-configuration.ts`, and the shared
equilibrium assembly. A rigid body has pins and mass properties; it does not
carry a general beam path or a load-transfer graph for its constituent bars.

| PMKS representation | S3 V1 interpretation |
| --- | --- |
| Simple RealLink, exactly two revolute pins | Candidate only: caller explicitly declares a straight prismatic member between those pins |
| Rounded ends / generated SVG hull / object scale | Rendering, not a cross section, mass distribution, or structural boundary |
| Circular/disc drawing or cylinder skin | No automatic straight-member mapping |
| Multi-pin root, including collinear tracers | Refuse automatic mapping; explicit decomposition is future work |
| Welded root with subset leaves | Refuse one-axis recovery, even if it has only two external pins |
| A constituent leaf passed separately | Not an independent root; no inferred reaction transfer from its parent |
| Slider, cylinder, gear | Outside the initial member model |
| Structural metadata on Link/root | Copy material/section data; do not infer them from the outline |
| Joint coordinates and S1 frame | Global y-up SI snapshot; S1 local load frame is its first named pin toward its second |

For member A→B, x=0 at A, x=L at B, e=(B-A)/L, n=(-e.y,e.x).
Always cut the A-side segment. Its exposed face carries **+N along e**,
**positive V opposite n**, and **positive M counterclockwise**. N is positive
in tension; M is positive sagging for the ordinary horizontal simply supported
beam. Thus N=-sum Fx, V=sum Fy, and M=-sum moments about the cut.

```text
      +n ↑                  cut force: N →, V ↓
 A ●───────────────│        cut couple: M ↺
   └──── +e → ─────┘
```

Off-axis point loads transfer at their projection s onto the axis, with
equivalent couple -yOffset*Fx. This explicitly assumes a rigid load arm.
Projections outside [0,L] are refused. A free body-level applied couple has no
spatial location: S3 requires its optional application point to be supplied.
S1/S2 continue to accept unlocated couples.

Events distinguish x-minus (exclude the event) and x-plus (include it).
Endpoints include the exterior limits 0-minus and L-plus, which should be zero
for a balanced member; 0-plus and L-minus are the interior end loads.
Static gravity is explicitly either lumped at the authoritative CoM or uniform
line gravity with validated mass distribution. Lumped gravity is not exact
distributed self-weight.

## Repository audit and design

PMKS already has `Link` / `RealLink` / `SliderBlock`, `Joint` / `RealJoint` /
`RevJoint` / `PrisJoint`, and `Force` with arbitrary application coordinates.
`MechanismService` owns the editable drawing and partitions it into `Mechanism`
instances. Each mechanism has `joints[frame]`, `links[frame]`, and sample times;
there is no `IKinematicAnalysis` interface. Compounds are root `RealLink` bodies
with constituent links in `subset`. A grounded pin anchors a body but lets it
rotate; two distinct grounded pins make a frame body.

`model/mechanism/force-solver.ts` already assembles static and dynamic equilibrium,
returns SI reactions per body and driver effort, and supports slides/cylinders.
It also maintains compatibility static fields and can optionally approximate
load sharing at redundant supports. S1 does not change this existing solver or
the kinematic pipeline. Its strict structural API never chooses a load split
when equilibrium alone cannot determine it.

There is no external matrix dependency on the staging baseline. Existing solvers
use private elimination routines. S1 adds `ml-matrix` for singular value
decomposition rather than extending those routines. Public results expose plain
numbers, counts, residuals, and diagnostic statuses, not library matrix objects.

`unit-conversions.ts` owns conversions and existing force results are SI. The
new domain uses explicitly named SI quantities. The PMKS adapter uses the
existing conversion factors and an explicit coordinate-space argument: internal
model coordinates are **200 times** project length coordinates (`MODEL_SCALE`).
Material and section data stay SI when the project's display units change.
Existing `Link.mass`, `RealLink.massMoI`, and solved `CoM` remain authoritative;
S0 does not create a second editable copy or infer mass from an outline/density.

URL state drives sharing and undo. Optional structural properties travel
in a versioned entry in the existing trailing extension section. Absence writes
nothing and reads as no structural data. The original record layout stays intact.

Dependency flow:

```text
PMKS solved joints/links (chosen partition and sample)
  -> pmks-configuration.ts (units, topology, plain snapshot)
  + LoadCase (explicit point forces, couples, optional gravity)
  -> static-force-solver.ts (three equilibrium rows per moving body)
  -> StaticForceAnalysisResult (body-side reactions, driver effort, residuals)
  -> S3 internal member loads -> future stress -> engineering checks -> UI
```

Concrete files live in `src/app/model/structural/`: `structural-properties.ts`,
`cross-section.ts`, `loads.ts`, `configuration.ts`, `results.ts`,
`pmks-configuration.ts`, and `static-force-solver.ts`. Serialization belongs in
`services/transcoding/structural-codec.ts`; a narrow structural service owns
saved load cases. `Link` gains one optional metadata reference. S1 has no new
screen, stress formula, deformation feedback, or change to existing analysis UI.

The initial compatibility boundary is revolute joints, grounded pins, binary
moving-body pin connections, root rigid compounds, multi-joint rigid bodies,
and a grounded revolute input holding one moving body. Prismatic joints,
cylinders, unresolved welds, ungrounded/ambiguous inputs, and multi-body free
pins are diagnosed explicitly before assembly. Later phases can add their
constraint laws independently of materials and member stress.

## API, coordinates, and units

`analyzeStatic(configuration, loadCase)` is a pure single-pose function:
no Angular dependencies, mutable global solver state, geometry changes, or
UI formatting. `snapshotPmksConfiguration` copies a chosen PMKS partition/sample
into plain structural objects; `analyzePmksFrame` adapts and solves in one call.
`StructuralAnalysisService.analyze` is the service boundary for future UI code.

Only a result with `status === 'ok'` has reactions, driver effort, and body
equilibrium results. Failed results contain diagnostics **without force values**.
Each pin reaction identifies both `jointId` and `linkId`: it is the force
**on that body**, in global axes. Internal binary pins return both sides with
exact opposite signs. Ground feels the negatives of its reported support forces
and holding couples. Positive moment/holding torque is counterclockwise on the
moving body. The moment equation uses `rx * Fy - ry * Fx`, referenced to the
body's first frame pin rather than a rendering centroid.

| Quantity | New domain units |
| --- | --- |
| Coordinates, local offsets, section dimensions | m |
| Force, applied/holding moment | N, N m |
| Mass, mass moment of inertia | kg, kg m² |
| Global gravity acceleration vector | m/s² |
| Elastic modulus, yield/ultimate strength | Pa |
| Density, Poisson ratio | kg/m³, dimensionless |
| Area, second moment, section modulus | m², m⁴, m³ |

The PMKS adapter calls `siUnitFactorsForLength`. In a centimeter project,
stored mass is grams and **stored inertia is kg cm²**, despite the UI displaying
g cm²; this is the existing URL convention. In an inch project, stored forces
are lbf, mass is lbm, and inertia is lbm in². Metadata in the new API stays SI
when display units change. Density does not silently replace the existing mass.

A point force specifies its application frame and direction frame independently:

- `at.frame: 'global'`: an absolute position in meters in the supplied pose.
- `at.frame: 'link'`: a position in meters relative to the first frame pin.
  Local +x runs from the first frame pin to the second; local +y is to its left.
- `directionFrame: 'global'`: force components fixed in the world.
- `directionFrame: 'link'`: follower-force components that rotate with the body.

A global application point stays in the world when a case is reused. Use a local
point to attach a load to a body across samples. Loads can act off the pin
centerline; S1 does not infer whether their points are inside a rendered outline.

`loadCaseFromPmksForces(frame, forces, name)` converts existing Force objects
into SI point loads. Pass forces from the **same solved sample** as the frame:
their application points and directions already reflect PMKS force transport.
The adapter's `coordinateSpace` is mandatory: `'model'` divides physical
coordinates by `MODEL_SCALE = 200`; `'project'` is for unscaled numerical
fixtures. Both also apply the selected project length-unit conversion.

Rectangular and solid circular sections return area, centroidal second moment
about the out-of-plane z axis, extreme-fiber distance, and section modulus
`S = I / c`. Rectangle height is the in-plane bending depth; width is the
out-of-plane thickness, so `I = width * height³ / 12`. Hollow sections and
stress calculations are deferred. Optional material fields describe an
isotropic material and reject nonphysical strengths/moduli/density or a Poisson
ratio outside `-1 < nu < 0.5`.

## Compatibility matrix

| Case | S1 behavior |
| --- | --- |
| Grounded revolute pin | Fx/Fy on every incident moving body |
| Free pin between two moving bodies | Shared Fx/Fy pair with opposite body-side signs |
| Free pin on one body | Tracer; no reaction |
| Free pin joining more than two moving bodies | Unsupported topology |
| Multi-joint root rigid link | Three equations for the entire body |
| Root welded compound | One body; leaf metadata persists, leaf force recovery is deferred |
| Separate links with multiple shared pins or unresolved welds | Refused; assemble a root compound first |
| Root body with two distinct grounded pins | Adapter excludes it as inertial frame |
| Any pin on that frame | Support for incident moving bodies |
| Grounded revolute input on one moving body | Unknown holding torque, independent of input speed |
| Multiple specified grounded inputs | One torque per input, subject to uniqueness checks |
| Ungrounded/ambiguous PMKS input | Unsupported topology |
| Prismatic joints, slides, blocks, cylinders | Explicit refusal; existing PMKS force analysis is unchanged |
| Gears, friction, distributed loads, elastic supports | Not implemented by S1 |

In the pure API, `bodies` explicitly means the bodies to analyze; frame removal
belongs to the PMKS adapter. Loads on excluded frame bodies or missing root
bodies return `invalid-load`. Loads naming compound leaves are not guessed onto
the root: a future topology-aware structural editor must map them explicitly.

The adapter checks that link membership and coordinates agree with the supplied
joint snapshot. It does not solve or repair positions. Callers must supply a
solved pose. A static structure can have determinate equilibrium without an input
or a motion cycle; its published fixture may show geometry without playback.

Prefer one PMKS partition per call, without assuming partition zero. Independent
supported bodies can be analyzed together, but very disparate scales may lead to
a conservative conditioning refusal.

## Numerical method and diagnostics

Each moving body contributes `sum Fx = 0`, `sum Fy = 0`, and `sum M = 0`.
Shared pin columns enforce Newton's third law. A holding input adds a couple
column. Known forces, applied moments, and gravity contribute to the right-hand
side. Existing masses and solved centers of mass supply gravity forces.

`ml-matrix@6.15.0` provides singular value decomposition (SVD). Zero padding
handles rectangular and zero-unknown systems. A truncated projection diagnoses
whether the applied load lies in the range of the equilibrium matrix; it is
**never returned as a minimum-norm engineering solution**.

Centralized `STRUCTURAL_TOLERANCES`:

| Check | Limit |
| --- | --- |
| Minimum coordinate-frame length | 1e-12 m |
| Relative rank threshold | 1e-12 of the largest singular value |
| Maximum accepted condition number | 1e10 |
| Maximum normalized equilibrium residual | 1e-9 |

The characteristic length is the largest distance from a body's first frame
pin to another pin on that body, across the supplied bodies. Moment rows are
divided by this length, and driver unknowns represent torque divided by length.
Thus conditioning does not mix N with N m. The normalized residual is the
largest scaled row imbalance divided by `max(1 N, max(abs(scaled RHS)))`.
Successful results also report separate Fx/Fy residuals in N and moment residuals
in N m for each body.

Diagnostics expose equation/unknown counts, rank, condition number,
`equilibriumDeficiency = rows - rank`, `reactionRedundancy = columns - rank`,
characteristic length, residual, and a message. Incompatible loads are
`inconsistent`. Otherwise a deficient system is `underconstrained`,
`statically-indeterminate`, or `singular` when both deficiencies occur.
An unloaded free mechanism is refused even though zero forces could balance it.
Full-rank but poorly conditioned poses are also refused. Validation and
arithmetic failures have explicit statuses; failures before assembly have zero
counts and make no rank/residual claim.

No stiffness assumptions, regularization, or even-load-sharing approximation
are used. A later elastic model must supply the information needed to split
redundant reactions.

## Worked examples

The published **Structural supported beam** fixture has A=(0,0), B=(4,0),
C=(4,3), grounded A and C, rigid bodies AB and BC, and a 100 N downward load on
AB at (1,0). BC is a vertical two-force hanger. About A,
`4 * By - 100 * 1 = 0`, so By=25 N; vertical balance gives Ay=75 N and
horizontal balance gives Ax=0. BC feels -25 N at B and +25 N at C. Six equations
determine six unknowns without a driver torque.

The **Structural held crank** has A=(0,0), B=(2,0), a grounded input at A, and a
100 N downward tip load. Without gravity it returns Ay=100 N and holding torque
+200 N m. A gravity-only case with its 2 kg mass at (1,0) returns Ay=19.6133 N
and holding torque +19.6133 N m.

Typical use after PMKS has solved a configuration:

```ts
import { analyzePmksFrame } from '../model/structural/pmks-configuration';
import type { LoadCase } from '../model/structural/loads';

const mechanism = mechanismService.mechanisms[partitionIndex];
const frame = {
  joints: mechanism.joints[sampleIndex],
  links: mechanism.links[sampleIndex],
  lengthUnit: settings.lengthUnit.getValue(),
  coordinateSpace: 'model' as const,
};
const loadCase: LoadCase = {
  name: 'Held tip load',
  loads: [{
    kind: 'point-force',
    linkId: 'AB',
    at: { frame: 'link', positionM: { x: 2, y: 0 } },
    directionFrame: 'global',
    forceN: { x: 0, y: -100 },
  }],
};
const result = analyzePmksFrame(frame, loadCase);
if (result.status === 'ok') {
  // Numeric SI values for future arrows, tables, and member-force recovery.
  useResults(result.jointReactions, result.driverReactions, result.linkEquilibrium);
} else {
  showDiagnostic(result.status, result.diagnostics);
}
```

For an undoable metadata edit, validate with `validateStructuralProperties`,
assign `link.structural`, and call `mechanismService.updateMechanism(true)`.
For saved cases, use `structuralAnalysisService.replaceLoadCases(cases)` and the
same save boundary. Analysis itself accepts a specific case and has no history
side effects. The case service copies its input/output to prevent alias mutation.

## Persistence and editing limits

Optional URL entry `T1` carries UTF-8 JSON in base64url:
`{ links: [{ id, properties }], loadCases: [...] }`. It preserves floating-point
precision and Unicode names without colliding with existing delimiters. Empty
structural data writes no entry, so pre-feature mechanisms retain identical URL
bytes. Older documents read as absent metadata and empty saved cases.
MechanismBuilder restores root/leaf metadata; UrlProcessorService restores cases,
including clearing them when a legacy document is loaded. This is also the
undo/redo path.

Missing/repeated metadata targets, duplicate entries, unknown versions, malformed
payloads, and nonphysical properties are rejected before rebuilding geometry.
Cases naming deleted load targets remain saved and later return `invalid-load`;
a save must not silently remove an applied load. New structural URLs require
this feature version; older PMKS readers do not understand T1.

RealLink samples deep-copy structural metadata. The existing solve-cache
signature now includes root and constituent metadata, so a material/section edit
refreshes copied data without changing solved positions. SI metadata is
independent of display units. S1 does not automatically distribute root metadata
to leaves on unweld, or remap load targets after link renaming/merging/deletion.
Those editing policies belong to the future structural UI.

## Roadmap recorded after S0/S1

The following preserves the S0/S1 roadmap. The implemented S2 API is documented below.

S1 uses no velocity, acceleration, or inertia torque. For S2, add an explicit
per-body kinematic state with SI center-of-mass acceleration and angular
acceleration. Reuse topology/equilibrium assembly with `sum F = m aG` and
`sum M_G = I_G alpha`, or an equivalent translated moment equation. Compare
against existing PMKS inverse-dynamics results on supported fixtures, and add
analytical acceleration cases before expanding to sliders/cylinders.

S3 can recover N/V/M from per-body reactions, known loads, couples, and driver
effort. S4 consumes the material/section data for analytical stress and safety
factors. S5 loops over supplied samples and records extrema with their sample
and angle. S6 beam/frame elasticity can resolve specified redundant structures.
S7 fatigue, buckling, pin/bearing checks, and gear-specific tooth/contact analysis
remain separate consumers. S1 introduces no stress solver, FEA, or deformation
feedback.

## Verification and handoff

Four new spec files contain **59 passing tests** for material/section properties,
hand-calculable equilibrium, failure statuses, unit/local-frame conversion,
PMKS sample snapshots/cache invalidation, and URL persistence. Every successful
numerical case checks residuals; hand calculations require normalized residual
below 1e-10 and body force/moment residuals below 1e-9. New and existing strict
force results agree on the supported beam fixture. The three new mechanisms
are registered in the generated gallery, whose round-trip checks pass.

The complete run reports **2,553 passed and 3 failed**, across 241 files.
The failures also occurred before implementation: two MotionGen gripper geometry
assertions and the stylesheet fence (99 raw rgba colors versus its 97 limit).
There are no new failing tests. Baseline Windows CRLF failures in generated text
and template parsing were resolved by normalizing the isolated checkout to Git's
existing LF content. The temporary audit-document inventory failure was resolved
by indexing this page.

`e2e/force-units.mjs` passes **20/20 checks**, covering conversion, editing,
shared-URL reload, torque units, and disabled controls. Its screenshots were
inspected. CUA exposed no browser surface, so the tracked Playwright suite used
a disposable browser profile. No new screen or interaction is introduced.

`npm run check` passes (ESLint, stylelint, and Prettier). The production app
and Storybook builds complete successfully; existing size/CommonJS warnings
remain. `git diff --check` passes. Logs and inspected screenshots are in the
worktree's ignored `artifacts/` directory.

### Files added

- `src/app/model/structural/`: `configuration.ts`, `cross-section.ts`, `loads.ts`,
  `structural-properties.ts`, `results.ts`, `pmks-configuration.ts`, and
  `static-force-solver.ts`.
- Tests in that directory: `structural-properties.spec.ts`,
  `static-force-solver.spec.ts`, and `pmks-configuration.spec.ts`.
- `src/app/services/structural-analysis.service.ts`.
- `src/app/services/transcoding/structural-codec.ts` and `url-structural.spec.ts`.
- `src/test-utils/verification/structural-fixtures.ts` and this document.

### Files modified

- `src/app/model/link.ts`: one optional metadata reference and deep sample copies.
- `src/app/services/mechanism.service.ts`: structural metadata in the existing cache signature.
- `src/app/services/transcoding/{transcoder-interface,string-transcoder,mechanism-builder}.ts`:
  versioned structural URL data, validation, and restoration.
- `src/app/services/{url-generation,url-processor}.service.ts`: persist/restore document cases.
- `src/test-utils/url-encoding.ts`: the new service in the test injection context.
- `src/test-utils/verification/fixture-gallery.ts` and `docs/fixture-urls.md`:
  three published structural verification mechanisms.
- `package.json` and `package-lock.json`: pinned matrix dependency and its dependencies.
- `docs/README.md` and `docs/tips-and-tricks.md`: index and durable integration notes.

## S2: inverse dynamics

S2 extends the same rigid-body equilibrium assembly. The legacy force solver,
URL format, structural metadata, position equations, and existing UI remain
unchanged. This is a model/service API milestone, not a new analysis screen.
The published [code style](https://docs.pmksplus.com/?path=/docs/guides-code-style--docs),
[UI guide](https://docs.pmksplus.com/?path=/docs/guides-ui-style-guide--docs), and
[vocabulary](https://docs.pmksplus.com/?path=/docs/guides-vocabulary--docs)
render the repository guides; the implementation follows their model/service
boundaries and explicit refusal rules.

### Legacy dynamics and acceleration audit

The relevant sources are `model/mechanism/force-solver.ts`,
`kinematic-solver.ts`, `position-solver.ts`, `mechanism.ts`,
`services/analysis-sample.service.ts`, and
`model/mechanism/finite-difference-kinematics.ts`.

| Concern | Existing PMKS behavior | S2 behavior |
| --- | --- | --- |
| CoM acceleration | Force series asks KinematicsSolver for each frame's root `linkAccMap`; missing rates fall back to sampled position differences | Consume analytical root accelerations only; unavailable/nonfinite rates are refused |
| Angular acceleration | `linkAngAccMap` in rad/s²; fallback differentiates unwrapped first-two-pin angles | Consume rad/s² directly, with no degree conversion |
| Mass and inertia | Root RealLink `mass`, `massMoI`; independent nonnegative checks | The same authoritative root properties, copied into SI configuration |
| CoM | Actual RealLink CoM; analytic kinematics rigidly transforms a known pin's acceleration to it | The solved root CoM and the existing transformed CoM acceleration |
| Moment reference | Legacy RealLink equations use CoM directly | Shared S1 assembly uses the first frame pin; translate the inertial moment exactly |
| Revolute joints | Shared pin unknowns; free multiway pin uses a star connection | Binary internal pins only, one unknown pair and its exact negative |
| Prismatic joints | Guide-normal reaction, translating block equations, guide couples for welded sliders | Explicitly unsupported |
| Cylinders and slides | Legacy resolves carrier/rider/root bodies and prismatic driver force | Explicitly unsupported; no partial result from supported bodies |
| Frame bodies | A rigid body with two distinct grounded pins is excluded | Preserve S1's exclusion; frame pins support moving bodies |
| Compounds | Root mass/CoM/inertia; no independent leaf equations | Root only, including multi-joint roots; never derive inertia from section/density |
| Drivers | First recognized input/body; revolute torque or prismatic effort | Explicit grounded revolute driver/body incidence; ambiguous PMKS drivers refused |
| Singular supports | A series can retry with an approximate evenest/ridge support split | SVD diagnostics, no numerical reactions for deficient or ill-conditioned systems |
| Geometry units | Legacy force conversion assumes project coordinates | Explicit project/model distinction; remove MODEL_SCALE where appropriate |

The legacy series computes finite-difference fallback data even when analytical
rates are available, and can mix analytical and approximate values by body.
Its three-point second difference supports unequal time steps but substitutes
timestamps for invalid/nonmonotonic input, and uses the nearest interior stencil
at endpoints. Fewer than three samples cannot supply a second derivative.
These are useful display fallbacks, not S2 engineering conventions. S2 neither
repairs timestamps nor substitutes zero for a missing body acceleration.

The existing analytical kinematics uses the loop route for ordinary grounded
cranks, a constant-speed rigid-root route for loopless cranks/compounds, and
differentiated position constraints for coupled mechanisms. It computes
`aG = aP + alpha cross rPG - omega² rPG` using the root's actual CoM.
Angular **position** is stored in degrees; angular acceleration is **rad/s²**.
The drive speed is signed rad/s and PMKS's commanded angular acceleration is
zero. Driven rockers/couplers can nevertheless have nonzero angular acceleration.
No velocity is required by the new pure inverse-dynamics API.

### State, equations, and results

`analyzeDynamic(configuration, states, loadCase)` is pure. Its inputs are:

- The S1 `StructuralConfiguration`, with mandatory `massProperties` on every
  moving body: `massKg`, `centerOfMassM`, and `inertiaKgM2` about CoM.
- Exactly one `BodyDynamicState` per moving root ID, in any order:
  `centerOfMassAccelerationMPerS2` and `angularAccelerationRadPerS2`.
- An ordinary SI `LoadCase`, including optional `gravityMPerS2`.

Keeping mass and CoM in the supplied configuration avoids two competing copies.
The two inputs together are the complete dynamic snapshot. The solver never
reads PMKS links, displayed samples, materials, or rendered geometry.

For a body with first frame pin O and CoM G:

```text
sum Fx = m aGx
sum Fy = m aGy
sum M_O = I_G alpha + (xG - xO) m aGy - (yG - yO) m aGx
```

Gravity is the **known applied force** `m g` at G. It is not subtracted from
or added to the supplied kinematic acceleration. Point loads (global or
link-relative), applied couples, gravity, and inertia all participate in the
required driver torque. Positive x/right, y/up, and counterclockwise moments
are unchanged from S1.

`equilibrium-solver.ts` factors S1's existing topology, load assembly, scaling,
SVD, reaction extraction, and diagnostics. Dynamics supplies inertial targets;
static analysis supplies none. The public `analyzeStatic` function and its
result shape remain unchanged.

`DynamicForceAnalysisResult` is explicitly tagged `mode: 'dynamic'`, including
failures. Success returns `jointReactions`, `driverReactions`, and
`bodyEquilibrium`. The neutral `driverReactions[].momentNm` field means the
required **driver torque**, not a static holding torque. Binary-pin forces are
reported on both bodies as exact negatives of one shared solved unknown.

Each body record contains its moment reference, known applied force/moment,
inertial force/moment target, and force/moment residuals. All those moments use
the stated reference O. Joint/driver records identify the body, so a caller can
reconstruct the complete free-body balance. To recover spatial internal loads
later, retain the configuration and LoadCase as well: a resultant alone cannot
locate multiple point loads.

### Explicit PMKS sample adapter

```typescript
const sample = {
  mechanism: selectedPartition,
  sampleIndex: chosenIndex,
  lengthUnit: LengthUnit.METER,
  coordinateSpace: 'model' as const,
};
const snapshot = snapshotPmksDynamicState(sample);
const result = analyzePmksDynamicFrame(sample, selectedLoadCase);
// Or: structuralAnalysisService.analyzeDynamic(sample, selectedLoadCase)
```

The caller supplies the **Mechanism object representing the selected partition**;
there is no implicit `mechanisms[0]`, displayed time, or singleton lookup.
A successful snapshot also identifies its sample index, time in seconds, and
`accelerationSource: 'pmks-analytical'`. LoadCase forces stay explicit; the
call does not silently collect the drawing's forces. Use
`loadCaseFromPmksForces` with the same sample if those are the intended loads.

`Mechanism.snapshotAccelerations` delegates to `kinematic-snapshot.ts`.
The helper evaluates the existing equations in fresh subclasses of the
kinematic and position solvers, initialized from that mechanism's saved drive
state and loops. A narrow overridable position-rate provider in KinematicsSolver
allows those contexts to remain isolated. It neither resets nor saves/restores
the UI's global maps. Loop and constraint routes are tested out of order with
other mechanisms; frozen source geometry and constraints remain unchanged.
No cache, serialization, undo entry, geometry edit, or asynchronous shared-state
window is introduced.

| Quantity crossing the adapter | Conversion |
| --- | --- |
| Position and CoM | raw coordinate × meters/project-unit ÷ MODEL_SCALE in model space |
| Linear acceleration | raw acceleration × the same distance factor; seconds already apply |
| Angular acceleration | unchanged rad/s² |
| Mass | PMKS mass × existing unit system's massToKg |
| Inertia about CoM | PMKS massMoI × existing inertiaToKgM2; no model-scale factor |

The project unit systems are meters/kg/kg·m², centimeters/g/kg·cm², and
inches/lbm/lbm·in², matching `siUnitFactorsForLength`. In particular, centimeter
mass and inertia have different factors (0.001 and 0.0001). The six combinations
of length unit and coordinate space are tested for CoM, acceleration, mass,
inertia, and reactions. Nonzero angular acceleration is separately verified
against differentiated four-bar closure equations: at the fixture's initial
pose, alphaBC = 0.04544290973869205 and alphaCDL = 0.6462922334444641 rad/s².
Changing sample timestamps does not rescale analytical accelerations.

### Analytical and legacy validation

The pure prescribed-state tests verify equilibrium independently of a position
solver. Such a supplied state is not a proof of kinematic compatibility with
the supports; that remains the responsibility of the upstream kinematic solve.

| Case | Expected result |
| --- | --- |
| A: axial CoM acceleration, m=2 kg, ax=3 m/s² | Rx=6 N, Ry=0, torque=0 |
| B: m=2 kg, ay=4 m/s², G=(1,0) m | Without gravity Ry=8 N and torque=8 N·m; with g=(0,-9.80665), Ry=27.6133 N and torque=27.6133 N·m |
| C: CoM at the grounded pivot, IG=3, alpha=4 | Zero pin force, driver torque=12 N·m |
| D: m=2, G=(1,0.5), IG=0.75, omega=2, alpha=3 | aG=(-5.5,1), pin force=(-11,2) N, driver torque=9.75 N·m |
| D with gravity, -100 N tip load at (2,0), +7 N·m applied couple | Pin force=(-11,121.6133) N; driver torque=222.3633 N·m |
| E: AB/BC two-body assembly | B on AB=(11/3,29/6) N, exact negative on BC; A=(7/3,19/6), C=(-7/3,47/6) N; external force=(0,11) N |
| F: existing welded bell crank, root mass=7, inertia=1.3 | One CDE body, actual solved CoM, no CD/DE leaf states despite deliberately different leaf properties |
| G: zero acceleration, same configuration and LoadCase | S1 and S2 reactions, driver moments, and diagnostics agree |

For D, the worked moment balance is:
`0.75*3 + 1*2 - 0.5*(-11) = 9.75 N·m`.
The additional load/gravity contribution is
`200 + 19.6133 - 7 = 212.6133 N·m`.
For E, the external moment about A is
`4*(47/6) - 3*(-7/3) = 115/3 N·m`, equal to the sum of the two bodies'
inertial moments about A. Tests independently sum every pin, known load, driver
couple, and inertial target and check body residuals.

Legacy comparisons explicitly prepare the existing analytical kinematic solver,
then use `ForceSolver.analyzeFrame(..., 'dynamic', ...)` with no evenest retry.
Crank, loaded four-bar, and bell-crank fixtures are compared at samples 0, 30,
and 90, with gravity both enabled and disabled: 18 complete reaction/driver
comparisons. Both equilibrium solvers consume the same physical kinematics, so
this independently checks force assembly and solution, not the kinematic source.
The hand cases and differentiated loop equations provide the independent
physics references. Agreement uses 1e-8 × max(1, abs(reference)) tolerance.

| Initial eccentric crank quantity | Legacy | S2 | Difference |
| --- | --- | --- | --- |
| Project/SI coordinates, Rx | -8 N | -8 N | <1e-8 N |
| Project/SI, tip load -100 N, gravity off, Ry | 96 N | 96 N | <9.6e-7 N |
| Project/SI, tip load and gravity, driver torque | 219.6133 N·m | 219.6133 N·m | <2.20e-6 N·m |
| Model coordinates, no applied loads, Rx | -1600 N | -8 N | -1592 N (legacy minus S2) |

The last row is intentional. The legacy force path treats model acceleration
as physical project acceleration; its displayed torque correction does not
repair that force error. Multiplying both translational acceleration and lever
arms by MODEL_SCALE can also multiply the translated inertial torque by its
square, while the separately stored IG alpha term is not scaled that way.
S2 removes the coordinate scale at the adapter boundary. It does not alter the
legacy solver or copy its display corrections.

### Diagnostics and limits

S2 retains all S1 topology, rank, residual, and conditioning checks. It adds
`invalid-dynamic-state` for missing/duplicate/wrong body IDs, missing analytical
rates, nonfinite accelerations, unavailable drive state, and invalid sample
selection/time/rate metadata. Missing or negative/nonfinite mass/inertia/CoM
is `invalid-properties`; assembly overflow is `numerical-failure`.
Nonfinite geometry and invalid loads retain their separate statuses.

Zero mass and zero inertia are **explicit idealizations**, independently allowed
as in PMKS: massless links, point masses, and ideal rotational-inertia elements.
Zero is never a substitute for missing data. Structural density/sections do not
fill absent properties or override the PMKS mass model.

Unknown/equation counts, rank, equilibrium deficiency, reaction redundancy,
condition number, characteristic length, and normalized residual remain exposed.
Rank tolerance is 1e-12 relative to the largest singular value, maximum accepted
condition number 1e10, and normalized residual limit 1e-9. Tests include
underconstraint, inconsistent inertia, redundant supports, a singular toggle,
and a full-rank near-toggle rejected for conditioning. Failures carry no
numerical force or driver result.

Supported topology is still revolute rigid roots with binary free pins and
grounded rotational drivers. Sliders, cylinders, friction, flexibility,
impact impulses, redundant reaction sharing, and floating/ambiguous drivers
remain unsupported. PMKS sample adaptation assumes the existing constant-speed
drive convention; prescribed nonzero input angular acceleration is supported
through the pure state API, not invented by the sample adapter.

### Per-sample cost

A diagnostic benchmark runs 25 warmups, then five batches of 50 evaluations,
cycling over five solved samples. These are Windows Node 24.21 / Angular Vitest
measurements, not browser or real-time performance guarantees. Medians in ms:

| Moving bodies | Pure equilibrium | Adapter only | Adapter + equilibrium |
| --- | --- | --- | --- |
| 1, eccentric crank | 0.036 | 0.102 | 0.148 |
| 3, loaded four-bar | 0.117 | 0.118 | 0.264 |
| 5, welded bell crank | 0.113 | 0.168 | 0.319 |

Independent batches include JIT/GC effects, so columns need not add exactly.
Setup/position solving is excluded. Re-run `structural-performance.spec.ts`
with `PMKS_BENCHMARK_STRUCTURAL=1` to write `artifacts/s2-performance.json`.
There is no timing assertion and no premature matrix cache.

### S3 recommendation

Keep N/V/M recovery as a pure downstream consumer of the configuration, complete
LoadCase, and successful S1/S2 result. First define section stations, cut-side
signs, and a mapping from a real body to supported beam segments. Share the
global point-load resolver with equilibrium, retain jumps at point forces and
couples, and validate both ends and independent cut balances. Do not infer a
beam axis for every multi-joint compound.

For **dynamic** cut recovery, m, CoM, and IG alone do not define the distributed
inertial loading. Require an explicit mass distribution and angular velocity
for `a(r) = aG + alpha cross r - omega² r`, or state a deliberate lumped-mass
approximation. That extra velocity input belongs to S3 when it is needed.
Do not silently apply all inertia at CoM and call the resulting diagram exact.
Keep S4 stress, FEA, fatigue, and full-cycle envelopes outside S3.

### S2 verification and file inventory

The targeted run covers the new S2 tests, S0/S1 structural and persistence tests,
and generated fixture gallery: **119/119 passing**. There are 62 tests in the
three new S2 spec files, plus two gallery checks for the additional fixture.
The complete suite reports **2,617 passed, 3 failed / 2,620**, in 244 files
(242 passed, 2 failed).

The baseline was rerun at `79a8ef0c` before S2 edits: **2,553 passed, 3 failed**.
The same assertions fail after S2:

- MotionGen gripper initial gap: 1.036629237211164, expected greater than 2.3.
- MotionGen gripper captured pose error: 1.051501, expected less than 0.0001.
- Raw-color fence: 99 rgba colors, with the actual ceiling **87**. The S0/S1
  prose above reported 97; the fresh baseline log confirms 87. This is a
  correction to that report, not a new stylesheet change.

An initial full-bundle failure in the new snapshot helper was fixed, then the
full suite was rerun. Angular lazy initialization plus Vite's imported-superclass
transform required resolving the constructors locally at invocation time.
The equations did not change. The durable explanation is in tips-and-tricks.

Browser regressions on the worktree server:
`e2e/force-units.mjs` **20/20**, and `e2e/force-analysis-panels.mjs` **15/15**,
with no reported browser errors/issues. Screenshots of the in-motion joint
panel, link force graph, and force-unit settings were inspected. CUA exposed
no browser surface; the tracked suites used disposable Playwright/Chrome
profiles. No motion or gesture behavior was changed.

Final `npm run check` passes (zero errors, the existing 15 ESLint warnings,
stylelint, and Prettier). Production and Storybook builds complete successfully;
existing bundle-size/CommonJS warnings remain. `git diff --check` passes.
The baseline, final full-suite, targeted, build, check, browser, and benchmark
logs are in the worktree's ignored `artifacts/s2-*` files. S2 is kept as a
separate commit after `79a8ef0c`; this work is not pushed.

Added:

- `model/mechanism/kinematic-snapshot.ts`: isolated analytical acceleration context.
- `model/structural/equilibrium-solver.ts`: shared S1/S2 assembly and strict solve.
- `model/structural/dynamic-state.ts`, `dynamic-force-solver.ts`,
  `pmks-dynamic-state.ts`: explicit SI dynamics and selected-sample adapter.
- `model/structural/dynamic-force-solver.spec.ts`,
  `pmks-dynamic-state.spec.ts`, `structural-performance.spec.ts`.

Modified:

- `model/mechanism/kinematic-solver.ts`: overridable position-rate provider only;
  `mechanism.ts`: explicit sample delegation.
- `model/structural/static-force-solver.ts`: stable public wrapper over the shared core;
  `results.ts`: dynamic result, per-body balance, and invalid-state status.
- `services/structural-analysis.service.ts`: explicit dynamic analysis method.
- `test-utils/verification/structural-fixtures.ts` and generated
  `docs/fixture-urls.md`: eccentric dynamic crank in the public gallery.
- This document, `docs/README.md`, and `docs/tips-and-tricks.md`.

All `model/` and `services/` paths above are under `src/app/`;
`test-utils/` is under `src/`. No dependency, persistence, legacy force-solver,
component, stylesheet, or hub-service changes are part of S2.

## S3 Internal Loads

S3 implements both static recovery and exact dynamic recovery **within the
explicit uniform-line model**. It consumes reactions from a successful S1/S2
result and the original configuration and LoadCase. It never solves reactions
again. The geometry audit and sign contract at the beginning of this document
were recorded before the section-cut implementation.

### Physical member and public API

`StructuralMember` declares `kind: 'straight-prismatic'`, a member `id`,
`bodyId`, `startJointId`, and `endJointId`. `resolveStructuralMember` produces
copied SI endpoints, unit axial/transverse vectors, length, and a deep copy of
the root's optional material/cross-section metadata. Neither a material nor a
section is required to compute loads. They will be required by the relevant S4
stress calculation. No density-derived mass is substituted.

The member must span one complete two-pin revolute root. The PMKS adapter
records whether its source is simple, multi-pin, compound, or non-beam, so even
a compound with two external pins is refused. A pure caller explicitly takes
responsibility for the declared straight prismatic interpretation. The current
`uniformBodyOf` helper can calculate rod or convex-hull plate mass properties;
that does not supply a structural decomposition for a multi-pin body. Similarly,
the compound outline is a rendering union, not a beam load-transfer graph.

```ts
const member: StructuralMember = {
  kind: 'straight-prismatic', id: 'member-AB', bodyId: 'AB',
  startJointId: 'A', endJointId: 'B',
};
const equilibrium = analyzeStatic(configuration, loadCase);
const diagram = recoverStaticMemberLoads(configuration, member, loadCase, equilibrium);
if (diagram.status === 'ok') {
  const section = evaluateMemberLoads(diagram, { xM: 0.8, side: 'left' });
}
```

For dynamics, use `snapshotPmksMemberMotion(selectedSample)`, pass its
configuration and states to `analyzeDynamic`, then call
`recoverDynamicMemberLoads(configuration, member, loadCase, equilibrium,
selectedBodyMotion, { massDistribution })`. This explicit sequence ensures one
selected partition/sample supplies geometry and all rates. It introduces no
active-selection lookup, global mutable state, or UI dependency.

### Cuts, events, and exact intervals

With local axes e and n from the audit, transform a global force with dot
products: Fx=F dot e and Fy=F dot n. On the A-side segment the exposed cut load
is N e - V n, with moment +M CCW. For effective line loads qx(s), qy(s), point
forces (Fxi,Fyi) at si, and axis couples Ci:

```text
N(x) = -sum Fxi - integral[0,x] qx(s) ds
V(x) =  sum Fyi + integral[0,x] qy(s) ds
M(x) =  sum ((x-si) Fyi - Ci) + integral[0,x] (x-s) qy(s) ds
```

The sums include events strictly before x for a left limit, and events at x
for a right limit. Loads include supplied body-side joint reactions, driver
couples at their actual pins, point forces, and located free couples. The shared
`load-coordinates.ts` resolver gives S1/S2/S3 identical global/link-frame
interpretations. Off-axis application uses the rigid-arm transfer described
above, including its -yOffset*Fx couple; a projection outside the member span
is refused. Explicit free-couple locations are optional for legacy S1/S2 and
mandatory for S3. Their optional `at` field round-trips through existing T1
load-case persistence without a version change.

At each event, jumps are deltaN=-Fx, deltaV=Fy, deltaM=-C. Coincident actions
share an event with their source labels retained. Distinct interior coordinates
remain distinct, including nearby loads. Endpoint projections alone snap within
max(1e-12 m, 1e-12 L). Queries never silently snap; `side` is mandatory.

`events` contain both limits at 0, each load/couple position, and L. `segments`
contain polynomial coefficients in ascending powers of **u=x-startM**. N and V
are at most quadratic and M at most cubic. This supports arbitrary station
queries and future plotting without sampling away a discontinuity or asking a
component to recompute physics. At a constant-load interval, dM/dx=V;
generally dN/dx=-qx and dV/dx=qy.

Each component exposes signed `minimum` and `maximum`, and nonnegative
`absoluteMaximum`, with event-side/interior locations and any whole constant
intervals. Stationary points are found analytically from polynomial derivatives.
Locations matching within 1e-10 times max(1, magnitude) are retained as ties.
Constant intervals describe their interiors; endpoint sides remain explicit.
The zero exterior limits participate in extrema, so no tensile/compressive
demand gives a zero positive/negative envelope. For an absolute maximum, use
the returned station to recover its signed value when S4 needs it.

### Worked static shear/moment diagram

The gallery's supported 4 m beam has a downward 100 N point load at x=1 m.
Its S1 vertical reactions are +75 N at A and +25 N at B, with zero axial load.

| Station | N (N) | V (N) | M (N m) |
| --- | --- | --- | --- |
| 0-minus, exterior | 0 | 0 | 0 |
| 0-plus | 0 | 75 | 0 |
| 1-minus | 0 | 75 | 75 |
| 1-plus | 0 | -25 | 75 |
| 4-minus | 0 | -25 | 0 |
| 4-plus, exterior | 0 | 0 | 0 |

Thus V=75 on (0,1), V=-25 on (1,4), M=75x before the load,
and M=100-25x after it. Maximum |V| is 75 N throughout (0,1), and
maximum |M| is 75 N m at x=1. A +12 N m located couple, independently
tested, produces a -12 N m moment jump with no shear jump.

### Gravity, mass distribution, and dynamics

Gravity requires an explicit `gravityModel`. `lumped-at-com` puts m g at the
authoritative CoM and labels the result accordingly. It represents that lumped
load system, not exact distributed self-weight. `uniform-line` applies mu g
along the axis and requires the same validated distribution as dynamics.

`MemberMassDistribution` currently has only `{ kind: 'uniform-line', memberId }`.
It has **no second mass field**: mu=m/L uses the authoritative root mass. The
line integrates to m, midpoint CoM, and IG=m L²/12. CoM tolerance is
max(1e-12 m, 1e-8 L); inertia tolerance is max(1e-12 kg m²,
1e-8 max(IG, implied IG)). Mismatches report their errors and refuse recovery;
mass properties are never rescaled or relocated. This is a slender line
idealization, not a finite-width mass model. A zero-mass line is permitted only
with consistent zero inertia and its declared midpoint; zero never fills a
missing input.

`BodySectionMotionState` extends the acceleration state with signed CCW-positive
`angularVelocityRadPerS`. The PMKS adapter reads the existing analytical
`linkAngVelMap` from the same isolated kinematic evaluation as the accelerations.
It uses neither finite differences nor a fallback zero. S2's public snapshot
shape and acceleration-only requirement remain unchanged. Tests cover both
velocity signs, selected samples, meters/centimeters/inches, and model/project
coordinates with MODEL_SCALE removed at the SI boundary.

For a line point s, r=(s-L/2)e relative to the validated CoM. The material
acceleration is aG + alpha cross r - omega² r. In member axes, the effective
applied-minus-inertial line load is:

```text
qx(s) = mu gx - mu (aGx - omega² (s-L/2))
qy(s) = mu gy - mu (aGy + alpha (s-L/2))
```

Omit the g terms for no gravity or for separately lumped gravity. These affine
fields are integrated in closed form in the cut equations. There is no CoM
lumped-inertia substitute and no visually sampled pseudo-load.

Hand-integrated 2 kg, 2 m rod cases, with x in meters:

| Motion | Internal loads |
| --- | --- |
| Translation aGx=3, omega=alpha=0 | N=-6+3x; V=M=0 |
| Angular acceleration about A: alpha=3, aGy=3, omega=0 | V=6-1.5x²; M=-8+6x-0.5x³ |
| Steady rotation about A: omega=±2, aGx=-4, alpha=0 | N=8-2x²; V=M=0 |

Additional tests combine gravity, both inertial terms, off-axis loading, and a
couple; find an interior cubic-moment maximum and an interior centripetal axial
maximum; and reduce zero-motion dynamic recovery to static recovery.

### Independent verification and diagnostics

The test helper rebuilds original load positions and global forces independently
of the production resolver and diagram coefficients. It checks both sides of
every event, both ends, and four arbitrary interior cuts. For dynamic cuts it
integrates the actual mass acceleration and moment with an independent Simpson
integral (exact for these polynomial integrands). This verifies global force and
moment equilibrium, including off-axis arms, and directly bridges S1/S2 joint
reactions to the member's interior endpoint loads.

Static tests cover A tension, B cantilever tip load, C supported point load,
D couple, E combined loading, F off-axis loading, and G lumped gravity.
Dynamic tests cover H translation, I angular acceleration, J centripetal force,
and K inconsistent mass properties. Other checks cover orientation reversal,
world rotation/translation, event jumps/coincidence, nonzero PMKS samples,
immutable inputs, legacy couple persistence, and interpretation refusals.

Recovery also verifies complete, nonduplicated reaction/driver identities and
whole-member closure. Its closure residual is max(|N(L+)|, |V(L+)|,
|M(L+)|/L), normalized by a force scale from all point/couple and line actions
(at least 1 N); acceptance limit is 1e-8. Tests require less than 1e-10 for
their successful cases. This detects inconsistent supplied reactions/loads/
motion without resolving them. Callers still must supply one matching sample:
whole-body balance alone cannot identify spatially different load systems with
the same resultant.

Failures return only a status and message, never a partial diagram. Added
statuses include `unsupported-member-geometry`, `ambiguous-member-mapping`,
`invalid-station`, `load-not-on-supported-member`, `missing-mass-distribution`,
`mass-distribution-mismatch`, `missing-angular-velocity`, `unsupported-compound`,
`missing-gravity-model`, `invalid-equilibrium-result`, and
`upstream-analysis-failed`. Existing geometry, property, load, dynamic-state,
and numerical-failure diagnoses remain available. Nonfinite input, integration
overflow, unavailable rates, unsupported roots, or unlocated couples fail closed.

### Cost and current limitations

Windows Node 24.21 / Angular Vitest medians, 25 warmups followed by five batches
of 100 operations, with already-computed S1/S2 reactions:

| Interior point loads | Static recovery (ms/member/sample) | Dynamic recovery | One station query |
| --- | --- | --- | --- |
| 1 | 0.0653 | 0.0561 | 0.00100 |
| 10 | 0.1061 | 0.0853 | 0.00060 |

These include validation, event construction, integration, and extrema; exclude
position solving, motion adaptation, and SVD. Small timings include JIT/GC
variation, not a guaranteed ordering or frame budget. Run
`member-performance.spec.ts` with `PMKS_BENCHMARK_MEMBER=1` to reproduce
`artifacts/s3-performance.json`. There is no machine-speed test or shared cache.

PMKS rounds some solved pin coordinates to four decimal places in raw model
coordinates (`PositionSolver.incrementRevInput`). Transported CoM and stored
inertia can then disagree with a uniform line through those pins. A project-meter
2 m rod at sample 30, for example, has midpoint error 0.0000213010 m and inertia
error 0.0000284017 kg m²: S2 succeeds, but exact S3 explicitly refuses that pose.
A nonzero model-centimeter sample that meets the same tolerance is verified
successfully. S3 does not loosen the mass check, move pins, or repair root
properties to hide this limitation. A later precision change needs separate
kinematic verification before promising full-cycle exact recovery.

No branched/multi-pin/compound decomposition, arbitrary distributed loads,
nonuniform or point-mass distributions, sliders/cylinders/gears, finite-width
inertia, stress, deformation, FEA, fatigue, or full-cycle envelope is implemented.
Off-axis loads assume a rigid arm whose own structural loads are not recovered.
The sample adapter retains PMKS's constant-speed drive convention; independently
prescribed consistent motion is available through the pure API. Prismatic section
and material data remain optional metadata and are not inferred from rendering.

### S3 file inventory and S4 recommendation

Added under `src/app/model/structural/`:

- `load-coordinates.ts`: shared body/local load interpretation.
- `member.ts`, `member-mass.ts`, `member-results.ts`: explicit geometry,
  authoritative-mass distribution validation, motion extension, and results.
- `member-diagram.ts`, `member-load-recovery.ts`: event/segment integration,
  arbitrary station evaluation, extrema, and downstream static/dynamic APIs.
- `member-load-recovery.spec.ts`, `member-dynamics.spec.ts`,
  `member-adapter.spec.ts`, `member-performance.spec.ts`.

Also added `src/test-utils/verification/member-verification.ts`, the independent
cut-equilibrium oracle. Modified `configuration.ts` and `pmks-configuration.ts`
to retain geometry provenance; `loads.ts` for optional couple positions;
`equilibrium-solver.ts` to reuse the resolver; `pmks-dynamic-state.ts` and
`model/mechanism/kinematic-snapshot.ts` for the analytical velocity extension.
Updated `structural-fixtures.ts`, generated `docs/fixture-urls.md`, this document,
`docs/README.md`, and `docs/tips-and-tricks.md`. No dependency, legacy force-solver,
component, stylesheet, or hub-service change is part of S3.

S4 should be another pure downstream module: successful S3 result plus validated
cross section/material and explicit section coordinates yields signed stress
at a requested station/side. Reuse `evaluateMemberLoads`, preserve provenance
(`mode`, gravity model, mass model), and keep section-specific axial/bending/shear
relations separate from material failure criteria. Compute combined stress and
factor of safety only for explicitly supported sections/criteria. Load extrema
alone need not locate every combined-stress maximum; S4 should evaluate its own
critical points over S3's exact intervals and both sides of jumps. Keep UI
formatting, future cycle aggregation, and compound load transfer separate.

### S3 verification results

All **188/188** tests in the targeted structural, persistence, verification, and
fixture-gallery run pass. S3 adds 53 tests in four new spec files and two
gallery checks. The full PMKS suite reports **2,672 passed, 3 failed / 2,675**
in 248 files (246 passed, 2 failed). Before any S3 code change, the preserved
S2 commit `f97d275a` was rerun: **2,617 passed, 3 failed / 2,620**. The same
three assertions fail with identical values:

- MotionGen gripper initial gap: 1.036629237211164, expected greater than 2.3.
- MotionGen gripper captured pose error: 1.051501, expected less than 0.0001.
- Stylesheet raw rgba count: 99, expected at most 87.

Production and Storybook builds succeed with existing size/CommonJS warnings.
`npm run check` passes with zero errors, the existing 15 ESLint warnings,
stylelint, and Prettier. `git diff --check` passes.
Browser suites on `http://localhost:4347` pass: `e2e/force-units.mjs` **20/20**,
`e2e/force-analysis-panels.mjs` **15/15**, no reported page errors or issues.
The in-motion joint panel, link force graph, and metric kgf settings screenshots
were inspected. CUA again exposed no app/browser surface, so the tracked suites
used disposable Playwright/Chrome profiles. No animation or gesture changed.

The implementation follows the repository code/style/vocabulary documents
published in the requested PMKS documentation gallery. Verification logs,
benchmark JSON, and browser artifacts are in the worktree's ignored `artifacts/`
directory (`s3-*`, `force-units/`, and `screenshots/s3-force-panels-*`). The S0/S1
and S2 reports above remain historical records. S3 is a separate commit after
`f97d275a`, with no squash or push.

## S4 Stress Analysis

S4 is a pure downstream nominal elementary-beam stress engine for **rectangles
and solid circles only**. It consumes a successful S3 result, an explicit cross
section, x/side/y coordinates, and optional material. It does not solve
kinematics or reactions, reinterpret mass or gravity, alter geometry, consult
Angular state, or calculate deformation. The section audit at the beginning of
this document records the pre-implementation contract.

### Coordinates, assumptions, and signs

Section coordinate y is measured from the centroid toward member-local +n:
positive at the top of a horizontal A-to-B member, negative at the bottom.
For rectangle width b and height h, c=h/2; for circle diameter d, c=d/2.
Width is out-of-plane thickness; height is in-plane bending depth. Coordinates
outside [-c,c], including just outside a boundary, are refused without clamping.

On S3's A-side segment, the exposed face normal is +e. Its traction components
are sigma along +e and tau along +n. The plane-stress model is:

```text
sigma_x = N/A - M y/I
sigma_y = 0
tau_xy  = -k V/A (1 - (y/c)^2)

k = 3/2 for rectangle; k = 4/3 for solid circle
```

Therefore positive N creates tension; positive sagging M compresses the +y fiber
and tensions the -y fiber. Since S3's positive cut shear points opposite +n,
positive V creates **negative** tau_xy. Independent section integration gives:

```text
integral sigma_x dA = N
integral (-y sigma_bending) dA = M
integral tau_xy dA = -V
```

For a circle, dA is the chord width 2 sqrt(R²-y²) times dy. This is the
elementary beam width-averaged depth distribution: center magnitude 4|V|/(3A),
zero at y=±R. It does not claim the full local shear vector on every point of
a curved circumference. The corresponding rectangle profile has center
magnitude 3|V|/(2A) and zero at y=±c. The beam shear approximation and its
width assumption are described in the
[University of Alberta beam notes](https://engcourses-uofa.ca/beam-structures/plane-beam-approximations/);
[MIT's beam relations](https://ocw.mit.edu/courses/16-01-unified-engineering-i-ii-iii-iv-fall-2005-spring-2006/26a4c795200c276094411ecf58e297d3_beamsquizhandout.pdf)
provide a reference for section properties and stress-resultant relations.

These are nominal prismatic-beam stresses, with no torsional or through-thickness
normal stress. Adding a finite cross section for stress does not replace S3's
explicit line-mass idealization or infer root mass from material density.

### Point, profile, and material APIs

```ts
const point = evaluateMemberStress(memberLoads, crossSection,
  { xM: 1, side: 'right', yM: 0.005 }, material);
const profile = evaluateStressProfileAtStation(memberLoads, crossSection,
  { xM: 1, side: 'right' }, [-0.01, 0, 0.01], material);
const sectionCritical = findSectionStressExtrema(memberLoads, crossSection,
  { xM: 1, side: 'right' }, material);
const memberCritical = findMemberStressExtrema(memberLoads, crossSection, material);
```

The point API obtains N/V/M through S3's `evaluateMemberLoads`; it does not
duplicate load evaluation. Profile evaluation defaults to bottom, centroid, and
top if no y list is supplied. Requested profiles are visualization data, not
an extrema approximation. All numeric stresses are Pa, with no formatted unit
strings. Point results include the copied location, original local internal
loads, separate axial and bending normal contributions, their sum, transverse
shear, von Mises, both in-plane principal stresses, criterion, and provenance.

For sigma_y=0, von Mises is `hypot(sigma_x, sqrt(3) tau_xy)`.
Principal stresses are sigma_x/2 ± hypot(sigma_x/2,tau_xy), returned in
descending order. The smaller principal is evaluated using the determinant
relation to avoid subtractive cancellation. The third principal stress is zero;
the two in-plane values are not mislabeled as the global 3-D maximum/minimum.
Zero stress components are normalized to +0 for JSON round trips.

Stress needs no material or elastic modulus. `validateStructuralProperties`
remains the material validator. Missing yield strength yields a valid stress
with criterion `unavailable / missing-yield-strength`; invalid supplied material
likewise leaves stresses valid, with `invalid-material-properties`. Ultimate
strength is never substituted for yield strength. No brittle or ultimate
criterion is implemented.

For valid Sy, the named `ductile-von-mises-yield` criterion reports utilization
sigma_vm/Sy and factor of safety Sy/sigma_vm. At zero demand, utilization is
zero, FoS is null, and `factorOfSafetyState` is `unbounded-zero-demand`.
A nonzero-demand FoS beyond numeric range is null with `exceeds-numeric-range`;
an unrepresentable utilization makes the criterion unavailable with
`numerical-failure`. No infinity, NaN, or arbitrary huge sentinel is returned.
This is a ductile-yield check, not a universal failure prediction.

### Discontinuities and provenance

Every station query requires a left or right side. The two sides of a point
force or couple event can have different stress states; they are never averaged.
Both exterior and interior endpoint limits from S3 remain accessible. Member
extrema preserve the side belonging to each interval, including roots that
round onto an endpoint.

Provenance retains member/body IDs, static/dynamic mode, no/lumped/uniform gravity,
mass model, distributed-uniform-line inertia where applicable, stress model,
and copied section dimensions/properties. Four small additive S3 metadata changes
retain motion provenance: `BodySectionMotionState.source`,
`MemberLoadsSuccess.motionSource`, the analytical adapter's source label, and
recovery's pass-through. PMKS snapshots are `pmks-analytical`; explicit callers
can identify `prescribed` motion. Older/unlabeled results remain `unspecified`.
S4 never invents an analytical-source claim. S2's acceleration-only interface,
S3 equations, and mass tolerances are unchanged.

### Section extrema

Let t=y/c and write sigma=a+b t, tau=d(1-t²), where a=N/A,
b=-M c/I, and d=-kV/A. Normal extrema occur at t=±1; shear magnitude
is largest at t=0. For von Mises, maximize:

```text
f(t) = sigma_vm² = (a+b t)² + 3 d² (1-t²)²
f'(t)/2 = a b + (b²-6d²)t + 6d² t³
```

The routine considers both fibers, the centroid, and every real in-domain root
of this cubic. It uses coefficient normalization and recursive derivative root
isolation with bisection on monotone intervals, retaining repeated roots.
Thus combined loading may govern at an interior y other than zero. A checked
example has a=2.6875 MPa, b=0.5 MPa, d=1 MPa and governs at t=1/4.

### Whole-member extrema and numerical bounds

Each S3 interval is mapped to dimensionless u in [0,1], with its exact
polynomials retained. Normal-stress maxima/minima use both fibers and roots of
their x derivatives; maximum absolute shear uses the center-depth V polynomial
and its derivative roots. Both sides of every event are included separately.

Von Mises squared is a tensor polynomial of at most degree six in u and four
in t. Boundary/neutral-axis x stationary roots and section-coordinate roots
provide candidates. Alternating stationary-root refinement improves the current
witness. A global search then converts the polynomial to tensor Bernstein form
and subdivides its control net using de Casteljau averages. Nonnegative
Bernstein weights sum to one, so the largest control coefficient bounds the
polynomial on each box; see the
[MIT Bézier surface reference](https://web.mit.edu/hyperbook/Patrikalakis-Maekawa-Cho/node14.html).
Boxes are discarded only when their upper bounds cannot exceed the attained
value. This closes the gap left by checking only fixed y values or alternating
roots, which alone would not establish a global maximum.

The bounded search normalizes stress coefficients before squaring. Its stopping
criterion is an upper-minus-attained squared-stress gap of 1e-10 times the
attained normalized squared stress (floor 1e-24), plus twice a roundoff allowance
of 2e-12 times the original control-net magnitude (floor 1e-30). Subdivision
is limited to 20,000 boxes split per interval; nonconvergence returns
`numerical-failure` with no extrema result. This is a floating-point numerical
bound with a documented roundoff allowance, not a formal interval-arithmetic
certificate. No coarse member/section plotting grid supplies the maximum.

Results report maximum tensile demand, compressive demand, absolute normal
stress, absolute shear, and von Mises. Each includes magnitude, signed value,
and a full stress-point witness identifying x/side/y. Tension and compression
demands are nonnegative; zero indicates no demand of that sign. One witness is
returned for ties or constant fields, rather than claiming a unique location.
The numerical gap bounds the maximum value, not a unique location error on flat
fields. Analytical isolated-location tests verify the expected x and y.

`governingYieldCriterion` uses the attained maximum; `conservativeYieldCriterion`
uses the reported von Mises upper bound, giving a conservative minimum FoS and
maximum utilization within the numerical bound. Diagnostics include that upper
bound, its gap in Pa, method, and number of subdivisions. Section-only extrema
use stationary roots directly and report zero subdivision gap.

### Worked stress and yield example

At x=1 m, right side, let N=2400 N, V=800 N, M=10 N m. Use a rectangle
b=0.01 m, h=0.02 m: A=0.0002 m², I=6.6666666667e-9 m⁴, c=0.01 m.
At y=+0.005 m with Sy=180 MPa:

| Quantity | Calculation | Result |
| --- | --- | --- |
| Axial normal stress | N/A | +12 MPa |
| Bending normal stress | -M y/I | -7.5 MPa |
| Combined normal stress | 12 - 7.5 | +4.5 MPa |
| Transverse shear | -1.5 V/A (1-0.5²) | -4.5 MPa |
| Von Mises | sqrt(4.5² + 3×4.5²) | 9 MPa |
| Yield utilization | 9/180 | 0.05 |
| Yield FoS | 180/9 | 20 |

This is a point result, not the maximum over the section or member. The test
creates these internal loads through the gallery's held 2 m crank and S1/S3,
with an end force and located end couple, then evaluates S4 downstream.

### Validation and performance

Hand checks cover A axial tension, B compression, C sagging rectangular bending,
D rectangle shear, E circle shear, F axial-plus-bending, G normal-plus-shear
von Mises, H yield utilization/FoS, and I zero demand. Independent quadrature
integrates both supported stress distributions back to N, M, and signed -V.
Circle integration substitutes y=R sin(theta) to handle the curved chord width.
Other tests cover all three event jumps, rotation/translation invariance,
nonzero static/dynamic equivalence, gravity-model differences, analytical versus
prescribed provenance, serialization, malformed inputs, and numerical overflow.

Critical-point tests include a section-interior maximum at y=c/4, uniform-gravity
beam maximum at x=2 m, a centripetal axial maximum at x=1 m, and a separable
two-variable polynomial with its independently known global maximum at
u=0.37, t=0.25. Twelve deterministic additional polynomial fields are checked
against independent dense probes as a regression oracle; those probes are not
part of the production maximum algorithm.

Diagnostic benchmark, Windows Node 24.21 / Angular Vitest, on the gallery's
4 m uniform supported member under gravity. Medians in ms per operation:

| Section | One stress point | Section extrema | Whole-member extrema |
| --- | --- | --- | --- |
| Rectangle | 0.0103 | 0.0576 | 0.5323 |
| Solid circle | 0.0047 | 0.0404 | 0.4390 |

Twenty-five warmups precede five batches of 50 operations. These include S4
validation but exclude fixture construction and S1/S2/S3. Independent batches
include JIT/GC variation; harder polynomial fields and more events cost more.
Run `stress-performance.spec.ts` with `PMKS_BENCHMARK_STRESS=1` to reproduce
`artifacts/s4-performance.json`. No timing threshold or shared mutable cache exists.

### Diagnostics, limitations, and S5 recommendation

Stress failures include `missing-cross-section`, `unsupported-cross-section`,
`invalid-section-coordinate`, `invalid-section-properties`, `invalid-station`,
`invalid-member-load-result`, `upstream-analysis-failed`, and `numerical-failure`.
Material-criterion unavailability is separate from stress failure. Malformed
event/interval topology, nonfinite coefficients, unsupported mechanics
provenance, or inconsistent interval limits are refused before evaluation.
S4 validates the downstream data contract; it does not rerun S3 mass validation
or body equilibrium.

The existing rounded-coordinate limitation is inherited: if S3 refuses a PMKS
sample because its pins, CoM, and inertia fail uniform-line consistency, S4
returns upstream failure. No tolerance or position-precision changes were made.
The same restriction applies to uniform-line distributed gravity recovery.

Only nominal plane beam stresses are supported. There is no torsion, section
warping, arbitrary-section VQ/It model, local notch/hole/fillet concentration,
pin shear, bearing/contact/tear-out, buckling, fatigue, deformation, reaction
redistribution, FEA, or cycle aggregation. Exceeding yield is a nominal elastic
demand check, not a plastic stress solution. Circular shear retains the
width-averaged beam approximation described above.

S5 should orchestrate explicitly selected mechanism samples through S2/S3/S4,
retaining each sample index, time, input angle, x/side/y witness, and mechanics
provenance. Aggregate stress envelopes and signed tension/compression ranges,
and record the critical mechanism sample/angle for each demand. Minimum cycle
FoS should use conservative per-sample bounds, with the corresponding actual
stress witness available separately. A finite sample sweep is an envelope of
those samples; continuous-cycle claims require additional angular/time refinement
or a bound between samples.

Address PMKS coordinate precision in a separate verified task before claiming
complete exact dynamic cycle coverage. Failed samples must remain explicit gaps
with an incomplete-envelope status, never zero stress or silently skipped
contributions to a claimed safe cycle. Static envelopes likewise inherit any
uniform-gravity distribution refusal.

Before fatigue, retain signed stress histories at consistent material points,
including mean/alternating components, shear/normal phase relationships, cycle
counts, and loading history. Nonnegative von Mises maxima alone cannot supply
that information. Fatigue needs a separately chosen material/life model,
appropriate strength data, and any justified geometric/surface/environment
corrections; S5 envelopes alone do not establish fatigue life.

### S4 file inventory

Added under `src/app/model/structural/`:

- `member-stress.ts`: point/profile stress, provenance, and optional yield checks.
- `stress-results.ts`, `stress-validation.ts`: typed results and downstream contract.
- `stress-polynomial.ts`, `stress-maximizer.ts`, `stress-extrema.ts`: stationary
  roots, bounded two-variable search, and section/member extrema.
- `member-stress.spec.ts`, `stress-extrema.spec.ts`, `stress-performance.spec.ts`.

Also added `src/test-utils/verification/stress-verification.ts` for real S1/S3
test inputs and independent section-resultant integration. Existing gallery
mechanisms are reused; no new mechanism URL or persistence format was needed.
Modified `member-mass.ts`, `member-results.ts`, `member-load-recovery.ts`, and
`pmks-dynamic-state.ts` solely for optional motion-source provenance, plus this
document, `docs/README.md`, and `docs/tips-and-tricks.md`. No S0 section formulas,
S1/S2 equations, S3 mass tolerances, legacy force solver, dependency, component,
stylesheet, or hub-service changes are part of S4.

### S4 verification results

The targeted run passes **222/222** tests across S4, all prior structural tests,
structural persistence, verification, and fixture gallery. S4 adds 34 tests in
three spec files. The full PMKS run reports **2,706 passed, 3 failed / 2,709**
in 251 files (249 passed, 2 failed).

The complete baseline was rerun at `04d06680` before S4 code changes:
**2,672 passed, 3 failed / 2,675**. All three failures have the same values in
the S4 run:

- MotionGen gripper initial gap: 1.036629237211164, expected greater than 2.3.
- MotionGen gripper captured pose error: 1.051501, expected less than 0.0001.
- Stylesheet raw rgba count: 99, expected at most 87.

`npm run check` passes with zero errors and the existing 15 ESLint warnings,
plus stylelint and Prettier. Production and Storybook builds succeed with
existing size/CommonJS warnings. `git diff --check` passes.

Browser regressions on the S4 worktree at `http://localhost:4348`:
`e2e/force-units.mjs` **20/20** and `e2e/force-analysis-panels.mjs` **15/15**,
with no reported page errors or issues. Joint in-motion force, link force graph,
and metric kgf settings screenshots were inspected. CUA exposed no browser/app
surface; tracked suites used disposable Playwright/Chrome profiles. S4 adds no
UI, animation, or gesture behavior.

Logs and benchmark JSON are in the worktree's ignored `artifacts/s4-*` files;
browser screenshots are in `artifacts/screenshots/s4-force-panels-*` and
`artifacts/force-units/`. The repository guides published at docs.pmksplus.com
remain the code, style, and vocabulary references. S4 is kept as a separate
commit after `04d06680`; no earlier milestone is squashed and nothing is pushed.
