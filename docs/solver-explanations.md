# Analysis: How it works

Open **Force Analysis → How it works** or **Kinematic Analysis → How it works**.
The mechanism selector and sample slider choose the same mechanism and pose used by the
canvas. The ordinary charts remain under **Graphs**.

For a first look, use the **Punch Press** library example for forces, and **4-Bar** for
vector loops and two-circle position construction. Scrub away from the initial pose to
see the coefficients and diagrams change.

## What moved from PMKSConversion

The educational walkthrough is present on PMKSConversion's `origin/restructureBackend`
branch, particularly `src/app/toolbar/toolbar.component.ts` in `changeTabs()` and its
force/kinematic cases. It isolates links, builds force arrows, and uses the force solver's
matrix and index maps to write equations. Looking only at Conversion's `master` misses
this implementation.

This version adapts that teaching sequence to the current Angular analysis panel and
current solvers. It does not run the old solver beside the new one.

## Force data: maps and a matrix

`Mechanism.getForceAnalysis(mode)` supplies the existing cached frames. Each frame has
`jointReactionsByLink: Map<jointId, Map<bodyId, [Fx, Fy]>>`, a default joint-reaction map,
guide couples, input effort, and solve status. The per-body map matters: the reaction on
one side of a pin has the opposite sign on the other side.

`ForceSolver.explainAt()` runs the selected frame through the same assembly and solve
used by those frames, with explanation capture enabled. It records:

- The actual `A`, `b`, solved `x`, and ordered unknown labels.
- Each moving root body's row offsets, joint positions, and center of mass G.
- Applied forces, gravity, pin/guide reactions, guide couples, and input effort.
- The known-load sum and inertia term for each body row.

The force panel draws each body's free-body diagram and displays its x/y force equations
and z moment equation about **G**. In-motion analysis uses the solver's Newton–Euler
inertia terms. Ideal slider blocks have two force rows; fixed frame bodies are identified
as supports without independent equilibrium rows. Welded links are one rigid root body.

Below the bodies, expand **Force matrix and solution** to see the combined system and
solved unknowns. Shared-support solutions retain the solver's notice about the even load
split. Invalid or singular frames display the solver's reason instead of a previous frame's
free-body solution.

The arrows indicate the solved direction and have schematic lengths. Zero-valued loads
stay in the list but have no arrow. The view uses N and N·m. `displayForceSystem()` applies
the same internal moment-scale normalization used by the analysis sampler, rescaling both
rows and moment columns so the displayed equation still satisfies `A x = b`. This change
preserves the existing force arithmetic and graph values.

## Kinematics: loops where the solver uses loops

`KinematicsSolver` still assembles velocity and acceleration matrices for its loop route,
then puts the solved rates into joint/link maps. With capture enabled, it snapshots the
two systems immediately after solving, alongside the **actual ordered unknown list**.
The new UI does not guess column order from a different map.

For that route the panel displays:

1. Directed vectors for every required loop, including its ground closure.
2. The x and y position-closure sums at this pose.
3. The velocity and acceleration equations with this pose's coefficients.
4. The two combined matrices and their solved unknowns.

Current `Loop` objects are directed ground-to-ground chains; the drawing adds the fixed
return vector to close them. Sliding edges are marked, and the differentiated equations
include relative sliding motion. Angular unknowns are in radians; linear terms use the
mechanism's length unit. Values shown on screen are rounded, while residuals use the
unrounded snapshot.

The solver can also use differentiated geometric constraints or direct rigid-body motion.
The panel names that route and shows its governing formulas. **A numeric Jacobian
walkthrough for the constraint route is not implemented here.** It does not substitute a
loop matrix when that is not the system used for the rates.

## Position: actual construction steps

`PositionSolver.explanationPlan()` copies the construction order, method, reference joints,
and rigid distances into `Mechanism.positionExplanation` when a mechanism is built.
This preserves the plan before the next machine overwrites the solver's static maps.
All joints in a simultaneous step retain that step's method.

**Position steps** lists this order. For every recorded two-circle step, the service uses
the selected frame's two known centers and the recorded rigid lengths to reconstruct
both intersections. The diagram labels the selected intersection with its joint ID;
the text shows centers, radii, circle equations, candidate coordinates, selected coordinates,
and radius error.

The solver normally follows the candidate nearest its previous position. Coincident
centers use its existing motion-continuity rule; sample zero is the initial drawing.
Circle-line, rigid-body, and simultaneous steps are named in the order list, but do not
yet have individual geometric walkthrough cards. Fully coupled solves are identified
explicitly rather than depicted as two-circle constructions.

## Code map and validation

| Responsibility | File |
| --- | --- |
| Entry toggle | `src/app/component/analysis-panel/analysis-panel.component.html` |
| Panel, diagrams, matrix rendering | `src/app/component/solver-explanation/` |
| Snapshot types | `src/app/model/mechanism/solver-explanation.ts` |
| Per-sample access and display units | `src/app/services/solver-explanation.service.ts` |
| Force assembly capture | `src/app/model/mechanism/force-solver.ts` |
| Rate matrix capture | `src/app/model/mechanism/kinematic-solver.ts` |
| Saved construction plan | `src/app/model/mechanism/position-solver.ts`, `mechanism.ts` |

The service calls `mechanism.prepareSolvers()` before an inspected solve to restore that
machine's drive state and loops. The panel caches its explanation by mechanism, pose
revision, sample, and force mode. Full equation snapshots are captured only on request,
not stored for every precomputed frame.

`solver-explanation.service.spec.ts` checks force-cache agreement, balance of the drawn
loads, matrix residuals, unchanged loop rates, two-circle candidates, saved construction
plans, and route restoration. Existing six-bar, force-analysis, force-fixture, and sample
service tests cover the arithmetic that the instrumentation observes.

`node e2e/solver-explanation.mjs` checks the running development build using a disposable
Chrome profile. It covers the punch press, four-bar, two independently selectable
four-bars, a cylinder-driven boom, sample scrubbing, and phone layout. Screenshots, the
scrub filmstrip/contact sheet, and a JSON report are written under
`artifacts/solver-explanation/` (gitignored).

On this Windows installation, a compatible portable Node is installed at
`C:\Users\adg66\.cache\pmks-tools\node_modules\node\bin\node.exe`.
From the PMKS repository, start the preview with:

```powershell
& 'C:\Users\adg66\.cache\pmks-tools\node_modules\node\bin\node.exe' node_modules/@angular/cli/bin/ng.js serve --host localhost --port 4200
```

Then open `http://localhost:4200/`. If using a normally installed compatible Node,
`npm start` performs the same development-server task.
