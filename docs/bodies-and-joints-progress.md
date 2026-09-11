# Bodies and joints execution ledger

## Authority and status

- Goal: implement **all S0–S8** of [the plan](bodies-and-joints-plan.md), including native default editor, consumer cutover and obsolete-runtime removal. No push or publication.
- Implementation starting commit: `487d535` on `bodies-and-joints-plan`.
- Worktree: `.claude/worktrees/funny-swirles-3c6486`.
- Current checkpoint: **S0–S2 complete; S3 in progress**. Native editor cutover has not begun. Concrete interface choices are in [the contract](bodies-and-joints-contract.md); frozen catalogs/reference hashes are in [the baseline](bodies-and-joints-baseline.json).
- Sole implementation owner: Codex. Fable reviews only at the four specified gates.
- Preserve other worktrees and unrelated changes. The starting tracked worktree was clean.
- Runtime for these commands: Node `v24.18.0`, explicitly prepended to PATH; the login shell otherwise selects unsupported Node 20.
- Owned dev server: `http://localhost:4307/`, Angular CLI started in this worktree. Recheck process, HTTP readiness and served source on resumption.

## Checkpoint gates

| Checkpoint | Status | Evidence / next work |
| --- | --- | --- |
| S0 | Baseline complete | Six unit suites pass (182 tests), seven new compatibility tests pass, build passes, template-open 11/11, template-graphs 3978/3978, ui-copy 17/17. Timing, visual baseline and operation-level consumer classification are recorded. Existing drag timing failures are reproduced on original test files, not waived; S7 must meet the measured comparison budget. |
| S1 | Complete | Native records, frames/rebasing, coordinates, material/group mass, weld compiler, pin bundles, cylinder factory and reference validation. F1 completed and resolved; final gate 12 files / 84 tests (`reviews/F1-final-unit.log`), build passes (`reviews/F1-build.log`). Earlier unchanged-editor browser gates: two-mechanisms 13/13, cylinder-mount 31/31 and ui-copy 17/17. No native UI cutover yet. |
| S2 | Complete | Native compiler, analytic Jacobians, mobility/admission, branch continuation, folds, limits and frame conditioning. Seven native/legacy and four native/MATLAB comparisons retain the original ceilings. Geometric redundancy, two slots on a carrier and one-pin/shared-WORLD cases pass. Combined S2/initial-rate gate: 255 tests / 37 files; current-editor browser gate is green. Continuous cycle event publication remains an explicit S3 obligation. |
| S3 | In progress | Analytic rates, forces, continuous intervals/cycles, immutable document snapshots and result readers implemented. Full unit suite: 2655 tests / 276 files pass, including native/MATLAB point and angular rates. Both reproduced legacy test failures are resolved with boundary-specific tracer assertions and explicit quantization bounds plus a full native butterfly branch comparison. Host build and ui-copy pass. Current-editor S3 browser gate is green. All five native worked examples now have closed-form motion, cycle and loaded-reaction checks; F2 remains pending. Latest full unit gate: 2676 tests / 282 files, build and ui-copy 17/17 pass. |
| S4 | Pending | Native transactions, codec/import, lifecycle, history and F3. |
| S5 | Pending | Native editor and both browser workflows; existing visual language. |
| S6 | Pending | All consumers, synthesis, tutorial, fixtures/templates and default cutover. |
| S7 | Pending | Removal manifest closed and performance budget met. |
| S8 | Pending | Integrated union of gates, live inspection, F4 and release evidence. |

## S0 verification

Logs live in `artifacts/bodies-and-joints/S0/` (gitignored).

With `PATH=/Users/kohmei358/.nvm/versions/node/v24.18.0/bin:$PATH`:

```sh
npm test -- --watch=false \
  --include=src/app/app.component.spec.ts \
  --include=src/tests/verification/fixture-gallery.spec.ts \
  --include=src/tests/verification/template-payloads.spec.ts \
  --include=src/tests/verification/template-url.spec.ts \
  --include=src/tests/verification/coupled-route-agreement.spec.ts \
  --include=src/tests/verification/force-power-balance.spec.ts
```

Result at the starting commit: **6 files / 182 tests passed**. `unit.log`; Angular build 12.072 s, Vitest duration 5.75 s. These are harness durations, not mechanism performance measurements.

Additional results:

- `npm test -- --watch=false --include=src/tests/verification/production-203-payloads.spec.ts`: **7/7**, `production-203.log`. Freezes five historical template payloads plus the grounded carriage mass and a separately authored compound/load case.
- `npm run build`: sandbox process exited 134 with no diagnostic after “Building”; rerun with normal host permissions succeeded, `build-escalated.log`. Existing dependency/style warnings remain; no application source has changed.
- `template-open`: **11/11**; `template-graphs`: **3978/3978 across all 43 public templates**; `ui-copy`: **17/17**, zero browser errors. Logs and copies of reports/screenshots are under S0.
- `drag-perf` now additionally records frame p50/p95/worst/count; comparison tolerances and tracked historical baseline are unchanged. The reporting-only run passed 3/12 stored budgets; an exact `git archive 487d535 e2e` run passed 2/12 against the same unchanged app. Both reports are retained (`drag-perf` and `drag-perf-original`). This is a verified existing failure; thresholds remain unchanged and S7 still owes the same-machine performance comparison. Frame p90 is 9 ms in most scenarios versus the tracked baseline's 17 ms, so the display environment differs.

Required browser commands use `PMKS_BASE_URL=http://localhost:4307 PMKS_PLAYWRIGHT_DIR=..` and the same Node 24 binary: `e2e/template-open.mjs`, `e2e/template-graphs.mjs`, `e2e/drag-perf.mjs`, `e2e/ui-copy.mjs`. Do not run the large browser sweep alongside unit tests. Preserve measured baseline artifacts; do not overwrite the tracked drag baseline to make the gate pass.

Before the goal, Playwright and standard Codex computer use both exercised the four-bar on this localhost build: selection, coordinate edit, undo, context menu and play/pause. Playwright reported 16 distinct animation frames and no runtime errors; images were inspected. Incognito Chrome also showed changing poses and restored the typed X value on Undo. These establish tool access and a partial orientation, **not the complete S0 live gate**. The completed motion/phone baseline is described below; these earlier checks also cover the live incognito workflow.

## Removal manifest (open until S7)

Paths below are relative to `src/app/`. Every row needs a final deleted/reused/bounded-reader disposition, caller evidence and replacement behavior tests. `artifacts/bodies-and-joints/S0/consumer-files.txt` is an initial search aid, not proof of a complete semantic audit.

| Current responsibility / sites | Native owner | Consumers and behavior to migrate | Target |
| --- | --- | --- | --- |
| `model/joint.ts`: point identity, flags, connections, `PrisJoint` | body-system records and attachments | Services, grid, panels, selection, codec, fixture factories | S7 |
| `model/link.ts`: joint-derived frame, hull, `RealLink.subset`, `SliderBlock` | authored body geometry; derived weld groups | Draw order, dimensions, mass, exports, solver result consumers | S7 |
| `model/cylinder.ts`, `slide-assembly.ts`: infer member roles | assembly records | Creation, ownership, permissions, skin and analysis labels | S7 |
| `model/cylinder-layout.ts`: five-point construction | two-body assembly factory | Cylinder fixtures, insertion previews, dimension edits | S7; retain pure skin geometry only with named caller |
| `model/cylinder-pose-plan.ts`: synthetic closure and repair | body edit transaction | `grid-utils.service`, normalizer, locks/holds; preserve atomic refusal tests | S7 |
| `mechanism.service`: `releaseFromCompounds`, `splitCompoundAtRemainingWelds`, `createNewCompoundLinkFromSubset`, `removeCompoundJoints` | persistent body/weld records and lineage | Delete/weld/merge, material properties, loads, holds, selection | S7 |
| `mechanism.service`: `reconcileAssemblyWelds`, `reconcileSlots`, carrier recovery | explicit ID validation | Slider drops, shared-mount cascades, save/reopen | S7 |
| `mechanism.service`: editable arrays also hold playback pose | document + immutable simulation snapshot | Anchors, history, unrelated clocks, all getters/mutations | S6–S7 |
| `model/rigid-bodies.ts`, `model/mechanism/bodies.ts` | one weld compiler and material/group mapping | Mobility, forces, display group queries | S1 interface / S7 old implementation |
| `model/mechanism/position-solver.ts`, `simultaneous-solver.ts`, `mobility.ts` | native constraint compiler and per-machine solver | Branches, bounds, rank, retry, rollback, known reference answers | S2–S7; reusable linear algebra only |
| `model/mechanism/kinematic-solver.ts`, `loop-solver.ts`, finite-difference result fallback | derivatives of native rows | Graphs, force inertia, witnesses, exports | S3–S7; no old editable graph retained |
| `model/mechanism/force-solver.ts` | native Newton–Euler / constraint wrenches | Loads, member/group CoM, normal force and P couple, power | S3–S7; reuse physical algebra where valid |
| `model/actuator.ts`, drive profile and anchor readers | stable joint coordinate refs | Input settings, timing, reversals, resumed edits | S3–S6 |
| `services/transcoding/mechanism-builder.ts` and old runtime codec facade | native codec + bounded decoded-record production reader | Share, save, history, recovery, templates | S4–S7 |
| `grid-utils`, `multi-edit`, `selection-batch`, drop and lock/hold models | one native planner/refusal result | Every preview and commit; all-or-nothing bulk operations | S4–S7 |
| `active-obj`, `model/selection*`, joint-letter selection keys | typed stable selection refs | Edit/analysis subject, keyboard/touch, undo mapping | S4–S6 |
| `slider-mark`, `model/joint-marks`, cylinder skin discovery | typed relationship marks and assembly skin roles | Hit targets, channels, glyphs, motion, group color | S5–S7 |
| `component/new-grid`: synthetic hitboxes, old creation/toggle/drag handlers | native commands and rendering views | Six link-creation routes, P travel handle, pair picking, design drag | S5–S7 |
| Edit panel and context-menu local topology queries | native selection + shared permissions | BLOCKS controls, kind/pair settings, explicit delete scopes | S5–S7 |
| Analysis services/components and export joint-letter maps | typed native sample accessors | Units, unavailable values, attachment/CoM rates, reaction pairs | S6 |
| `services/export/`, CAD dialog | native start-pose geometry and semantic tables | SVG/DXF, CSV/XLSX/report, origin shift, units, selection | S6 |
| Synthesis and tutorial point-graph writers/readers | native commands / progression facts | Dyads, drive direction, saved design, tutorial Undo | S6 |
| Test-utils constructors, templates and dev gallery | native fixture/editor commands | All catalog IDs and independent numerical references | S6 |
| Dead IC paths, obsolete CSS, imports and dependencies | none | Confirm no live caller before removal; retain useful BLOCKS styling | S7 |

