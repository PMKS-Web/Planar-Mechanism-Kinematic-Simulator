# Gear V1 stabilization and acceptance review

> **Status:** Reference — isolated local V1 review, September 12, 2026. Final check results appear below. No push, PR, merge or deployment was performed.

## Ownership, recovery and base

The canonical review branch is `feature/gears-v1`, in
`artifacts/worktrees/gears-v1`. The shared checkout remains on
`feature/analysis-results-table`; its files and index were not reset, stashed, cleaned,
switched or selectively restored. Its old uncommitted gear copies remain untouched and are
not the canonical continuation. Future gear development uses the isolated branch.

During the first read, shared HEAD advanced from `b9b8c513` to `218d9075` as the other
contributor committed the force worksheet. The stable snapshot at `218d9075` had no staged
changes. Its unstaged and untracked files were captured before separation, along with all
other tracked source files: **1,028 files**, SHA-256 manifest, exact index backup, binary
staged/unstaged patches, and a verified Git bundle containing the committed history.
The capture checked HEAD, status, index bytes and every file again before accepting itself.

Recovery files remain in the original checkout at
`artifacts/gear-stabilization-20260912-191115/`: `working-files.zip`, `manifest.json`,
`index.backup`, `status.z`, `staged.patch`, `unstaged.patch`, and `committed-head.bundle`.
The empty staged patch records the empty index delta. Ignored dependencies/build/browser
artifacts were left in place rather than packed into the source snapshot. Recovery should
extract into a new directory, never over an active contributor's checkout.

`origin/staging` was fetched and remained `acba1b770a20551b37a9b2f24b459c224c8ed0fc`.
The chosen base is **`aa10245f`**, the original V1 integration base. It is staging plus
four existing worksheet commits (`82e7c451`, `4c03c712`, `8c5858ef`, `aa10245f`). V1's
educational explanation uses those shared worksheet and convention APIs. Replacing them
with a separate gear worksheet just to start directly at staging would change the accepted
architecture. This is a **stacked branch**: those dependencies should land first, or the PR
should explicitly identify them. They are ancestors, not relabeled gear commits.

The later worksheet commits **`7ef1f2ed`, `b9b8c513`, `218d9075` are excluded**. In the
worksheet merge conflict, only `gearsAt`, the gear motion section, the view data and the
gear-specific loop exclusion were retained. The later gravity-comparison cache, force-body
presentation and full-mechanism visual changes were not copied into this branch.

## Classification and commit decisions

All snapshot deltas are inventoried below. Four audit categories were used:

1. Gear V1 model, solver, codec, editor, examples, tests and documentation.
2. Shared changes needed by those paths: solver boundaries, partitioning, history, selection,
   analysis/export integration and the existing worksheet adapter.
3. Unrelated later worksheet work: retained on its branch, excluded here.
4. Ambiguous changes: inspected and resolved by the decisions below; none remain unclassified.

| Initially shared or ambiguous change | Decision |
| --- | --- |
| Playback/fingerprint/angle helper moves | Behavior-preserving standalone commit before gear changes; 55 existing scoped tests pass. The gear fingerprint extension is added later with production behavior. |
| MotionGen CRLF header | Standalone general-fix commit; all four existing tests pass, with reference data and tolerances unchanged. |
| `.pmks` Open/history | Keep with production lifecycle: loading a file must record the arrival before the first edit can be undone. Browser checks exercise Open over another drawing and subsequent Undo/Redo. |
| Worksheet adapter | Keep only gear data and explanation on the original shared APIs; exclude later worksheet revisions. |
| Analysis/export edits | Required by the selected gear identity and the shared sampler; preserve ordinary object routes. |
| Generated-file checkout rules | Fresh Windows checkout exposed CRLF failures. Match Prettier/generators with an explicit LF text checkout policy; binary files remain binary. No physics or generated values changed. |
| Locale-based G1 sorting | Review defect: use ASCII identifier order, independent of locale. Precision and authored coordinate ownership are unchanged. |
| Mixed-mechanism force exports | Review defect: exclude all objects of a geared partition from force columns, including its input torque; show “gear forces unavailable” in the export group note. Ordinary force results remain available. |
| Old report's artifact links | Use local artifact paths as code, rather than broken repository links to files absent from a fresh clone. |

