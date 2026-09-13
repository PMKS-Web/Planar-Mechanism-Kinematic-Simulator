# Gears: production V1 handoff

Current continuation: [compound V1.1 handoff](gears-compound.md), based on the protected V1 checkpoint. This document retains the original V1 implementation record.

> **Status:** Reference — fixed-axis external circular gears implemented in the actual PMKS application, September 12, 2026. Local acceptance build; not published. Verification and release scope are recorded below.

This records the initial shared-checkout handoff. The current branch and acceptance review are
in [gears-stabilization.md](gears-stabilization.md).

## Try it

Open **http://localhost:4330** and choose **Project menu → Mechanism Library → Start Here**.
The examples are **Simple Gear Pair**, **Gear-Driven Four-Bar**, and **Idler Gear Train**.
Click a pitch circle to select the gear. Press Play, change input speed, scrub the full cycle,
or use **Kinematic Analysis** to inspect its angular quantities. The shared library examples
use the normal PMKS document codec, not a separate preview format.

To build your own 20T/40T pair in centimeters:

1. Right-click empty canvas and choose **Gear**. The click location becomes its fixed center.
2. Use **Edit Center** and the existing joint position fields to set the first center to (-3, 0).
3. Add another gear and set its center to (0, 0). Select its pitch circle and set **Teeth** to 40.
4. Choose **Mesh With…**, choose the 20T gear, review the spacing and ratio, then **Create Mesh**.
5. The first gear is the root input. Its signed speed is editable; the dependent gear has no
   independent speed field. Setting the root to +60 rpm gives the output -30 rpm.

Editing a center moves that joint through the ordinary PMKS editor; it does not silently move
its reference point or partner. A reference arm and pitch radius may differ. Pitch artwork is
symbolic, not manufacturing tooth geometry. Numerical center fields are useful because freehand
placement cannot reliably establish exact tangency at every zoom level.

To restart the preview with supported Node 24: `node node_modules/@angular/cli/bin/ng.js serve
--host localhost --port 4330 --live-reload=false --hmr=false`. The last two switches keep other
contributors' edits from reloading a browser mid-gesture. Source changes still compile and appear
on the next manual reload.

## Required implementation report

### 1. Branch, base and commit state

Work continued in the requested shared checkout, on `feature/analysis-results-table`.
The initial base was `aa10245f`; another contributor advanced HEAD through `7ef1f2ed` to
`b9b8c513` during this pass with worksheet improvements. Gear changes remain in the working tree, including the prior
Stage 1/2 implementation. No gear commit, push, PR, deployment, reset or branch switch was made.
Concurrent worksheet changes were preserved. The milestones are separated by service/model,
codec, UI, tests and documentation boundaries for review; they are not separate commits.

### 2. Files added

The Stage 1/2 files remain listed in [gears-implementation.md](gears-implementation.md).
The production additions are:

- `src/app/services/transcoding/gear-codec.ts`: authored gear extension and structural preflight.
- `src/app/services/gear-editor.service.ts`: creation, attachment, property and mesh operations.
- `src/app/model/gear-lifecycle.ts`: cascade cleanup, duplication and host-operation refusal.
- `src/app/model/gear-analysis.ts`: shared quantity definitions and continuous samples.
- `src/app/component/gears/gear-drawing.component.ts`, `gear-layer.component.ts`,
  `gear-panel.component.ts`, `gear-fields.component.ts`, `gear-mesh-summary.component.ts`,
  `gear-analysis.component.ts`: native canvas, editing and analysis components.
- `src/app/model/angle-overlay.ts`, `src/app/model/mechanism/playback-values.ts`,
  `solve-fingerprint.ts`: existing pure calculations moved out of the two capped hubs.
- `src/stories/blocks/gear-{fields,mesh,drawing}.stories.ts`: component-gallery states.
- `src/test-utils/verification/gear-gallery.ts`: production example entries.
- `src/assets/gifs/gear-{pair,four-bar,idler}.svg`: bounded vector library thumbnails.
- `src/tests/verification/gear-{persistence,lifecycle,results,performance}.spec.ts`.
- `e2e/gear-production.mjs`, `gear-results.mjs`, `gear-gallery.mjs`, and this report.

