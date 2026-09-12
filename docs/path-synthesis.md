# Path synthesis prototype

> **Status:** Partly built — target-path editing is available; automatic mechanism fitting is not implemented.

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

The recovered feature describes a target, not a solved linkage. This transfer keeps that scope
explicit in the chooser and editor. Presets are regenerated in model coordinates; no legacy
DOM manipulation or solver code is imported. Ordered points replace the old mutable neighbor
references, so deleting a point cannot leave a broken traversal. Closed smooth paths use
wrapped neighbors so the tangent is continuous at the seam.

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