The computational foundation and solver integration are one commit because the prescribed
boundary route, mobility rows, continuous travel and full-constraint audit form one buildable
architecture change. Production persistence/lifecycle/UI/results are likewise kept together:
their strongly typed service, selection and panel interfaces reference each other. The
recommended six-way split would otherwise leave intermediate commits unable to compile.

| Commit | Purpose | Scoped verification before commit |
| --- | --- | --- |
| `6a7de2be` | Pure helper extraction | 55 tests |
| `bfeb9b6d` | Windows CSV-header fix | 4 tests |
| `9c610afb` | Computational foundation and solver | 35 tests, including the closed four-bar and legacy MATLAB comparison |
| `b9ef4772` | Production editing, persistence and results | 75 tests |
| `305af4a7` | Examples, gallery, browser suites and historical handoffs | 103 tests |
| `8140b099` | Demonstrated V1 review fixes | 27 tests; the two new defect checks fail before the fixes |
| `a2dd95a7` | Reproducible text checkout policy | Full lint/style/format gate passes; no unrelated source-content delta |

Later checkout-policy and final-review documentation commits are recorded in the branch log.
Each verification log is under this worktree's gitignored `artifacts/gears-stabilization/`.

## Architecture review

| Principle | Finding |
| --- | --- |
| Gear attaches to an ordinary rigid body | `Gear.hostLinkId` names an existing `RealLink`; no extra mass/body/DOF is introduced. |
| Mesh is a separate relationship | Explicit gear endpoint IDs; partition union connects mechanisms without body fusion. |
| Dependent gears are not actuators | Exactly one input is admitted for a geared partition; dependent centers keep their ordinary non-input state. |
| Analytical fixed-axis motion | Exact reduced bigint ratios prescribe rotations of authored body points. |
| Existing remaining-linkage solver | Unknown points use the existing nonlinear solve and derivative kernels. |
| Continuous q is authoritative | `gearTravel` feeds gear motion and the drive profile; the final two-turn sample is distinct from zero. |
| Complete original constraints | Position, velocity and acceleration audits check the original constraint set, including prescribed points and zero-unknown cases. |
| Gear-free route | Existing dispatch remains behind the no-transmission path and has full regression coverage. |
| Artwork and physics | Pitch circles/ticks are presentation only; no SVG quantity enters equations. |
| Pitch radius versus reference arm | Independent authored pitch module/tooth count and ordinary host reference geometry; short-arm tests and export bounds cover the distinction. |

No architectural drift was found. The review fixes address document determinism and export
capability reporting, not the mathematical architecture.

## Persistence review

G1 owns the **canonical authored project-unit coordinates** for every joint in a geared
document; legacy rounded fields are its compatibility shell. The decoder replaces that shell
before model construction, scales to model units once, and ignores derived runtime data.
The encoder parks at the authored pose and converts model units back once. Ratios, motion,
samples, playback clocks and solver caches are rebuilt, not serialized.

The 15-significant-digit representation remains unchanged. Axis-aligned and diagonal drawings,
small reference arms and nonzero headings pass repeated byte-stable round trips in centimeters,
meters and inches. Decimal canonicalization is intentional; it does not promise preservation
of every IEEE-754 bit or arbitrary coordinate magnitudes beyond the solver's numerical range.
There is no evidence from supported-unit cases that widening the representation is necessary.
No geometry movement, radius adjustment or tolerance relaxation repairs a load.

The new ordering test demonstrates that locale collation could change the bytes. ASCII ordering
fixes that without changing numeric precision. Gear-free documents still omit G1 entirely.
Malformed metadata, IDs, coordinates, duplicate extensions and multiple independent inputs
are rejected before live drawing/settings/selection/paused pose mutation. Structurally valid
but physically incompatible drawings remain editable with readiness diagnostics.

