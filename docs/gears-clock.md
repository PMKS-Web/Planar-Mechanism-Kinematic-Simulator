# Mechanical Clock showcase

> **Status:** Reference — implemented locally on `feature/gears-clock-example`; no push or publication.

Open **Project menu → Mechanism Library → Start Here → Mechanical Clock**.
The local review server uses `http://localhost:4336`. Press Play; select **Minute A**
and change its ordinary Input Speed to slow the demonstration. At −30 rpm the full
cycle takes 24 seconds. The default −60 rpm is accelerated, not a real-time clock.

## Mechanical design

Three ordinary rigid hosts, six ordinary revolute joints, four gear attachments and
two external meshes produce one degree of freedom. No clock-specific solver or
ratio assignment is involved.

| Host | Gear | Teeth | Visible axial plane | Center (cm) | Reference |
| --- | --- | --- | --- | --- | --- |
| AB, Minute hand | GA, Minute A | 12 | 1 | A (0, 0), grounded input | B (0, 5) |
| CD, Intermediate shaft | GB, Intermediate B | 48 | 1 | C (3, 0), grounded | D (3, −1.2) |
| CD, Intermediate shaft | GC, Intermediate C | 15 | 2 | C (3, 0), grounded | D (3, −1.2) |
| EF, Hour hand | GD, Hour D | 45 | 2 | E (0, 0), grounded | F (0, 3.4) |

A and E are distinct joint identities at identical coordinates. AB and EF remain
different physical bodies; the compiler never merges them by coordinate equality.
B and C in the tooth-count description mean the intermediate **gears**, not the
ordinary joint IDs B and C in this table.

All gears use module **0.1 cm/tooth**. The fixture computes center distance from
`m(12 + 48)/2 = 30m = 3 cm`; the production validator independently accepts both
meshes, including `m(15 + 45)/2`. A displaced intermediate bearing fails both mesh
spacing checks. Pitch radii are 0.6, 2.4, 0.75 and 2.25 cm. The hand lengths, 5 and
3.4 cm, are independent rigid geometry. The production fixture pipeline scales
centimeter geometry into model coordinates (200 model units/cm); this is the same
pipeline as the other gear examples. Axial plane indices remain zero-based internally.

The external routes are GA → GB and GC → GD. The compiler gives GB/GA = −1/4,
GC = GB on their shared physical host, and GD/GC = −1/3. Thus GD/GA = **+1/12**.
Both central hands turn clockwise at −60 and −5 rpm; the intermediate turns at
+15 rpm. All acceleration values are zero for this constant-speed input.

The complete cycle is **12 root turns**, **4,321 samples**, **12 seconds**. Signed
travel at the endpoint is minute −4,320°, intermediate +1,080°, hour −360°.
Every physical point returns to its starting position, while continuous travel
keeps those complete turns. The unchanged sample ceiling is 6,000.

## Presentation and analysis

The long indigo minute hand and shorter teal hour hand are ordinary named links.
At their aligned starting pose, click the exposed upper minute segment or the
lower hour segment. Each central gear also has its own pitch-circle hit target.
Keyboard focus/Enter, Select Host Body and the compound same-shaft list remain
available. Intermediate GB and GC share CD but retain their separate plane labels.

The dial is `assets/backdrops/clock-face.svg`, using the existing BackgroundImageService.
It contains simple ticks and 12/3/6/9. It contributes no body, DOF, mass, constraint,
contact or force. A small optional `TemplateBackdrop.fitFullMotion` presentation
setting calls the existing full-motion fit after placement, through either library
entry point. This keeps the dial and hand sweep visible on desktop and phone.
Other backdrops keep their existing framing behavior.

The ordinary gear graphs expose position, continuous travel, speed and acceleration.
The hour graph reads −30°/s and the minute graph −360°/s. Ordinary hand-link angular
rates and point kinematics come from the same solved state. The worked worksheet
now explains authored mesh tooth ratios, shared shafts and the route to each output.
`gearDerivation` is a general presentation helper: overall exact ratios still come
from the compiler. Reversing authored mesh endpoint order preserves the explained
input-to-output route. There is no new motion, force or clock-analysis mathematics.

## Persistence