## Production import audit

Local historical source `b7ec8d7` declares package version 2.0.3. Its shipped template source contains the five R/grounded-slider templates, and its `StringTranscoder` reads the five joint flags including `isWelded` and PRISMATIC. This establishes actual legacy syntax support; it does not establish that every commit carrying version 2.0.3 was deployed. The supplied deployment context says production has no floating slots, Slides or sealed cylinders. Freeze payloads and verify historical source coverage before implementing the bounded reader. No production bundle or deployment was changed.

## Anthropic reviews

Working ceiling: **$35**, planned caps F1 $5 / F2 $10 / F3 $7 / F4 $6; $7 reserve. F1 completed; F2–F4 remain required.

| Call | Session | Actual reported cost | Status |
| --- | --- | --- | --- |
| Planning availability probe | `1e1aa8aa-e65e-4f52-957b-56ef372e594e` | $0.073899 | `claude-fable-5-1`, `FABLE_OK`; availability only |
| Earlier canceled planning review | `93cfef40-4bbb-4454-81b8-a2317a37861f` | Unknown; reserve $6 | Transcript ends interrupted; no findings or approval claimed |
| F1 | `aab450ea-661d-45fc-a91a-6286dd1d8614` | $3.40532475 | Completed on `59296bb`; regressions and resolution below |
| F2–F4 | Pending | Not spent | Caps $10 / $7 / $6 |

Known reported spend: **$3.47922375**, including the probe and F1 auxiliary usage. With the $6 canceled-call reservation, $25.52077625 remains inside the $35 ceiling. F2/F3/F4 caps total $23; unallocated headroom is $2.52077625. Do not spend the reservation.

## Current source audit findings

- Mechanical inventory: **1,592 sites / 85 production files**, `consumer-sites.tsv`. The original scan is now classified by enclosing operation in `docs/bodies-and-joints-consumers.tsv`, with native output owners and deliberate mixed concerns. Adding eight transitive geometry helpers gives 1,629 sites across 93 files. Conversion/deletion remains pending; see `docs/bodies-and-joints-consumer-audit.md`. Catalog extraction uses the shared template reader and the TypeScript AST for gallery names (a quoted apostrophe defeated the first simple name match).
- Nine reference/MATLAB files have frozen SHA-256 hashes. The checked-in baseline also freezes 43 public IDs, three dev IDs and 66 gallery names.
- Five template payloads are copied verbatim from `b7ec8d7`. The extra welded/load payload was **authored with that historical commit's own eight pure codec modules**, not taken from a shipped template. The generation script and decoded records are in S0 artifacts. Source version alone does not identify a deployed commit.
- Plan clarification: reversing carrier/rider on a freely rotating pin-in-slot is a physical change, not a harmless A/B permutation. Keep guide ownership explicit and test equivalent transformations only.
- Plan clarification: root-owned legacy compound forces have no unique member owner. The contract preserves import-only group provenance and refuses a split that needs an ownership choice. New native loads still require a material BodyId. Review this with F1 and F3.
- Native computer-use baseline: opened Cylinder-Driven Boom in a new incognito tab through the library; selected barrel to get Edit Cylinder GC, expanded Visual Settings, fitted full motion, played and inspected multiple poses, paused and verified the pose-bound field refusal and live mass controls. Returned to start, dragged C from (0,4) to (0.36,3.78) cm and one Undo restored (0,4). The existing skin stays aligned with the ram; selected amber outline and faint design ghost are distinct. The current third “Sliding Body” mass row is an intentional removal candidate when the assembly becomes two physical bodies. Complete-cycle Playwright filmstrips now supplement these live checks; isolated native screenshots alone were not counted as proof of a full cycle.

## Completed timing and visual baseline

- `precompute.json`: all 43 templates valid, all nine cache-cold rebuilds per template retain identical sample counts. First rebuild is reported separately; p50/p95 use the other eight. Slowest measured p95 is Cylinder_Gripper at 91.8 ms (359 samples); Double_Butterfly 27 ms; Pumping_Field 26.4 ms for three partitions. Heap, units, scale and original sample counts are frozen in the checked-in baseline.
- `visual/report.json`: zero browser errors. Four-Bar, Cylinder_Boom, Scotch_Yoke and Three_Machines run for 2.15–2.18 cycles of their slowest machine, with 26/26/26/32 captured frames. Codex inspected all four contact sheets, desktop focus, subsection and phone animation sheets. Cylinder extension/return stays aligned; Scotch yoke keeps its guide heading; three independent machines retain their separate motion. These observations are visual evidence, not numerical accuracy assertions.
- Preserve the visible design ghost, indigo/teal parts, amber selection, white elevated cards, compact gray fields, Roboto, measured-height phone slide, subsection fade/resize, and focus underline. The 390×844 phone sheet clears the playback card. Reduced-motion open/close was captured too. No unnecessary visual redesign is called for.
- The visual harness initially called sample indices `seconds`; its saved report and harness now call them `samples`. Wall-clock durations are separately recorded in milliseconds; this labeling correction changes no measurement.

## Next action

Launch F2 against the verified native S3 kernel and resolve actionable findings before S4.
The five worked examples, continuous paths, rate/force ownership and frozen references now
pass the full computational gate. See the latest entry below for the exact evidence and
budget. S4–S8 remain required; the current editor and gallery still use the legacy route.

## S1 implementation history (pre-review evidence)

- New `model/body-system/` modules hold opaque record IDs, material bodies with independent geometry, two-body joint records, unit conversion, frame transforms/rebasing, coordinate evaluation, a deterministic weld compiler, and material mass integration. No live application consumer imports these modules yet.
- The cylinder factory makes two material bodies and one P with an explicit travel limit; outer mounts are attachments, not invented connections to WORLD. There is no synthetic carriage body.
- Group annotations keep explicit aggregate mass/CoM/inertia separate from member-derived properties; a dangling annotation after a split fails validation. Membership-changing transaction policy remains S4 work.
- The native validator is currently a typed-record/reference validator. S4 still owes the defensive unknown-input codec boundary; do not mistake this for a complete decoder. Solver feasibility (including internal joint consistency/drive conflict) remains S2 work.
- `S1-first-tests.log`: initial test helper type failure, fixed. `S1-tests-2.log`: 16 tests passed. `S1-tests-3.log`: 18 tests passed. The reversal and complete rebase assertions pass in `S1-gate-unit.log` (68). The validator extraction briefly caused a void-return compile failure (`S1-gate-unit-final.log`), corrected in `S1-gate-unit-verified.log` (69). Guide ownership adds a 70th assertion case (`S1-guide-owner-unit.log`); slender-bar compatibility brings the final total to 71 (`S1-slender-bar-unit.log`).
- F1 is now running after the S1 self-review and gates. The canceled planning cost is conservatively reserved below. No F1 approval or finding disposition is claimed until the completed review is inspected.

### Additional source findings and current verification

- `model/uniform-body.ts` is a material-geometry consumer missed by the initial property-name scan (it takes plain points). Its default bar is a slender rod; neither Object Scale nor circle display style changes inertia. The native mass implementation was corrected before cutover, with a 5 cm / 12 g / three-width regression. S0's inventory needs this helper and other transitive geometry utilities, not just direct graph readers.
- P equation order and visible guide ownership are distinct. `guideDisplay` now retains its BodyId and local attachment/frame; reversal and rebase preserve both guide endpoints in world space. A freely rotating pin-in-slot still cannot exchange guide/rider as an equivalent operation.
- The validator is split into focused material, joint, relationship and group checks. These are typed-record checks; unknown-payload decoding is still S4.
- Host browser gate logs: `S1-two-mechanisms-host.log` 13/13; `S1-cylinder-mount.log` 31/31; `S1-ui-copy.log` 17/17, zero errors. Codex inspected compound-drag and running contact sheets. The native code remains unreferenced by this editor, so these protect the legacy app and do not prove native UI integration.
- `S1-build.log` passes with existing warnings. Native changes after that build are covered by the subsequent Angular unit build; a full checkpoint is still pending.
- Baseline/contract commit: `05e0780`. This freezes evidence and the open inventory, not a claim that S0 is fully verified. Native foundation is the next progress commit; no push.

- Final foundation checks: `S1-slender-bar-unit.log` passes 71 tests across ten files. A subsequent locale-independent ID comparator passes the two affected suites (10 tests), and the newly added non-UUID ordering regression passes in `S1-codepoint-order-unit.log` (4 weld tests). IDs choose derived frames by code-point order, never client locale or display label.
- Recovery state: baseline commit `05e0780` plus the native-foundation progress commit. All earlier test/browser/build sessions completed. The localhost server and the explicitly tracked F1 review are now the only intended running work.

## F1 review launch accounting

The canceled planning session is `93cfef40-4bbb-4454-81b8-a2317a37861f`. Its persisted transcript ends with a user interruption and no billed-cost result. Token totals must be deduplicated by message ID; individual streaming content blocks repeat usage. The five unique message usage records are retained in `reviews/canceled-planning-usage.json`. Actual cost remains **unknown**; reserve **$6** against it. This is a conservative budget allocation, not a reported charge.

Working ceiling $35 minus known probe $0.073899 minus reservation $6 leaves $28.926101. Reserve F1/F2/F3/F4 caps of $5/$10/$7/$6 (total $28), leaving $0.926101 unallocated before actual review costs are returned. Savings in each completed review replenish headroom; do not spend the canceled-call reservation.