## Lifecycle, results and mixed documents

`gear-v1-review.spec.ts` uses real `SaveHistoryService` and `UrlProcessorService` instances,
not a save counter. It verifies authored URL identity through Undo/Redo for deleting a gear,
mesh, center, reference, host or complete mechanism; adding/removing a tracer with host ID
remapping; and full/partial idler duplication. The existing lifecycle suite separately checks
fresh IDs and stale-ID cleanup, retained mesh endpoints, refused host rewrites and paused edits.
The production browser checks the `.pmks` arrival and subsequent edit/Undo/Redo path.

The final gear sample remains at the complete cycle, with nonzero continuous travel even when
its geometry repeats the start. Panel/graph data and table/CSV/XLSX share `AnalysisSampleService`;
the worksheet samples the same compiled motion. Tests compare all four angular quantities in
degrees and radians, including endpoint travel, velocity and acceleration.

A mixed geared/ordinary document preserves both after save/reload. Seeking the ordinary machine
does not move the geared machine's endpoint, and sampling one does not change the other's data.
Geared force analysis returns an unsupported result; the ordinary mechanism still solves forces.
The review caught the export-only input-effort exception and now excludes every geared
partition force column before it can be selected. Separate tables retain each machine's time
column and all requested supported results remain finite.

## UI and performance review

The actual isolated app uses `http://localhost:4332`; its built local gallery uses
`http://localhost:4333`. CUA reported no enabled browser/app surfaces, so the repository's
documented fallback uses tracked Playwright suites and disposable Chrome contexts.
The V1 filmstrips cover normal desktop, selected gear/mesh, invalid spacing, paused
playback, full-cycle endpoint, four-bar motion and the expanded phone panel. Gallery states
cover invalid module, disabled controls, dense values, selected/invalid artwork, low detail
and high tooth counts. The production browser also edits a long name and a 10,000-tooth gear,
checks bounded tick complexity and the incompatible-module diagnostic, and restores a valid mesh.
PMKS currently exposes one light application theme; an invented gear-only
dark theme was not introduced.

The workload limits remain **128 gears, 256 meshes and 6,000 samples**. The isolated performance
suite records 20/40, 20/100, closed four-bar, idler and eight-gear trains. Timings are observations
from this machine under concurrent development load, not formal performance guarantees.

A dedicated benchmark run, without the full suite competing for CPU, observed 28.7 ms (20/40,
721 samples), 37.3 ms (20/100, 1,801), 46.0 ms (closed four-bar, 721), 15.0 ms (idler, 721),
and 21.5 ms (eight gears, 361). Full-suite concurrent runs were slower, particularly the
four-bar, so those are not used as a regression claim. The bounded train and five-turn cases
show no unexpectedly nonlinear growth in these representative workloads.

## Final V1 verification and acceptance

The isolated branch passes **249 unit-test files / 2,607 tests** and **8 focused gear files /
71 tests**. `npm run check`, the production build, Storybook build, all three gear browser
suites and `git diff --check` pass. The gallery covers 15 states. Existing build-size/CommonJS
warnings and the 15 allowed lint warnings remain; there are no test failures or lint errors.

Logs are `artifacts/gears-stabilization/{full-unit,focused-gears,check,production-build,
storybook-build,browser-production,browser-results,browser-gallery,performance}.log`.
Reviewed PNGs, motion filmstrips and the actual printable report capture are under
`artifacts/gears/`. These are intentionally local gitignored paths, not repository links.
The final review commit leaves the isolated V1 branch clean; the shared checkout remains
untouched. Dependencies were installed independently with `npm ci` from this branch's lockfile.

**Acceptance checkpoint: fixed-axis external circular Gear V1 is production-ready within its
declared scope.** The two demonstrated behavior defects and the fresh-checkout portability
issues were addressed before starting V1.1. No unresolved V1 correctness/lifecycle issue was
found. I recommend opening a V1 PR now, with its worksheet dependency stack explicitly identified;
merge after those dependencies and the ordinary repository review/CI gate. Nothing has been
pushed, published or merged. Compound work continues on a separate branch based on this checkpoint.

