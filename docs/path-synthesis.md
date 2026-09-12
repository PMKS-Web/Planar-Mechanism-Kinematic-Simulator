# Path synthesis

> **Status:** S0–S3 — target editing, equal-angle/free-timing four-bar fitting, and production-verified insertion are available.

The Synthesis chooser offers **Path — points on a curve** beside three-position motion
synthesis. It opens a target-path editor with ordered points, coordinate fields, canvas
placement and dragging, open/closed ends, and straight or smooth connections. Horizontal,
vertical, rising and falling lines, Bean, Figure Eight and Infinity provide starting shapes.
Replacing a path, editing a coordinate, reordering or deleting a point, and completing a drag
each make one undo entry. Escape cancels a drag or ends point placement. The target remains
as a faint reference in Edit and Analysis, and participates in Fit to view.

## What was recovered

PMKSConversion's history contains the prototype even though its current default branch does
not expose it. These commits establish the source:

- `62abecf52fc5f3279eac8996ec55df73ecdb6788` (September 20, 2021): the path-point coordinate
  table, deletion, and neighboring-point model.
- `5aa1e55c1635608bf70df5f60bac9c0b5a4e60bd` (September 20, 2021): drawing a path through points.
- `19596bdef6194bc117e037f7ff4db6d1140f3f9d` (October 1, 2021): the path shape picker;
  `src/app/grid/grid.component.ts` also contains the straight-line and Catmull–Rom-to-Bezier preview.

The recovered feature described a target, not a solved linkage. The continuation adds a new
numerical four-bar backend; its [technical reference](path-synthesis-backend.md) distinguishes
that implementation from the recovered prototype. Presets are regenerated in model coordinates; no legacy
DOM manipulation or solver code is imported. Ordered points replace the old mutable neighbor
references, so deleting a point cannot leave a broken traversal. Closed smooth paths use
wrapped neighbors so the tangent is continuous at the seam.

## Fit and create a four-bar

Choose **Synthesize Four-Bar** to search bounded four-bar dimensions and a rigid coupler point.
The target curve is resampled to 64 arc-length samples. Choose ordered Free Timing or the
Equal Input Angle baseline. Closed paths fit a full revolution; open paths fit a finite sweep.
**Cancel Search** keeps the drawing and target. Changing the target also cancels a pending search.

The best production-verified candidate is drawn over the target: a solid generated path, small
target evaluation dots, and a skeleton of the starting mechanism, with square ground markers.
The target remains dashed. **Fit to view** includes the preview. RMS Path Error and Maximum
Error use the document's length unit; Normalized RMS Error is relative to the target's
bounding-box diagonal. A search-limit result can still offer a feasible mechanism, with its
error shown explicitly.

**Create Mechanism** appends the crank, coupler, rocker, two ground pivots and a coupler tracer
as normal PMKS entities, then opens Edit. It preserves existing machines and saves once, so one
Undo removes the insertion. The normal mechanism and target survive sharing and reload.
Numerical candidates are transient and must be recomputed after reload; no new URL tags are
introduced for solver settings or results. Animation follows the whole feasible mechanism
cycle, not a separately stored partial synthesis interval.

## Where it lives

- `src/app/model/path-synthesis.ts`: target geometry, preview curve and starting shapes.
- `src/app/services/synthesis/path-editor.service.ts`: selection and undoable point edits.
- `src/app/component/path-synthesis-panel/`: coordinates and path choices.
- `src/app/component/path-synthesis-canvas/`: the SVG target and provisional drag gestures.

The existing `SynthesisBuilderService` owns the target alongside its motion design. Both
survive switching synthesis types. The existing synthesis URL section adds `ST~flags` for
path mode/closed/smooth and repeated `SQ~x~y` for ordered points. Existing tags and flag positions
are unchanged; old URLs still decode. Like other geometry, coordinates have three decimal
places in document units. Older app builds reject these new path entries rather than silently
discarding them, so use this branch's build to open links containing a target path.

## Verification

`e2e/path-synthesis.mjs` covers shapes, coordinates, order/deletion, drag and cancellation,
placement, one-step undo/redo, reload, sharing, phone layout and reduced motion. Its filmstrip
and screenshots are written to `artifacts/path-synthesis/`. `e2e/synthesis-redesign.mjs` retains
the motion-synthesis workflow. Unit coverage includes the curve, path editing, URL round trips,
malformed entries, unit conversion and synthesis history permissions.


The Path Timing choice now defaults to **Free Timing**, which keeps the points ordered while
allowing uneven input-angle steps. **Equal Input Angle** remains an explicit baseline. The result
shows the fitted sweep and count of distinct verified candidates; creation uses the best fit.
Free timing takes longer. Search can be canceled, and changing timing invalidates the old preview.
The solid preview samples the whole fitted sweep independently of the timing correspondence.
See [the backend reference](path-synthesis-backend.md#prescribed-and-unprescribed-timing) for the
mathematics, deterministic benchmark and limitations.