F1 reviews native source at `59296bb` (diff from `05e0780`), with the contract and current tests. The remaining inventory edits are documentation only. No approval is claimed until a completed result and its findings are read and resolved.

## F1 completed review and resolution (September 10)

`reviews/F1.json` reports success, no error, model `claude-fable-5-1`, total $3.40532475
(main model $3.37265675 plus CLI auxiliary $0.032668). This is the actual charge reported by
the CLI. The review found no blocking frame-math error, but three medium and five low
findings. All seven executable counterexamples failed on the reviewed source in
`reviews/F1-counterexamples-before.log`; the unwrapped-angle finding is a documented choice.

- Pin-in-slot guide ownership is restricted to its carrier; P order reversal retains artwork ownership.
- Zero-mass groups retain their member display centers without inventing a physical CoM.
- Legacy group loads store relative material frames. Split/reshape refuses ownership ambiguity;
  global rigid motion and rebasing any member preserve it. Geometry compilation is independent
  of properties, so unrelated driver/limit/mass errors cannot mask the scope check.
- Keep strict unwrapped weld rests, including redundant cycles. Producers must capture from
  one pose set; the regression explicitly refuses a 2π-mismatched cycle.
- Refuse zero-length bars and infeasible new P/slot origins; R origins must coincide too.
  Earlier frame-algebra fixtures had off-line anchors; they now construct feasible oblique
  anchors while retaining their coordinate/reversal assertions.
- Group frame translations use document units; mass centers use SI. `groupPoseSI` and a
  centimeter/gram test make that boundary explicit.
- Group compilation returns typed property/annotation failures; it does not throw on a
  density bar, invalid geometry, or a foreign override frame. Negative member masses cannot
  be hidden by a positive aggregate.

`reviews/F1-fixes-first.log`: 30 native tests pass, including the seven original regressions.
The expanded provenance/unit tests pass (35 native tests). Final S1 gate passes **84 tests /
12 files**, `reviews/F1-final-unit.log`; host production build passes, `reviews/F1-build.log`.
The reviewed foundation plus these resolutions completes S1. Browser gates remain the earlier
verified legacy-app runs: none of this native code is imported by the active editor.
No live editor consumer has switched to native records; S2–S8 remain open.

## S2 progress: rows and local correction (not a completed checkpoint)

- `constraint-compiler` validates references and weld pose consistency, converts analysis data
  to SI, condenses welds, and keeps material mapping. A design pose inconsistent with its weld
  rest is refused rather than silently reconstructed. Derived solver frames are translated
  near referenced connection points; no authored frame or geometry is changed.
- R/P/pin-in-slot compile to native scalar rows with exact physical Jacobian blocks. Coordinate
  drives have command partial -1. Internal relationships are retained, including constant
  rows, commands and limits in an entirely fixed group. Compilation is not admission.
- Moving components sharing WORLD remain separate; an unconnected material body remains an
  underconstrained candidate. WORLD ownership and sample availability are distinct.
- Pivoted Householder QR provides rectangular solves, rank and nullspace without normal
  equations. Tests cover redundant rows, column pivoting, small independent directions,
  scale changes, malformed inputs and inconsistent right sides. Least-squares output is not
  itself a consistency verdict.
- `relaxBodyPosition` is a bounded local Newton correction with backtracking and immutable
  seeds. It deliberately does **not** certify branch, bounds or mobility; only the forthcoming
  continuation/admission layer may accept a simulation sample. Caps refuse, never return the
  last iterate as success. No current app consumer uses this layer.
- A one-pin rod retains its rigid witness point through a complete commanded turn. Oblique
  carriage correction is tested from 1e-12 through 1e5 length scales and after large local-frame
  changes. The first test exposed a scale near zero when nominally coincident guide origins
  differed by round-off; commanded travel/bounds now supply physical scale in this case, and
  the trust cap limits angular change instead of imposing an arbitrary translation limit.
- A native four-bar matches independent circle-intersection coordinates at three commands,
  including redundant R rows and reversed body/joint enumeration. This proves local nonlinear
  correction only, not full-cycle branch safety or agreement with every legacy fixture.
- `S2-first-rows.log`: 48 tests pass. `S2-linear-algebra.log`: five pass.
  `S2-position-first.log`: one scale regression fails; `S2-position-scaled.log`: all 56 pass.
  `S2-four-bar.log`: the independent nonlinear test passes. The formatted combined native/MATLAB
  regression gate passes **60 tests / 13 files**, `S2-rows-correction-gate.log` (57 native
  tests and three existing MATLAB regression tests). This is a progress gate, not all of S2.

Next work must not skip these requirements: partition-local numerical origins for large global
coordinate translations (material-local recentering alone does not solve global floating-point
cancellation); singular/rank and nonlinear mobility checks; sample branch/limit classification,
retry and rollback; passive/fixed drive/limit admission; full S2 numerical and browser gates.
The global translation behavior is unverified at this progress commit. S3 still owes analytic
rates/wrenches and F2. S4–S8 and native default cutover/removal remain entirely open.

## S2 progress: admission, continuation and geometric folds

- The 1e9 world-translation probe first failed with `unsolved` at normalized residual
  9.67e-9 (`S2-global-frame-probe.log`). Continuation now retains a partition-local pose and
  transformed fixed-boundary anchors. The probe passes without weakening residual tolerance
  (`S2-global-frame-fixed.log`). The earlier `S2-global-frame-before.log` was only an import-path
  compile failure, not numerical evidence; that fixture extraction path was corrected.
- `bodyMobility` separates regular rank, second-order compatibility and an obstructed tangent.
  The stretched two-rod example has one infinitesimal direction but zero actual local freedom;
  redundant four-bar rows retain DOF 1. Multiple obstructed directions report singular rather
  than falsely proving immobility. Higher-order singularity classification is not claimed.
- Analytic `bodyRowQuadratic` landed for these mobility/fold checks and is reusable by S3.
  Every native row kind is checked on independent curved paths with nonzero unknown/boundary
  acceleration and command acceleration. This is not the completed S3 rate/force layer.
- Admission checks the drawn rows, one drive, control rank, mobility and passive bounds;
  all-fixed internal rows/commands/bounds remain visible. A drive on a welded internal R is
  refused when it fails to control its surrounding moving body. P versus free pin-in-slot
  admits/refuses the expected DOF counts. Large-world input quantization is accounted for only
  when validating the authored start; corrected local residuals still use the strict tolerance.
- Continuation uses a tangent predictor and private bounded subdivisions, preserves unwrapped
  body angles, and discards all substeps on refusal. The four-bar retraces, the parallelogram
  traverses exact collinear samples over two complete turns, and cut/attempt/passive-bound
  refusals preserve the original command, poses and tangent. A tiny unbounded carriage moves
  from zero without a unit-dependent subdivision loop.
- A physical input fold is a separate proof using the passive regular curve, a bracketed input
  extremum and analytic curvature. The initial test exposed that exhaustion can say branch as
  well as unsolved near a true fold (`S2-fold-first.log`); either is upgraded to travel only
  after that proof. Both extrema match the rocker fixture's triangle formula. A forced
  attempt cap alone is still not a travel event (`S2-fold-directions.log`).
- The native axial ram/carriage fixture has three actual material bodies and four relationships,
  no synthetic slider. Both R and weld mount variants solve at three guide headings, retain
  the independent off-axis witness and enforce the ram stroke plus a tighter passive carriage
  bound (`S2-cylinder-position.log`). Rates, forces and UI construction remain S3/S5/S6 work.
- New fixture helpers are under `src/test-utils/verification/native-body-fixtures.ts` and
  `native-cylinder-fixtures.ts`. They are test construction candidates, not yet published UI
  fixtures; S4/S6 must route them through editor commands and the native codec/gallery.
- Intermediate passing evidence: `S2-admission-first.log` 66 tests;
  `S2-continuation-first.log` five; `S2-admission-boundaries.log` five;
  `S2-fold-directions.log` six; `S2-cylinder-position.log` two. The expanded required unit gate
  passes **229 tests / 33 files**, recorded by `S2-unit-gate-scope.json` / `S2-unit-gate.log`.
  Those legacy suites protect existing behavior; they are not native/reference agreement evidence.

Still pending before S2 is complete: full agreement on the reference mechanisms, a broader
singularity/redundancy set, and browser/build/ui-copy gates. Event localization and checking
passive-limit extrema between samples must be handled before S3's cycle precomputation can
claim continuous playback respects stops. The current frame/mobility/continuation code is
isolated from the live app. S3–S8, native default cutover and legacy removal remain open.


## S2 progress: independent reference agreement and frame precision

The position-only bridge `native-position-reference-fixture.ts` builds native records directly
from declarative reference geometry. It never reads solved legacy positions to set a body's
shape. Grounded free sliders become pin-in-slot relationships; welded riders become P
relationships, without synthetic blocks. Material attachments retain every reference tracer.
The bridge deliberately does **not** migrate loads or mass specifications and is not a codec
or editor adapter. S3 must not use its placeholder properties for force comparisons; S6 must
replace this bridge with published native fixtures built through editor commands.

`native-reference-position.spec.ts` advances the native continuation through every legacy
sample, in both native array orders, at the crank coordinate retained by that sample. Legacy
crank points are rounded at each rotation, so reconstructing the nominal integer degree is
not the same coordinate (the first attempt exposed that mismatch). Separately, every MATLAB
sample is solved at its published input angle, including the extra rocking extrema absent
from the legacy cycle. No MATLAB rows or singular/toggle samples are skipped. MATLAB's
slider-crank sensor E is explicitly mapped to B, as its source fixture documents.

Maximum Euclidean position differences (reference length units), from
`S2-native-reference-errors.json`; ceilings remain 0.001 against legacy and 0.01 against MATLAB:

| Mechanism | Legacy samples | Native vs legacy | MATLAB samples | Native vs MATLAB |
| --- | --- | --- | --- | --- |
| four-bar | 361 | 0.000159614052 | 361 | 9.06039944e-15 |
| slider-crank | 361 | 9.39926944e-05 | 361 | 1.83240863e-09 |
| Stephenson III | 199 | 0.000291999503 | 201 | 2.19379226e-08 |
| Watt I | 21 | 0.000455165508 | 23 | 1.49778267e-08 |
| inverted slider-crank | 361 | 0.000142040352 | — | — |
| guided rod | 361 | 9.95012174e-05 | — | — |
| offset-pivot lever | 361 | 0.000182947751 | — | — |

Three concrete defects were reproduced and fixed:

- The old grounded-input ordering rotated each point of a ternary crank independently.
  Repeated coordinate rounding changed the angle between B and tracer H: native/legacy
  error reached 0.002154 near the end of a revolution. The same rigid-tracer placement used
  elsewhere now carries additional input-body points from one direction. This small legacy
  correction is needed to maintain a trustworthy transition baseline; it is not a new legacy
  architecture. `S2-native-reference-diagnostic.log` records the failure; the unchanged
  0.001 agreement assertion passes after the correction.
- A weld to WORLD at x=1e9 accepted a body displaced by 0.01 because `sameTransform`
  allowed 1e-10 times the world distance. The failure is in `S2-weld-origin-before.log`.
  Frame comparison now accounts for floating-point precision of its operands, including
  cancellation, rather than that geometric fraction. Oblique, redundant grounded weld
  cycles pass at sizes 1e-9, 1 and 1e6, near and far from the origin. Unwrapped angle
  comparison remains capped at 1e-10; a large angle cannot hide a whole-turn mismatch.
- The factory used the opposite fixed-length half-measure: its absolute anchor tolerance
  rejected a feasible four-bar at size 1e6 before the solver ran. `S2-frame-invariance-first.log`
  records that refusal. Anchor feasibility now uses operand precision too. Native continued
  four-bars at sizes 1e-9, 1 and 1e6 pass at world rotations -1.1 and 0.9 with every material
  frame rebased; the independent circle-intersection answers agree after normalization to
  eight decimal places. Malformed anchor refusals remain covered by the F1 regression suite.

The pre-fix S2 browser gate completed (phase2 6/6, phase3 8/8, cylinder-mount 31/31,
playback-direction 14/14, ui-copy 17/17) and the build passed. After the legacy crank
correction, all five browser suites were rerun and pass again in
`S2-browser-after-reference/`. Codex inspected its running-ram and playback-reversal
filmstrips: the welded bracket remains attached, the block follows its guide, the design
pose stays visible, and reversal preserves the current pose. The phase2/phase3 reports and
screenshots are copied into that gate directory. These Playwright checks protect the current
editor; native editor integration and the later live incognito gates remain pending.

S2 is still **in progress**: broaden the native redundancy/singularity cases, especially two
slots on one carrier and nonlinear singular continuation, before closing the position gate.
Continuous passive-bound event localization belongs with the cycle controller before S3 can
claim playback stays inside every stop. No S3–S8 completion is claimed, and no Fable call was
made for this self-review checkpoint.


Final gate for this progress change: **243 tests / 34 files pass** in
`S2-reference-gate-final.log`, including the unchanged original MATLAB regression and all
specified S2 legacy suites. The native frame/factory subset independently passes 93 tests
(`S2-frame-invariance-fixed.log`). `S2-reference-build.log` is a passing production build
with the existing dependency/style warnings. Only touched source files were formatted.
The comparison bridge was renamed to include `position` so its limited property scope is
visible at the call site; its 11-case verification is rerun after that rename.


## S2 closure and initial S3 rate implementation

S2 now passes its remaining native probes. `native-redundancy-fixtures.ts` builds a third
parallel crank whose redundancy is geometric rather than a duplicated row, and two distinct
pin-in-slot joints on one rotating carrier, with separately grounded riders and off-axis
witnesses. The parallel branch traverses two turns, exact collinear samples, and the reverse
path in both array orders. Both slot riders agree with independent ray/circle intersections
through a full revolution. One-pin bodies retain their material shape and heading through
full turns without invented endpoint joints; two such machines sharing WORLD stay in
separate partitions. Fixture publication through native editor commands remains S6 work.

`body-rates.ts` and `body-point-rates.ts` begin S3. They return physical velocity/acceleration
from the accepted row set, including explicit moving boundaries, nonuniform command
acceleration, off-axis material points and numerical-origin changes. They hold no global
maps and return no motions on refusal. Tests cover R and P pairs with boundary acceleration
projecting into their rows, an unreferenced extreme-speed boundary, rank/missing-input and
contradictory-acceleration refusals, tiny incompatible commands, pinned/welded ram carriages,
a geometrically redundant parallel crank, and success → singular sample → recovery.

Two initial failures improved the implementation:

- `S3-rates-first.log`: the offset R pair was refused at its drawn pose because the tiny
  rounding difference between coincident anchors became the scale. The position scale now
  accounts for arithmetic precision and referenced moving-origin lever arms, with no absolute
  WORLD distance. Native position invariance/reference gates remain green.
- `S3-rates-offset-scale.log`: exact zero angular rates inherited tiny QR round-off and were
  misclassified as inconsistent. The residual check now includes a scaled floating-point
  allowance, without an absolute rate floor. Tiny conflicting commands still refuse.
- `S3-fixture-rates-first.log` was a test-title apostrophe syntax error, corrected before
  the mechanism checks ran; it is not solver evidence. `S3-rate-consistency-fixed.log`
  passes the initial eight rate tests. The added tiny-rate conflict probe raises that to nine.

`S2-final-and-S3-rates.log` passes **255 tests / 37 files**, containing every required S2 unit
suite plus the initial rate specs. No production UI module imports the native body-system
runtime yet, so the last five-suite Playwright gate at `d9f6e59` still covers the unchanged
live editor. Browser/native integration is not claimed. The new stop-event section in
`bodies-and-joints-contract.md` states S3's required controller behavior and counterexamples;
it is an implementation contract, not a completed controller.

S3 is **not complete**. It still owes physical joint/member wrenches and power checks, the
remaining independent end-to-end examples, broader reference-rate checks, native sample and
cycle publication with interior-stop detection, the full S3 gate, and F2. S4–S8 are pending.
No Fable call was made; the recorded review budget is unchanged.


The closure build passes in `S2-close-S3-rates-build.log` with existing warnings. Source was
formatted only where touched, and `git diff --check` is clean. Current live-UI behavior is
unchanged by these native-only additions; later S5/S6/S8 still require both Playwright and
standard Codex computer use in incognito Chrome.

## S3 moving-group force primitives and one-pin scale correction

Resumed from `ec2d1ac` and the uncommitted force work. The pending `body-force-loads` run
had terminated with a real failure, not an environment wait: a rebased one-pin rod was
refused at position admission. The diagnostic retained in `S3-force-loads-diagnosis.log`
identifies the SI/body-vector/rebased case. Its rounding gap was supplying its own length
scale. The correction uses within-group anchor spans, guided axial separation and moving
origin lever arms instead of a revolute mismatch. The existing extreme-scale/world-offset
and reference tests pass without relaxing their tolerances.

New source responsibilities:

- `bodyRowBlocks` exposes separate unscaled A/B gradients; `bodyRowGradient` still sums
  duplicate group IDs for the position/rate matrix.
- `joint-wrenches` maps physical row efforts to A/B wrenches, transports moments between
  origins and computes wrench power.
- `body-force-loads` compiles moving-group Newton–Euler demands in SI using resolved group
  mass properties and material-owned load points/vectors/couples. Static loads do not require
  rates; dynamic loads refuse unavailable rates. Successful rate input also provides applied
  power and the kinetic-energy derivative.
- `body-efforts` solves `Jsᵀ lambda_s = Dc w`, restores physical multipliers, checks balance
  against load magnitude, and marks nonidentifiable efforts unavailable. It accepts an
  explicit cycle-level `unique`/`evenest` policy; selecting that policy is still pending.
- `evenest-body-rows` implements the established support ridge and three refinements with
  augmented QR, avoiding normal equations. Approximate support efforts carry `basis: evenest`
  and `sharedSupport: true`; a condensed internal reaction remains unavailable, never zero.

The physical derivations and normalization choices are in `bodies-and-joints-equations.md`.
Tests use a native loaded rod and independent force/moment/power arithmetic in SI,
centimeter/gram and inch/pound units, body/world force directions and rebased material
frames. A welded bracket owns the load in the aggregate-override case; shuffled body/joint/
attachment/group-member arrays and rebasing preserve the expected drive torque and energy
rate. Separated P origins conserve moment about a common reference and virtual power.
Duplicate supports retain an identifiable drive effort in unique mode and a stated even
split in support mode; near-coincident supports remain bounded, and tiny unsupported loads
are refused in both policies. The new fixture remains a private native-kernel constructor;
its publication through the native codec/gallery is still owed at S6.

Verification (Node 24, logs under `artifacts/bodies-and-joints/`):

- Initial physical wrench/gradient gate: 13 tests / 2 files, `S3-wrenches-first.log`.
- Rebased force/load correction: 101 native tests / 24 files, `S3-force-native-first.log`.
- Expanded native force/support gate: 105 tests / 25 files, `S3-force-native-expanded.log`.
- Final native suite plus the full S2 position/reference gate: **267 tests / 40 files pass**,
  `S3-force-and-position-gate.log`. Exact arguments are unchanged from
  `S2-reference-gate-scope.json`; its native-spec glob includes the new force tests and the
  final condensed-internal-reaction regression.

No native editor or production solver dispatch changed. F2 has not been called; spending is
unchanged. Still required before closing S3: material/weld reaction recovery (including
redundant weld cycles and aggregate-inertia/imported-load ownership ambiguity), fixed-frame
ownership, whole-cycle shared-support policy selection and result labels, continuous stop
events, immutable sample availability, remaining worked examples/rate comparisons, the full
S3 unit/browser/build/ui-copy gate and F2. S4–S8 remain pending.