### 3. Files modified

- Codec/document path: `transcoder-interface.ts`, `string-transcoder.ts`, `mechanism-builder.ts`,
  `url-generation.service.ts`, `url-processor.service.ts`, and `top-bar.component.ts`.
- Reference verification: `motiongen-gripper.spec.ts` trims a CRLF CSV header on Windows;
  its assertions and reference data are unchanged.
- Lifecycle: `mechanism.service.ts`, `selection-batch.service.ts`, `active-obj.service.ts`,
  `joint-operation-permission.ts`, `drop-target.ts`, `grid-utils.service.ts`,
  `context-menu-builder.service.ts` and its provider setup in the existing spec.
- Canvas and panels: `new-grid.component.{ts,html}`, `svg-grid.service.ts`,
  `edit-panel.component.{ts,html}`, `analysis-panel.component.{ts,html}`,
  `analysis-graph.component.ts`, `analysis-series.ts`, `analysis-sample.service.ts`.
- Explanation: `solver-explanation.service.ts`, `solver-explanation.component.{ts,html}`.
- Export: `export-model.ts`, `export-catalog.service.ts`, `export-columns.service.ts`,
  `export-flow.service.ts`, `export-writer.service.ts`, `export-panel.component.ts`,
  `canvas-svg.ts`, `mechanism-svg.ts`, `dxf-export.service.ts`, drawing-export component/template.
- Examples: `fixture-gallery.ts`, `template-fixtures.ts`, `template-payloads.spec.ts`,
  `template-{catalog,linkages}.ts`, generated `docs/fixture-urls.md`.
- Solver additions retain the Stage 1/2 files; `drive-profile.ts` also distinguishes gear cycle
  endpoints, and `readiness.ts` exposes the compiler diagnostics.
- `CLAUDE.md`, `docs/README.md`, both preceding gear documents, `docs/tips-and-tricks.md`,
  and `e2e/README.md` carry the durable handoff.

### 4. Persistence format

An optional trailing `G1~<base64url UTF-8 JSON>` extension travels inside the existing checksum
and digest. It contains authored gear IDs, host/center/reference IDs, teeth, module in project
units, optional names, and explicit external mesh endpoint IDs. No ratios, compiled graph,
adjacency, period, velocities, q samples or solver frames are saved.

The same extension also contains the document's authored joint coordinates at **15 significant
decimal digits**, in project units. These are the canonical coordinates for geared documents;
the old low-precision fields remain a compatibility shell. This includes ordinary linkage
joints coupled to the gears. Decoder validation requires exactly one finite point per joint.
Canonical decimal rounding stabilizes repeated saves. Tests use axis-aligned/diagonal pairs,
nonzero headings and a 0.0008-project-unit reference arm in cm, m and inch documents over five
round trips. No center movement or radius adjustment repairs serialization.

Structural validation happens before changing the current drawing, pose, selection or settings.
It rejects duplicate/dangling records, invalid IDs/numbers, unsupported versions/types, invalid
membership and multiple independent inputs in a gear-connected assembly. Physical incompatibility
such as spacing/module mismatch or a moving axis remains an editable readiness blocker.

### 5. Backward compatibility

Gear-free documents emit no G1 extension and retain their encoded form. Legacy templates,
checksum/digest tests, unit/drive codecs and the ordinary solver paths remain covered by the
regression suite. New readers load old documents. Old deployed readers are not promised to
understand gears; share these examples with this build until the feature is released.

### 6. Production creation

The canvas Add menu offers Gear. One operation creates an ordinary rigid host, a grounded
revolute center and a noncoincident visible reference point, then attaches gear metadata.
The first created gear is the initial root; subsequent standalone gears need an explicit mesh
or a normal input assignment. Right-clicking an eligible selected body offers **Attach Gear**.
Ambiguous, welded, already-geared or unsupported hosts are refused before mutation.

