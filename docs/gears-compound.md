# Gear V1 stabilization and compound V1.1 handoff

> **Status:** Built - local acceptance verification completed September 12, 2026.
> No push, PR, merge or publication is authorized or performed.

## V1 stabilization

### 1. Dedicated branch and base

V1 is isolated on `feature/gears-v1`, clean checkpoint `daef9908`, in
`artifacts/worktrees/gears-v1` under the original checkout. Its chosen base is
`aa10245f`: staging `acba1b77` plus four existing worksheet API/convention commits.
Those are explicit dependencies, not new gear work. Land those dependencies first or
identify the PR as stacked. The full [stabilization audit](gears-stabilization.md)
records the base decision, source inventory and engineering review.

### 2. Protection of concurrent work

The shared `feature/analysis-results-table` checkout was not reset, stashed, cleaned,
switched or selectively restored. A stable snapshot at `218d9075` protects all 1,028
source files, their SHA-256 manifest, exact index, binary patches and verified Git bundle
in the original checkout's `artifacts/gear-stabilization-20260912-191115/`.
The later unrelated worksheet commits `7ef1f2ed`, `b9b8c513` and `218d9075`
are excluded from the gear branch. Original uncommitted gear copies remain untouched;
the isolated worktrees are the canonical continuation.

### 3. Commit structure

V1 has eight local reviewable commits after its base:

| Commit | Change |
| --- | --- |
| `6a7de2be` | Behavior-preserving playback/fingerprint/angle helpers |
| `bfeb9b6d` | Windows CSV-header trim fix |
| `9c610afb` | Gear computation and coupled solver integration |
| `b9ef4772` | Production persistence, lifecycle, editing and results |
| `305af4a7` | Examples, browser/gallery checks and handoffs |
| `8140b099` | Demonstrated determinism and force-export review fixes |
| `a2dd95a7` | Reproducible LF text checkout policy |
| `daef9908` | Final review and expanded native browser evidence |

Cross-referencing interfaces stay together so intermediate commits compile. The audit
lists the scoped test gate for each milestone.

### 4. Final V1 verification

The isolated V1 checkpoint passed **249 test files / 2,607 tests**, including the
unchanged legacy solver routes; **8 focused gear files / 71 tests**; `npm run check`;
production and Storybook builds; `gear-production.mjs`, `gear-results.mjs`,
`gear-gallery.mjs` (15 states); and `git diff --check`. Its worktree was clean.
Build warnings are the existing stylesheet budgets/CommonJS warnings. Lint has zero
errors and the existing 15 permitted warnings.

### 5. Issues found and resolved

G1 locale-based sorting could change serialized bytes across locales; it now uses ASCII
ID order. A mixed document's force export could still offer the geared host's input
torque; every object in a geared partition is now excluded with an explicit unavailable
note, while ordinary force results remain supported. Fresh Windows checkout exposed
CRLF versus formatter/generator mismatches; the text checkout policy now specifies LF.
No tolerance, reference result or numeric precision was relaxed.

Fifteen significant coordinate digits remain justified by repeated centimeter, meter
and inch round trips. G1 owns authored project-unit coordinates, which are converted to
model units exactly once. It does not persist a second solver state.

### 6. V1 acceptance

**Fixed-axis external circular gear V1 remains production-ready within its declared
scope.** Recommend opening its PR after identifying/landing the worksheet dependencies.
No unresolved V1 correctness issue blocked continuation. Compound development starts
from the protected checkpoint on its own `feature/gears-compound` branch.

## Compound V1.1

### 7. Data and ownership

Multiple individual `Gear` records reference the same ordinary `RealLink` through
`hostLinkId`. That link is the shaft's physical identity. All its attachments share
the same grounded center and reference point. There is no extra body, input, shaft
speed, angular state or `compound` flag.

The only new authored field is optional `plane`: an integer 0–127, displayed as axial
planes **1–128**. Omission means plane 1, preserving existing G1 bytes. Different
attachments on one shaft occupy distinct planes; meshed gears occupy the same plane.
This expresses axial alignment, not a manufactured thickness or axial distance.
It prevents a drawing from claiming gears in different planes mesh.

### 8. Creation

Select a gear and choose **Attach Another Gear**, or use the existing geared host's
context menu. The new gear inherits its shaft's center/reference and module, uses the
lowest free axial plane, and opens its normal Teeth/Pitch Diameter/Axial Plane fields.
It creates no joints, links or independent inputs. Select **Mesh With…** to connect it
explicitly to a gear on another shaft in the same axial plane. The normal preview
checks planes, module, pitch spacing and graph compatibility before committing.

### 9. Rendering