Checkpoint finish: `npm run build` passed with existing warnings in `S3-force-build-host.log`
after the sandbox run exited 134 without a diagnostic. The owned localhost:4307 server was
confirmed live by its process handle and HTTP 200. `PMKS_BASE_URL=http://localhost:4307
PMKS_PLAYWRIGHT_DIR=.. node e2e/ui-copy.mjs` passed **17/17**, zero browser errors,
`S3-force-ui-copy.log`. All touched TypeScript files pass Prettier; `git diff --check` passes.
The browser check protects the current app's copy; it is not a native-editor integration gate.

## S3 material and weld reaction recovery

Continued from clean checkpoint `3d1f4a6`. The preceding goal turn made verified source
progress; no stopped process was restarted on the strength of a stale log. No public editor,
production solver route or legacy runtime was changed by this checkpoint.

`body-load-wrenches` now owns the shared physical load/inertia calculation used by both
`groupForceLoads` and `memberForceLoads`.
The latter places every material balance at the group's numerical origin, retaining the
actual material mass and load owner. It refuses ambiguous aggregate inertia/CoM/mass only
when those values affect the requested calculation: static/no-gravity remains available;
an inertia-only override does not block statics with gravity. WORLD is excluded when counting
material owners, so a single grounded material can use its complete aggregate override.
An active imported multi-material load scope returns `load-owner`; external group loads remain
available and no reference owner is silently adopted as the unique material owner.

`internal-force-partition` restores the original material pair for every internal R/P/slot
row and adds three full-wrench channels per weld. These are force-reference frames, not a
second motion model. Authored weld ends need not coincide. Fixed rows are included exactly
once whether already present in the supplied frame or obtained from the compiled system.
`recoverMemberReactions` subtracts known external row wrenches from the owning member,
solves internal equilibrium in unique mode, then transports each side to its named material
origin. It preserves a determinate bridge beside an indeterminate weld cycle. Missing external
reactions refuse recovery; a stated external evenest split can supply boundary values, but
recovered results retain that label. Internal weld cycles never select that split themselves.
Approximate external values that cannot balance the members remain unavailable.

The two-stage subtraction exposed a real cancellation problem: an unloaded welded leaf on a
loaded four-bar acquired an almost-zero balance error, which the internal solver compared to
itself and refused. The load calculation now retains contributing term magnitudes and
recovery adds the known external reaction magnitudes, supplying an explicit epsilon-sized
arithmetic allowance to `solveBodyEfforts`. Raw residual and allowance are both reported.
No absolute one-unit load floor was added; a 1e-10 N injected imbalance still refuses and the
next valid call recovers.

Independent evidence:

- `nativeWeldedLoadedRod` adds a 1 m, 3 kg slender bracket at (1,1), rotated 0.3 rad relative to
  the existing loaded rod. Static/dynamic member force, moment transport and zero internal
  power match hand arithmetic at three commanded poses with omega 3 and alpha -0.5, in SI and
  inch/pound units, with rebasing and construction-array reversal. Member power/energy sums
  match the external group values.
- A three-member weld cycle keeps all cycle reactions unavailable, while a fourth loaded
  leaf's bridge has its hand-derived wrench in both enumeration orders.
- Fixed-frame support wrenches are recovered without a drive or rates in statics. Adding an
  internal pin makes the redundant weld/pin reactions unavailable without erasing the
  identifiable support wrench. Supplying fixed rows through the frame does not duplicate them.
- The unloaded four-bar leaf has zero wrench; genuine imbalance, missing external reactions,
  missing rates, aggregate properties and imported load provenance remain distinct refusals.
- Repeated external ground pins require the explicitly selected support split; conditional
  weld results say `evenest` and still match the bracket's independent force/moment answer.
- Single grounded material overrides and an inertia-only static override are not over-refused.

Four deliberate mutations were run separately and restored before the final gate. Removing
rounding provenance failed the zero-leaf test with `unbalanced`; dropping internal non-weld
rows falsely made a redundant weld unique; regularizing the internal cycle fabricated a
reaction split; omitting moment transport missed the hand result by about 21 N·m. All four
failed their intended assertions (not compilation). Exact records:
`S3-member-mutations.json` and `S3-member-mutation-{roundoff,internal-pin,cycle-split,moment-reference}.log`.

Final verification under Node 24:

- Same exact S2/native argument list from `S2-reference-gate-scope.json`, now including the
  member suites: **274 tests / 42 files pass**, `S3-member-complete-checkpoint.log`.
- `npm run build`: **pass**, existing warnings, `S3-member-complete-build.log`.
- Touched TypeScript formatted only; `git diff --check` passes. No UI or animated/dragging
  behavior changed, so no new native-editor browser result is claimed. The current app's last
  UI-copy check remains the 17/17 check recorded at the preceding force checkpoint. The full
  S3 browser gate and S5/S6/S8 paired browser workflows are still required.

Both new fixture constructors are recorded in `native-force-fixtures.ts`. Their native
codec/gallery publication remains an explicit S6 task, alongside the earlier loaded rod.
F2 has not been called and review spending is unchanged. Next: integrate per-partition force
frames and availability, choose support policy across a cycle, settle shared fixed-frame
ownership, implement the already-written continuous-stop/sample contract, finish the five
worked examples/reference rates, then run the full S3 gate and F2. **S3 is not closed; S4–S8
remain pending.**

## S3 force frames, independent clocks and passively fixed material frames

This continuation made verified implementation progress. The pending force-series run from
the previous implementation turn was confirmed terminal and green before proceeding; no
duplicate process was launched on the basis of an expired observation.

`solveBodyForceFrame` now publishes driver effort, material-pair wrenches, group balances and
power with revision/partition/index/time/command/direction identity. Published maps expose no
mutators, including through their callback arguments. Result records are detached/frozen;
producer stamps and poses remain mutable. A refused pose, missing dynamic rates or reversal
publishes no stale maps. A static reversal can retain forces while declining power. Internal
aggregate-property/load-owner/reaction ambiguity stays local to the affected joint result;
an available external driver is not erased by an unavailable weld split.

The power result includes incoming work from a moving prescribed boundary. Its rotating
carrier/carriage fixture checks `x=cot(theta)`, the guide normal and couple, driver torque and
energy rate against explicit hand expressions. The separate prescribed-carrier calculation
has nonzero boundary work, so dropping that term cannot pass merely because a stationary
WORLD does no work. An axial cylinder/carriage fixture checks the two moving masses only,
an effort in newtons, power, and refusal at a settled pose past the stroke limit.

`solveBodyForceSeries` chooses the evenest policy only for persistent external redundancy in
a strict majority of supplied samples, then reruns the entire series with that policy before
publication. An isolated rate refusal stays unavailable and does not change policy; an
internal weld cycle never triggers an external support split. Mixed revision/partition and
non-increasing time/index are explicit series refusals. This is a series policy, not proof
that its caller supplied a complete cycle or detected every intervening stop.

The new two-clock fixture exposed a compiler omission: a material frame pinned to WORLD at
two distinct points stayed movable, merging its independently driven cranks. Before the fix,
the tracked probe failed both fixedness/partitioning and retained fixed-drive assertions
(`S3-pinned-frame-before.log`: 2 intended failures, 1 pass). `fixedBodyGroups` now propagates
fixedness from consistent passive relations to already-fixed neighbors with full local rank.
It preserves material/group IDs and all support rows. Driver rows are excluded. Coincident
redundant pins remain free to rotate; an inconsistent support is not silently discarded;
an incompatible drive on the fixed bar remains a `fixed-drive` refusal. Fixed admission uses
local conditioning and the same authored-coordinate precision allowance as moving admission.

The probes cover oblique frames, local rebasing, sizes 1e-8 through 1e8, distant world origins,
reversed record arrays, and propagation through a second frame bar. A dynamic two-clock test
advances the cranks to different commanded poses/times and checks each torque and pin reaction
against independent Newton–Euler expressions. Neither result carries its neighbor's efforts.
The moving-to-frame reaction is available, but the frame's own supports say `frame-context`.
The complete fixed-frame force producer must still combine every attached clock and the
frame's own loads. Also audit collectively rigid foundations with no individually fixed
member, and singular isolated frame configurations, before S3 closure: the new full-rank
neighbor test is sufficient for the demonstrated cases, not a general rigid-core algorithm.

Final checkpoint evidence (Node 24):

- All native tests: **129 tests / 32 files pass**, `S3-force-clocks.log`.
- Exact broad argument list in `S2-reference-gate-scope.json`: **290 tests / 47 files pass**,
  `S3-force-frame-checkpoint.log`. The existing native/reference ceilings are unchanged.
- Production build passes with existing warnings, `S3-force-frame-build.log`, on the host
  where prior Angular builds were verified to work.
- The existing dev-server handle was polled live, localhost:4307 returned HTTP 200, and the
  listening process's working directory matched this migration worktree. Live browser
  `ui-copy` passes **17/17, zero console errors**, `S3-force-frame-ui-copy-live.log`.
  An initial invocation omitted the documented Playwright path override and failed to import
  `/tmp/pmks-playwright`; that is recorded in `S3-force-frame-ui-copy.log`, not counted as a
  product failure or a passing check.
- Only touched TypeScript was formatted; `git diff --check` passes. These native-only modules
  do not yet change the running editor, so this does not claim a native visual/animation gate.

The new rotating-carrier and pinned-frame fixture constructors still need their native
codec/gallery publication at S6. Full immutable simulation snapshots, continuous stop/cycle
publication, remaining examples/reference rates, complete fixed-frame reactions, the full S3
gate and F2 remain open. **S3 stays in progress; S4–S8 remain pending.** No Fable call was made
and review spending is unchanged. S0/S5/S6/S8 still require both browser workflows; the plan's
decision table now makes that requirement explicit as well as its detailed workflow section.

## S3 fixed-foundation force context

The preceding goal turn was verified progress, committed as `e89ce11`; this turn adds the
fixed-foundation producer rather than repeating its status. `solveFixedBodyForces` now combines
the selected moving-machine reactions with fixed material's own loads. It retains every
required sample identity, accepts independent clock times, and refuses missing/duplicate
samples, mixed revision/mode/gravity and unavailable incident reactions. A separate machine
whose reaction acts directly on WORLD is not required to balance fixed material. Moving
force frames now carry immutable gravity provenance to prevent mixed calculations.

