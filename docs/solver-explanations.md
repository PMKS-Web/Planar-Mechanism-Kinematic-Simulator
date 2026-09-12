# Analysis: How it works

> **Status:** Reference

Open **Kinematic Analysis → How it works** or **Force Analysis → How it works**, then
**Open Full Worksheet**. The wide worksheet places sketches beside their equations.
The mechanism selector and sample slider use the same machine and pose as the canvas.
**Graphs** keeps the ordinary plots. Escape closes the full worksheet.

The TeachingLab four-bar and slider-crank examples in the Mechanism Library are good
starting points. Move the sample slider to see the constructions and answers change.

## Presentation references

The worksheet follows the supplied notes' sequence: sketch, knowns, vector definitions,
symbolic equations, numerical substitution, and solution. References reviewed were
`Kinematics_TL_4_Bar.pdf`, `Force_Analysis_TL_4_Bar.pdf`, `Kinematics_OTIS_4_Bar.pdf`,
`Force_Analysis_TL_4_Bar Copy.pdf` (the OTIS force example),
`TL_Slider_Crank_Kinematics Copy.pdf`, and `TL_Slider_Crank_Force_Analysis.pdf`.
Their example-specific assumptions do not override the mechanism's settings.

PMKSConversion's earlier educational implementation is on `origin/restructureBackend`,
in `src/app/toolbar/toolbar.component.ts`, especially `changeTabs()`. This worksheet
adapts its isolated-body and equation sequence to the current solvers and UI.

## Force worksheet

- **Definitions:** mechanism sketch, coordinate/gravity assumptions, force and moment
  vectors, cross-product expansion, and names of the unknowns.
- **Free Bodies:** every moving root body, orange reaction arrows, vector force balance,
  vector moment balance about a chosen reference (CoM by default), then scalar x, y, and z equations.
  Expand the numerical details for current loads and actual coefficient rows.
- **System:** the combined bracketed matrix `A x = b`, ordered unknowns, answers, and residual.

Joint-based names such as Aₓ and Bᵧ replace opaque column names. Shared reactions have
opposite signs on their two bodies. **Assumed Directions** shows the sign convention;
**Solved Directions** reverses arrows when the answer is negative. Lengths are schematic.
Both choices describe the same equations and solution.

**Static** sets the force calculation's acceleration terms to zero. **In Motion** uses
current Newton–Euler inertia terms. Ideal slider blocks have two force rows; welded links
form one rigid root body. Fixed bodies are supports. Shared-support and singular-system
notices come from the solver. Gravity acts in negative y when enabled.

The notes' second friction pass is **not implemented**. The worksheet identifies that
limitation and does not add friction forces or torques to the current solution.

Some imported CAD examples specify centers of mass far outside their joint outlines.
To keep the free body legible, the diagram marks a schematic **CoM*** with an explanatory
note. Moment equations still use the specified center without moving it in the model.

Each rigid body's **Moment Reference Point** dropdown includes its joints, tracer points,
CoM, and labeled application points. A blue ring identifies the chosen point. Both axes
have arrowheads, and a curved arrow shows positive counterclockwise z rotation.
The reference is where moments are summed; it need not be a stationary pivot or the
instantaneous center of rotation. In motion, the balance about P is
`ΣM_P = I_CoM α + r_CoM/P × m a_CoM`. The extra term is retained for moving points too.

**Expand the Cross Products** shows each force and arm as columns, the determinant,
the component expansion, numerical vectors, and the resulting moment. A force through
the reference has zero arm. Pure couples contribute directly, independent of reference.
Existing applied-force locations receive names P1, P2, …, skipping names already used
by joints or tracers. The worksheet never moves an applied force when naming its point.

## Kinematic worksheet

- **Position:** grounded coordinates, then every joint in construction order. Input rotation,
  two-circle intersection, circle-line intersection, and rigid-body placement show geometry
  and governing equations. Numerical details include candidates, the selected position,
  and distance error. Tracer points have their own cards.
- **Velocity:** directed closed loops, vector closure differentiated once, expanded cross
  products, grounded zero terms, and the assembled system. Every moving joint and every
  body's center of mass then has its relative-velocity equation and substitution.
- **Acceleration:** the second derivative of closure, tangential and centripetal terms,
  the acceleration system, and individual joint/center-of-mass equations and substitutions.

The position plan is saved when the mechanism is built. Intersection cards reconstruct
candidates from that plan and the selected pose; their answer is the actual solved position.
Circle-line construction uses a parametric guide, including vertical guides. Rigid-body
placements are identified as rigid transforms rather than claimed circle intersections.

Loop sketches include the fixed return vector of the solver's directed ground-to-ground
chain. Sliding edges include relative motion. The view names the actual rate-solving route:
loop matrices, differentiated geometric constraints, or direct rigid-body motion. A numeric
Jacobian walkthrough for the constraint route is still not implemented; its governing
formulas are shown without substituting a loop matrix that the solver did not use.

## Data flow

### Choosing signs and loop paths

**Choose Your Equation Conventions** appears in both worksheets. For forces, choose
each pin's **X Direction** and **Y Direction** independently, or reverse a guide reaction
or input effort. Link previews show the assumed arrows, including the opposite reaction
on the other body. Assumed arrows, vector/scalar equations, substitutions, and solved unknowns
all follow the choice. The physical load components listed beside them keep the world axes.

Kinematic angular values can be clockwise-positive or counterclockwise-positive, either
for all links together or separately under **Choose Angular Directions per Link**. The
known input follows its link's choice too. World x/y velocities and accelerations keep
their coordinate directions. Clockwise-positive angular values acquire a minus sign when
converted to the positive-z cross products.