### 7. Production meshing

Select a gear, choose Mesh With, then an explicit partner. The shared relationship component
shows tooth counts, signed ratio, opposite direction, actual/required spacing and diagnostics.
Commit is enabled only for a compilable candidate connected partition. Independent invalid
partitions do not veto an otherwise valid mesh. Touching/overlapping artwork creates no edge.

### 8. Property behavior

Teeth and Pitch Diameter are primary fields; module is derived for display and canonical storage.
Changing teeth preserves module and therefore changes pitch diameter. Changing diameter derives
module. Structurally valid edits that invalidate a mesh persist, with readiness blocking playback.
Invalid numerical definitions are refused. Neither operation moves a partner. Name and root
input speed use existing form controls; negative speed reverses motion.

### 9. Rendering

The production SVG layer shows dashed mathematical pitch circles, bounded tooth ticks, reference
lines, centers, tooth counts, hover/selection and invalid states. Detailed mode draws at most
96 ticks per gear; low-detail mode at most 12. Pitch size is independent of host-arm length.
The layer follows the ordinary model frame and viewport. Fit-to-view includes pitch extents.
Paused poses have authored-reference ghosts. Canvas/report SVG snapshots include pitch geometry
and its bounds; the non-canvas report fallback also includes pitch circles and references.

### 10. Gear selection

`Gear` is a distinct active-object type, selected by pitch artwork, keyboard Enter or its panel.
The properties panel shows host, center access, root/dependent status and compiled ratio.
Dependent speed is derived. Select Host Body opens ordinary rigid-body controls rather than
pretending the gear is another link or inertial body. Keyboard Delete removes the attachment.

### 11. Mesh selection

`GearMesh` is a separate relationship selection. A small contact marker selects its summary,
which exposes both endpoints, ratio/direction, spacing and compatibility, endpoint selection
and Remove Mesh. The marker does not create or impersonate a physical body.

### 12. Undo and redo

Each gear create/attach/edit/mesh/remove transaction calls the normal history path once.
History encodes the same authored G1 document; restoring definitions reconstructs runtime data.
The browser covers mesh deletion/undo and gear deletion/undo/redo. File Open now records the
loaded arrival, fixing a shared-path bug where the first undo restored the preceding document.

### 13. Delete and cascade

Deleting a gear removes metadata and incident meshes but leaves the ordinary host/joints.
Deleting a mesh leaves both gear attachments. Removing host links or center/reference joints
cleans dependent metadata before deleted IDs can be reused. Whole-mechanism deletion follows
that same cleanup, and Clear resets the gear arrays. Mesh removal repartitions the drawing.
Adding or deleting a tracer on a retained host explicitly remaps its gear's host ID when PMKS
renames that body. Single and batch deletion tests verify that its mesh survives.

### 14. Duplication

Ordinary host multi-selection/duplication now copies attached gears. Every copied gear and mesh
gets a fresh ID. A mesh is copied only when both hosts and their references were copied; copied
edges connect copies exclusively. Partial selections never reconnect automatically to originals.
Integration tests cover full and partial duplication and stale/reused IDs. The browser suite
also duplicates both hosts through native multi-selection and verifies the copied mesh endpoints.

### 15. Paused-pose editing

Metadata operations execute against the authored start pose, save that design and restore the
viewing clocks. A paused sample does not redefine the zero reference. Tests cover nonzero-cycle
edits and complete-cycle scrubbing. Gear q distinguishes a full two-turn cycle from its identical
zero geometry; this endpoint rule is gear-specific, preserving ordinary profile semantics.

### 16. Analysis integration

Angular Position, Angular Travel, Angular Velocity and Angular Acceleration use the declared
reference and authoritative q through `AnalysisSampleService`. Angular position is heading plus
continuous travel, not a wrapped atan2 reconstruction. The existing graph sections, extrema
tables, export table builder, CSV and XLSX use the same samples and angle-unit conversion.
Tests compare the same frame in degrees and radians. Browser downloads check 360 degrees of
dependent travel and 90 deg/s for the library pair's -30 rpm root / +15 rpm output.

