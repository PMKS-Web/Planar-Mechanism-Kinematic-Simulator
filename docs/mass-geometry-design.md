# Future physical mass geometry

> **Status:** Design investigation — recommendation only. Parametric shapes and outline integration are not implemented.

## What PMKS currently does

The automatic model is an intentional idealization, not an accidental use of the easiest available path. Commit `1b38e59b2502256ee7b5dee10499077fe9aa0868` introduced the skeleton-derived properties and explicitly rejected dependence on Object Scale. Its predecessor kept user-supplied inertia and the joint-average center; this change added an educational approximation while preserving custom values and old URLs. The opening comment in [`uniform-body.ts`](../src/app/model/uniform-body.ts) records the same reason today.

The current mass domain is a slender rod, convex plate, point mass, or member-wise welded combination. Mass is supplied, not inferred from material or volume. Custom CoM/inertia can represent a different distribution, but PMKS cannot reconstruct that distribution from those few numbers. The solver already consumes mass, CoM and centroidal inertia; it need not know whether they came from a rod, a physical shape, or a measurement.

### Data already available

| Data | Current meaning | Suitability as physical mass input |
| --- | --- | --- |
| Joint positions, membership, held length/angle | Editable mechanism geometry and constraints | Useful anchors and dimensions; joint order is not an authored polygon boundary. Interior joints do not imply added material. |
| Object Scale | Document-wide visual sizing in model units, saved with settings; influences joints, bar half-width/caps, glyphs and other drawn objects | Not a per-link physical dimension. It must not silently change mass integration. |
| Bar width and caps | `link.ts` uses half-width/cap radius `objectScale / 4`; DXF `linkBodyWidth()` returns `objectScale / 2` | Generated drawing dimensions, not an independent width field or material specification. |
| SVG `d`, `externalLines`, `initialExternalLines` | Cached/lazily realized display paths, lines and arcs; copies transport visual geometry across poses | Useful rendering output; unsuitable as the authoritative physical model. Reading artwork can realize caches, and drawing choices can change it. |
| Rounded boundaries and fillets | Automatic offset/corner construction; compound paths have their own union/smoothing representation | No authored physical fillet dimensions. They must not implicitly add material or merge welded masses. |
| Disc flag | `isCircle` requests a drawn disc only when a single grounded pivot allows it. Radius is maximum joint reach plus the display cap radius | A presentation choice, not a stored physical disc radius. Losing its eligible pivot can restore the bar drawing. |
| CAD `outlineLoops()` | Closed loops with line/arc bulges for simple links; sampled polygon rings for compounds | Promising transport format for planar boundaries, but currently exports the drawing. A manufacturing starting sketch is not yet a mass-property contract. |
| Export pin holes | Export options supply pin radius, with default derived from displayed width; welded joints receive marks instead of pin holes | Export-only hole choices do not remove mass in the simulator. Reusing them would make inertia depend on an export dialog. |
| Welded subsets | Separate member masses, CoMs and inertias plus parallel-axis terms | Preserve member decomposition. Current mass sums count each member, including overlapping domains; a visual union is a different physical assumption. |
| Cylinder dimensions/skin | Stored linkage geometry plus generated bore/head/rod dimensions; Object Scale affects bore size and stroke clearances | Specialized geometry is available, but is not a material/volume model or an automatic cylinder inertia model. |
| User geometry | Users arrange joints, add members and tracer points, and choose display shapes | No supported arbitrary physical polygon editor, CAD boundary import, material database, density, wall thickness or cross-section property was found in the mass model/URL schema. Commented-out `Shape`/`Bound` fields are not implemented data. |

Relevant implementation: [`link.ts`](../src/app/model/link.ts), [`settings.service.ts`](../src/app/services/settings.service.ts), [`settings-panel.component.ts`](../src/app/component/settings-panel/settings-panel.component.ts), [`link-bodies.ts`](../src/app/services/export/dxf/link-bodies.ts), [`dxf-options.ts`](../src/app/services/export/dxf/dxf-options.ts), [`cylinder.ts`](../src/app/model/cylinder.ts), and [`transcoder-data.ts`](../src/app/services/transcoding/transcoder-data.ts).

Object Scale deserves one qualification: although it does not enter automatic mass integration, it is not purely cosmetic across the entire application. `cylinderStrokeAlong()` uses a bore radius derived from it to enforce drawable travel clearances. A future physical-geometry effort should explicitly separate those clearances from presentation sizing too; this pass does not change cylinder behavior.

## What would be physically more representative

A finite-width rectangular body or actual circular body can represent its intended manufactured part better than the skeleton approximation, provided the dimensions and mass distribution are known. A rounded-ended bar also differs from a rectangle; calling all thick-looking links rectangular would just substitute a new hidden approximation.

For planar rotation about the out-of-plane centroidal axis, a uniform extrusion's thickness does not change inertia when total mass and planar outline are held fixed: distance to that axis depends only on x and y. Thickness matters when computing mass from volumetric density, for nonuniform material, and for other inertia axes. A cross-section input needs an explicit physical meaning rather than a thickness field that appears to change this particular inertia by itself.