The generated library payload uses the ordinary G1 compound extension. Save `.pmks`,
Open, Share, refresh, history, speed edits, gear deletion and undo/redo preserve the
independent centers, host identities, planes and complete cycle. Length-unit changes
rescale both the mechanism and a currently loaded backdrop without changing ratios.

As with all existing backgrounds, the **dial image is outside the document and undo
history**. A `.pmks` file or normal Share link carries the complete mechanism, not
the dial. Opening the library card restores the dial; a library new-tab link uses
the existing `#backdrop=Mechanical_Clock` fragment. No special clock persistence
metadata was added. A reader's own background image is still preserved.

## Verification and evidence

- `mechanical-clock.spec.ts`: concentric independent bodies, production geometry
  validation, exact rational ratios, common intermediate coordinate, both input
  signs, complete period, all-sample B/C agreement, point positions and rigid-link
  velocity/acceleration. Hour travel after 1/3/6/12 minute turns is 30/90/180/360°
  in magnitude, with the correct input sign.
- `mechanical-clock-production.spec.ts`: generated G1 lifecycle, units, history,
  general worksheet route (including reversed mesh endpoints), normal hand analysis,
  all four gear quantities in degrees and radians, CSV/XLSX agreement and cost recording.
- `e2e/mechanical-clock.mjs`: real library controls, canvas hand/gear targets,
  all gear selections, playback filmstrip, quarter/half/full cycle scrubbing,
  graph, worksheet, actual file downloads, Share/reload/Open/history, units and
  390 × 844 phone panel. `--open` leaves disposable Chrome available for review.

Browser images and the JSON verdict are in `artifacts/clock/browser/`; the filmstrip
includes the start, ten motion frames, quarter/half/full cycle and phone views.
The generated `.pmks`, CSV and XLSX downloads live alongside those images.
Performance results are in `artifacts/clock/performance.json` and the browser report.
The measurements cover 4,321 samples and all four gear quantities for all four gears;
they are observations on this machine, not performance guarantees.

Acceptance completed September 12, 2026 (local time):

| Check | Result |
| --- | --- |
| Full unit regression | 255 files, 2,657 tests passed |
| Clock-specific final run | 2 files, 10 tests passed |
| `npm run check` | Passed; existing 15 lint warnings, no new warnings |
| Production build | Passed; existing stylesheet budget/CommonJS warnings |
| Storybook build | Passed; existing chunk-size warnings |
| `mechanical-clock.mjs` | Passed; 22-frame filmstrip, inspected motion/selection views and all four gear graphs |
| `gear-production.mjs` | Passed |
| `gear-results.mjs` | Passed |
| `compound-gears.mjs` | Passed |
| `template-backdrops.mjs` | Five checks passed |
| `gear-gallery.mjs` | All 24 existing V1/compound states passed |
| `git diff --check` | Passed |

No existing V1/V1.1 test file was edited. Native browser workflows use disposable
profiles. Codex's computer-use inventory had no enabled surfaces in this session,
so verification used the repository's tracked Playwright fallback and direct
inspection of its PNG evidence.

The final focused timing run measured **98.7 ms** to construct/solve the fixture,
**142.7 ms** to collect the complete 16-column gear analysis, **11.2 ms** to write
CSV (1,090,138 bytes), and **23.4 ms** to write XLSX (2,849,488 bytes). The final
headed browser measured **223.7 ms** for the selected hour CSV download action and
**197.2 ms** for XLSX, including the UI/download interaction. An earlier full-suite
run under concurrent load measured a 266 ms solve; the variation did not require
solver changes or a sample-limit increase.

The example is ready to retain as a production showcase in this local branch.

## Branch preservation and architectural conclusion

This branch starts at clean compound checkpoint `d5e30998`. Protected V1 checkpoint
`daef9908` and the compound worktree remain unchanged. The original shared checkout's
uncommitted work is untouched. Nothing is pushed or published.

Two concentric independent shafts required **no change to the gear compiler, solver,
body assignment, G1 codec or sample limit**. The only reusable additions are a
worksheet route explanation and an optional template call to the existing motion-fit
control. Gear tooth contact forces remain outside the existing V1/V1.1 scope.