Selected reactions enter as SI wrenches at their original material origins, without synthetic
document force records. Contributions remain separate until the load calculation records
their pre-cancellation magnitudes; group equilibrium now carries that arithmetic scale too.
The foundation's external fixed rows are solved under the explicit support policy, followed
by member recovery including WORLD welds. Fixed material has zero acceleration even when its
machines have dynamic forces, so its own member balance needs no distribution of an overridden
moment of inertia. Weight and imported load-owner ambiguities still apply. Member recovery
also ignores an unavailable reaction acting directly on WORLD before asking for its value;
WORLD is not a material balance equation.

Independent checks in `fixed-body-forces.spec.ts`:

- Two differently timed cranks plus an explicit frame load and gravity: both pin reactions
  match hand force/moment equilibrium in statics/dynamics, SI/inch-pound units, rebased frame
  coordinates and reversed enumeration. The two-pin support split is unavailable in unique
  mode and explicitly conditional in evenest mode; moments are transported to the material
  frame origin.
- Replacing those supports with one WORLD weld gives the hand-derived unique total reaction.
  Missing or refused samples cannot yield a partial foundation load, and a subsequent valid
  call recovers. Duplicate sample keys and mixed calculation provenance refuse explicitly.
- A redundant crank support can supply a declared evenest split; the foundation's resulting
  weld reaction remains labeled conditional even when its own external policy is unique.
- A third, unrelated crank acting directly on WORLD requires no sample in this context.
- Indeterminate fixed pin reactions acting directly on WORLD do not hide a separate material
  bracket's unique weld reaction; its hand answer remains (0,10) N and 5 N·m.
- A fixed internal weld cycle stays indeterminate in both support policies, while its unique
  total WORLD support remains available. An inertia-only override does not obstruct this
  stationary balance, even with the context set to dynamic mode.

The omission mutation removed all selected-machine contributions from both group and member
loads. Both pinned and welded hand-answer tests failed their force assertions (not compilation),
then the source was restored: `S3-fixed-force-missing-contributions.log` and
`S3-fixed-force-mutation.json`. The untouched internal-cycle/no-required-clock probes passed.

Verification:

- All native tests before the final unit extension: **133 tests / 33 files pass**,
  `S3-fixed-force-expanded.log`.
- The exact broad list in `S2-reference-gate-scope.json` plus
  `src/tests/verification/frame-body-forces.spec.ts`: **303 tests / 49 files pass**,
  `S3-fixed-force-final-checkpoint.log`, including the final SI/inch-pound and independent
  WORLD/material-balance probes. The preceding 302-test result is retained separately in
  `S3-fixed-force-checkpoint.log`.
- Host production build passes with existing warnings, `S3-fixed-force-build.log`.
- Only touched TypeScript was formatted; `git diff --check` passes. No production editor
  imports or visual/animation behavior changed. The latest live ui-copy remains the verified
  17/17 at `e89ce11`; no new native-editor browser gate is claimed.

This is still one all-fixed context. Add component-level fixed availability before S3 closure
so a missing machine on one independent foundation does not hide a valid result on another.
The fixed-support policy also needs integration into the full snapshot/cycle producer, rather
than per-sample guessing by a consumer. Continue the rigid-foundation audit, complete simulation
schema and continuous stop/reversal controller, remaining examples/reference rates, full S3
gates and F2. **S3 remains in progress; S4–S8 are pending.** Fable spending is unchanged, and
the new native fixtures still need S6 codec/gallery publication.


## S3 independent fixed-component publication and precision

The previous implementation turn made verified progress; the intervening user-requested
workflow reminder verified the existing paired-browser requirement without changing source.
The pending implementation is now verified against its files and final logs, not inferred
from the earlier session. `solveFixedForceComponents` is the consumer entry point; the
all-fixed `solveFixedBodyForces` remains a diagnostic convenience. Fixed material connectivity
excludes WORLD as an intermediary. Each component validates only its incident moving samples,
retains its own support policy, and publishes immutable availability and body-side reactions.
A missing/refused/mixed/duplicate clock on one foundation leaves another foundation's hand-
derived forces available, including when their visible ground points coincide. Actual material
welds or P connections instead join their force context. The source drawing stays unchanged.
Cross-component mass/load ownership ambiguity refuses affected foundations; a third independent
carriage still reports its hand-derived support. These checks include reversed enumeration,
independent clock times, policy labels, immutable outputs and recovery on a subsequent call.

The force projection is a read-only `ForceDocument`, not a persistable/editable document.
A fixed WORLD weld at a remote origin exposed two separate precision losses: choosing the
WORLD origin produced about 3.8e-6 N force error; choosing a nearby material origin alone still
left about 4.4e-7 N·m moment error because the cached world CoM had already rounded away its
local offset. Fixed balance now uses a nearby material origin and member loading reconstructs
the local mass center before applying a single-material override. The same nine-decimal hand
force/moment assertions pass at zero and 1e9 origins, in SI and inch/pound units, with and
without custom CoM/mass. No tolerance was widened.

Evidence under `artifacts/bodies-and-joints/`:

- `S3-fixed-components-final-checkpoint.log`: **308 tests / 51 files pass**, exact S2 broad
  list plus the existing frame-force reference suite. Earlier native gate: 138/35.
- `S3-fixed-components-build.log`: host build completed with output location and existing
  warnings; its former process handle is now absent (terminal), not a reason to restart it.
- `S3-fixed-precision-before.log` and `S3-fixed-precision-local-origin.log` preserve the two
  intended hand-answer failures before the complete fix.
- `S3-fixed-components-unscoped.log` / `S3-fixed-components-mutation.json`: removing scoped
  input selection fails the independent-foundation force assertion (one failure, three
  passes); source restored before the final broad gate.
- Only touched TypeScript formatted; whitespace check passes. No native editor imports yet;
  no new live UX gate is claimed. Both browser workflows remain required at S5/S6/S8.

Next: audit a collectively rigid passive foundation (two ground-pinned bars joined at their
apex) carrying independent cranks. The existing single-body fixed-neighbor rank test cannot
prove that shape. Require a consistent full-column-rank passive subsystem; instantaneous zero
velocity alone is unsafe at a rocker turning point. Then complete immutable simulation samples,
continuous interval/stop/reversal publication, stable fixed-support policies across those
samples, remaining hand-derived examples/reference rates, the full S3 gate and F2. **S3 remains
in progress; S4–S8 remain pending.** No paid review ran; spending is unchanged.


## S3 collectively rigid foundations

The previous pending force work is committed as `75e3459`. This turn then reproduced the
next documented gap before changing the compiler: two ground-pinned bars joined at an apex
remained movable, incorrectly joining their independently driven cranks. The new fixture's
fixed-foundation assertion and fixed-drive refusal failed against that committed implementation
(`S3-collective-fixed-before.log`); the ordinary turning-point guard passed.

`fixedBodyGroups` retains single-body propagation first, preserving a proved foundation beside
an inconsistent attached branch. Once that stalls, it searches passive connected candidates.
It removes bodies with nonzero instantaneous nullspace components, removes their incident
rows, and repeats. Acceptance requires a consistent full-column-rank Jacobian on the retained
subsystem and already-fixed boundary. Thus a transiently still rocker does not borrow its
moving neighbors' constraints to become permanent ground. This changes only derived fixedness;
all material identities, support channels, drives and travel limits remain represented.

Added evidence:

- A two-body triangle supports two independent crank clocks in SI/inch-pound units, across
  1e-8/1/1e8 scale, remote origins, local rebasing and reversed enumeration. Six passive
  support rows and both material identities survive. A fixed-core drive still refuses.
- A four-body platform carried by three RR struts has an independent three-equation rigidity
  derivation. It too keeps two crank clocks, proving the implementation is not a pair shortcut.
- A crank-rocker at its extremum stays movable both on WORLD and on the collective triangle.
  Independent circle-intersection positions establish that the rocker changes on either
  side of the zero-rate pose. A faulty apex remains inconsistent; a singular straight
  foundation is not certified as a regular fixed core.
- A frame that is independently fixed stays available beside an inconsistent attached branch;
  the good cranks still admit separately. This guards the retained single-body propagation.
- Triangle support/apex forces and transported moments match the hand equations in
  `bodies-and-joints-equations.md` to nine decimal places. Both crank samples are required for
  its one fixed force component; dropping one refuses both sides instead of a partial balance.
- The instantaneous-only mutation bypassed the retained-subsystem proof. Both rocker tests
  and the inconsistent-core test failed, with three other tests passing. Source restored:
  `S3-collective-fixed-instant-only.log` / `S3-collective-fixed-mutation.json`.

Final verification: `S3-collective-fixed-final.log` has **316 tests / 52 files passing** with the
same broad argument list and unchanged native/reference ceilings. Host production build passes
with existing warnings (`S3-collective-fixed-final-build.log`). Only touched TypeScript formatted;
whitespace check passes. No production editor import changed; the latest live ui-copy remains
17/17, and no native UX gate is claimed. New foundation fixtures need S6 native codec/gallery
publication alongside the other native fixtures. No Fable review ran; spending is unchanged.

**S3 remains in progress.** Next implement the continuous interval/stop/reversal controller and
full immutable simulation sample schema described in the contract, integrate stable fixed
support policies, finish the remaining independent example/reference rates and full S3 gate,
then request F2. Regular collective foundations are now implemented, not still pending. Singular
isolated foundations remain a stated limit of the rank proof and ordinary admission, rather
than being silently classified fixed. S4–S8, native default cutover, consumer conversion and
substantial obsolete-code removal all remain required.


## S3 checked intervals and native cycle publication

The preceding goal turn made verified progress (`75e3459`, `224e837`). This turn implements the
next two missing layers instead of treating a successful position endpoint as a playback
interval. `inspectBodyInterval` privately probes the continued branch with bounds removed,
checks all coordinate limits at endpoints and analytic stationary points, refines the first
crossing and returns a clear endpoint, coordinate/fold stop, or branch/unsolved refusal.
Coincident contact values belong to the selected safe-side pose and sort by stable ID.
Budgets never manufacture a reversal or a successfully truncated series.

