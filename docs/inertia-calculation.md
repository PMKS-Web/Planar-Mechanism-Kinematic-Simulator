# Mass properties and their visible working

> **Status:** Reference — the calculation used by the model, its coordinate frames, and the explanation's scope.

## What is integrated

`model/uniform-body.ts` derives mass geometry from joint positions. Two joints (or a collinear hull) define a uniform slender rod between the farthest pair. Three or more noncollinear hull vertices define a uniform straight-edged convex plate. Coincident points define a point mass. Interior joints add no material. `model/mass-properties.ts` combines welded members using their masses, centers, centroidal inertias, and parallel-axis terms; member overrides are retained.

`model/link.ts` also constructs curved drawing/export outlines: caps, fillets, and optional disc outlines. Those outlines are real renderer/CAD geometry, but are **not mass geometry**. Object Scale and rounded display boundaries do not change the automatic mass properties. There is no curved mass integration and no tessellation approximation in this calculation. Consequently an analytical curved-body benchmark would test a model PMKS does not use. A user who wants a real disc's inertia must supply its mass properties.

## Why the first local vertex is zero

The convex hull is ordered counterclockwise. The integrator takes its first vertex as O and subtracts O from every grid vertex:

\[
x_i^{local}=x_i^{grid}-O_x^{grid}
\]
\[
y_i^{local}=y_i^{grid}-O_y^{grid}
\]

Thus the first local vertex is exactly (0,0), even when its grid position is not. This was a labeling problem, not a coordinate calculation bug. Subtracting the origin reduces cancellation in second moments when a small body is far from the grid origin.

These local axes are **parallel to the grid**, not rotating body axes. The current grid pose supplies the geometry; no extra body rotation is applied in this integrator. As a body turns, the lexicographically first hull vertex and the vertex numbering can change. The UI names the corresponding joint and shows both coordinate frames. Adding O transforms the local centroid back to the grid. Barred coordinates denote the centroid relative to O.

Grid x points right and y points up. Positive angular motion and positive out-of-plane moment are counterclockwise. Rigid translation and planar rotation preserve scalar centroidal inertia. Reshaping the skeleton, changing its mass, or changing member properties can change it.

## Exact polygon formulas

In the equations below x and y are local, j is the next vertex, and the last edge closes to vertex 1. The integrator retains its unrounded per-edge terms; the UI reads those same terms. The displayed split into Jx and Jy is the two parts of that same polar polynomial, not a second integration of an outline.

\[
c_i=x_i y_j-x_j y_i
\]
\[
A_i=\frac{c_i}{2}
\]
\[
A=\sum_i A_i
\]
\[
S_{x,i}=\frac{(x_i+x_j)c_i}{6}
\]
\[
S_{y,i}=\frac{(y_i+y_j)c_i}{6}
\]
\[
\bar{x}=\frac{\sum_i S_{x,i}}{A}
\]
\[
\bar{y}=\frac{\sum_i S_{y,i}}{A}
\]

Sx means the integral of x over area, and Sy the integral of y over area. These first moments have units of length cubed.

\[
Q_{x,i}=x_i^2+x_ix_j+x_j^2
\]
\[
Q_{y,i}=y_i^2+y_iy_j+y_j^2
\]
\[
\Delta J_{x,i}=\frac{c_i Q_{y,i}}{12}
\]
\[
\Delta J_{y,i}=\frac{c_i Q_{x,i}}{12}
\]
\[
J_O=\sum_i(\Delta J_{x,i}+\Delta J_{y,i})
\]
\[
I_O=\frac{m}{A}J_O
\]
\[
I_G=m\left(\frac{J_O}{A}-\bar{x}^2-\bar{y}^2\right)
\]

J is an area moment (length to the fourth power); I is mass moment (mass times length squared). Uniform density is assumed. Zero edge terms are retained and explained, including the closing edge. UI values use six significant digits; sums use unrounded terms.

The existing degeneracy criterion treats an area smaller than `1e-9 * max(span**2, 1)` in model units as a rod. The squared radius of gyration is clamped to zero against negative roundoff. The editable model uses `MODEL_SCALE`; project-unit lengths divide by that scale, and SI conversion uses the shared unit factors.

### A rod and its endpoint

The calculation measures L between the farthest two joints. For the gallery's 12 g, 5 cm rod:

\[
I_G=\frac{mL^2}{12}=25\,\mathrm{g}\cdot\mathrm{cm}^2
\]
\[
d=\frac{L}{2}=2.5\,\mathrm{cm}
\]
\[
I_{\mathrm{end}}=\frac{mL^2}{12}+m\left(\frac{L}{2}\right)^2
\]
\[
I_{\mathrm{end}}=\frac{mL^2}{3}=100\,\mathrm{g}\cdot\mathrm{cm}^2
\]

This worked result is the automatic rod estimate. Custom properties remain the values used by the solver.

### Area moment versus mass moment

J is a polar **area** second moment; I is a **mass** moment. The uniform areal mass density is:

\[
[J_O]=L^4
\]
\[
[I_G]=ML^2
\]
\[
\rho_A=\frac{m}{A}
\]
\[
I_O=\rho_A J_O=\frac{m}{A}J_O
\]

This accurately describes the implementation: `polarOverMass` is the geometric ratio J/A, and `mass-properties.ts` multiplies the centroidal squared radius by the supplied mass and unit factor. No material density or plate thickness is inferred.

## A selected parallel axis