In **Velocity** or **Acceleration**, **Reverse Loop** reverses a closed path. **Loop Path**
is a dropdown of closed paths through the mechanism. Choosing one replaces that loop
immediately; Jansen's second loop can use the internal path `A → B → C → E → D → A`.
The sketch, closure, differentiated equations, and both matrices update together.

The model checks connectivity, closure, and independence. Dependent paths are labeled
and disabled. Disconnected paths are not offered. Ground connections may close a path, but an internal closed
loop need not touch ground. Paths outside the current solver's loop space are refused.
Changing the loop basis is offered only when the rates use the loop solver.
The body/joint graph supplies simple cycles, avoiding false tracer triangles within a
single rigid body. Large searches are bounded at 30,000 visits or 512 cycles; the menu
states when this limit is reached and always considers the current loops.

These are worksheet presentation choices. They do not change graph axes, applied loads,
input motion, or the physical solution. Choices survive scrubbing, switching analysis
sections, and closing/reopening the worksheet. They are isolated per solved mechanism,
reset when that mechanism is rebuilt/reloaded, and are not saved in a shared URL.
**Reset Worksheet Conventions** restores all of that mechanism's worksheet defaults.

For force or angular signs, a diagonal sign matrix D gives `A′ = A D` and `x′ = D x`,
so `A′ x′ = b`. For loop paths, signed body/joint incidences express the chosen basis in
the original basis. Applying the same row combinations to both A and b preserves the
solution; the combined transformation is `A′ = (C ⊗ I₂) A D`, `b′ = (C ⊗ I₂) b`.
Independence is checked with signed real elimination, not unsigned cycle membership.
The production solver keeps its existing basis; the worksheet presents equivalent equations.

The models include `worksheet-conventions.ts`, `worksheet-loops.ts`, `worksheet-loop-options.ts`,
`force-reference.ts`, and `force-body-equations.ts` under
`src/app/model/mechanism/`. `WorksheetPreferencesService` shares the choices between
the panel and dialog. The controls reuse `button-block` and `segmented-block` (including
its dropdown variant), with isolated states under **Analysis** and **Choices** in Storybook.

### Solver snapshots

`Mechanism.getForceAnalysis(mode)` retains its cached frames and
`jointReactionsByLink: Map<jointId, Map<bodyId, [Fx, Fy]>>`. `ForceSolver.explainAt()` uses
the same assembly and solve with optional capture of `A`, `b`, `x`, column order, body row
offsets, geometry, loads, and inertia. Column/sign metadata connects body arrows to global
unknowns. `displayForceSystem()` applies the graph sampler's moment-scale normalization;
displayed forces are N and moments N·m. Solver arithmetic and graph values are preserved.

`KinematicsSolver` snapshots its actual velocity and acceleration matrices immediately
after solving, including column order. `SolverExplanationService` also copies its joint
and body-center velocity/acceleration maps, omega, and alpha. Those maps drive individual
joint and center-of-mass derivations.

Before inspecting a frame, the service restores that machine's solver state. The panel
caches by machine, pose revision, sample, force mode, and arrow choice. Full systems are
captured on request, not stored for every precomputed frame.

| Responsibility | File |
| --- | --- |
| Entry and deferred loading | `src/app/component/analysis-panel/analysis-panel.component.html` |
| Worksheet, SVG diagrams, matrix display | `src/app/component/solver-explanation/` |
| Joint-named force equations | `src/app/model/mechanism/force-worksheet.ts` |
| Loop and relative-motion derivations | `src/app/model/mechanism/kinematic-worksheet.ts` |
| Snapshot types | `src/app/model/mechanism/solver-explanation.ts` |
| Per-sample access, intersections, units | `src/app/services/solver-explanation.service.ts` |
| Optional solver capture | `force-solver.ts`, `kinematic-solver.ts`, `position-solver.ts` in `src/app/model/mechanism/` |

Equations use KaTeX, loaded with the worksheet. Joint names are escaped and rendering
uses `trust: false`. Wide equations scroll within their container, including on phones.
Displayed numbers are rounded; residuals use original values.

## Validation and preview

`solver-explanation.service.spec.ts` checks force-cache agreement, load balances, matrix
residuals, unchanged loop rates, circle candidates, saved plans, and machine restoration.
`worksheet.spec.ts` checks equation rendering, reaction signs, every TeachingLab joint/center
relative-motion equation, and slider intersection candidates.

`worksheet-conventions.spec.ts` re-solves transformed matrices, checks physical-load
invariance and mixed angular directions, validates alternative Jansen bases, refuses
dependent paths, and checks preference isolation/reset. `node e2e/worksheet-conventions.mjs`
checks those controls in Chrome, including dialog persistence, a sign-change filmstrip,
and phone layout. Its evidence is in `artifacts/worksheet-conventions/`.
`force-reference.spec.ts` re-solves independent component conventions about every available
point, independently totals physical moments, checks cross-product typesetting, and tests
application-point names and the loop dropdown catalog.

With the dev server running, `node e2e/solver-explanation.mjs` checks TeachingLab worksheets,
multi-machine selection, the constraint route, scrubbing, dismissal, reduced motion, and
phone layout. It uses disposable Chrome and writes screenshots, a scrub filmstrip/contact
sheet, and a JSON report under `artifacts/solver-worksheet/` (gitignored).

From the repository root, `npm start` serves `http://localhost:4200/` with a compatible Node.
On this Windows setup, use the compatible portable Node directly:

```powershell
& 'C:\Users\adg66\.cache\pmks-tools\node_modules\node\bin\node.exe' node_modules/@angular/cli/bin/ng.js serve --host localhost --port 4200
```
