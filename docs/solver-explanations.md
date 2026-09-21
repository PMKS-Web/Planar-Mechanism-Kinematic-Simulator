# Analysis: How it works

> **Status:** Reference

Enter **Kinematic Analysis** or **Force Analysis**, then use **How It Works** in the
top-right toolbar. The explanation opens in the right-side drawer; graphs remain on the left.
**Open Full Worksheet** places sketches beside their equations in a wider dialog.
The mechanism selector and sample slider use the same machine and pose as the canvas.
Escape closes the full worksheet and leaves its drawer available.

Force analysis opens on Free Bodies, with the first complete FBD and its numbered equations
visible. Mechanism notes, per-body assumptions, and cross products remain collapsible. Open sections
remain open while changing signs, gravity, force mode, or sample.

**Worksheet Gravity** defaults to the document setting and can include or exclude weight
for comparison. This recomputes the worksheet's forces, arrows, and matrices while the graphs
continue using **Settings → Gravity**. Returning to **Use Settings** restores agreement.
The comparison is shared between panel and dialog and resets with the worksheet preferences.
It is not saved into a shared mechanism URL.

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

- **Definitions:** a mechanism-independent, collapsible walkthrough with no sample, settings, or
  convention controls. Force and moment balances each begin with the dynamic equation, followed by
  collapsible component and assumption details. The force assumptions make gravity and the static
  condition explicit; static equations follow by setting a and alpha to zero. A two-point sketch
  introduces a force creating a moment before a slanted bar AB FBD is built with centered CoM,
  weight W_ab, and applied force F_1. The variables include position vectors to A, B, P, and CoM.
  The walkthrough then builds separate x-force, y-force, and z-moment equations. The
  moment-reference control updates the selected point, symbolic equation, and an external component
  grid for every r vector for A, CoM, or B. The moment expansion appears with that grid, where the
  required visual context exists.
- **Free Bodies:** every moving root body, orange reaction arrows, vector force balance,
  vector moment balance about a chosen reference (CoM by default), then scalar x, y, and z equations.
  Choose force-component/couple directions and the moment reference directly on each isolated
  body. No separate list of joint convention cards or substitution/check section is shown.
- **System:** repeat the numbered equations from Free Bodies, then show `A X = B` with equation
  numbers beside A's rows and unknown names above its columns. Show X, B, solved unknowns, and
  residual; no separate Equation Row Order list. Mechanism & Assumptions remains available.

Joint-based names such as Aₓ and Bᵧ replace opaque column names. Shared reactions have
opposite signs on their two bodies. **Assumed Directions** shows the sign convention;
**Solved Directions** reverses arrows when the answer is negative. Lengths are schematic.
Both choices describe the same equations and solution.

**Static** sets the force calculation's acceleration terms to zero. **In Motion** uses
current Newton–Euler inertia terms. Ideal slider blocks have two force rows; welded links
form one rigid root body. Fixed bodies are supports. Shared-support and singular-system
notices come from the solver. Gravity remains physically downward when enabled.
The mode is reactive, including a change made while the full worksheet is open.
**X-Axis Angle** under **Mechanism & Assumptions** rotates one right-handed frame for the entire
force worksheet. Zero degrees is right/up; positive angles turn counterclockwise, and +y stays
90 degrees from +x. Diagrams retain the mechanism's world pose while their axis arrows, force
components, moment arms, equations, and matrix use the chosen frame. Gravity is resolved into
those axes. Pin-force pairs change coordinates together; guide normals remain physically constrained.
This preference is shared by the drawer and dialog, resets with conventions, and does not change graph axes.
**Acceleration Terms at This Sample** shows the actual `m a_CoM` and `I_CoM α` used in
the solve. Turning gravity off does not turn inertia off. A zero mass, inertia, or acceleration
can give a zero inertia term; unavailable solves retain their explicit diagnostic.

Free-body diagram frames depend on geometry with equal arrow clearance in every direction.
Changing an assumed force/couple sign or switching to solved arrows does not recenter or resize
the body. Changing the mechanism's sample still changes its physical pose.

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

**Expand the Cross Products** shows an arm sketch from the reference to the application point,
with signed r_x/r_y steps in the chosen frame and their distances in meters. It then shows force
and arm columns, the determinant, and the component expansion. Only distances are substituted:
force symbols remain unknown until System solves them. A force applied at the reference has zero
arm. Pure couples contribute directly, independent of reference.
SVG labels are measured after rendering and moved to nearby free positions to reduce overlap.
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