The canvas draws concentric pitch outlines at their true center, with numbered
`P1`/`P2` labels and different dash patterns. It applies one physical heading to all
attachments on a shaft. The selected outline is drawn last; labels for coincident
radii are stacked. No screen offset is fed into geometry, and no perspective artwork
pretends that the shaft moved. Tick detail remains bounded at 96 (12 at low detail).

### 10. Selection

Each gear has its own focusable SVG target, accessible name and Enter action.
The **Gears on Shaft** list provides explicit individual navigation, including a
rear or equal-radius attachment. Repeated clicks on coincident pitch circles cycle
through their plane order. A continuous transparent stroke hit target makes dash gaps
clickable. Native pointer, touch and compatibility mouse events are stopped at the gear so
the canvas's legacy tap handler cannot clear its selection before cycling runs.
The browser regression reproduces this interaction and captures both selections.
Final visual review also corrected the analysis help paragraph's horizontal spacing:
padding inside the standard full-width panel child replaces margins that clipped its text.

### 11. Compiler

The exact weighted graph is now built over physical hosts. Mesh edges still use their
individual gear endpoints' teeth. `GearDrive.bodies` holds one prescribed motion per
host; `GearDrive.gears` maps each gear identity to that body and its authored heading.
`gearBodyFor` resolves that reference for analysis and the worksheet.

For A20 → B40, with C10 on B's host and C10 → D30, the graph naturally gives
`A=1, B=C=-1/2, D=+1/6`. There is no B/C mesh. Exact bigint cycle checks and reduced
ratios remain authoritative. The LCM gives **six input turns / 2,161 endpoint-inclusive
samples** for a full train period. The body points are prescribed once, and the existing
nonlinear solver handles the remaining linkage and complete original constraint audit.

### 12. Mobility

No new mobility algorithm was needed: the existing Jacobian already counts rigid bodies
and mesh constraints. Explicit tests show three freely rotating shafts have 3 DOF;
the first mesh reduces that to 2, the second to 1. Adding C alone changes neither body
count nor DOF. Parallel compatible mesh cycles remain consistent; incompatible exact
ratios are reported as locking.

### 13. Persistence

G1 extends its whitelist only with nonzero `plane`. It preserves independent gear IDs,
shared host IDs and individual mesh endpoints. Shared angular relations are derived.
Old V1 and gear-free encodings retain their formats. Malformed planes (negative,
fractional, out of range, null or string) fail atomically; structurally valid but
physically incompatible plane edits remain visible and repairable.

Five repeated byte-stable round trips cover the compound fixture. Native browser tests
cover Save, Share, reload and opening the downloaded `.pmks` over an ordinary four-bar.
Serialization sorts records by ID; source array insertion order is not physical state.

### 14. Lifecycle

- Delete B: remove B and only B's incident meshes; C, its host and C–D remain.
- Delete C: remove C and only C's incident meshes; B and A–B remain.
- Delete the shared host, center or reference: remove both attachments and all incident meshes.
- Duplicate the complete train: four fresh gear IDs on three copied hosts; copied B/C
  share their copied host; copied meshes connect copies only.
- Duplicate only the shared host: copy both of its attachments, with no cross-boundary
  meshes or reconnection to originals.
- Tracer changes remap both attachments when the host ID changes. Weld/unweld/merge
  remain refused before mutation while any gear attachment remains.

Real history tests cover Undo/Redo of these operations and edits at a paused pose.
Deleting B removes the input path to C–D: the retained attachments remain structurally
valid, but that disconnected train is correctly undriven. PMKS does not invent a new
actuator to make it simulate.

### 15. Analysis and export

B/C keep separate names and selectors while sharing identical angular position, travel,
velocity and acceleration series. The waveform/table sampler and worksheet read the same
compiled motion. CSV and XLSX use those same tables in degrees and radians. Endpoint
travel remains six turns for A, minus three for B/C and plus one for D (signs reverse
with input direction); the rendered pose repeating does not reset continuous travel.
The final D angle also retains its authored reference-heading offset.

Canvas SVG and report fallback label both concentric attachments and their planes.
Gear forces, pressure-angle loads, input torque and manufacturing DXF remain unavailable
under the existing capability guards; ordinary gear-free mechanisms retain their results.

### 16. Playable production example

The mechanism library's **Start Here → Compound Gear Train** uses exactly the 20/40 +
10/30 arrangement, three visible shaft reference arms and an ordinary closed four-bar
driven by D. The source is the verified `COMPOUND_GEAR_FOUR_BAR` fixture, not a separate
hand-tuned demo. The bare train and coupled fixture are also published in the generated
[fixture gallery](fixture-urls.md).