### 17. Solver explanation

The existing worksheet includes the actual analytical gear route: exact rational multiplier,
theta = theta0 + multiplier*q, rates, and signed rpm. Remaining linkage motion is explained as
the existing simultaneous constraint solve. The geared route does not manufacture an unrelated
legacy linkage-loop derivation. Display numbers are rounded only for reading; solver data remain
unchanged. The 20T/40T law is -20/40 = -1/2; +60 rpm gives -30 rpm.

### 18. Force-analysis gating

Geared partitions explicitly refuse force transmission at computational and UI boundaries.
Gear attachments do not acquire mass, inertia, tooth loads or torque results. Eligible independent
gear-free partitions still offer force analysis and export. The integration test builds both in
one document and verifies successful ordinary force frames alongside the gear refusal.

### 19. Idlers and trains

Pairs, idlers, simple trains and valid branched fixed-axis external networks use the same exact
compiler and editor. The 20T/40T/20T idler gives multipliers 1, -1/2, 1 but retains a two-turn
cycle because the intermediate shaft matters. Exact rational cycle consistency, unreachable
rotors, one-input enforcement and bounded work remain intact. Compounds remain refused.

### 20. Component-gallery additions

Fifteen states are rendered by tracked browser checks: Gear Properties default/disabled/invalid/
dense values; Gear Mesh valid/spacing mismatch/module mismatch/dependent/disabled/unsupported
host; Gear drawing default/selected/invalid/low detail/large tooth count. Production uses these
same components and existing PMKS blocks/tokens. The local gallery is http://localhost:4331.

### 21. Production examples

Simple Gear Pair, Gear-Driven Four-Bar and Idler Gear Train appear under Start Here in the
mechanism library. Their URLs are generated by the normal fixture publication path and listed
in [fixture-urls.md](fixture-urls.md). They include G1 metadata and precise authored coordinates.
The older localhost:4329 preview is retained only as a developer computational diagnostic.

### 22. New automated tests

The computational tests remain intact. Production specs add twelve persistence cases, lifecycle
transactions/force eligibility/duplication/paused edits/full-cycle scrubbing, three results and
atomic-load cases, and representative workload measurements. Browser suites are
`gear-production.mjs`, `gear-results.mjs` and `gear-gallery.mjs`. Artifact logs live in
`artifacts/gears/`; screenshots are inspected, not merely collected.

### 23. Existing regressions

The full unit suite was run, in addition to focused service/component/compiler suites. Two
initial MotionGen gripper failures traced to its test reader retaining a Windows carriage return
in the final CSV header (`J11_y`). That left the expected `y` coordinate at zero. The actual CSV
starts with a jaw gap of 2.37115, consistent with the existing assertion. Trimming the header
fixes the cross-platform parser; reference data, fixtures, production physics and numerical
tolerances are unchanged. Final counts and checks are recorded below.

### 24. Production browser verification

The real application passes creation, explicit meshing, playback, input speed/reversal,
two-turn scrubbing, invalid-edit repair, mesh history, gear delete history, file/share/recovery,
graphs/worksheet, CSV/XLSX and idler workflows. Reviewed filmstrips include the pair, selected
properties, mesh, invalid state, two-turn endpoint, four-bar motion and narrow layout.
CUA exposed no enabled browser surfaces in this session; tracked Playwright suites used fresh
disposable Chrome contexts as allowed by AGENTS.md. No user's ordinary browser profile was used.

### 25. Performance and limits

Observed test-run costs on this machine (not portable performance guarantees):

| Mechanism | Samples | Input turns | Solve time |
| --- | ---: | ---: | ---: |
| 20T/40T | 721 | 2 | 50.1 ms |
| 20T/100T | 1801 | 5 | 99.2 ms |
| Closed four-bar | 721 | 2 | 128.8 ms |
| Idler | 721 | 2 | 76.9 ms |
| Eight-gear train | 361 | 1 | 51.7 ms |