For forces, expand **Choose Assumptions for [body]** beneath that body's FBD. Choose X/Y
directions independently or reverse a guide reaction or input couple. The labels describe
arrows on this body, including when it is the negative side of a shared reaction; the other
body updates with the opposite sign. Assumed arrows, vector/scalar equations, and solved
unknowns all follow the choice without changing physical loads.

**Choose Your Equation Conventions** remains in the kinematic worksheet.

Kinematic angular values can be clockwise-positive or counterclockwise-positive, either
for all links together or separately under **Choose Angular Directions per Link**. The
known input follows its link's choice too. World x/y velocities and accelerations keep
their coordinate directions. Clockwise-positive angular values acquire a minus sign when
converted to the positive-z cross products.

The mechanism sketch and **Choose Your Equation Conventions** show a curved positive-direction
arrow for every link, labeled with its ID, ω, and α. Global and per-link choices update these
arrows immediately while the body geometry stays fixed. Expand a link under **Choose Angular
Directions per Link** for an isolated sketch, the conversion to a +z vector, and the current
signed angular values. These are reference directions, not animations of the actual motion;
the arc's location does not identify a pivot. Negative values point opposite the reference.

Force worksheets open on **Free Bodies**, with the first body expanded. Each body presents its
complete FBD beside its two or three scalar balance equations. **Read the FBD** highlights the
X, Y, or moment contributions and the matching equation without changing geometry or the solve.
Moment highlighting includes pure couples and forces with a nonzero perpendicular arm to the
selected reference. A force whose line of action passes through that point is gray. Slanted force arrows
can contribute to both X and Y. **How the Vectors Become These Equations** keeps vector balances
and cross-product expansions underneath. Force directions, input moment direction, moment references,
and force points stay together in each body's collapsible assumptions. **Assemble & Solve** continues
from these numbered body equations to the shared system.

In **Velocity** or **Acceleration**, **Reverse Loop** reverses a closed path. **Loop Path**
is a dropdown of closed paths through the mechanism. Choosing one replaces that loop
immediately; Jansen's second loop can use the internal path `A → B → C → E → D → A`.
The sketch, closure, differentiated equations, and both matrices update together.

Loop sketches retain the **full mechanism** in gray and number the directed vectors in the
selected path. **Trace the Loop** and **Follow Next Vector** highlight one vector in orange
and build the partial vector sum alongside the sketch. The last step returns to the starting
joint and gives zero closure. The dashed leg is the ground return. Reversing or replacing a
path restarts the trace; changing the sample keeps the chosen step. The mechanism framing stays
fixed when changing paths, so an internal loop remains visibly located within the full linkage.

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
The gravity comparison described above is the separate choice that changes the worksheet's
weight loads; it leaves document settings and graph caches intact.

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
`node e2e/force-worksheet-usability.mjs` checks collapsed defaults, immediate mode changes,
gravity comparisons, inertia retention, graph isolation, unchanged SVG geometry on force/couple
reversals, and phone layout. Its screenshots and arrow-change filmstrip are under
`artifacts/force-worksheet-usability/`.
`node e2e/kinematic-visuals.mjs` checks angular-reference arrows, per-link choices, unchanged
body geometry, full-mechanism context, each trace step, closure, reversed and internal paths,
signed equations, and phone layout. Screenshots and an angular-change filmstrip are under
`artifacts/kinematic-visuals/`. Storybook has **Analysis/Angular Reference** and **Analysis/Trace a Loop**.
`node e2e/force-diagram-equations.mjs` checks the FBD-first entry, visible balance equations,
axis highlighting, unchanged geometry, sign/reference changes, static and dynamic balances,
system navigation, slider rows, and phone layout. Storybook has **Analysis/From FBD to Equations**.
`node e2e/worksheet-layout.mjs` checks the right drawer, independent definitions, reciprocal
per-body controls, consistent equation numbers, matrix headers, and phone layout. Its drawer
filmstrip and screenshots are in `artifacts/worksheet-layout/`. Storybook also contains
**Analysis/Force Definitions** and **Analysis/Numbered Force Matrix**.

With the dev server running, `node e2e/solver-explanation.mjs` checks TeachingLab worksheets,
multi-machine selection, the constraint route, scrubbing, dismissal, reduced motion, and
phone layout. It uses disposable Chrome and writes screenshots, a scrub filmstrip/contact
sheet, and a JSON report under `artifacts/solver-worksheet/` (gitignored).

From the repository root, `npm start` serves `http://localhost:4200/` with a compatible Node.
On this Windows setup, use the compatible portable Node directly:

```powershell
& 'C:\Users\adg66\.cache\pmks-tools\node_modules\node\bin\node.exe' node_modules/@angular/cli/bin/ng.js serve --host localhost --port 4200
```