## Snapshot file inventory

The inventory records the captured gear deltas, not every unchanged ancestor file. All later
worksheet-only commits listed above remain excluded. Detailed per-file hashes and original
staged/unstaged representations are in the recovery manifest and patches.

| Captured path | Classification |
| --- | --- |
| `CLAUDE.md` | 1 — Gear V1 |
| `docs/README.md` | 1 — Gear V1 |
| `docs/fixture-urls.md` | 1 — Gear V1 |
| `docs/gears-implementation.md` | 1 — Gear V1 |
| `docs/gears-plan.md` | 1 — Gear V1 |
| `docs/gears-production.md` | 1 — Gear V1 |
| `docs/tips-and-tricks.md` | 1 — Gear V1 |
| `e2e/README.md` | 1 — Gear V1 |
| `e2e/gear-gallery.mjs` | 1 — Gear V1 |
| `e2e/gear-preview.mjs` | 1 — Gear V1 |
| `e2e/gear-production.mjs` | 1 — Gear V1 |
| `e2e/gear-results.mjs` | 1 — Gear V1 |
| `scripts/gear-preview-viewer.mjs` | 1 — Gear V1 |
| `scripts/gear-preview.html` | 1 — Gear V1 |
| `scripts/gear-preview.mjs` | 1 — Gear V1 |
| `src/app/component/MODALS/drawing-export/drawing-export.component.html` | 2 — Required shared integration |
| `src/app/component/MODALS/drawing-export/drawing-export.component.ts` | 2 — Required shared integration |
| `src/app/component/MODALS/templates/template-catalog.ts` | 2 — Required shared integration |
| `src/app/component/MODALS/templates/template-linkages.ts` | 2 — Required shared integration |
| `src/app/component/analysis-graph/analysis-graph.component.ts` | 2 — Required shared integration |
| `src/app/component/analysis-panel/analysis-panel.component.html` | 2 — Required shared integration |
| `src/app/component/analysis-panel/analysis-panel.component.ts` | 2 — Required shared integration |
| `src/app/component/edit-panel/edit-panel.component.html` | 2 — Required shared integration |
| `src/app/component/edit-panel/edit-panel.component.ts` | 2 — Required shared integration |
| `src/app/component/export-panel/export-panel.component.ts` | 2 — Required shared integration |
| `src/app/component/gears/gear-analysis.component.ts` | 1 — Gear V1 |
| `src/app/component/gears/gear-drawing.component.ts` | 1 — Gear V1 |
| `src/app/component/gears/gear-fields.component.ts` | 1 — Gear V1 |
| `src/app/component/gears/gear-layer.component.ts` | 1 — Gear V1 |
| `src/app/component/gears/gear-mesh-summary.component.ts` | 1 — Gear V1 |
| `src/app/component/gears/gear-panel.component.ts` | 1 — Gear V1 |
| `src/app/component/new-grid/new-grid.component.html` | 2 — Required shared integration |
| `src/app/component/new-grid/new-grid.component.ts` | 2 — Required shared integration |
| `src/app/component/solver-explanation/solver-explanation.component.html` | 2 — Required shared integration |
| `src/app/component/solver-explanation/solver-explanation.component.ts` | 2 — Required shared integration |
| `src/app/component/top-bar/top-bar.component.ts` | 2 — Required shared integration |
| `src/app/model/analysis-series.ts` | 2 — Required shared integration |
| `src/app/model/angle-overlay.ts` | 2 — Required shared integration |
| `src/app/model/drop-target.ts` | 2 — Required shared integration |
| `src/app/model/gear-analysis.ts` | 1 — Gear V1 |
| `src/app/model/gear-lifecycle.ts` | 1 — Gear V1 |
| `src/app/model/gear.ts` | 1 — Gear V1 |
| `src/app/model/joint-operation-permission.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/constraint-motion.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/drive-profile.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/force-solver.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/gear-drive.spec.ts` | 1 — Gear V1 |
| `src/app/model/mechanism/gear-drive.ts` | 1 — Gear V1 |
| `src/app/model/mechanism/gear-validation.ts` | 1 — Gear V1 |
| `src/app/model/mechanism/mechanism-partition.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/mechanism.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/mobility.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/playback-values.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/position-solver.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/readiness.ts` | 2 — Required shared integration |
| `src/app/model/mechanism/solve-fingerprint.ts` | 2 — Required shared integration |
| `src/app/services/active-obj.service.ts` | 2 — Required shared integration |
| `src/app/services/analysis-sample.service.ts` | 2 — Required shared integration |
| `src/app/services/context-menu-builder.service.spec.ts` | 2 — Required shared integration |
| `src/app/services/context-menu-builder.service.ts` | 2 — Required shared integration |
| `src/app/services/export/canvas-svg.ts` | 2 — Required shared integration |
| `src/app/services/export/dxf/dxf-export.service.ts` | 2 — Required shared integration |
| `src/app/services/export/export-catalog.service.ts` | 2 — Required shared integration |
| `src/app/services/export/export-columns.service.ts` | 2 — Required shared integration |
| `src/app/services/export/export-flow.service.ts` | 2 — Required shared integration |
| `src/app/services/export/export-model.ts` | 2 — Required shared integration |
| `src/app/services/export/export-writer.service.ts` | 2 — Required shared integration |
| `src/app/services/export/mechanism-svg.ts` | 2 — Required shared integration |
| `src/app/services/gear-editor.service.ts` | 1 — Gear V1 |
| `src/app/services/grid-utils.service.ts` | 2 — Required shared integration |
| `src/app/services/mechanism.service.ts` | 2 — Required shared integration |
| `src/app/services/selection-batch.service.ts` | 2 — Required shared integration |
| `src/app/services/solver-explanation.service.ts` | 2 — Required shared integration |
| `src/app/services/svg-grid.service.ts` | 2 — Required shared integration |
| `src/app/services/transcoding/gear-codec.ts` | 1 — Gear V1 |
| `src/app/services/transcoding/mechanism-builder.ts` | 2 — Required shared integration |
| `src/app/services/transcoding/string-transcoder.ts` | 2 — Required shared integration |
| `src/app/services/transcoding/transcoder-interface.ts` | 2 — Required shared integration |
| `src/app/services/url-generation.service.ts` | 2 — Required shared integration |
| `src/app/services/url-processor.service.ts` | 2 — Required shared integration |
| `src/assets/gifs/gear-four-bar.svg` | 1 — Gear V1 |
| `src/assets/gifs/gear-idler.svg` | 1 — Gear V1 |
| `src/assets/gifs/gear-pair.svg` | 1 — Gear V1 |
| `src/stories/blocks/gear-drawing.stories.ts` | 1 — Gear V1 |
| `src/stories/blocks/gear-fields.stories.ts` | 1 — Gear V1 |
| `src/stories/blocks/gear-mesh.stories.ts` | 1 — Gear V1 |
| `src/test-utils/verification/fixture-gallery.ts` | 2 — Required shared integration |
| `src/test-utils/verification/fixture.ts` | 2 — Required shared integration |
| `src/test-utils/verification/gear-fixtures.ts` | 1 — Gear V1 |
| `src/test-utils/verification/gear-gallery.ts` | 1 — Gear V1 |
| `src/test-utils/verification/template-fixtures.ts` | 2 — Required shared integration |
| `src/tests/verification/gear-kinematics.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/gear-lifecycle.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/gear-performance.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/gear-persistence.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/gear-preview.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/gear-results.spec.ts` | 1 — Gear V1 |
| `src/tests/verification/motiongen-gripper.spec.ts` | 2 — Required shared integration |
| `src/tests/verification/template-payloads.spec.ts` | 2 — Required shared integration |