Limits remain 128 gears, 256 meshes and 6,000 samples. The codec additionally caps the encoded
gear token at 500,000 characters. High tooth counts do not increase SVG tick complexity. Excessive
period/work is refused by the compiler, not silently shortened. Timing evidence is recorded in
`artifacts/gears/production-performance.json` (subsequent runs may have different timings).

### 26. Deviations from the plan

The additive extension also carries precise authored coordinates because retaining only the
legacy rounded coordinates would invalidate legitimate meshes and short reference arms. The
gear definition is still teeth plus module; derived state is not serialized. Symbolic ticks
are used instead of involute artwork. CAD fabrication export is explicitly refused for geared
documents; diagram and numeric result exports are supported. Pure helper extraction keeps the
existing hub file-size caps rather than raising them. No automatic placement was introduced.

### 27. Deviations from the Stage 1/2 handoff

The temporary fixture viewer is no longer the user-facing entry point. Production persistence,
editing, selection, lifecycle, results and examples now own that workflow. The earlier report's
unimplemented-stage statements are historical. The nonlinear/derivative kernels, analytically
prescribed gear-body route, full-constraint audit and closed four-bar proof remain intact.

### 28. Remaining V1 limitations

Fixed grounded axes, circular external meshes, simple ordinary host bodies and one independent
input per connected mechanism only. No gear forces, fabrication tooth profile, automatic mesh
placement or automatic repair. Weld/unweld/merge/host-type rewrites require removing the gear
attachment first. Long names use the normal finite-width PMKS inputs. Complex networks whose
exact full cycle exceeds the work cap are refused. Shared links require the new build.

### 29. Recommended V1.1 work

Address compound gears with explicit shaft/layer ownership and safe lifecycle rules, then add
the compound end-to-end acceptance case. Gear force transmission, internal gears, racks,
planetary systems, contact physics and synthesis remain separately designed later work.

### 30. Is fixed-axis external V1 production-ready?

The requested V1 feature is implemented in production application paths and available for local
acceptance testing. The gear tests and browser evidence support its computational and workflow
correctness within the fixed-axis external scope. Final repository checks are recorded below.
This is a local implementation handoff, not a published release or completed merge review.

## Final verification record

Final checks on September 12, 2026, using the supported portable Node 24.15 runtime:

- **Full unit suite: PASS — 248 files, 2,595 tests.**
  Full test log (`../artifacts/gears/final-unit-tests.log`).
- **Focused gear/lifecycle/documentation checks: PASS — 10 files, 107 tests.**
  Focused log (`../artifacts/gears/final-gear-tests.log`).
- **`npm run check`: PASS.** ESLint has zero errors and the existing 15 allowed warnings;
  stylelint and Prettier pass. Check log (`../artifacts/gears/final-check.log`).
- **Production build: PASS.** Existing stylesheet budget and CommonJS warnings remain.
  Build log (`../artifacts/gears/final-production-build.log`).
- **Storybook build: PASS; all 15 gear states: PASS.**
  Build log (`../artifacts/gears/storybook-build.log`),
  gallery record (`../artifacts/gears/gallery/report.json`).
- **Native production workflows: PASS.**
  Browser record (`../artifacts/gears/production/browser-check.json`),
  motion filmstrip (`../artifacts/gears/production/filmstrip/`).
- **Save/share/file/history, results and printable report: PASS.**
  Results record (`../artifacts/gears/results/report.json`),
  captured printable report (`../artifacts/gears/results/gear-report.html`).
- **`git diff --check`: PASS.** No whitespace errors; Git emits its usual Windows line-ending notices.

Artifacts are local and gitignored. The development server is left running at
**http://localhost:4330**, with a disposable Chrome preview for hands-on review. Nothing was
committed, pushed or published by this gear pass.