`buildBodyCycle` retains one admitted frame, explores the requested direction and (for a
bounded motion) the other direction from the initial state, then reuses accepted geometry
for the return path. It closes angular motion only after full commanded turns and a body-pose
closure check. Times follow physical speed; both speed signs and an initial stop work without
zero-time duplicate samples. Pose maps, tangents, contacts and samples are immutable copies.
`bodyCycleInputs` stamps each sample and recomputes analytic rates with its signed speed;
reversal rates and dynamic forces are unavailable, statics remain available, and later regular
samples recover. Wrong-partition stamping refuses. No native editor consumer has switched yet.

Thirteen initial tests plus one added singular-limit regression establish:

- R*cos(theta) carriage excursions between safe endpoints, both directions, scales
  1e-8/1/1e8, off-center narrow maxima, stationary touches, ordered passive/driven bounds,
  coincident limits under reversed enumeration, outward/inward starts and rollback/recovery.
- A welded axial carriage hitting tighter passive limits before the ram's own bounds has the
  hand-derived 7-second cycle at either ±0.2 speed. Every stored pose satisfies every bound,
  reused return poses are exact, signed carriage velocities match the guide heading, and
  dynamic/static force availability differs correctly at the reversals.
- An initially bounded carriage has an 11-second cycle and proper seam events. Two cranks on
  one frame retain durations pi and 2pi. Budget exhaustion publishes no cycle or stale values.
- A rocker-driven mechanism reaches both independent geometric fold angles and the expected
  duration. A tighter passive coordinate wins before a fold; nonbinding driven/passive bounds
  remain checked at the fold. Private passive-tangent signs are not published as velocities.
- A parallelogram completes a full turn through an isolated singular sample, both with and
  without a nonbinding passive limit. Position remains available, singular rates refuse as
  rank, and the next regular sample has fresh rates.

The tests exposed and corrected two accuracy/availability defects during this turn:

1. A shallow crossing amplifies ordinary pose residuals into command error. The initial
   calculation missed the hand crossing by about 4.28e-7 radians; private event probes now
   polish to 1e-13 while ordinary relaxation keeps its 1e-10 default. The unchanged
   eight-decimal angle assertion passes (`S3-interval-first.log`, `S3-interval-polished.log`).
2. A nonbinding passive limit at an isolated singular non-fold initially refused after 134
   probes (`S3-limited-singular-probe.log`). A local geometric enclosure now clears distant
   bounds without undefined rates. The tracked regression also verifies that a stop 1e-7
   radians before the singularity is still found. The temporary diagnostic was removed after
   moving the scenario into the tracked interval and full-cycle tests; no failing expectation
   was replaced by an assertion that the unsupported behavior is correct.

`bodies-and-joints-equations.md` records the adaptive criteria, fold treatment and enclosure
inequality. These are numerical event-search checks, not a formal global interval proof.
Near a singular contact that cannot be cleared/localized the answer remains unsolved, not an
invented physical stop. Further adversarial event/performance review belongs in F2/S7.

Verification under `artifacts/bodies-and-joints/`:

- `S3-cycle-interval-final.log`: **330 tests / 54 files pass**; same S2 broad list plus existing
  frame-force references, with original MATLAB/native ceilings. This is not the full unit suite.
- `S3-cycle-interval-final-build.log`: host production build passes with existing warnings.
- `S3-interval-no-interior.log` / `S3-interval-mutation.json`: testing only the interval start
  fails five crossing tests, with three unrelated tests passing. Source restored before gates.
- `S3-interval-enclosure.log`: all 14 new tests pass before the final full-turn limit variant;
  that additional variant is included in the final broad gate above.
- Only touched TypeScript formatted; whitespace check passes. Latest unchanged-editor ui-copy
  remains 17/17. No live native animation/UI gate is claimed; S5/S6/S8 still require both tools.

**S3 remains in progress.** Next build the document-wide SimulationSnapshot and availability-
aware material/attachment/coordinate accessors, retaining each numerical frame and revision.
Integrate fixed-foundation contexts/support policies across selected independent samples.
The closed-cycle producer intentionally refuses unbounded/nonperiodic travel; audit the
existing behavior and supply an explicit finite nonlooping analysis range if needed rather
than inventing physical stops or treating every valid linear motion as a periodic cycle.
Finish remaining independent examples/reference rates, the complete S3 unit/browser gates,
then F2. Publish the new cosine-carriage fixture through the native codec/gallery at S6.
S4–S8 and substantial old-runtime removal remain required. No paid review ran; spending is
unchanged, and nothing was pushed or published.

## S3 document snapshots, readers and finite analysis windows

This turn made verified progress from b1df740. The preceding note-only response did not advance
the migration; the current implementation and gates below do. No goal scope was reduced.

`buildSimulationSnapshot` now owns one compiled design revision, independent partition
admission/trajectory results, numerical frames, rates and force series. Deep copies preserve
shared records while removing mutable Map interfaces; neither freezing nor later editor
changes reach the other side of the snapshot boundary. `selectSimulationView` checks revision
and explicit per-clock indices and assembles only the selected fixed-foundation context.
A missing/failed clock never supplies index zero, and an unrelated foundation can still answer.

New readers cover material poses and point motion, attachments, intrinsic material CoM,
aggregate group CoM, scalar coordinates and derivatives, pair-owned reactions, driver effort
and power. Their public values use world-oriented SI, with local point arguments in document
units. Rates stay in the numerical frame until publication. Group overrides affect the
aggregate center without overwriting intrinsic member properties; WORLD does not masquerade
as one physical aggregate center. Force results preserve the unique/evenest basis.

Fixed support policy is selected once per component from its geometry, with explicit overrides
validated against component identity. The frame construction formerly inside fixedForceBalance
is shared with this policy calculation; existing distant-origin/foundation tests still pass.

`buildBodyMotionWindow` supplies an explicit nonlooping duration for unbounded/nonperiodic
motion. It uses the same checked intervals as cycles, stops early at proved physical bounds,
and never treats a time endpoint as a reversal. A sample/probe budget refuses the trajectory
atomically. Code audit found the old Mechanism eventually refuses unclosed linear travel under
its cycle budget; it supplies no existing finite-window policy to preserve. Native transport
controls/default duration and intermediate-time display behavior remain S5/S6 work.

Twelve new tests in simulation-snapshot, simulation-availability and body-motion-window cover:

- Owned immutable snapshots, unchanged editable input, revision/index refusal and recovery.
- Off-axis welded member/witness positions and v/a against R(theta), SI/inch-pound units,
  local-frame rebasing and construction enumeration changes.
- Independent clock selections, shared-foundation context requirements, a no-drive machine
  beside a working machine, static-only material drawings, fixed support policy overrides.
- Intrinsic versus overridden aggregate centers, zero-mass center refusal and usable witnesses.
- Unbounded oblique translation at either speed sign, no false endpoint reversal, real early
  stop, budget refusal, and fresh later builds. A one-probe unbounded interval can validly
  succeed; the probe-exhaustion assertion therefore uses a bounded interval requiring checks.
- Rotating-carrier P and horizontal-slot coordinates against independent csc(theta)/cot(theta)
  values and their first/second derivatives at every sample, including the carriage acceleration.

Verification under artifacts/bodies-and-joints:

- `S3-snapshot-expanded.log`: 12 tests / three files pass. The final endpoint arithmetic uses
  the exact requested target instead of reconstructing it; subsequent gates include that change.
- `S3-snapshot-native-reference.log`: **342 tests / 57 files pass**, with the original S2
  argument list plus frame-body-forces and unchanged reference ceilings.
- `S3-snapshot-final-build.log`: host production build passes with existing warnings.
- `S3-snapshot-ui-copy.log`: **17/17**, zero browser errors. Dev server session 70166 was
  revalidated live, HTTP 200 and PID 13660 cwd matched this worktree. No native-editor or
  complete-cycle visual gate is claimed by this check.
- `S3-snapshot-full-unit.log`: **2648 passed / two failed, 275 files**. The failures are
  coupled-routing's rejection of `determineTracerJoint` on the driven body and double-butterfly's
  near-stationary step ratio (0.0014035668847612065 versus 0.001341640786502705).
- Both failures reproduce in isolation (`S3-snapshot-isolated-failures.log`) and in a clean
  git-archive b1df740 copy (`S3-snapshot-baseline-failures.log`, location in
  `S3-snapshot-baseline-path.txt`). Neither test imports the native kernel. This establishes
  baseline failures, not a waiver: diagnose the intended invariants and resolve them before F2.
- Only touched TypeScript formatted; whitespace check passes. No Fable call or additional
  review spending; no push or publication.

**S3 remains in progress.** Next resolve the two full-suite baseline failures without weakening
motion/route invariants, audit the remaining independent example/reference rates, complete the
full S3 browser/unit gates and request F2 within its existing $10 cap. Publish the new linear
carriage and other native fixtures in the S6 gallery once the native codec exists. S4–S8,
transaction/codec/history, native editor and consumer cutover, substantial obsolete-runtime
removal, performance and paired Playwright/incognito visual gates are all still required.

## S3 frozen rate references and full-unit gate repair

Snapshot checkpoint: **7b91c0c**. This follow-up resolves the two independently reproduced
legacy test failures and adds the missing direct native comparisons with frozen MATLAB rates.
No legacy/runtime solver formula or production UI code changed in this follow-up.

The coupled-route assertion now allows a tracer placement **only on the prescribed input
body**. PositionSolver already deliberately carries the extra points of a ternary input from
one rotated direction to avoid accumulated shearing. The test still requires exactly one
simultaneous step, last, and forbids walking any other body or using another placement kind.

The butterfly smoothness check now compares possible unrounded step lengths. Every coordinate
is published to four decimals, so subtracting two points introduces a displacement-length
uncertainty of at most sqrt(2)*1e-4. The factor-six test and 1e-3 floor remain, applied to the
next step's lower bound and the preceding step's upper bound. This resolves the original
0.000062 near-stationary false positive using the actual quantization scale, not a tuned factor.
As an independent branch check, native-reference-position now compares every butterfly sample
in both construction orders at the unchanged **1e-3** ceiling: worst error **0.0001942861**.