G is the CoM, and P is a current joint or the grid origin. The UI shows P's name/type, grid coordinates of G and P, displacement from G to P, and separation:

\[
\Delta x=x_P-x_G
\]
\[
\Delta y=y_P-y_G
\]
\[
d^2=(\Delta x)^2+(\Delta y)^2
\]
\[
I_P=I_G+md^2
\]

The axes must be parallel and G must be the center-of-mass axis for the supplied mass distribution. The calculator refuses a numerical shift when a relocated custom CoM is paired with the automatic uniform-centroid inertia. It cannot independently validate a user's custom mass distribution.

The ephemeral grid overlay marks G with a circle and P with a square, connects them, and labels d. It reads current pose objects so seeking/playback changes the coordinates and mark positions. Closing the axis explanation removes it. Selection never changes the solver's stored inertia, undo history, or shared URL.

## Force moments are a different calculation

`model/mechanism/force-solver.ts` assembles x/y force equations and a moment equation about each extended body's CoM. Reaction coefficients use joint-to-CoM arms; applied loads use application-to-CoM arms. Drive and supported constraint couples enter the moment row. Gravity acts at G and contributes to force balance. Dynamic right-hand sides are `m aG` and `IG alpha`; static acceleration terms are zero. Solver frames have project-unit coordinates and are converted to SI for the matrix.

`model/force-moment.ts` is now the shared signed cross-product helper for solver applied-force terms and the explanation:

\[
M_{P,i}=(x_i-x_P)F_{iy}-(y_i-y_P)F_{ix}
\]
\[
\sum M_P=\sum_i M_{P,i}+\sum_i C_i
\]

The numerical contribution panel shows **applied loads plus enabled gravity only**, in N and meters after shared unit conversion. Each row shows the application point, arm components, force components, substitution and sign. Its final value is explicitly an applied-load subtotal. It does not fabricate unknown reactions or drive/constraint couples, nor label that subtotal as the complete external moment balance. Force Analysis remains the source for solved reactions and effort. Opening an applied-force row highlights its force and arm on the grid; gravity has no applied-force arrow.

The complete Newton–Euler balance at G is `sum MG = IG alpha`. With r directed **from P to G**, opposite to the displayed displacement, its instantaneous equivalent at P is:

\[
\sum M_P=I_G\alpha+m(r_x a_{G,y}-r_y a_{G,x})
\]

If P is a material point fixed on the body, this can also be written:

\[
\sum M_P=I_P\alpha+m(r_x a_{P,y}-r_y a_{P,x})
\]

Only when the extra term vanishes may that reduce to `sum MP = IP alpha`. The UI specializes to a grounded revolute point on the body, whose acceleration is zero. A grid origin is not automatically a stationary material pivot, and instantaneous zero velocity is insufficient. These are instantaneous moment balances, not an assertion that angular momentum about every moving point has derivative `IP alpha`. See [MIT's 2D rigid-body dynamics lecture](https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/befffaf20475c1a379c3ac52e91a78cb_MIT16_07F09_Lec21.pdf).

## Validation and implementation boundaries

`inertia-trace.spec.ts` tests rectangle and asymmetric triangle analytical values, nonzero grid origins, translated/rotated copies, per-edge area/first-moment/polar sums, a known (3, 4) offset, force signs, translation invariance, SI scaling, and gravity inclusion. The presentation spec parses every edge equation and checks that local zero is accompanied by the nonzero grid coordinate. Existing solver/MATLAB regression cases remain in the full unit suite.

Gallery additions are Translated Plate, Rotated Plate, Asymmetric Triangle, and Applied Loads under Feedback / Inertia Explanation. `e2e/inertia-explanation.mjs` checks the app, current CoM, axis changes/motion, force highlighting, disclosure cleanup, equation layout, nested pieces, and gallery examples. Screenshots and filmstrips are written to `artifacts/inertia-explanation/`.

The new-grid line ceiling increases by exactly two declarations: one overlay import and one standalone component registration. The overlay implementation lives entirely in its own component and ephemeral service; no new calculation or interaction behavior was added to the grid hub.

## Seeing the mass domain

The result now names the automatic model even with the detailed explanation folded. **Mass Model Being Used** states what is integrated and offers **Show Mass Geometry**. The dashed rod segment or plate boundary overlays the existing drawing; a point gets a location marker. Welded members are numbered separately, matching the member explanations. Marker radius and line width are for visibility only. Custom properties are explicitly labeled: a custom inertia or CoM need not describe this automatic geometry.

The overlay reads the actual integrator's endpoints or hull, so it follows current poses without a second geometry algorithm. It is ephemeral: closing its disclosure, closing the outer explanation, or destroying the panel clears it. It does not write selection, solver state, history, or URLs. Two panels share one mass preview; the most recently interacted panel owns it, independently of the G/P preview.

**Interior Joint** in the gallery shows rectangle ABCD, 6 cm by 2 cm, with E inside. Moving E from (3, 1) to (4, 1.5) cm preserves the 12 cm² hull, G = (3, 1) cm and I_G = 40 g·cm² for 12 g. A concave traversal of these joint locations still produces the convex hull: link joints are an unordered skeleton, not an authored boundary. This model cannot represent a concave mass domain. Other examples compare the visible rounded outline with a slender rod, recover its endpoint inertia, and show welded decomposition and coincident geometry. Translated/rotated examples remain.

See [future mass geometry options](mass-geometry-design.md) for the architecture investigation and recommendation; no physical-shape redesign is part of this feature.