True concavity, holes, cutouts and curved boundaries need an authored mass domain. Geometry alone is still insufficient for nonuniform density, multiple materials or a lumped attachment. A visually accurate silhouette is no guarantee of correct inertia.

## Recommended direction

**A: Keep the current automatic approximation as the default and a clearly named option.** It is useful for teaching and quick mechanism design, has no missing dimensional inputs, and preserves existing models. Keep independent custom properties for measured/CAD-derived results.

**B: Add opt-in parametric physical shapes in a separate feature first.** Start with explicitly dimensioned uniform rectangles and discs, then a capsule/rounded bar if needed. This offers recognizable assumptions, closed-form analytical benchmarks, and a manageable editor. Label total-mass mode separately from any eventual density-and-thickness mode. Do not infer physical width or radius from Object Scale.

**C: Eventually support an explicit physical outline if users need imported or authored parts.** Build it on the same mass-domain interface as B. Do not wire the mass calculator to the current renderer/CAD output. Instead, render and export the physical model, optionally with separate visual aids. This is worthwhile for concave plates, holes and manufactured-part studies, but requires substantially more geometry validation and user decisions than B. There is no need to implement it merely because SVG paths already exist.

### Architectural changes required

1. Add a discriminated, per-body mass-model definition: legacy skeleton, parametric shape, explicit outline, or externally supplied properties. Keep shape dimensions and anchors in a stable body frame with explicit length units. Define whether reshaping joints resizes the shape, moves its anchors, or produces a conflict. Ordinary rigid motion must only transform the body.
2. Resolve that definition in a pure mass-property module returning mass, CoM and I_G with source/assumptions. Separate geometry moments from density/mass conversion. Keep explanation traces and overlays attached to the same calculation. The current solver inputs can remain unchanged; update/copy/animation/anchor flows must preserve and transport the definition.
3. Extend the URL codec compatibly, including clone, undo/redo, legacy decoding, imports and fixtures. Old URLs must keep their current custom/skeleton semantics. Define how new shape mass interacts with the existing mass input and custom CoM/inertia overrides; never overwrite one silently.
4. For B, add dimension controls, validation and shared geometry primitives used by physical drawing/export and mass calculation. Pin holes must be physical features if they are to subtract mass, not export decorations. Decide whether a disc requires a grounded pivot physically (it should not merely inherit the drawing restriction).
5. For C, represent ordered oriented outer loops and holes, line/arc segments, topology and a body-local transform. Reject self-intersections, invalid nesting and near-zero domains; define tolerances and units. Integrate arcs analytically or use bounded, documented tessellation error with convergence tests. Existing CAD bulges are reusable adapters, not a substitute for this contract.
6. Define welded-material semantics explicitly: assemble separately weighted members, union material of a common density, or represent layers/overlap. These are distinct bodies physically. Do not substitute the renderer's smoothed union for today's member sum.
7. Validate against analytical rods, finite rectangles, discs/annuli, holes and concave plates, translated/rotated copies, compound offsets, unit conversions, serialization and custom overrides. Check mass invariance under all display-only controls.

This leaves drawing geometry intentionally separate where it is decoration, while allowing an explicitly chosen physical model to be the source for both a faithful drawing and mass properties.

## Staged handoff for a separate feature

None of P0–P4 is implemented by `feature/mass-inertia-explanation`.

| Stage | Deliverable | Acceptance boundary |
| --- | --- | --- |
| P0 — Data model | Per-body definition distinguishing legacy skeleton, parametric shape and supplied properties, with a reserved explicit-outline extension. Body-frame anchors, unit semantics and compatible URL representation. | Old URLs, saved custom values, undo/redo, copies and existing solver inputs behave exactly as before. No automatic migration to a new physical shape. |
| P1 — Rectangle | Opt-in uniform rectangle with explicit width/height, placement and total mass. Shared trace, drawing and export adapters. | Analytical result below; translation, rotation, unit conversion, serialization and parallel-axis benchmarks. Object Scale changes none of its physical dimensions. |
| P2 — Disc | Explicit radius and body-frame center with analytical properties. | The disc result below, the same invariants, and no dependency on presentation-only `isCircle`, ground-pivot eligibility or display cap radius. |
| P3 — More parametric shapes | Evaluate capsule/rounded bar and other common parts against real teaching needs. | Each addition has explicit dimensions, analytical/independent benchmarks and documented mass-distribution assumptions. |
| P4 — Explicit outline | Authored/imported concave domains, holes and line/arc boundaries; decide whether density/material options belong here or in a later stage. | Valid topology, explicit tolerances, bounded integration error, independently verified moments and compatible physical drawing/export. Only proceed after P0–P3 establish the shared architecture. |

The future uniform rectangle benchmark is:

\[
I_G=\frac{m}{12}(w^2+h^2)
\]

The future uniform disc benchmark is:

\[
I_G=\frac{1}{2}mR^2
\]

Before P0, decide the semantics of reshaping joints, custom-property precedence, total mass versus density-derived mass, and overlapping welded parts. The current member sum must remain the legacy meaning; a physical material union needs a separate explicit choice.