`native-reference-rates.spec.ts` constructs native geometry and compares every published
point velocity/acceleration and material angular velocity/acceleration directly with all four
frozen MATLAB datasets, in both array orders. The geometry bridge now exposes its material
lookup; placeholder mass and CoM are explicitly excluded from this kinematic comparison.
MATLAB's slider-crank E/B sensor and BCE/BC material alias remain explicit. Expected values
never come from the legacy solver or another native run. Dataset-specific absolute/relative
tolerances are unchanged, and none of these four datasets has excluded/singular rate samples.

| Reference | Published samples | Worst point velocity | Worst point acceleration | Worst angular velocity | Worst angular acceleration |
| --- | --- | --- | --- | --- | --- |
| Four-bar | 361 | 3.69e-14 | 5.20e-14 | 1.13e-14 | 1.49e-14 |
| Slider-crank | 361 | 1.37e-10 | 1.21e-10 | 1.22e-12 | 1.99e-12 |
| Stephenson III | 201 | 2.28e-7 | 8.74e-6 | 1.59e-8 | 6.21e-7 |
| Watt I | 23 | 1.32e-6 | 3.57e-4 | 3.45e-7 | 9.36e-5 |

Rates use the reference geometry's SI interpretation; angular rates are rad/s and rad/s².
The Watt I values near the end of its sweep pass the source's absolute-plus-relative ceiling;
no tolerances were inferred from these observed errors. Exact results are in
`S3-native-reference-rate-errors.json`, with test output in `S3-native-reference-rates.log`.
`S3-legacy-gate-repair.log` has 32 tests / three files passing.

**Full unit verification:** `S3-native-reference-full-unit.log` reports **2655 tests / 276
files passing** after formatting. The prior two failures are resolved, not waived. The final
snapshot production build and 17/17 live ui-copy remain current for the runtime; this follow-up
changes only test/reference helpers. Four required current-editor browser suites are being
run separately from the full unit suite, with their results to be recorded below.

The native five-example audit is still open before F2: axial carriage has a native cylinder
fixture and independent rates; the moving-boundary row tests and the rotating-carriage/welded-
rod tests prove relevant terms, but do **not** replace native cylinder constructions for the
oblique guide, translating bracket, rotating carrier and selective welded-bracket scenarios.
The legacy coupled-mount suite remains green and useful as reference evidence. Build those
native cases with independent closed forms and retain their S4/S6 history/editor/gallery
obligations; do not claim solver fixtures alone prove drawable integration. No Fable spending
in this follow-up; F2's $10 cap and the later review reserves remain unchanged.

### S3 browser and live observation follow-through

The sequential browser runner completed (session 18936, exit 0):

- force-analysis-panels: **15/15**, no reported issues.
- force-units: **20/20**.
- template-graphs: **3978/3978 across 43 templates**. Its existing singular/source-
  nondifferentiability reports remain explicit; no source or thresholds were changed.
- export-flow: **50 PASS checks**, no failures, exit 0. Downloaded data/report behavior is
  asserted by the existing suite, including distinct machine clocks.

Logs are `S3-force-analysis-panels.log`, `S3-force-units.log`, `S3-template-graphs.log` and
`S3-export-flow.log`. Visually inspected the link force graph, kgf Settings controls and the
butterfly acceleration chart: headings, values, controls and graph labels fit without clipping.
These are the existing editor's integration gates, not evidence of native consumer cutover.

Standard Codex computer use also reconnected to the **incognito** localhost:4307 window.
Played the existing cylinder-driven boom, captured **96 distinct native screenshots over
7.332 seconds**, then inspected a labeled 24-frame contact sheet. The Edit panel reports
2.82 cm travel at 1 cm/s, so the recording spans more than a full out-and-back cycle. The sheet
shows both reversals and repeated poses; the barrel/rod skin stays aligned, with the start
pose ghost distinct and no observed assembly flip or jump. Full frames and timestamps remain
under `artifacts/bodies-and-joints/S3-live-incognito/`; `cycle-sheet.png` and
`selected-cylinder.png` are the inspected/live artifacts.

Paused, returned to start, selected the cylinder directly on the grid and opened its context
menu. The panel says Edit Cylinder GC, and the menu names the same cylinder, its two joints,
input, fixed-angle and lock controls. The familiar BLOCKS layout, blue palette, shadows and
selection treatment are the reference for S5. Escape also clears selection; reselected the
cylinder and left it paused at start. The obsolete third Sliding Body mass row is still
visible in the current editor and remains a removal obligation for native cutover.
No authored geometry, public settings or regular Chrome tabs were changed by this inspection.

The full-unit gate is now green, the requested S3 current-editor browser suites are green,
and both browser workflows were actually used. **S3 is not complete:** native constructions
for the remaining worked cylinder examples and F2 still precede S4. All S4–S8 obligations,
including full native visual/integration gates and substantial old-code removal, remain open.


## S3 five hand-derived cylinder examples and numerical consistency

Computational checkpoint after `b2d27e3`; the commit containing this entry records the
implementation. S3 remains in progress until F2 resolves. S4–S8 are untouched and required.

All five scenarios now exist as native constructions: axial carriage (pinned and welded),
both roots of an oblique guide intersection, a translating welded bracket with passive
cylinder stops, a rotating carrier with a separate sliding block and welded barrel, and a
selectively welded rod/bracket with a third pinned boom. The explicit scalar derivatives,
body poses, witness motion, independent static reactions and dynamic power derivations are
in `docs/bodies-and-joints-equations.md`.

The computational tests assert exact body/joint/group/DOF counts, every row and travel bound,
every material body's directed heading and three noncollinear points, velocities and
accelerations under two nonuniform instantaneous command profiles, independent material
CoM energy rates, input effort/power, finite travel stops, an actual geometric fold,
return motion and unavailable rates at reversals. Construction order and external A/B
reversal variants preserve signs. The selective weld keeps the boom in a different group,
with changing relative angle; its load reactions are derived by whole-machine moment
balance rather than copied from the constraint solver. The axial transverse load has an
independent guide normal/couple answer, including moments about a common world point.

Two moving-boundary companions preserve the admitted constraint set and its driver as a
redundant compatibility row. They prescribe hand-derived poses as well as velocities and
accelerations; omitting the acceleration must refuse. The maximum **linear acceleration**
projection is required to exceed 0.1. Merely offsetting the carrier's material origin did
not accomplish this: numerical compilation rebased coincident anchors onto the pivot.
Separate pivot and guide anchors keep their numerical mean moving, so the intended test
now survives compilation. This was a fixture defect, not a missing analytic term.

Three numerical issues emerged:

1. The near-tangent oblique example amplified a 1e-10 pose residual into an acceleration
   error beyond the preselected 1e-8 absolute/relative tolerance. Ordinary native position
   correction now targets 1e-12. The expected-answer tolerance was retained.
2. Pure translation at constant speed generated round-off angular velocities, and their
   tiny Coriolis terms made redundant acceleration rows appear inconsistent. The velocity
   arithmetic error is now propagated through the row's analytic products and the actual
   least-squares residual projection. Boundary/command cancellation retains operand scales.
   Regression tests reject contradictory acceleration across speeds 1e-12 to 1e8 and keep
   unrelated rows from borrowing a tolerance. No finite-difference displacement was added.
3. Fold localization's 1e-11 passive arc tolerance was looser than its consumers' 1e-13
   event polish; the reported fold could fall about 5e-12 beyond the true extremum. Arc
   correction now matches event precision. Separately, a closest Newton sample may carry
   an unreliable tangent near singularity; the original regular seed can still prove the
   fold. It is tried only after the closer seed fails, with the same positive bracket and
   curvature requirements. Driver-coordinate bounds remain affine at a fold, so they do
   not require a geometric enclosure intended for genuinely passive coordinates.

The deterministic `body-fold-order.spec.ts` covers **6 body orders × 24 joint-row orders ×
2 roots = 288 cases**. The old behavior was observed to exhaust 484 advance attempts and
return unsolved while a direct fold search from the original pose proved s=0.2. This replaces
an exploratory randomized stress probe, whose 300 constructions were insufficient to catch
all order-dependent failures. Diagnostics remain in ignored artifacts; temporary diagnostic
specs and instrumentation have been removed.

Verification with Node 24.18.0:

- `npm test -- --watch=false`: **2676 tests / 282 files pass**;
  `artifacts/bodies-and-joints/S3-five-examples-full-unit.log`, session 71397 exit 0.
- Focused final fold/cylinder/interval/continuation gate: **33 tests / 7 files pass**,
  `S3-fold-order-seed-repair.log`; the exhaustive permutation test is included.
- `npm run build`: **passes** outside the sandbox, existing CommonJS warnings only;
  `S3-five-examples-build.log`, session 79529 exit 0.
- `PMKS_BASE_URL=http://localhost:4307 PMKS_PLAYWRIGHT_DIR=.. node e2e/ui-copy.mjs`:
  **17/17**, zero console errors; `S3-five-examples-ui-copy.log`, session 49485 exit 0.
  The first launch lacked the explicit Playwright installation path and did not run tests;
  the corrected host launch used the verified worktree server (PID 13660, HTTP 200).
- Only edited TypeScript files were formatted; diff whitespace checks pass.

The earlier S3 current-editor browser suites and incognito live cycle observations are
recorded above. This checkpoint changes native computational code and fixtures, not the
currently served editor. It does not claim new native UI evidence. Native gallery URLs,
transaction construction, save/reopen, undo/redo and the default editor are still explicit
S4–S6 obligations. Substantial legacy removal remains S7; the full goal is not complete.

No additional Anthropic call has yet been made for this checkpoint. Prepare the single F2
review against its committed hash, with a $10 cap, preserving the $6 unknown-call reservation
and the F3/F4 allocations. The bounded reviewer brief is in
`artifacts/bodies-and-joints/reviews/F2-brief.md`.
