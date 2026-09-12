# Instant centers and velocity comparison

> **Status:** Built — optional preview and independent velocity backend. Animation, existing graphs, acceleration and force analysis retain their current solver.

In Kinematic Analysis, click the active mode tab again to open Analysis setup. Expand **Instant Centers** and turn on **Show Instant Centers**. The section starts collapsed and the overlay starts off. Fixed and permanent centers use crosses; secondary centers use diamonds. Body `0` denotes ground. Each independently animated machine has its own centers and sampled velocity comparison. Coordinates use the drawing's length unit; angular velocities are in rad/s.

**Show Construction Lines** independently toggles dashed Kennedy lines from the solver's recorded construction pairs. Each secondary center lies at the intersection of its two lines. The lines follow the displayed pose and extend to the edges of the view; a known center at infinity supplies a parallel direction. A line entirely at infinity has no visible segment. Both overlay toggles start off and keep their settings when the setup drawer is reopened. These are instant-center constructions, not center-of-mass calculations.

Use the eye button beside a center to include or exclude it from the overlay. **Select All** and **Clear Selection** apply to all listed machines. All centers are selected initially; the master toggles control whether selected points or their construction lines are drawn. Selecting a secondary center draws only its own two construction lines, using hidden source centers as needed without revealing their markers. Location and velocity tables remain complete. Choices persist through animation, mode changes, drawer reopening, and rebuilds with the same machine identity and body pairs; they are session display preferences, not saved in shared URLs.

## Recovered implementation

The implementation was present in PMKSConversion's history, although absent from its current master checkout:

- [`54ba9bb`](https://github.com/PMKS-Web/PMKSConversion/commit/54ba9bb): primary centers for revolute and sliding joints.
- [`a51399b`](https://github.com/PMKS-Web/PMKSConversion/commit/a51399b): secondary center positions.
- [`773811c`](https://github.com/PMKS-Web/PMKSConversion/commit/773811c): joint and angular velocities using ICs.
- [`0bda849`](https://github.com/PMKS-Web/PMKSConversion/blob/0bda849/src/simulator/Analysis/ICSolver.ts): centers updated as the mechanism moves.

PMKS+ copied that logic in `229a0816`, but never connected it to the application. The unused solver was removed in `6f80e794`. This implementation preserves primary-center seeding, iterative Kennedy construction, and IC velocity relationships, while replacing the old loop-letter indexing, substring pair matching, slope intersections, and shared static maps.

## Backend

`model/mechanism/instant-center-solver.ts` constructs one center per pair of rigid bodies, including ground. Shared-pin compound links and welded slider blocks use the existing rigid-body grouping. A revolute pin supplies a finite primary center. A sliding pair supplies a center at infinity normal to the current slot direction, including a slot on a moving carrier. Grounded frame links collapse into body 0.

For bodies i, j and k, Kennedy's theorem puts I(i,j), I(i,k) and I(j,k) on one line. Two independent such lines locate I(i,j); a newly found center can unlock more constructions. Homogeneous coordinates and cross products handle vertical lines, parallel lines, and translation without infinite floating-point coordinates. Coordinates are translated and scaled before intersection. Coincident or ill-conditioned lines remain unresolved. This construction is not guaranteed to resolve every linkage or singular pose.

`model/mechanism/instant-center-kinematics.ts` uses each ground IC to define a body's velocity field up to one multiplier. Equality of velocities at finite pair centers, relative translation at infinite centers, and the signed prescribed input determine those multipliers. A rank and residual check refuses ambiguous results. The backend returns joint velocities, link center-of-mass velocities, angular velocities, method provenance, and an explicit availability reason. It never calls the closed-loop rate solver or fills a missing IC rate from that solver.

`instantCenterRatesAt(mechanism, sample)` caches by mechanism, sample and input rate. `AnalysisSampleService.sampleAt(..., 'kinematic', 'ic', ...)` supports `Linear Joint Vel`, `Linear Link's CoM Vel`, and `Angular Link Vel`; other properties return no IC series. The existing `'loop'` route is unchanged. Position samples are shared, so this compares two ways to derive rates at the same pose, not two independent position solvers.

## What the preview compares

The outer fold keeps the two canvas switches within reach. **Center Selection**, **IC Velocity Analysis**, and **How the IC Method Works** fold independently and start closed. The analysis section gives the known input rate, angular comparisons, a joint-velocity fold, and a calculation fold for each real link. Nested sections share their parent's inset so charts stay readable on narrow screens.

Each body calculation uses `instant-center-explanation.ts` to substitute the independent IC solution into the shared-center velocity equation and the CoM equation `v = omega × r`. The robust angular substitution is `omega = (-ry*vx + rx*vy)/(rx²+ry²)`, rather than dividing by one possibly zero coordinate. The shared-center substitution checks simultaneously solved rates; it does not claim a separate sequential derivation. Translating bodies show zero angular velocity and a uniform velocity field without a fictitious finite radius. Ground bodies show zero velocity.

The body plot compares angular velocity or CoM speed over up to 361 uniformly indexed samples of the cycle, explicitly labeled as sampled poses. Missing IC rates remain gaps, never current-solver replacements. Curves cache until the mechanism, body, property, units, or sampled input rates/times change. The displayed calculation names its recorded sample and time. Opening a calculation builds its plot; closing it removes the plot. Canvas visibility selection never changes these calculations.

IC analysis is a valid velocity method for planar rigid bodies, not an inherently less valid substitute for closed-loop velocity equations. Construction conditioning and unresolved ground centers limit this implementation; general acceleration needs more than the instantaneous zero-velocity property. PMKSConversion's `determineKinDataICs` used cross products and component ratios, including `-vx/dy`; this implementation preserves those relations while handling vertical and translating cases. The educational derivation is supported by [UPC's planar rigid-body kinematics](https://mec.etseib.upc.edu/en/index.php?title=C5._Rigid_body_kinematics:_planar_motion) and the NPTEL reference below. The maintainer's intended final-analysis path remains the current solver for positions, velocities, accelerations, default graphs, and export; the IC calculation is a separate teaching preview.

The current solver primarily differentiates closed-loop equations and uses position differences where necessary. The preview labels that column **Current solver** rather than promising that every value came from a closed-loop solve. The **Instant centers** column is independently computed. Unavailable values are not shown as zero or silently replaced with current-solver results.

The angular comparison lists real links. The current solver stores zero in a slider block's angular slot even on a moving carrier, so that placeholder is not used as an angular reference. The IC backend gives a floating block its carrier's angular velocity, checked against the cylinder boom's analytical geometry. A positive sliding input means block motion along the slot direction relative to its carrier; incident-body enumeration order must not reverse that convention.

Centers on the canvas and in the location table follow the displayed, interpolated pose. Velocity rows identify the preceding recorded sample on each machine's own clock. Pause or scrub for inspection. Infinity is listed with its direction; unresolved and off-screen centers are explained in the table rather than represented by arbitrary distant points. The preview does not change zoom bounds, mechanism serialization, undo history, playback, export, or the default graph method.

An instantaneous center is a zero-velocity point, not generally a zero-acceleration point. The original method supplies velocities; acceleration is deliberately not labeled as an IC result. See [NPTEL's planar rigid-body kinematics](https://archive.nptel.ac.in/content/storage2/courses/112103109/mod8/lec4/slides/slide11.htm) for velocity construction and moving centers.

## Verification

`instant-center-solver.spec.ts` compares independent IC rates with the existing solver on published four-bar, slider-crank, tracer, six-bar, floating-slot, welded-slider, driven-slider and cylinder fixtures. It also covers centers at infinity, reverse/zero input, scale and translation invariance, ambiguous pair names, missing inputs, collinear singularities, and per-machine caching. `analysis-sample.service.spec.ts` verifies that IC requests do not execute the closed-loop solver or return its accelerations.

`e2e/instant-centers.mjs` exercises the opt-in workflow and records the fold animation and moving overlay. Existing MATLAB solver tests remain the regression guard for the default path.