Local app: [compound preview](http://localhost:4334).
Choose **Project menu → Mechanism Library → Compound Gear Train**. Select B/C, edit fields,
mesh with another shaft, Play/Pause and scrub to the full endpoint. These changes are
local; the public PMKS site cannot decode the new compound capability until it ships.

### 17. New tests

| Suite | Coverage |
| --- | --- |
| `compound-gear-kinematics.spec.ts` | Exact +1/6, B/C displacement/velocity/nonzero acceleration, physical body count, mobility, full period, reverse direction, exact compatible/locking cycles, coincident independent hosts, ordinary four-bar derivative agreement |
| `compound-gear-persistence.spec.ts` | Whitelist, shared identities, repeated round trips, editable physical diagnostics, atomic malformed-plane rejection |
| `compound-gear-lifecycle.spec.ts` | Attach another, gear/host/center/reference deletion, full/partial copies, tracer remapping, structural refusal, real history, paused edits |
| `compound-gear-results.spec.ts` | Every B/C frame, worksheet identity and ratios, continuous endpoint, four separate gear exports, degree/radian table/CSV/XLSX agreement, report SVG |
| `e2e/compound-gears.mjs` | Native creation and editing through phone layout, with motion and selection filmstrips |

### 18. Existing regressions and final gates

Final verification passes: **253 unit files / 2,642 tests**, **14 focused gear-related files / 115 tests**, `npm run check` (zero errors, 15 existing warnings), production build, Storybook build, all four relevant browser scripts and `git diff --check`. Logs are in this worktree's ignored `artifacts/gears-compound/`.
The unchanged V1 focused suites remain part of the gate. The production example is
generated through `template-payloads.spec.ts`, with the existing template and fixture
gallery contracts intact.

### 19. Browser and Storybook

The native compound workflow passes and captures 23 frames, including moving compound
and coupled four-bar sequences, coincident selections, duplication and a 390×844 phone
panel. The existing V1 production and results workflows also pass against this build. Compound-specific native checks additionally open the worksheet (four gear identities, no math-render errors), download CSV/XLSX, and confirm the output endpoint is 360 degrees with a signed speed of -30 degrees/second at a -30 rpm input. Real touch taps and mouse clicks both cycle coincident outlines.
CUA exposes no enabled app/browser surfaces in this session; the repository's documented
fallback uses tracked Playwright suites in disposable Chrome, with screenshots inspected.

The local gallery adds seven **Canvas/Gear Shaft** states (pair, front selected, rear
selected, three gears, coincident outlines, invalid overlap, low detail) and two
**Fields/Compound Gear Shaft** states (narrow and phone panels). The original fifteen
states remain: **24 total**. PMKS exposes one light application theme.
Gallery: [local Storybook](http://localhost:4335).

### 20. Performance

Limits remain **128 gears, 256 meshes, 6,000 samples**. The performance suite retains
all five V1 workloads and adds the compound train and compound four-bar. Measurements
are local observations, not timing guarantees. A dedicated run's results are recorded
below.

| Workload | Samples | Elapsed (ms) |
| --- | ---: | ---: |
| 20T/40T | 721 | 11.9 |
| 20T/100T | 1,801 | 17.8 |
| Gear-driven four-bar | 721 | 27.7 |
| Idler | 721 | 9.6 |
| Eight-gear train | 361 | 16.5 |
| Compound train | 2,161 | 70.3 |
| Compound four-bar | 2,161 | 103.4 |

The compound cases are measured first (cold); the V1 cases benefit from warmed code. No evidence calls for raising the limits or changing the solver route. More samples and the downstream linkage explain the added work; these observations are not a controlled microbenchmark.

### 21. Known limits and design decisions

Only circular external gears on simple fixed-axis ordinary rigid hosts are supported.
Welded/multiple-link host assemblies, internal gears, planetary trains, racks, moving
centers, forces, tooth/contact physics and synthesis remain outside this release.
Meshes are explicit; touching outlines do not automatically engage.

All attachments on a shaft share one center/reference pair; independent tooth-phase
offsets are not authored. Axial planes describe alignment and identity, not finite
thickness, separation or collision detection. Equal-radius outlines are legal on
different planes and use explicit navigation/cycling. Different gears on one host in
the same plane are diagnosed rather than silently merged.

### 22. Acceptance

**Compound gear V1.1 is ready for acceptance within the scope above.** The V1 checkpoint remains independently protected and reviewable. The compound branch is local and stacked on V1, with separate compiler/ownership, editor/lifecycle/results, and example/gallery/browser handoff commits. No push or publication was performed.

The compound milestones are `342eda38` (compiler, physical ownership, G1 and fixtures),
`c4243e16` (native editing, selection, lifecycle and result agreement), followed by the
example/gallery/browser handoff commit in the branch log. That final commit also keeps
the demonstrated touch-handler and analysis-spacing fixes. Both dedicated worktrees
are clean; generated dependencies, local servers, screenshots, downloads and logs are
gitignored artifacts.
