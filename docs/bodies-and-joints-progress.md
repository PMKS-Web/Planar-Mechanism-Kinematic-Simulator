# Bodies and joints execution ledger

> **Status:** Reference — execution checkpoints, review findings and verification evidence.

## Authority and status

- Current authorization (2026-09-13): rebase completed S0–S4 onto staging, align with staging's code/UI style guides, refactor where useful, create a draft PR into staging, and complete a full-PR Fable 5.1 review with findings addressed. Publishing this feature branch and its draft PR is authorized. S5 remains pending; do not reactivate a goal or begin UI cutover.
- Implementation starting commit: `487d535` on `bodies-and-joints-plan`.
- Worktree: `.claude/worktrees/funny-swirles-3c6486`.
- Current checkpoint: **S0–S4 complete; F3 resolved; stopped before S5**. Native editor cutover has not begun. Concrete interface choices are in [the contract](bodies-and-joints-contract.md); frozen catalogs/reference hashes are in [the baseline](bodies-and-joints-baseline.json).
- Sole implementation owner: Codex. Fable reviews at the specified gates and at the additional full-PR review requested September 13.
- Preserve other worktrees and unrelated changes. The starting tracked worktree was clean.
- Runtime for these commands: Node `v24.18.0`, explicitly prepended to PATH; the login shell otherwise selects unsupported Node 20.
- Owned dev server: `http://localhost:4307/`, Angular CLI started in this worktree. Recheck process, HTTP readiness and served source on resumption.

## Checkpoint gates

| Checkpoint | Status | Evidence / next work |
| --- | --- | --- |
| S0 | Baseline complete | Six unit suites pass (182 tests), seven new compatibility tests pass, build passes, template-open 11/11, template-graphs 3978/3978, ui-copy 17/17. Timing, visual baseline and operation-level consumer classification are recorded. Existing drag timing failures are reproduced on original test files, not waived; S7 must meet the measured comparison budget. |
| S1 | Complete | Native records, frames/rebasing, coordinates, material/group mass, weld compiler, pin bundles, cylinder factory and reference validation. F1 completed and resolved; final gate 12 files / 84 tests (`reviews/F1-final-unit.log`), build passes (`reviews/F1-build.log`). Earlier unchanged-editor browser gates: two-mechanisms 13/13, cylinder-mount 31/31 and ui-copy 17/17. No native UI cutover yet. |
| S2 | Complete | Native compiler, analytic Jacobians, mobility/admission, branch continuation, folds, limits and frame conditioning. Seven native/legacy and four native/MATLAB comparisons retain the original ceilings. Geometric redundancy, two slots on a carrier and one-pin/shared-WORLD cases pass. Combined S2/initial-rate gate: 255 tests / 37 files; current-editor browser gate is green. Continuous cycle event publication remains an explicit S3 obligation. |
| S3 | Complete | Native rates/forces, immutable results, interval/cycle/window publication, all five hand-derived cylinder examples and native/MATLAB positions/rates. F2 reviewed d842ffd and all findings resolved below. Final full gate: 2682 tests / 285 files; host build passes; ui-copy 17/17 with zero console errors. Earlier S3 browser and live-incognito evidence remains recorded. Native UI cutover is S5–S6, not claimed here. |
| S4 | Complete | Native authority/transactions, structural and property commands, connected gestures, axes/dimensions, drives/units/copy/paste, paused re-anchoring, native codec/history, bounded production import and recovery. F3 completed in two focused passes and findings resolved at `7f1bdbbb`. Final gates: 2893 tests / 323 files, production build, ui-copy 17/17; all named legacy browser gates and live incognito observations recorded below. Native UI and platform clipboard wiring remain S5. |
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

**The user removed the review budget cap on 2026-09-12.** Earlier caps and reservations below are historical. Continue recording actual charges and use focused review requests. F1/F2 are resolved; F3 coverage and all actionable resolutions are complete at `7f1bdbbb`. F4 belongs to S8.

| Call | Session | Actual reported cost | Status |
| --- | --- | --- | --- |
| Planning availability probe | `1e1aa8aa-e65e-4f52-957b-56ef372e594e` | $0.073899 | `claude-fable-5-1`, `FABLE_OK`; availability only |
| Earlier canceled planning review | `93cfef40-4bbb-4454-81b8-a2317a37861f` | Unknown | Transcript ends interrupted; no findings or approval claimed |
| F1 | `aab450ea-661d-45fc-a91a-6286dd1d8614` | $3.40532475 | Completed on `59296bb`; regressions and resolution below |
| F2 | `6df95b2b-659f-4349-9876-86a4fff7a5d8` | $6.00034425 | Completed on `d842ffd`; resolved at `bca3492` |
| F3 initial | `04e221a8-f7f7-492d-8333-f95c87943c0d` | $4.571421 | Reviewed `b33355b1`; resolved at `ae91f07c`; omitted coverage completed below |
| F3 follow-up | `a2a1ef0a-f5bc-4af6-9ffe-9c2d365b59db` | $9.50394975 | Reviewed `ae91f07c`; all requested coverage complete, resolutions below |
| F4 | Pending S8 | Not spent | No dollar cap |

Known reported spend: **$23.55493875**, including the availability probe and auxiliary usage. The canceled planning call's actual cost remains unknown; its former $6 reservation was not a reported charge.

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


## F2 completed review — findings open

- Reviewed hash: **d842ffd**. Fable 5.1, read-only Read/Grep/Glob tools, $10 cap.
- CLI session `6df95b2b-659f-4349-9876-86a4fff7a5d8`, process 19618 completed exit 0;
  JSON `subtype: success`, `is_error: false`.
- Total cost **$6.00034425**, comprising Fable $5.99759825 and auxiliary Haiku $0.002746.
  Cumulative known spend is **$9.479568**. Keep the $6 unknown canceled-call reservation;
  $19.520432 remains against the $35 working ceiling, including the $13 F3/F4 allocation.
- Complete prompt, result, cost metadata and readable findings:
  `artifacts/bodies-and-joints/reviews/F2-{brief.md,findings.md,launch.json}` and `F2.json`.
  Persisted transcript: the worktree's Claude project directory, session ID above.

Findings to reproduce and resolve before S4:

1. **F2-1 / medium:** `findBodyFold` rejects a proved extremum when it coincides with the
   requested command (the beyond-target guard also excludes equality). Add on-grid fold
   cycle cases and a passive limit near a fold; prove the correct typed stop and retained
   branch. The reviewer proposes a one-sided beyond-target test; validate it rather than
   accepting it solely on review authority.
2. **F2-2 / low, latent:** a published fold sample retains the previous regular sample's
   tangent even though the command derivative is not defined. Rates currently recompute
   and reversal readers refuse correctly, but make the continuation type/availability
   prevent future consumers treating that stale tangent as a rate.
3. **F2-3 / high-risk verification gap:** no-limit intervals skip interior event inspection.
   Test a pair of folds narrower than a single command step and determine whether
   continuation can jump across them. Keep adaptive evidence distinguished from formal
   global proof; do not claim the missing adversarial case passed.

Fable found no incorrect analytic acceleration terms, residual-projection derivation,
P wrench transport sign, member recovery or shared-foundation clock ownership in the
reviewed sources. That is independent review evidence, not a substitute for regression
probes on the open continuation findings. **S3 and F2 are still open; do not begin S4.**


## F2 resolutions and S3 completion

The checkpoint containing this entry resolves F2 locally; no additional paid call was needed.
The actual F2 cost and remaining F3/F4 allocation above are unchanged. The preceding review
findings section is the historical open state; all three items now have reproductions and
passing replacement behavior.

- **F2-1:** the one-sided fold guard alone was insufficient. Exact on-grid endpoints also
  needed passive-curve inspection before Newton acceptance and a fresh search from closer
  subdivision seeds despite cached endpoints. Both oblique roots and command steps 0.1/0.2
  now retain the fold and complete the 13-second return cycle. A separate near-fold passive
  stop failed because crossing refinement stopped on command width while its coordinate
  residual remained too large. Both criteria now govern refinement. Original failures and
  incremental isolation are retained in `reviews/F2-contact-*.log` and
  `F2-near-limit-{stack,residual}.log`; temporary instrumentation was removed.
- **F2-2:** cycles and finite windows publish only immutable `BodyPoseSample` poses, command
  and regularity. Predictors remain private continuation state. The regression inspects
  every regular/fold sample and confirms reversal inputs still carry unavailable rates.
- **F2-3:** constructed an actual native carrier/rider/carriage with hand-derived
  `x(theta)=cot(theta)+r*sin(theta)`, no coordinate limits, and two nearby extrema.
  The old fixed-step search accepted theta=1.015316618 beyond both turns for epsilon=1e-5,
  instead of stopping at theta=0.953490490 and command=-0.000041165644.
  Adaptive arc-plane Hermite derivative checks request subdivision; a physical stop still
  requires the real slope bracket and analytic curvature. Three widths and both record
  orders now hit the independently bisected first extremum. Work exhaustion refuses, and
  a shorter interval can retry without changing its start. No finite sampling algorithm
  is claimed as a global proof; equations document this limit explicitly.

A broader regression caught a refinement-scale trap: shrinking the command of a lone P
also shrank its only numerical length, leaving normalized arc work unchanged. The search
now retains the admitted scale as a floor. Unbounded oblique motion in SI/English, passive
stops, supported isolated singular samples, repeated cycles and frozen references pass.

Final verification with Node 24.18.0:

- Full unit suite: **2682 tests / 285 files pass**, session 53516 exit 0,
  `artifacts/bodies-and-joints/reviews/F2-resolution-full-unit.log`.
- Earlier broad native/reference gate: **215 tests / 52 files pass**,
  `F2-native-scale-gate.log`; final full gate also includes the added work-cap test.
- Host production build: **pass**, session 22387 exit 0,
  `F2-resolution-build.log`; existing CommonJS warnings only.
- `ui-copy`: **17/17**, zero console errors, session 11711 exit 0,
  `F2-resolution-ui-copy.log`. Host HTTP 200; server PID 13660 has this worktree as cwd.
- Edited TypeScript files only were formatted; `git diff --check` passes.

S3 is complete. S4 now owns native transaction construction, lifecycle, project metadata,
codec/import and history, followed by F3. S5–S8 remain mandatory, including the native UI,
all catalog/consumer cutovers, actual live animation gates, substantial removal and final
performance/integration evidence. The narrow-fold fixture joins the S6 native gallery list.


## S4 first persistence slice — native core records

S3/F2 completion is committed as **bca3492**. S4 is in progress, not complete.

`services/transcoding/body-document-codec.ts` now reads/writes the current computational
BodyDocument through an explicit `pmks2:` envelope. Its JSON includes version 2, uses full
JavaScript numeric precision, and carries a CRC32 over its UTF-8 bytes. CRC is a damaged-data
check, not authentication. There is no compression yet. Table/set ordering is canonical;
authored geometry sequence/winding is retained. The decoder returns a whole candidate or a
structured refusal, never a partly loaded record collection and never a mutation of the live
legacy document.

A separate exact-shape boundary precedes the typed model validator: unknown fields/kinds,
wrong-kind fields, unsupported versions, nonfinite/malformed nested values and missing or
duplicate references refuse. This matters because the pure typed validators assume their
required nested objects exist. Bounds are 8 MiB decoded JSON, 20,000 entries per general
collection (4,096 polygon vertices), 200,000 aggregate JSON nodes, depth 32, 128-character IDs
and 2,048-character labels. These are candidate resource limits, not claimed UI capacities.
The schema is intentionally explicit; adding a persistent native field requires updating it
and its round-trip assertion rather than silently dropping that field.

Tests cover native joint kinds and the worked cylinder/fold-pair constructions, Unicode
labels, tiny/full-precision poses, stable bytes under record reordering, retained bar vertex
ordering, group/material mass and paint overrides, circular geometry, material force ownership,
holds, locks and traces. Corrupt bytes, valid-checksum unsupported physics, invalid references,
malformed JSON, sparse author-side arrays and resource excesses all refuse without a document.

Verification: `S4-codec-properties-unit.log` reports **21 tests / 3 files pass** (7 codec tests
plus material ownership and joint-record regressions), session 28024. The initial test compile
exposed a TypeScript narrowing error in the new assertion; the corrected tuple construction
is checked by this passing run. Host production build also passes, session 56427 exit 0,
`S4-codec-build.log`; only the existing CommonJS warnings remain. The new files were formatted
and whitespace checks pass. This is a native core-persistence checkpoint, not the S4 gate.

**Next required work:** extend the authored document/schema for complete project settings and
synthesis state; preserve shipped backdrop/camera metadata while keeping existing local-only
photo semantics explicit. Implement the one native edit authority, typed commands and shared
permission results, exact deletion closure and group lineage, then bounded production import,
codec facade and history/recovery. Build native lifecycle fixtures through those commands and
save/reopen them. Run S4's full named unit/browser gates and F3 before native UI work. The
current codec is not wired into UrlProcessorService or public templates, and no legacy or
native drawing has been silently converted in place. S5–S8 remain unchanged requirements.


## S4 structural transactions, lifecycle and local history

The core codec checkpoint is **d8bb9e6**. This slice adds `planBodyEdit`,
`BodyDocumentAuthority` and the inactive `NativeBodyDocumentService` facade. They accept one
command, compute a complete candidate, validate its physical records and drawn constraints,
and publish one immutable document/change/history entry. Commit replans stale previews;
refusal and no-op publish nothing. Local selection/independent clocks are history metadata,
not shared drawing data. Updating local playback state retains the design document identity.

Current commands cover insertion, exact deletions, joint-kind changes and explicit aggregate
mass reset. This is **not complete S4 editing**: pose/geometry/property/driver operations,
copy/remap and paused-pose re-anchoring still need implementation. Capture operations currently
require the start pose through the existing permission model; this temporary restriction must
not survive as a regression in the native public editor. No UI consumer has switched authority.

Lifecycle behavior now has direct native-command assertions:

- All six construction orders of three cylinders sharing a pin, deleting each cylinder, and
  deleting the junction itself. A native junction is a connection bundle: removing it keeps
  physical bodies and all three assemblies. Removing a cylinder preserves the other two and
  reconnects their surviving pin attachments after loss of the original hub.
- Explicit edge removal happens before lost-hub connectivity is collapsed. A combined body
  and connection deletion must not reconstruct the connection the author removed. An unweld
  at the same point retains attachment and bundle IDs; a different point creates new anchors.
- A selected welded group owning two cylinders deletes both complete assemblies; brackets in
  their opposite groups survive. A slot always keeps its actual material owner and never moves
  to a lookalike sharing its two ends. Loads, locks, holds, traces and valid selections follow
  actual retained records. No native fewer-than-two-pins garbage collection exists.
- Continuing groups retain paint/name, true splits restore member presentation, and merging
  honors the explicit target before stable size/ID precedence. Aggregate mass is never invented
  on split or nonzero-inertia membership change; an explicit reset can be in the same batch.
  Losing a zero-contribution frame member reexpresses custom CoM in the surviving frame.
  Zero mass with nonzero inertia is still a physical contribution.
- New annotations reach validation even when invalid; they cannot be silently discarded by
  lineage. Empty overrides and unaffected singleton annotations survive no-ops unchanged.
- Converting P to pin-in-slot honors the actual guide owner, including reversed coordinate,
  speed and limit signs. Removed driven/limited coordinates require an explicit decision.
  Welding the two sides of an actively driven coordinate refuses even if the drawn pose fits.

These assertions cover small construction-order enumeration and targeted reversed arrays;
independent Cartesian permutations of body/joint/label/member order and all named legacy
lifecycle ports remain part of the full S4 gate. The native save/reopen lifecycle matrix,
production import and native recovery facade also remain pending.

Verified evidence (Node 24.18.0, logs under `artifacts/bodies-and-joints/`):

- `S4-structural-final-unit.log`: **2716 tests / 293 files pass**.
- `S4-structural-final-build.log`: production build passes, existing CommonJS warnings only.
- Four intentional defect mutations fail their intended assertions and were restored before
  the final suite: `S4-mutation-explicit-pin-delete.log`, `S4-mutation-pin-identity.log`,
  `S4-mutation-annotation-drop.log`, `S4-mutation-rigid-drive.log`. The last reports one expected
  failure / five passes, observing an erroneously accepted driven weld, not a compile failure.
- The owned server's cwd and HTTP 200 were rechecked at localhost:4307. `S4-structural-ui-copy.log` reports **17/17 pass**, zero console errors; this unchanged legacy page is not evidence of native browser editing.

F3 has not been requested; spending/reservations are unchanged. Next: complete authored project
state and remaining commands, then production import and recovery integration before F3/S5.


## S4 authored project state and persistence follow-through

The structural edit checkpoint is **77b2cb1**. The next slice extends `BodyDocument` with
required project settings and optional synthesis/view records; their exact fields and units
are in the contract. This is still S4 in progress, not a public/native editor cutover.

- Settings retain display angle/force units, gravity, force-analysis mode, major/minor grid
  and ID visibility, object scale, and signed defaults for newly created drives. Existing
  drivers retain their actual profiles. Length-unit conversion is not implemented by this
  operation; relabeling units without converting geometry is not permitted.
- Synthesis retains ordered target poses, length/reference/search options, pivot region,
  generated material/joint/attachment IDs, original attachment placements and the partial
  ownership flag. Removing generated material preserves the design, marks partial ownership,
  and prunes only references to records that existed before deletion. Invalid ownership in a
  mixed author/delete batch remains invalid and refuses the whole batch.
- View metadata retains a model-space camera center/span and shipped backdrop path, center,
  width, angle, opacity and label. Remote/private data URLs and path traversal are refused.
  Actual asset loading remains an S5/S6 UI task. Local photos, snap preferences, global CoM/
  trace switches, selected objects and playback clocks do not become shared payload fields.
- The project command participates in the same preview/commit/effects/history boundary.
  Synthesis-only changes are allowed in Synthesis mode; settings quote the existing
  `SETTINGS_AT_START_ONLY` model. Metadata-only changes retain clocks. Changing gravity
  invalidates force results, but its broad invalidation does not reset unrelated clocks when
  combined with deletion. Two ordinary four-bars paused after a whole revolution assert that
  distinction through the actual authority, including the retained elapsed time.

The save/reopen tests exposed a pre-existing native-factory schema mismatch: structural typing
allowed a `Pose` as a `Point`; object spreading then copied `angle` into an attachment. The
factory now captures only the fields declared by point/pose/vertex records. The codec keeps its
strict unknown-field check. The initial compile failure (a union of branded ID arrays needed
`Set<string>`) and original round-trip failures are retained in `S4-project-initial-compile.log`
and `S4-project-shape-failure.log`; they are not passing evidence.

Verification under `artifacts/bodies-and-joints/` (Node 24.18.0):

- `S4-project-full-unit.log`: **2723 tests / 294 files pass** before moving the shared schema into the model.
  The two clock tests were subsequently strengthened to use completed full crank revolutions;
  `S4-project-final-focused.log` reports **7/7 pass** for those final assertions.
- `S4-project-build.log`: production build passes; only existing CommonJS warnings.
- `S4-project-ui-copy.log`: **17/17 pass**, zero console errors, unchanged legacy localhost
  route. No native UI or animation change is claimed by this checkpoint.
- `S4-mutation-synthesis-owner.log`: removing the provenance check yields the intended one
  failed assertion (bad owner silently accepted). `S4-mutation-settings-clock.log`: using
  force invalidation to reset clocks yields the intended one failed assertion: the surviving
  crank's command/time reset from 2π to zero. Both mutation processes restored source in
  `finally`; `S4-project-restored-unit.log` reports **11/11 pass** afterward.

**Remaining before F3:** finish pose/geometry/coordinate/property/load/hold/lock/drive commands,
copy/remap and branch-neutral paused re-anchoring; complete production import and atomic native
load/save/recovery facade; port the full enumerated lifecycle/save-reopen matrix and named
legacy behavioral assertions. The source audit also confirms missing native force color/lock
and attachment-anchored custom CoM representation; those existing user properties must be
carried before import/editor cutover, not silently dropped. Connect project gravity/analysis
settings to the native runtime options when the service begins owning simulation. Complete
S4's named browser gates and focused F3 review before S5. Paid review accounting is unchanged.


### S4 shared schema and acceptance budget

The exact native schema now lives in `model/body-system/document-schema/`; both the codec and
edit validator ask it. This prevents an accepted typed edit from introducing an unknown field
that the next save refuses. The existing 8 MiB decoded-document budget also lives in the model
and is enforced before accepting an edit, using UTF-8 bytes rather than JavaScript character
count. The envelope retains the same limit and public refusal shape. A regression inserts
individually valid Unicode labels whose aggregate exceeds the envelope and expects refusal
without a history entry or document change. This is resource validation, not compression.

After schema centralization, `S4-project-schema-full-unit.log` reports **2724 tests / 294 files
pass**. The final byte-budget check adds one further test; `S4-project-budget-unit.log` reports
**20 tests / 3 files pass** (project/authority/codec), and `S4-project-schema-build.log` passes
the production build. Both processes finished with exit 0. The UI-copy gate above remains
17/17 with no public renderer change. The two earlier clock/provenance mutation probes remain restored.


## S4 authored properties, editing references and clock separation

The preceding project/schema checkpoint is **e1571b1**. This slice adds native material/group,
force, attachment, label, lock and hold property commands through the existing transaction.
S4 is **still in progress**; there is no public editor cutover and no F3 call yet.

- Material properties stay on persistent bodies. Group color/name/mass edits target exact
  final membership and run after lineage; they do not overwrite member properties. Ordinary
  no-op properties and refused bulk changes create no events/history. Identity fields cannot
  be smuggled through a property change's object spread.
- Material and group CoM records now support attachment editing anchors with actual ownership
  validation. Deleting an existing reference keeps the physical center and falls back to the
  body's editing frame. A newly supplied invalid reference is not silently repaired away.
  Group anchors can name members; member anchors cannot name another material's point.
- Loads retain color, optional authored arrow length, zero-magnitude heading and lock state;
  attachments retain color as well as labels/traces. Force-frame switching and explicit
  material-owner reassignment preserve world application point/vector and free couple at the
  design pose. Owner reassignment deliberately resolves an imported ambiguous load scope.
- Settled transaction validation checks surviving point/force locks. Force magnitude, color,
  label and couple can change, but neither arrow handle can move. Locked objects can delete.
  Setting a force to zero preserves its previous direction rather than turning its arrow.
- Clock invalidation now uses a motion-only record projection. Physical-property, load, trace,
  annotation and edit-mark changes can require fresh analysis without resetting a paused
  command/time. A mixed batch still invalidates the actual changed motion partitions.

Tests build on the existing native three-leaf and four-bar fixtures. They exercise a single
bulk property/history event; exact material versus group values; save/reopen; releasing welds
with owned force color/locks and anchored custom CoM; oblique force-frame/owner conversion
against hand sine/cosine arithmetic; locked force handles; deleting member and group editing
references; malformed new anchors in deletion batches; and paused analysis-mode mass/trace/
length-hold edits with the same nonzero clock retained.

Verification (Node 24.18.0, `artifacts/bodies-and-joints/`):

- `S4-property-full-unit.log`: **2735 tests / 295 files pass**, session 26024 exit 0.
- `S4-property-build.log`: production build passes, session 22349 exit 0; only existing
  CommonJS warnings. All touched TypeScript files were formatted and whitespace checks pass.
- `S4-property-mutation-{clock,force-lock,center-owner}.log`: each deliberately reintroduced
  defect gives exactly one intended assertion failure / seven passes. The mutation process
  restored each source file in `finally` before the full passing suite. These failures show
  wrong clock values, accepted locked-handle movement, and accepted invalid center ownership;
  they are not compile/admission failures.
- `S4-property-test-syntax.log` records an initial missing-brace compile failure in the new
  test; it is corrected, not counted as evidence. The earlier focused gate passed 33 tests.
- The owned server remains PID 13660 in this exact worktree and returns HTTP 200 on
  localhost:4307. `S4-property-ui-copy.log` reports **17/17 pass**, zero console errors,
  session 47571 exit 0, on that unchanged legacy route.

**Next required S4 work:** native pose/geometry/coordinate/drive edits, copy/remap, unit
conversion, cylinder dimensions/angle holds, whole-body locking for a one-connection body,
and anchor-preserving paused editing through displayed body frames. In particular,
`force-owner` and `force-properties` frame conversions temporarily quote the start-pose
refusal because their current mapper has only design frames. This is an incomplete internal
capability, not an approved regression: complete the displayed-frame mapper and its tests
before S5/S6 native UI acceptance. Other canonical local properties/length holds retain paused
clocks; no native gesture/angle-hold filmstrip is claimed here. Match the existing body/centroid,
grid and attachment CoM behavior when implementing deformation.

Then finish production import, the atomic native load/save/recovery facade, the complete
independent enumeration and save/reopen lifecycle matrix, and the named S4 browser gates.
Only then request F3. Fable spending/reservations are unchanged. S5–S8, substantial legacy
runtime removal, both live browser workflows and final integration remain required.


## S4 canonical geometry, body locks and center mapping

The preceding checkpoint is **dd82745**. This slice implements the canonical geometry/pose
transaction primitives that the connected gesture solver will consume. S4 remains **in
progress**, the native UI is not active, and no F3 review was requested.

- `body-geometry`, `attachment-position` and `body-poses` now run through `planBodyEdit`.
  Shape and pose are separate operations. Bound endpoint edits update the actual vertex and
  every marker explicitly bound to it; unbound connection/tracer edits leave shape unchanged.
  `BodyFactory.vertexAttachment` makes binding a deliberate construction choice. Partial
  one-sided R edits and incomplete welded-group pose proposals fail settled validation.
  Complete three-way proposals and whole welded/cylinder poses commit once with unchanged
  local shapes/rest transforms. Generic edits preserve cylinder intrinsic geometry; assembly
  dimension editing remains its own pending command, not an allowed arbitrary leaf resize.
- A persistent optional material `locked` flag handles the one-pin rotating-body case.
  Its pose, geometry and surviving attachments cannot move while locked. Individual point
  locks still permit rotation about the point. Mass/color/labels and deletion remain allowed;
  unlock-and-move is one transaction. Codec/history preserve the new body lock.
- Length/angle holds are checked on the settled candidate and return the shared
  `held-dimension` refusal. They never become simulation rows. The pending gesture solver
  must use holds when finding a proposal, not merely rely on rejection after an arbitrary move.
- Material centers now follow their body/centroid, fixed grid or selected attachment during
  canonical edits. A body-relative center retains a stable named geometry direction in
  `editAxis`; shape rotation rotates its offset, and a later longer polygon diagonal or array
  reversal cannot reinterpret it. Save/reopen preserves that pair; removing the pair rebases
  without moving the center. Copy/remap must include these VertexIds.
- Group centers retain their explicit reference and aggregate overrides. Body-relative group
  offsets use the member geometry-derived aggregate centroid in the group's stable frame;
  grid/attachment offsets stay in world axes. Existing reference deletion is applied **after**
  pose mapping, so deleting the attachment during a turn preserves the old world center.
  Newly supplied invalid references are not eligible for repair. Explicit center properties
  override automatic remapping even if the supplied number equals its old value.

Tests use the new reusable `nativeEditableBar` construction helper and the existing native
three-leaf/three-cylinder fixtures through actual authority commands. They cover binding and
free tracers, accepted/refused multiway proposals in both orders, rigid group/cylinder poses,
held length/angle, one-pin versus whole-body locks, atomic refusal and unlock, all three CoM
reference modes under extension/rotation/translation, deletion during a turn, and a polygon
whose longest vertex pair changes between two edits with save/reopen in between. They also
check annotation/material retention and undo/redo. Public native fixture URLs remain an S6
gate; these source fixtures are not being counted as native UI evidence.

Verification in `artifacts/bodies-and-joints/` (Node 24.18.0):

- Final `S4-geometry-full-unit.log`: **2749 tests / 297 files pass**, session 6963 exit 0.
- Final `S4-geometry-build.log`: production build passes, session 73065 exit 0; existing
  CommonJS warnings only. Earlier full/build sessions 36055/79534 passed before the final
  CoM deletion/polygon additions and are superseded by the final logs.
- `S4-geometry-focused.log`: 26 tests / 4 files pass (session 78273 exit 0), before the last
  polygon assertion was added; the full final suite includes that assertion.
- `S4-geometry-mutation-body-lock-angle.log` and `S4-geometry-mutation-center-direction.log`:
  each deliberate defect produces **one intended assertion failure / six passes**. The first
  accepts a locked body's rotation; the second produces the wrong custom-center position.
  The Python process (session 19094 exit 0) restored each source byte-for-byte in `finally`
  before the final full tests/build. These are behavior failures, not compile failures.
- `S4-geometry-ui-copy.log`: **17/17**, zero console errors (session 29598 exit 0). Server
  PID 13660 was rechecked with cwd in this worktree and HTTP 200 at localhost:4307. The initial
  invocation failed because `/tmp/pmks-playwright` is gone; the rerun used the repository's
  installed Playwright with `PMKS_PLAYWRIGHT_DIR=..`. The initial failure is retained as
  `S4-geometry-ui-copy-missing-temp-install.log`. No new browser installation was needed.
- All touched TypeScript files formatted; whitespace checks pass. No renderer, gesture handler
  or legacy public edit path changed, so this unchanged-route copy check is not native UX
  acceptance. Required live/incognito and filmstrip checks still accompany S5/S6/S8.

**Next required work:** implement the connected gesture proposal solver and paused displayed-
frame mapping/re-anchoring using these canonical primitives. Do not simply lift their temporary
start-pose guard or commit a displayed body pose as the authored anchor. The current primitive
checks complete proposals but does not discover their closure, solve held CAD geometry, or
reparameterize input commands. Coordinate/drive edits, cylinder dimensions and assembly angle
holds, unit conversion, copy/remap, production import/recovery, the full independent lifecycle
matrix and named S4 browser gates remain required before F3. Fable spending/reservations are
unchanged. S5–S8 and substantial obsolete-runtime removal remain pending; no push/publication.


## S4 connected point proposals and exact edit derivatives

The preceding geometry checkpoint is **5097c94**. This slice adds the native `move-point`
command and its connected geometry/pose proposal solver. S4 remains **in progress**. No native
UI cutover or paid review occurred; F3 remains after the complete S4 gate.

- A point command captures the requested authored world coordinate. Exact placement must
  reach it; pointer projection can follow available local motion. Both use canonical geometry
  operations inside the existing one-document transaction. A stale preview retains the original
  command, so a weld inserted before commit is included in the replanned rigid-group move.
- The model closes binary R attachment relationships, explicit vertex bindings and holds,
  then follows connected bodies without using WORLD as a bridge. Requested ground anchors
  can move, while unrequested ground anchors remain fixed. This corrects the preceding
  canonical primitive's overly broad WORLD-attachment refusal; the WORLD frame stays immutable.
- R/P/slot, drive, hold and lock rows use exact first derivatives of changing local geometry
  and rigid poses. Welded/cylinder material moves through condensed rigid frames, with a
  geometry-centered normalized motion metric. Independent body/joint/attachment order and
  opaque ID changes do not pick another answer in the 16-way three-cylinder junction test.
- A length-held bar's actual bound ends imply rigid material motion, so its off-axis witness
  follows its rotation. Holds between unbound points still permit local geometry changes.
  The Jacobian fixture explicitly keeps that latter case mutable; otherwise a rigid length
  row would no longer test the local-geometry derivative its name promised.
- Correction/projection are bounded searches and refuse on exhaustion. A zero tangent step
  with remaining pointer error checks nearby feasible directions, catching the stationary
  maximum at the opposite side of a held circle. Projection can seed exact placement but
  cannot substitute for reaching the typed coordinate. Refusals create no partial history.
- Material rebasing now also rotates a body-frame force's stored zero-magnitude heading.
  A body/world-frame zero-force test, including a lock, checks both world arrow ends.

The new four-file, 18-test set includes hand-derived held-circle positions and off-axis
witnesses, exact versus projected refusal, antipodal targets, explicit versus unrequested
ground edits, three-way R closure, an unbound welded tracer, a cylinder's accepted travel and
rejected stop, stale previews after a weld, rigid local-shape retention, all three row families
against central differences, enumeration/opaque ID permutations, scales 1e-5/1/1e5, translated
oblique poses and material-frame rebasing. The geometry fixture now supports explicit scale
and pose without changing its default construction. These source fixtures still await native
UI/gallery integration; they are not browser acceptance evidence.

Verification in `artifacts/bodies-and-joints/` (Node 24.18.0):

- `S4-point-full-unit.log`: **2767 tests / 301 files pass**, session 89844 exit 0, including
  the corrected mutable-geometry derivative fixture.
- `S4-point-build.log`: production build passes, session 50280 exit 0; existing CommonJS
  warnings only. Touched TypeScript files are formatted; whitespace checks pass.
- `S4-point-mutation-held-material.log`: disabling held-bar rigidity produces the intended
  **3 failed / 9 passed** assertions, leaving off-axis witnesses behind.
  `S4-point-mutation-stationary-maximum.log`: disabling the improving-direction probe produces
  the intended **1 failed / 11 passed**, accepting the farthest point. Both mutated source
  sites were confirmed restored before the final full suite. The mutation runner's session
  was no longer available after context restoration; the retained logs provide its test
  outcomes, and the subsequent full suite verifies the restored files.
- `S4-point-projection-initial.log` retains the initial projection convergence failure; it
  was corrected before the passing focused/full suites, not counted as passing evidence.
- `S4-point-ui-copy.log`: **17/17**, zero console errors, against the owned localhost:4307
  server (PID 13660, correct worktree cwd and HTTP 200 verified). Repository Playwright was
  used via `PMKS_PLAYWRIGHT_DIR=..`. This still exercises the unchanged legacy UI only.

**Required next:** displayed-frame mapping and anchor-preserving paused edits; coordinate and
drive edits, cylinder dimensions/assembly holds, active travel projection policies and gesture
continuation; independent-clock integration, unit conversion and typed copy/remap; production
import/recovery and the complete native lifecycle/save-reopen matrix; named S4 browser gates
and F3. This local projection does not claim a global nearest solution or completed branch-
continuous gesture semantics. Do not simply lift the temporary shared start-pose guards.
S5/S6/S8 retain both Playwright filmstrips and standard Codex computer use in incognito Chrome,
as recorded in CLAUDE.md and the plan. Review spending/reservations remain unchanged; S5–S8
and substantial obsolete-runtime removal remain pending. Nothing was pushed or published.


## S4 displayed properties, force ownership and local frame history

The preceding connected-point checkpoint is **4f0379a**. This slice establishes the native
displayed-frame boundary and completes direct paused mappings for properties and free points.
S4 remains **in progress**, with constrained geometry/topology re-anchoring still required.
No paid review or public editor cutover occurred.

- The authority/service accepts an existing `SimulationView` only when its revision and full
  source document match. Every runnable partition needs an explicitly selected sample. Native
  material poses and scalar commands convert from the readers' SI boundary into document units;
  selected times/directions join local clocks while authored anchors and sync choices survive.
  Capture does not mutate the document or add history. Clock changes invalidate the captured
  frame; selection changes alone retain it.
- The canonical transaction implementation moved to `body-design-edit-plan.ts`; the public
  `planBodyEdit` still owns permission and now chooses the displayed mapping when available.
  Posed force axes/owner changes use actual displayed transforms. Free unbound/unconnected
  tracer targets map into their material frame. Final lock checks apply at the displayed pose,
  then exact authored body poses and driver initial values are restored. The mapper refuses
  an incidental geometry/connection/pose change that requires the pending re-anchor solve.
- Angle holds travel into the displayed frame for editing and back to the authored frame for
  storage; unchanged holds retain their exact records across repeated property edits. Capturing
  a new angle hold without a displayed frame now quotes the shared start-pose refusal instead
  of inferring it from the wrong angle. Other canonical property behavior stays available.
- Accepted direct mappings preserve all clocks. A moved free tracer invalidates its analysis
  samples but does not reset the input command. History stores the local displayed frame and
  restores it on Undo/Redo, stamping change events with the restored revision. Shared encoding
  includes neither frame nor clock state and reopens at the authored start. Frame getters keep
  stable identity between changes so ordinary UI reads do not invalidate caches.
- Preview commit replans against the current authority frame, including a seek to another
  sample without a document edit. Missing, foreign and stale views are rejected without
  disturbing the last accepted view or local clocks. Playing and failed bulk changes remain
  atomic and produce no history/event.

The new 11 tests use actual native snapshots and commands. A rod authored at 0.4 rad is shown
at 1 rad beside an independently translating carriage; expected world/local points and force
vectors come from those hand angles and translations. Tests cover SI/English frame capture,
locked force axis/owner changes, a locked zero-magnitude arrow, a free tracer's local target,
independent clocks, angle-hold stability, save/reopen versus local history, stale/foreign/missing
samples, a seek between preview and commit, and an atomic locked bulk refusal. A real ram cycle
adds the return leg: an outward and returning sample have identical poses but different times
and directions, which must survive the edit and Undo/Redo.

Verification in `artifacts/bodies-and-joints/` (Node 24.18.0):

- `S4-posed-property-full-unit.log`: **2778 tests / 303 files pass**, session 70454 exit 0.
- `S4-posed-property-build.log`: production build passes, session 54488 exit 0; existing
  CommonJS warnings only. Touched TypeScript files formatted and whitespace checks pass.
- `S4-posed-property-focused.log`: **11 tests / 2 files pass**, session 31858 exit 0.
  Earlier focused coverage included existing authority/property tests; the full gate above
  covers all of them. `S4-posed-property-initial.log` retains the initial exact decimal-time
  assertion failure; the expected time now uses a numerical tolerance, with no runtime change.
- `S4-posed-property-mutation-clock.log`: disabling clock retention gives **1 failed / 9 passed**,
  resetting the tracer owner's command to zero. `S4-posed-property-mutation-direction.log`:
  forcing every sample to the outward direction gives the intended **1 failed / 1 total**.
  Runner session 60727 exited 0 and confirmed byte-for-byte source restoration in `finally`
  before the final full suite/build.
- `S4-posed-property-ui-copy.log`: **17/17**, zero console errors, session 20360 exit 0.
  Server PID 13660's cwd was verified in this worktree; localhost:4307 returns HTTP 200 with
  the required network permission. Repository Playwright used `PMKS_PLAYWRIGHT_DIR=..`.
  This is still the unchanged legacy renderer, not native paused-gesture acceptance.

**Next required:** extend the displayed transaction to constrained geometry and topology by
solving back to each surviving authored input anchor, retaining branch/return-leg identity
and the explicit unreachable-anchor policy. Do not merely restore old body poses after a
length change, or lift all paused guards because direct properties now work. Complete the
remaining coordinate/drive/cylinder/hold commands, unit conversion, typed copy/remap, production
import and atomic load/save/recovery, the full lifecycle matrix and named S4 browser gates,
then F3. The service exposes the frame but does not yet own simulation scheduling or the
public renderer. S5/S6/S8 require both Playwright filmstrips and standard Codex computer use in
incognito Chrome. Paid-review spending/reservations are unchanged; substantial legacy removal
and all S5–S8 acceptance criteria remain required. No push/publication.


## S4 constrained paused geometry and anchor recovery — implementation checkpoint

Continued from **108d9bc**. The previous reminder response only confirmed the already tracked
requirement to use both browser workflows; it was not implementation progress. Resumption
inspected the actual uncommitted source and the terminal passive-gap test log. That test
failed with `unreachable` where the hand-derived mechanism retains a route to its anchor.

The displayed transaction now handles constraint-changing geometry/topology through the same
canonical planner, then restores affected partitions to their authored input coordinates.
The staging source, lock/hold checks and all-or-nothing history behavior are shared with the
direct property mapper. Unaffected material poses and clocks remain exact, including stationary
drivers outside movable partitions. A stopped input still at its own start does not need to
build a finite-speed cycle just because another machine is displaced.

- `restoreBodyPartitionAnchor` recovers the old coordinate and rebuilds the changed motion to
  find the displayed pose by material geometry and direction. New times come from the changed
  cycle, preserving a returning cylinder's leg. Bracket insertion carries new material back
  with its welded group. A weld that makes a nonzero driven linkage immobile still refuses
  through existing final validation; the test was corrected instead of weakening that rule.
- `reachBodyAnchor` checks an alternate angular route when direct continuation encounters a
  stop. The rotary carriage has y=r sin(theta), r=0.8 enlarged to 1, and an upper stop y=0.95.
  The old theta=0.4 and displayed theta=2.8 remain feasible although the direct route crosses
  the sine maximum. A completed cycle retains the anchor around the other side. A second
  test adds an input upper bound that closes that route and proves the reset is appropriate.
- `bodyAnchorTurns` keeps integer turns coherent across welded material and P angle rows.
  The native rotating-cylinder fixture supplies carrier, welded barrel and rod; the source
  before cylinder insertion is made by the actual assembly-deletion command, so the new
  members have no previous angle seed. Both construction orders preserve the hand poses.
- `bodyCycleCrossings` corrects crossings of the rebuilt cycle and compares material position
  and orientation. It checks passive limits as well as residual correction. Returned material
  angles and command share the same unwrapped turn. Display position matching allows the
  solve frame's world-coordinate input precision without weakening its angle tolerance.
- A nonlooping window validates its direct interval and displayed pose, in addition to the
  signed elapsed-time calculation. Valid endpoints cannot bypass a passive stop. A window
  that cannot represent the edited display resets explicitly; it does not silently become a
  cycle. Numerical exhaustion and failed clock matching say `anchor-unsolved`, separately from
  positively proved `unreachable`, changed coordinates and unavailable motion.
- Locks apply where the gesture is displayed, while anchor recovery transports rigid material
  as motion would. Final authored/displayed documents both validate constraints and limits;
  stored angle holds are transported consistently. Undo/Redo includes the display frame and
  local clocks; shared encoding remains the authored document only.

Independent expectations cover the four-bar after a radius change (including an off-axis
coupler witness), a driven bar beside independently clocked and fixed machines, a returning
axial ram with a changed welded carriage, a newly welded bracket and a physically lost anchor.
Sixteen record-order/opaque-ID variants preserve the four-bar answer. A negative-speed cycle
checks equivalent command and material angles. These are headless native transaction checks;
the unchanged legacy browser renderer is not evidence for the future native gesture UI.

Final verification after byte-for-byte mutation restoration:

- `S4-reanchor-full-unit.log`: **2791 tests / 308 files pass**, session **4818 exit 0**.
- `S4-reanchor-build.log`: production build passes, session **98730 exit 0**; existing
  CommonJS warnings only. Touched TypeScript formatted; whitespace checks pass.
- `S4-reanchor-ui-copy.log`: **17/17**, zero console errors, session **5933 exit 0**.
  PID 13660's cwd was rechecked in this exact worktree; localhost:4307 answered HTTP 200.
  Repository Playwright used `PMKS_PLAYWRIGHT_DIR=..`. This checks the current legacy UI.
- `S4-reanchor-lift-window.log`: **4 tests / 3 files pass**, session **91452 exit 0** before
  the additional bounded-input test and the inserted-member refinement; both are included
  in the final full gate above. Earlier `S4-reanchor-alternate.log` passed **10 / 4**,
  session **4357 exit 0**.

Mutation runner **45436 exited 0**, restored every source byte-for-byte, and the logs in
`artifacts/bodies-and-joints/` demonstrate:

- `S4-reanchor-mutation-direct-route.log`: **1 failed / 1 passed** when an angular stop is again
  treated as sufficient reason to reset. The alternate-route retained-anchor assertion fails.
- `S4-reanchor-mutation-coherent-turn.log`: **1 failed / 1 total** when P turn coherence is
  disabled; the newly inserted cylinder's hand angle fails.
- `S4-reanchor-mutation-unchecked-window.log`: **1 failed / 1 passed** when only elapsed time
  is checked; the window incorrectly crosses the passive gap.
- `S4-reanchor-passive-gap-initial.log` retains the original real failing regression. Earlier
  invalid-fixture/syntax explorations and the first mutation's unreachable-code build failure
  are retained as diagnostics, not counted as verification. The latter probe was rewritten
  to preserve TypeScript control-flow narrowing and then failed its intended assertion.

**Still required before S4/F3:** coordinate/drive/limit and cylinder-dimension operations,
active travel projection and full gesture policies, unit conversion, typed copy/remap,
production 2.0.3 import, atomic load/save/recovery, the full lifecycle/service matrix and the
named S4 browser gates. S5/S6/S8 still require both live incognito computer use and Playwright
filmstrips against the native route. F3 has not run; Fable spending and reservations are
unchanged. Substantial obsolete-runtime removal and all later acceptance criteria remain.
No push or publication.


## S4 explicit drives and working limits — implementation checkpoint

Continued from **d3b7621**, the committed constrained re-anchoring checkpoint. Added native
`add-driver`, `driver-speed`, `remove-driver`, `add-limit`, `limit-bounds` and `remove-limit`
operations through `planBodyDesignEdit`. Existing records are addressed by stable IDs; adding a
drive names its exact joint coordinate and captures the candidate's current value. Transaction
IDs supply deterministic new record IDs, so repeated previews agree with commit. No incident
body or first matching limit chooses ownership. Duplicate coordinate drives, unavailable
coordinates, missing targets, nonfinite values and invalid bounds refuse the entire batch.

A cylinder's intrinsic stroke-limit ID remains owned by the cylinder dimension command.
Generic limit editing/removal quotes `assembly-interior`; a separate working limit on the
same P coordinate is allowed. Two working limits on one coordinate can be independently edited
or removed in either array order. The existing interval solver intersects their bounds.
A working bound that excludes the displayed pose refuses; one that excludes only the old
anchor uses the proved re-anchoring reset and preserves the intrinsic cylinder record.

Speed changes use constrained re-anchoring to retain the physical display and recompute the
clock. The regression found that a negative speed replacement was still matching the old
returning direction. The fixed selection reverses the current leg when the speed sign changes,
but treats a coordinate sign reversal separately so representation does not reverse motion.
A second failing probe found that an input starting from zero speed reused its previous
placeholder direction. A stopped input now takes its new speed's direction, with a second
independently displaced machine keeping its exact clock.

The hand clock for the cylinder starts at travel 0.4, reaches 1.5 and is shown returning at
1.3. Changing +0.2 to +0.4 gives `(1.5-.4+1.5-1.3)/.4`; changing it to -0.4 gives an outward
sample at `(.4+1.3)/.4`. The displayed material poses remain exact, Undo restores the old
speed/clock, and native save/reopen keeps the authored anchor and new speed with time zero.
Speed edits have a captured paused-frame mapping in analysis; drive/limit restructuring
retains the shared analysis start restriction. Playing and missing-frame checks compare the
returned refusal against `menuRefusal`, rather than copying its wording into the tests.

Evidence in `artifacts/bodies-and-joints/`:

- `S4-drive-edit-initial.log`: **1 failed / 5 passed**, session **18732 exit 1**. The real
  negative-speed return-leg defect fails the direction assertion before its fix.
- `S4-drive-edit-focused.log`: **15 tests / 3 files pass**, session **3300 exit 0** after that
  fix, including the preceding geometry and passive-gap regressions.
- `S4-drive-edit-stopped-initial.log`: **1 failed / 7 passed**, session **6939 exit 1**. The
  real zero-to-negative-speed defect fails the new direction assertion before its fix.
- `S4-drive-edit-final-focused.log` contains a test-authoring compile error (`kinematic`
  instead of the shared mode's `analysis`); it is not passing evidence. The final full gate
  below includes the corrected permission/save-reopen test.
- `S4-drive-edit-full-unit.log`: intermediate **2798 tests / 309 files pass**, session
  **23283 exit 0**. `S4-drive-edit-build.log`, session **66841 exit 0**, passed at that state.
- `S4-drive-edit-ui-copy.log`: **17/17**, zero console errors, session **99594 exit 0**, on
  the verified localhost:4307 server using repository Playwright. The later stopped-input
  fix changes only native headless direction selection, not that legacy UI route.

Final verification after the stopped-input fix:

- `S4-drive-edit-final-full-unit.log`: **2799 tests / 309 files pass**, session **96535 exit 0**.
- `S4-drive-edit-final-build.log`: production build passes, session **3590 exit 0**; existing
  CommonJS warnings only. Touched TypeScript formatted and whitespace checks pass.

These eight command tests are a transaction slice, not the full S4 service/browser gate.
No native renderer or live user control has been switched yet.

**Next required:** coordinate pose/axis and cylinder-dimension commands, active travel
projection and full gesture policy, typed copy/remap and unit conversion, bounded production
2.0.3 import and atomic load/save/recovery, the complete lifecycle/service matrix and named
S4 browser gates, then F3. Preview currently performs full anchor recovery; future live gesture
scheduling/performance must be measured against the plan without omitting commit validation.
Both browser workflows at S5/S6/S8, native default/consumer cutover, obsolete-runtime removal
and all final gates remain. No Fable call or spending change in this checkpoint. No push or
publication.


## S4 continuation — physical unit conversion (2026-09-11)

Checkpoint based on `886e0d9`. The preceding reminder-only turn confirmed already-recorded
browser requirements but made no implementation progress; this continuation rechecked the
worktree and terminal test artifacts, then completed the pending checkpoint documentation.

One `convert-units` transaction scales every dimensional native record using independent
length, mass, inertia and force factors. Other batch operands use the destination units in
either array order. A converted source supplies lineage, CoM and lock comparisons so a unit
change preserves physical settings without exempting another edit in the same transaction.
The shared settings start restriction applies; malformed units and mixed failures are atomic.

Eight command tests cover hand-derived loaded-rod rates/reactions, explicit and density-based
mass/inertia, custom and aggregate CoM, force provenance/locks, length/angle holds, cylinder
stroke/ownership, independent display units, synthesis and saved framing, exact history and
native save/reopen. The hand disk has mass 16π and inertia 32π; the triangle has mass 6 and
inertia 13/3. A returning travel coordinate scales its values without changing its clock leg.

A real initial failure exposed a fully fixed P whose driver scaled from 2 to 200 while its
clock stayed 2: it belongs to no moving partition. Clocks now scale travel values directly,
then compare actual physical motion/driver changes against the converted source. The initial
objectScale assumption was also corrected against the contract before the final gate: it is
a document-length marker setting, not dimensionless. Its ratio to saved camera span stays
constant across units. No physical constraint is derived from it.

Rechecked evidence in `artifacts/bodies-and-joints/`:

- `S4-unit-edit-full-unit.log`: **2807 tests / 310 files pass**, session 2959 exit 0.
- `S4-unit-edit-build.log`: production build passes, session 55547 exit 0; existing CommonJS warnings.
- `S4-unit-edit-ui-copy.log`: **17/17**, zero console errors, session 71967 exit 0.
- `S4-unit-edit-unit-undo-view.log`: **6/6**, session 35087 exit 0, on localhost:4307.
- `S4-unit-edit-focused-initial.log`: actual fixed-coordinate clock regression before its fix.
- `S4-unit-edit-mutation-density-area.log` and `S4-unit-edit-mutation-independent-inertia.log`:
  each intended hand-answer assertion fails when its conversion defect is inserted. The
  mutation runner restored source byte-for-byte; final full tests/build include restored code
  and the subsequent objectScale correction. Restoration is recorded in `S4-unit-edit-mutations.log`.
- Touched TypeScript formatted; `git diff --check` passes. Documentation-only closure does
  not require repeating the already-terminal source gates.

The preceding live check used standard Codex computer use in **incognito Chrome**, alongside
Playwright, on the owned localhost:4307 server (PID 13660, worktree and HTTP 200 checked).
Selected cylinder GC and grounded rod OC retained screen positions, cylinder skin, selected
yellow outline, panel blocks and card styling through cm→m→Undo. Screenshots were inspected
inline, not saved as a filmstrip. This is a legacy-route unit/view reference check, **not**
native UI or full-cycle animation evidence. Existing native S5/S6/S8 live/filmstrip gates remain.

Two legacy issues observed there are now explicit S5 native acceptance requirements: Object
Size 0.27 cm becomes a nonzero meter value displayed as 0.00, and a size/coverage warning
appears despite unchanged on-screen proportions. Fix these in the native settings UI; do not
silently inherit them or count the current headless tests as their UI verification.

**Next required:** coordinate pose/axis and cylinder dimensions, active travel projection and
full gestures, typed copy/remap, bounded production 2.0.3 import and atomic recovery, complete
lifecycle/service coverage and remaining named S4 browser gates, then F3. S4 remains in
progress. No Fable call or spending change, no push or publication.


## S4 continuation — copied material, annotations and exact source clocks (2026-09-11)

Checkpoint based on `5e619d9`. `copy-bodies` is now a canonical transaction with explicit
material selection, translation and ground inclusion. It closes a cylinder's ownership once,
retains selected riders through an omitted multiway-pin hub, allocates all new IDs before
mapping references, and selects the new assemblies/material. Partial imported load scopes
and custom aggregates refuse atomically. Existing source material, synthesis ownership,
project settings and camera are preserved.

The typed remap covers all included material geometry/vertex bindings, custom CoM axes and
anchors, group frames/properties, forces/couples/provenance, locks, holds, guide stations,
pin bundles, cylinder roles, drivers and limits. WORLD is retained only as the explicit ground
body; copied ground anchors get new IDs and the placement offset. A weld rest is recaptured
for either WORLD pair order. Undo/Redo and native save/reopen preserve the copied identities;
deleting a copy leaves the original cylinder, bracket, loads and drives intact.

Self-review probes found and fixed five defects before this commit:

1. A later joint-kind edit in a mixed batch discarded the newly copied pin bundle. The pin
   lifecycle source now includes copied records as well as the original pre-kind graph.
2. A copied grounded fabrication attempted a second annotation on the same WORLD weld group.
   Existing presentation lineage governs that shared group; aggregate copying there refuses
   until member-derived properties are selected.
3. A paused copy needlessly solved the unchanged original back to its anchor, perturbing its
   exact return-leg clock from 6 to 5.9999999999255 seconds. `unchangedBodyMotion` compares the
   actual material, incident constraints, referenced boundary points, drives, limits and holds
   before anchor recovery. Analysis may still be invalidated by the changed fixed group.
4. Eleven copied materials changed raw ID sort order (body:10 before body:2), changing the
   fallback name/paint of a copied weld group. Complete groups now capture their visible
   presentation without rewriting the leaves' own presentation.
5. The first presentation fix assumed groups had at least two members, dropping a valid
   singleton mass/inertia/CoM override. Explicit singleton annotations are now retained too.

Eleven command tests cover those defects, grounded/floating connections, oblique guide
stations, source/reference isolation, custom mass/force/hold data, cylinder closure, paused
return-leg copying, history, serialization, and table/selection permutations. The paused
copy starts its new input at the captured pose while preserving every original authored body
and the exact original clock. Geometry-changing edit and drive tests remain alongside it so
that the unchanged-motion check cannot replace necessary anchor recovery.

Evidence in `artifacts/bodies-and-joints/` (all process handles terminal):

- `S4-copy-initial.log`: test-authoring TypeScript error using the codec write-result object
  as a string, session 18477 exit 1. Corrected to unwrap the typed payload; not passing evidence.
- `S4-copy-focused.log`: initial **5/5**, session 49637 exit 0.
- `S4-copy-boundaries-initial.log`: **3 failed / 6 passed**, session 19592 exit 1, reproducing
  the pin bundle, WORLD annotation and exact-clock defects above before their fixes.
- `S4-copy-fixed-focused.log`: **24 tests / 3 files pass**, session 29957 exit 0, including
  existing posed geometry and drive commands.
- `S4-copy-mutation-center-axis.log` and `S4-copy-mutation-ground-weld.log`: deliberately
  omitted CoM-axis remapping and WORLD-weld translation each fail intended runtime tests.
  `S4-copy-mutations.log` records byte-for-byte restoration; runner session 62631 exit 0.
- `S4-copy-identity-initial.log`: **1 failed / 9 passed**, session 91939 exit 1, proving the
  fallback identity change before its fix.
- `S4-copy-full-unit.log`: intermediate **2817 tests / 311 files pass**, session 2695 exit 0.
- `S4-copy-singleton-initial.log`: **1 failed / 10 passed**, session 3904 exit 1, proving the
  missing singleton override before its fix.
- `S4-copy-final-full-unit.log`: final **2818 tests / 311 files pass**, session 63907 exit 0.
- `S4-copy-build.log`: production build passes, session 62763 exit 0; existing CommonJS warnings.
- `S4-copy-edit-undo.log`: all **6 assertions pass**, session 65816 exit 0.
- `S4-copy-ui-copy.log`: **17/17**, zero console errors, session 53752 exit 0.

The browser checks used repository Playwright on the verified owned localhost:4307 server;
PID 13660's working directory and HTTP 200 were rechecked before running them. They are
unchanged legacy-route regressions, not native clipboard/UI or animation evidence. This
checkpoint adds no live renderer; both browser workflows and the specified native filmstrips
remain required at S5/S6/S8. Touched TypeScript formatted; whitespace checks pass.

**Next required:** integrate clipboard capture/cross-document units/paste through the native
facade using these same maps, coordinate pose/axis and cylinder-dimension commands, active
travel projection/full gestures, bounded production 2.0.3 import and atomic recovery,
complete lifecycle/service coverage and remaining named S4 browser gates, then F3. Preview
performance must still be measured at native UI integration. S4 is not complete; no Fable
review was solicited and spending is unchanged. No push or publication.

## S4 continuation — captured clipboard and destination-unit paste (2026-09-11)

The native service now captures selected material into a minimal validated `pmks2:` drawing
and previews/commits paste through the same transaction authority. Capture uses an accepted
displayed pose, excludes unselected material and project settings, and leaves source history
untouched. The immutable payload survives deleting/seeking its source. Paste converts all
physical records into destination units before adding the destination-unit placement offset.
Repeated pastes allocate independent references, preserve locks/holds/drives/assembly ownership
and produce one history entry each. Stale previews retain their captured source and replan
against current destination units; S5 placement must reuse the gesture's command ID and
cancel/restart its screen gesture when display units change.

A complete WORLD-welded aggregate can be captured in isolation. Pasting it onto an existing
zero-mass, zero-inertia support preserves destination presentation and maps its CoM through
world coordinates into the retained group frame. Existing custom aggregates or nonzero
material mass/inertia refuse ambiguous merging. A new hand-center test initially exposed an
overly broad refusal of the zero-inertia case; that production defect was corrected. No
aggregate distribution or guessed merging of custom properties was introduced.

Ten service tests cover minimal selection, source independence, SI/centimeter/English units,
forces/couples/inertia, repeated three-cylinder bundles, stale previews, paused return-leg
clocks, full history/save-reopen, corrupt/physically inconsistent payloads, playing refusals,
WORLD aggregate transfer and the oblique destination frame. Failed operations leave clipboard,
destination, history and local state unchanged. Platform clipboard and native UI remain S5.

Verification under `artifacts/bodies-and-joints/`:

- `S4-clipboard-full-unit.log`: **2828 tests / 312 files pass**, session 44951 exit 0.
- `S4-clipboard-build.log`: production build passes, session 47942 exit 0; existing CommonJS warnings.
- `S4-clipboard-ui-copy.log`: **17/17**, zero console errors, session 37714 exit 0.
- `S4-clipboard-initial.log`: fixture-label test error; corrected to the fixture's actual labels.
- `S4-clipboard-zero-frame-initial.log`: real zero-inertia support refusal before its fix.
- `S4-clipboard-ground-focused.log`: **21 tests / 2 files pass**, session 71181 exit 0.
- `S4-clipboard-mutation-units.log` and `S4-clipboard-mutation-center-frame.log`: suppressing
  source conversion and omitting the CoM frame map each fail their intended runtime assertion.
  `S4-clipboard-mutations.log` records byte-for-byte restoration, session 54198 exit 0. An
  earlier mutation caused a TypeScript error and is separately retained; it is not counted
  as runtime evidence. Final full tests/build ran after restoration.

The required legacy locking suite initially passed **27/28**, failing only its assertion
that lock badges disappear outside Edit. That expectation predates `7ec4721`; pre-checkpoint
`2949dbb` already keeps lock marks in every paused mode and hides them only while playing.
The suite now asserts the actual shared boundary: identical stored locks and visible badges
in paused Edit/Kinematic/Force Analysis, no badges during playback, physical motion despite
an edit lock, a complete observed cycle crossing, and restored badges on Pause. No production
lock behavior changed. `S4-clipboard-locking-final.log` reports **34/34**, zero page errors;
the original terminal handle is now absent and the final log is complete.

Both `artifacts/locking-modes/modes.png` and `motion.png` were inspected. The first motion crop
clipped part of the rocker/path; the suite was widened and rerun, and the final 14-frame sheet
was inspected again. It shows the full linkage moving through a cycle, the stationary faint
authored ghost, hidden playback lock and its return on Pause. Mode-panel cards retain the
reference app's layout and lock marks. This is legacy reference evidence, not native UI proof.

Standard Codex computer use also exercised the owned localhost:4307 incognito Chrome drawing:
locked cylinder GC, inspected disabled dimension fields, opened Kinematic Analysis, played
and inspected closing and opening poses, paused, returned to start, then undid the test lock.
The drawing is restored at its start with editable fields; screenshots were inspected inline,
not saved as a separate artifact. These sampled live observations complement the scripted
full-cycle filmstrip and do not claim uninterrupted live endpoint observation. Server PID
13660's worktree and HTTP 200 were verified before the browser checks.

**Still required:** coordinate pose/axis and cylinder dimensions, active travel projection/full
gestures, bounded production 2.0.3 import and atomic recovery, complete lifecycle/service
coverage and remaining named S4 browser gates, then F3. S4 remains in progress. No paid review,
push or publication occurred; Fable budget/reservations are unchanged.

## S4 continuation — exact rigid coordinate edits (2026-09-11)

`move-coordinate` now changes an existing R angle, P travel or pin-in-slot angle/travel using
one canonical transaction. It preserves local material/attachments, coordinate datums, weld
rests, cylinder dimensions and force ownership. Passive coordinates gain no persistent drive;
a selected existing driver keeps its identity/speed and captures the accepted coordinate.
Other prescribed coordinates, locks, force handles and holds stay constrained. WORLD and
unrelated machines do not follow the edit.

The former point-only model is now `body-edit-model`; `body-edit-rows` holds the shared
physical/hold/lock equations and coordinate differentiation. The point wrapper retains only
its positional goals. Coordinate motion disables all local shape variables and follows small
normalized increments. It never changes a bar's length to reach a pose. Correction/continuation
exhaustion refuses the complete command. These are exact typed-coordinate operations; guide
axis edits, dimension changes, pointer clamping and full gesture continuation remain open.

Three actual failures shaped this implementation:

- The paused return-leg test initially reported no change: re-anchoring recovered exactly the
  original authored document and the authority discarded the requested display movement.
  Posed planning now also compares display poses/clocks. A display-only coordinate edit produces
  one revision/history event; Undo/Redo retain both authored start and selected motion leg.
- A cosine carriage at angles -0.025 and +0.075 lies inside x=0.99999 at both endpoints while
  crossing x=1 between them. Small pose corrections plus endpoint bounds wrongly accepted it.
  Regular single-input motion now also uses the established `inspectBodyInterval` fold and
  interior-stop search, and compares its branch with the edit candidate. Refusal cannot fall
  through to a sketch solve.
- Adding a freely pinned member makes that drawing a loose sketch, outside ordinary motion
  admission, and exposed the same gap again. Edit segments now inspect interior values and
  analytic minimum-norm tangents, refine their Hermite shape and bracket extrema. Both kernels
  share the extracted scalar refinement criterion. The loose fixture still accepts nearby
  valid travel; it is not a blanket refusal of sketches. Searches are bounded numerical
  evidence, not interval arithmetic, and exhaustion refuses without changing the drawing.

Fourteen new tests include locks/holds/loads, both slot coordinates, passive/driven R,
unwrapped angles, paused returning travel/history, SI/centimeter/English travel, reversed P
order with WORLD on B, separate machines, corrupt targets/permissions, canonical save/reopen,
and all five worked cylinder shapes through actual commands. Oblique branches, guide directions
and construction order are permuted. The existing closed forms supply expected world poses
and off-axis witnesses; every command also checks unchanged local material, joints and assembly
records. The four additional examples are inserted through native creation transactions.

Verification under `artifacts/bodies-and-joints/`:

- `S4-coordinate-initial.log`: **2 failed / 23 passed** (session 60109 exit 1): one test incorrectly
  compared codec-canonical array order with input order; the other exposed the real display-only
  commit loss. Reopen now compares canonical payloads, retaining all physical/identity assertions.
- `S4-coordinate-focused.log`: **42 tests / 7 files pass**, session 23274 exit 0.
- `S4-coordinate-passive-gap-initial.log`: **1 failed / 7 passed**, session 65548 exit 1.
- `S4-coordinate-path-focused.log`: **43 tests / 7 files pass**, session 93325 exit 0.
- `S4-coordinate-examples-initial.log`: **13 tests / 2 files pass**, session 54940 exit 0.
- `S4-coordinate-loose-gap-initial.log`: **1 failed / 8 passed**, session 25548 exit 1.
- `S4-coordinate-interval-focused.log`: **23 tests / 3 files pass**, session 4202 exit 0.
- Final `S4-coordinate-full-unit.log`: **2842 tests / 314 files pass**, session 47974 exit 0.
- `S4-coordinate-build.log`: production build passes, session 20150 exit 0; existing CommonJS warnings.
- `S4-coordinate-ui-copy.log`: **17/17**, zero console errors, session 92868 exit 0.

The owned localhost:4307 server was reverified: PID 13660, this worktree, HTTP 200. The required
legacy `posed-editing` suite initially passed **56/58**, session 57297 exit 1. Both failures
compared the old normalized rocker fraction with the rebuilt track. The isolated probe
`S4-coordinate-rocker-probe-final.log` reproduces **848 → 851** while every displayed joint
remains exactly unchanged and the new anchor equals the shown input angle. Its initial harness
used the wrong numbered section and failed before loading; that log is retained separately.
No production transport implementation changed. The tracked suite now asserts exact physical
pose preservation, the actual input angle, the new anchor/current-thumb relationship, and the
seat's rendered position after moving away. This replaces a stale cross-range comparison with
stronger physical and rendered checks, not a larger unexplained tolerance.

`S4-coordinate-posed-editing-final.log` passes **60/60**, zero page errors, session 24978 exit 0.
`artifacts/posed-editing/drag.png` contains nine intermediate frames and was inspected: selection,
panel blocks, authored ghost and the moving joint remain visually distinct, and the displayed
point remains in place on release. A reference distance-angle field changes on release despite
that retained point; S5 now explicitly requires displayed-frame measurements across re-anchoring
and Undo/Redo. No native editor is active yet, so these reference checks do not prove native UI.
The final browser-only cleanup changes the test's old center-spelling identifiers; syntax is
checked after that rename. Core unit/build results above cover the unchanged production code.

**Next required:** guide axis edits, cylinder dimensions, active travel projection/full rigid-body
and pointer gestures, bounded production 2.0.3 import, atomic recovery, full lifecycle/service
matrix and remaining S4 browser gates, then F3. Preview performance still needs measurement at
native UI integration. S4 stays in progress. No paid review, push or publication; budget unchanged.

## S4 continuation — guide-axis transactions and visual stations (2026-09-12)

The latest goal instruction names S0–S4. S4 remains in progress; no later-stage cutover or
completion is claimed. S0–S3 evidence and the migration's later-stage requirements remain
recorded, without redefining those later deliverables as accomplished.

`guide-axis`/`guide-axes` now author headings at the captured edit pose through the existing
transaction authority. The carrier and its welded group remain fixed while connected material
moves rigidly at its captured signed travel. Existing prescriptions remain; passive travel
uses temporary edit equations rather than a stored driver. Coupled guides change together in
one solve, and independent components keep their own numerical origins, tested with another
machine displaced by 1e9. Locks, holds, assembly interiors and final validation share the
existing model refusals. Failure cancels all operations/history, including earlier properties.

An early focused test exposed asymmetric paused re-anchoring: a normal P lost its travel start
while its reversed equation order retained it. Typed axis commands now explicitly carry that
same signed coordinate across the newly authored heading; attachment/datum/pair checks remain.
The exception is not granted to general record edits. The shared rigid edit model gained fixed
carrier groups; coordinate and point callers retain their previous variable sets.

New P/slot records retain guide ownership even without physical rail extents. Reversing an old
record lacking display metadata captures its original A owner before swapping equation order.
Existing bounded records still decode, as do older native records without any display record.
New optional `station` and `normalOffset` preserve artwork independently of shared attachments;
`from`/`to` are optional only as a pair. Unit conversion scales all four distances. Axis edits
re-express displaced artwork at the physical origin before rotating it; no trace/lock/vertex is
moved to relocate a glyph. Internal cylinder P marks now have an explicit barrel-mouth station.
The native format has not shipped publicly; new optional records need not be readable by an
older pre-release native build. Public production payload handling is unchanged.

Ten focused tests cover both P orders, floating P and slot carriers, separately prescribed
slot rotation, a guided cylinder with welded off-axis witness, locked/grounded refusal,
paused travel/history, distant and coupled batch enumeration, codec, unit conversion, old
metadata, malformed extents and no-op/permission boundaries. The separate artwork tests use
hand world positions, including a locked/traced offset origin and the stationary barrel mouth
at three extensions. Intermediate continuation describes an authored design change, not
playback of the old constraint set; final relationships and bounds must pass validation.

Verification under `artifacts/bodies-and-joints/`:

- Earlier `S4-guide-axis-initial.log`: **1 failed / 27 passed**, session 61598 exit 1;
  the real normal-P paused-anchor loss, subsequently fixed.
- `S4-guide-axis-focused.log`: **27 tests / 7 files pass**, session 46479 exit 0.
- `S4-guide-axis-batch-focused.log`: **37 tests / 4 files pass**, session 93905 exit 0.
- `S4-guide-station-focused.log`: **10 tests / 2 files pass**, session 76016 exit 0.
- `S4-guide-axis-full-unit.log`: **2852 tests / 316 files pass**, session 6535 exit 0.
- `S4-guide-axis-build.log`: production build passes, session 31493 exit 0; existing CommonJS warnings.
- `S4-guide-axis-ui-copy.log`: **17/17**, zero console errors, session 88396 exit 0.

The required legacy `link-holds-angles` gate initially failed before browser launch because
it hard-coded a missing `/tmp` Playwright install. It now honors `PMKS_PLAYWRIGHT_DIR`, matching
the other suites. `S4-guide-axis-link-holds-final.log` passes **8/8**, session 38324 exit 0.
Its contact sheet was inspected: label, hold chip and center mark remain distinct at every
angle. Other bodies and ground artwork can cross the label, which this narrow test does not
claim to prevent. This is a static angle sweep on the reference renderer, not a native
animation filmstrip. Server PID 13660's worktree and HTTP 200 were verified before these checks.

A standard Codex computer-use attempt opened a separate localhost four-bar tab in incognito
Chrome. Focus changed to another task's Storybook page during observation. The test tab alone
was closed and the other page left untouched. This attempt is **not** counted as a live UX pass;
previous recorded live checks stand, and the native integration gates still require both
browser workflows.

**Still required before F3:** cylinder dimension commands (including the mouth station), active
travel projection and full body/pointer gestures, bounded production 2.0.3 import and atomic
recovery, complete native lifecycle/service matrix, and remaining S4 browser gates
`analysis-editing`, `two-mechanisms`, `export-flow`. No paid review, push or publication;
Fable budget and reservations are unchanged.

`S4-guide-station-mutation.log` restores the discarded normal-offset defect and fails the
intended runtime assertion (0.2 instead of 0.7), while the cylinder-mouth test still passes.
Session 76162 exits 0 only after requiring that failure and restoring the implementation
byte-for-byte. The full green suite/build above used those same restored production bytes.

## S4 live retry — selected-link readout after rewind (2026-09-12)

Guide-axis checkpoint committed as **b83be9e1**. The maintainer explained the accidental tab
switch and requested a computer-use retry. Standard Codex computer use opened a separate
incognito localhost:4307 test tab, selected AB on the grid, enabled Fixed Length in the panel,
verified the context menu's fixed-length state, played through observed cycle crossings,
paused and returned to start. The hold badge hid during playback and returned on Pause. The
authored ghost stayed fixed. The temporary hold was undone and only that test tab was closed.
This completes the previously interrupted live interaction check on the legacy reference app.

That retry caught a real reference defect: after selecting AB at paused angle 23°, Back to
Start moved the drawing and transport to 80° but left the selected Angle field at 23°. A later
screenshot confirmed it was settled, not animation lag; Undo refreshed it. The panel now
refreshes link/cylinder pose-dependent fields on `poseRevision`, using its existing silent
patch helpers. Unchanged poses do not overwrite unfinished typing. No selection events,
history entries or new physics are produced by refreshing the readout. The native UI gate now
explicitly includes this sequence.

The tracked `e2e/link-pose-readout.mjs` derives angle independently from the rendered link's
joint coordinates and compares the actual field, preserving the same selected ID. It covers
seek, full-cycle playback, Pause, two rewinds, Undo releasing the hold, and unfinished typing.
The first test draft accidentally committed its unfinished text when playback blurred it;
that check was moved to the end and restores the saved text. A second run reproduced the seek
failure but pressed Play during the rewind animation, which then stopped it. The final harness
waits for that existing transition. These draft runs are not counted as complete gate evidence.

Verification in `artifacts/bodies-and-joints/`:

- `S4-link-readout-initial.log`: runtime stale-field failures plus the draft's unintended typed edit.
- `S4-link-readout-before-fix.log`: stale seek field (**80° versus 51.93666°**), followed by
  the harness's rewind/play timing failure, session 41603 exit 1.
- `S4-link-readout-fixed.log`: connection refused before verification, session 41584 exit 1.
  The previous server PID 13660 was absent and port 4307 had no listener. Restarted only this
  worktree's server, session **13661**, node **19077**; HTTP 200 then verified.
- `S4-link-readout-fixed-live.log`: **9/9**, zero page errors, session 17142 exit 0. Its first
  filmstrip clipped the lower motion; final capture uses Fit Full Motion and observes a wrap.
- `S4-link-readout-final.log`: **10/10**, zero page errors, session 60787 exit 0.
  The 35-frame sheet was inspected: complete linkage stays in view, selection and authored
  ghost remain distinct, panel values follow motion, the hold badge returns on Pause, and
  rewind shows 80° in panel and transport. These are legacy frames, not native rendering proof.
- `S4-link-readout-full-unit.log`: **2852 tests / 316 files pass**, session 58495 exit 0.
- `S4-link-readout-build.log`: production build passes, session 21036 exit 0; existing CommonJS warnings.
- `S4-link-readout-ui-copy.log`: **17/17**, zero console errors, session 95974 exit 0.

S4's remaining native work and F3 are still pending as listed above. No paid review, push or
publication. The live browser finding was fixed rather than dismissed because scripts passed.

## S4 continuation — native cylinder dimension edits (2026-09-12)

`cylinder-dimensions` now proposes barrel length, rod length, bore, rod diameter and physical
stroke through the canonical transaction. Dimensions use destination document units and the
same physical inequalities as cylinder creation; object-mark scale never sets the bounds.
Each member's bar stretches about its outer material attachment, preserving that attachment's
local point, body/vertex IDs, weld rests and load records. Bound vertex attachments follow the
shape; unbound attachments retain their local coordinates. Internal P origins and barrel-mouth
station update together, and the existing final center-remapping rules preserve body/grid/member
CoM edit references. No member or compound is rebuilt under a new ID.

The chosen outer attachment (barrel by default, rod explicitly) remains at its captured world
position. The connected material settles rigidly at its captured internal extension, with
existing drives/holds/locks participating. Passive travel adds no permanent driver. The first
hand-position test failed because an off-axis welded bracket caused the least-motion answer
to rotate a floating cylinder slightly while lengthening it. The solver now prefers the
captured heading where feasible, but relaxes that preference when a physical connection needs
a turn. A vertical external slot validates the latter against x fixed and
`y=sqrt(newSpan^2-x^2)`, with its positive branch named by the initial pose.

Locked points use the original document as their positional reference during shape relaxation;
other edit callers retain the default unchanged reference. Final body/attachment/force locks,
holds, travel bounds and the canonical document validator still refuse the complete command.
Bounded continuation exhaustion never publishes a partial edit. This is a design-shape change,
not playback through the old constraint set. Existing native assembly member geometry is the
factory-authored bar; the resize does not invent a remeshing rule for arbitrary non-bar material.

Six specs cover both outer anchors, a welded off-axis bracket, forced rotation on a vertical
slot, locked material and shortened-stroke refusal without earlier property leakage, reordered
bodies/attachments/vertices, independent material-frame rebases, bound mouth vertices, custom
body-relative CoM, identity/load retention, codec round trips, paused extension re-anchoring
and Undo, destination-unit batches in both operation orders, no-op and malformed dimensions.
The paused case retains the original 0.4 extension anchor, displayed command and clock while
moving the shown outer attachment to the hand-derived new span.

Verification under `artifacts/bodies-and-joints/`:

- `S4-cylinder-dimensions-initial.log`: **1 failed / 1 passed**, session 74922 exit 1; the
  unintended floating heading change shifted the expected rod x by 0.0170076.
- `S4-cylinder-dimensions-heading.log`: **3/3**, session 20377 exit 0, including the independently
  derived vertical-guide case that requires rotation.
- `S4-cylinder-dimensions-lifecycle.log`: **5/5**, session 88526 exit 0.
- `S4-cylinder-dimensions-full-unit.log`: **2858 tests / 317 files pass**, session 72180 exit 0.
- `S4-cylinder-dimensions-build.log`: production build passes, session 75785 exit 0; existing CommonJS warnings.
- `S4-cylinder-dimensions-ui-copy.log`: **17/17**, zero console errors, session 57309 exit 0.
- `S4-cylinder-dimensions-analysis-editing.log`: required legacy browser gate **55/55**, zero
  page errors, session 76558 exit 0. The comparison and force screenshots were inspected:
  selected graph subjects remain distinct from dragged joints, previous/live curves and their
  ranges remain readable, and the existing mode/panel/grid styling is retained. This suite's
  captures are settled screenshots; its per-move assertions do not constitute a new native
  drag filmstrip. The separately recorded full-cycle/readout filmstrip and successful standard
  computer-use retry remain the live reference evidence for this continuation.

Before browser checks, node PID **19077** was verified to serve this worktree at localhost:4307
with HTTP 200. Its owned terminal session remains **13661**. No native UI is active yet.

**Still required for S4/F3:** active travel projection and full body/pointer gestures, bounded
production 2.0.3 import, atomic load/recovery, completion of the native lifecycle/service
matrix and remaining named browser gates `two-mechanisms` and `export-flow` (plus final stage
integration). S4 is in progress. No paid review, push or publication; Fable budget unchanged.


## S4 completed implementation, F3 preparation (2026-09-12)

The remaining native facade is implemented: bounded multi-event point/body/coordinate
previews with one commit/history entry, active travel projection and interval checks, the
isolated production 2.0.3 reader, atomic document replacement and versioned recovery. Full
contracts and S5 obligations are at the end of `bodies-and-joints-contract.md`.

Codex's lifecycle audit reproduced an additional load-loss defect: deleting the material
used only as a legacy compound load's reference frame silently deleted that load while other
scoped members survived. `S4-aggregate-load-before.log` fails the intended assertion (accepted
partial deletion instead of `ambiguous-load-owner`). The fixed cascade checks surviving scope
before interpreting the reference BodyId as an automatic load deletion. Both body/joint orders
pass. Explicitly deleting the force or its complete scope remains allowed.

The native regression mapping is now explicit:

| Original behavioral gate | Native evidence |
| --- | --- |
| welded-mount-identity/release/drawing | body-lifecycle, body-lifecycle-ownership, body-lifecycle-integration, body-property-edit/ownership: stable material/paint/forces, group lineage, merge/release, physical witnesses |
| cylinder-mount-topology | body-lifecycle's 18 delete-one cases (all six construction orders), all-order shared-junction deletion; crossed-cylinder group ownership and group deletion |
| slot-lifecycle | actual-carrier deletion with a same-endpoint neighbor; merge/release preserves actual slot record and guide frame in body-lifecycle-integration; reversed-P conversion/axes specs |
| url-weld-force / url-welded-mount | body-document-codec, native lifecycle save/reopen, production compound load/provenance test |
| url-com-anchor / url-locking / url-part-color | body-document-codec, body-property-edit, body-geometry-properties and integration: body/grid/attachment centers, material/force/attachment locks, color/trace/holds, local selection/history |
| cylinder-edit-transaction / cylinder-weld-guards | body-edit-plan, body-point-edit/order, body-cylinder-dimension-edit, joint-permission: atomic refusal, connected compound motion, mount pair edits allowed, internal P/member mutation refused |
| paused edit/history with independent clocks | body-document-authority, body-posed-property/geometry, coordinate/dimension/unit/copy tests; NativeBodyGesture rejects stale revision/display/clocks and foreign editor tokens |
| persistence loss/recovery | native-body-recovery, legacy-production-reader: failed load preserves history/selection/revision/backups; native-only versioned recovery, tab priority, stale fallback and denied storage |

New focused gate `S4-native-integration.log`: **58 tests / 12 files**, session 4576 exit 0.
`S4-final-full-unit.log`: **2878 tests / 321 files**, session 81773 exit 0.
After the final gesture-only scale/clock hardening, `S4-gesture-final.log`: **5/5**, session
14086 exit 0, including grounded attachment motion and clock staleness. `S4-final-build.log`
passes (session 86543 exit 0; existing CommonJS warnings). `S4-final-ui-copy.log` **17/17**,
zero console errors (session 23908 exit 0).

Legacy browser gates `S4-two-mechanisms.log` **13/13** (39446 exit 0) and
`S4-export-flow.log` **50/50** (90366 exit 0) complete the named S4 list alongside earlier
recorded edit-undo, unit-undo-view, posed-editing, link-pose-readout, analysis-editing, locking
and link-holds-angles. These two suites have assertions rather than screenshot outputs.

The old owned server PID 19077 was absent and localhost:4307 refused connections. Restarted
only this worktree's server: session **24304**, node **42589**, HTTP 200 on localhost:4307;
log `S4-final-dev-server.log`. Standard computer use then confirmed an incognito Chrome
window, opened a separate frozen four-bar reference tab, selected AB, inspected its Edit
blocks and live readout, watched successive playback screenshots (120/110/98 degrees),
paused at 41 degrees, inspected the context menu and returned to 80 degrees. The selection,
shadow/card vocabulary and authored ghost were coherent. Only that new tab was closed;
the original test tab was left at its prior start pose. Earlier tracked full-cycle/drag
filmstrips remain the reusable motion evidence. No native rendering is claimed at S4.

Known draft failures: the first slider import used a vertex object as a circle center and
was correctly refused by the exact schema; fixed to an x/y point. Two initial assertions
compared pre-codec arrays directly with canonical post-codec arrays; corrected to compare
identity/records or canonical encodings. A proposed physical-path check on every exact point
edit refused a valid loose three-cylinder design edit; it is scoped to rigid body motion,
while exact point design edits retain their existing semantics. No validator was weakened.

Next: commit this reviewed-internally S4 candidate, send one F3 lifecycle review with the
recorded $7 cap, reproduce and resolve actionable findings, rerun affected/final gates and
stop before S5. No paid call has yet been made in this continuation; budget remains
$9.479568 known spend plus the $6 canceled-call reservation.


## F3 initial review and resolutions (2026-09-12)

Reviewed **b33355b1**; Fable 5.1 confirmed (`claude-fable-5-1`), read-only tools. Session
**04e221a8-f7f7-492d-8333-f95c87943c0d**, process session 49113 exit 0, JSON success/non-error.
Artifacts: `reviews/F3-{brief.md,input.txt,launch.json,findings.md,stderr.log}` and `F3.json`.
Actual total **$4.571421** = Fable $4.538566 + auxiliary Haiku $0.032855. Cumulative known
migration review/probe spend is **$14.050989**, plus the prior unknown canceled-call amount
(previously reserved at $6). **The user removed the review budget cap while this run was
underway.** Original ceilings are historical; keep accounting and avoid unnecessary calls.

- **F3-1 confirmed and extended:** moving a group and deleting its zero-inertia frame member
  kept the aggregate center at its old world location. Probes fail for body-relative,
  surviving-attachment and deleted-attachment edit anchors (x=2.1 instead of 3.1). Grid-fixed
  center behavior was already correct. Capture the pre-deletion placement, run the existing
  center-edit rules while all old frames/points still exist, then express the result in the
  retained group's frame. Do not transform when the frame has not changed, preserving exact
  no-ops and unit values. Translation, rotation, reversed arrays, all four anchor cases and
  Undo/Redo are covered.
- **F3-2 not reproduced as stated:** weld deletion splitting a legacy load scope already
  returns `ambiguous-load-owner`, through `validateBodyEditDocument`'s explicit mapping of
  `split-load-scope`. The new probe passed before fixes; no new refusal rule was added.
- **F3-3 hardened:** the reviewer could not name a naturally late non-clamp refusal. A fault-
  injected test confirms that a future refusal after accepted substeps could commit a hidden
  partial event. `advance` now restores its entry draft on refusal/exception; only successful
  limited previews keep partial travel. The operation budget reserves its bisection allowance.
  This is a transaction fault-injection test, not a claimed reproduction in a real drawing.
- Suggested probes for duplicate groups after units and temporary drag attachment leakage
  both pass before changes. `lineageSource` is already the converted source; candidate old
  annotations share those references. Rigid drag operations contain body poses only.

`F3-probes-before.log`: **4 failed / 4 passed**, session 60450 exit 1, intended center and
fault-injected gesture failures. First correction `F3-probes-fixed.log`: **47 passed / 2 failed**
(session 51230 exit 1); unit/no-op tests caught unnecessary same-frame floating round trips.
Final `F3-center-final.log`: **16/16** (review probes plus unit edits), session 28529 exit 0.
Earlier remaining lifecycle/property/gesture checks passed in the 49-test run.

The initial reviewer explicitly left pin reconnection, copy/paste, re-anchoring and codec
unreviewed. That is a coverage gap, not approval of all F3. A single focused follow-up will
review those areas plus the resolved changes, without a budget cap, before S4 is closed.
S5 remains pending and must not start in this continuation.


## F3 follow-up completed and resolved (2026-09-12)

Fable 5.1 reviewed stable **ae91f07c** with read-only tools and no dollar cap. Session
**a2a1ef0a-f5bc-4af6-9ffe-9c2d365b59db**, process session 68581 exit 0, JSON success/non-error.
Actual **$9.50394975** = Fable $9.49555675 + auxiliary Haiku $0.008393. Artifacts are
`reviews/F3-followup-{input.txt,launch.json,findings.md,stderr.log}` and `F3-followup.json`.
The prompt construction initially failed locally before any CLI request; it incurred no review
call. This review explicitly completed pin reconnection, copy/paste, paused re-anchoring and
codec/schema coverage omitted from the initial pass, and audited the prior fixes. It did not
repeat S3 numerical derivations, deletion/import or previously covered recovery atomicity.

All six proposed behavioral probes failed against ae91f07c for the predicted reasons,
`reviews/F3-followup-before.log` (session 93125 exit 1). The initial test draft had TypeScript
fixture/narrowing errors, corrected before this run; those were not model failures.

- **F3b-1, confirmed inconsistency:** materials lost the final displacement of a deleted
  attachment center anchor, while groups retained it. Material remapping now also happens
  before deletion. Both receive the attachment's final displacement, then fall back to body
  anchoring; grid and body anchor behavior remains distinct. The old material test deliberately
  pinned the opposite interpretation and is rewritten to the unified rule (world 9,5 rather
  than 4,3). The contract now names both materials and groups.
- **F3b-2, confirmed:** copying the non-reference side of an ambiguous load scope silently
  omitted the load. Check every scope that overlaps selected material before filtering copied
  loads. Either side refuses atomically; both enumeration orders are tested.
- **F3b-3, confirmed missing notice:** removing a displaced machine's last drive left no driver
  for the reset loop, silently retaining the sampled pose as authored start. The accepted pose
  still becomes the start, with an explicit `drive-removed` anchor notice and no ghost clock.
  It identifies a removed driver whose surviving material is adopted by a driverless partition;
  a surviving coordinate supplies its actual new value. Undo restores the source and paused
  display. S5 must render this through the same `bodyAnchorNotice` model as other resets.
- **F3b-4, confirmed with a corrected numeric probe:** 1.1 happened to round-trip exactly; 0.7
  returned as 0.7000000000000002. Unchanged holds recover the original record when the authored
  angle is restored, keeping unrelated material out of invalidation effects. Changed holds
  still receive their required frame transformation.
- **F3b-5, confirmed:** deleting only a rotated group's center editing attachment changed
  0.1,0.4 to 0.10000000000000013,0.3999999999999999. Resolving before deletion removes the
  unnecessary second round trip, preserving exact coordinates with the anchor fallback.
- **F3b-6, documented API obligation:** new actions need fresh command UUIDs; a shown paste
  commits its existing plan. `paste()` starts a separate action. Duplicate IDs already refuse
  atomically, so no second ID allocator or retry semantics were added. Recorded in tips.
- **F3b-7, confirmed:** singleton WORLD annotations are valid and survive the codec. Grounded
  paste now uses the ordinary annotation/aggregate merge policy when such an annotation
  exists, keeping its presentation and incoming properties without duplicate group records.
  The test checks explicit mass, inertia, hand-transformed center, Undo/Redo and encoding.

Focused post-fix run `reviews/F3-followup-fixed.log`: **58 passed / 1 failed** across seven
files (session 75237 exit 1). The remaining assertion compared an independently evaluated
anchor coordinate with the old command at exact equality; their one-ulp difference is correct.
The assertion now checks the notice exactly and its coordinate to 12 decimal places. Final
whole-suite/build gates follow below. No additional paid review is needed for these bounded
fixes; Codex inspected their effects and retained the failing-before probes.


## S4 final checkpoint — stop before S5 (2026-09-12)

**Implementation and F3 are complete.** Tested code is committed as
**7f1bdbbb5227dab2fe4c0f383144de9d765a8547** on `bodies-and-joints-plan`; the following commit
only records this completion. No push, publication, S5 work or goal reactivation occurred.

Final gates on that code:

- `S4-complete-full-unit.log`: **2893 tests / 323 files passed**, session 56222 exit 0.
- `S4-complete-build.log`: production build passed, session 21168 exit 0; existing CommonJS
  dependency warnings remain.
- `S4-complete-ui-copy.log`: **17/17**, zero console errors, session 88077 exit 0, against the
  worktree's localhost:4307 dev server.
- `git diff --check` passes. Only touched TypeScript files were formatted.
- Earlier named S4 browser gates remain valid: edit-undo 6/6, unit-undo-view 6/6, locking 34/34,
  posed-editing 60/60, link-pose-readout 10/10, link-holds-angles 8/8, analysis-editing 55/55,
  two-mechanisms 13/13 and export-flow 50/50. The follow-up fixes touch only the private native
  facade. The actual localhost/incognito observations and inspected Playwright filmstrips are
  recorded above; no native DOM or native animation gate is claimed at S4.

F3 review calls together cost **$14.07537075**; cumulative known migration review/probe spend
is **$23.55493875**, plus the unknown earlier canceled planning call. The user removed the
cap; no further availability probe or review call was made after the focused follow-up.

Next, only after new authorization: S5 native selection/grid/Edit-panel/context-menu cutover
behind the development route, including native notices, clipboard preview identity, and both
Playwright motion evidence and live incognito computer use. Large obsolete-runtime removal
remains S7 after consumers are migrated; it has not been silently dropped from the plan.


## Rebase and staging style alignment (2026-09-13)

Rebased S0–S4 onto `c090dcc25b0fcf3ae885e265823f8fbc3347e635` (staging PR #10).
`backup/bodies-and-joints-before-staging-20260913` retains the pre-rebase history at
`25e87b94`. Staging's documentation reorganization, dependency updates, shared UI blocks,
source formatting and lint rules are preserved. Migration-only tips were recovered from
the original append diff and moved to `short-notes.md`; the deleted tips file stays deleted.

The audit applied `docs/code-style.md`, `docs/ui-style-guide.md`, `docs/ui-vocabulary.md`
and the runner-specific UI skill. Alignment changes:

- Move-only commit `b5675691` consolidates 18 algorithm fragments into five cohesive modules
  (rates, anchor recovery, re-anchoring, interval certification and folds). Shared math and
  separate command/codec responsibilities remain separate. An AST comparison of every moved
  non-import declaration found identical algorithm bodies. The result removes 17 files net;
  it does not claim the S7 legacy-runtime removal has happened.
- Native direction decisions and their specs now use `turnsClockwise`; no lint cap or
  exemption changed. Positive-direction branches already reject a zero-speed drive.
- The migration docs now have status lines and index entries. The plan points to current
  shared-block paths and token ownership. Pinned Prettier 3.9.6 required formatting only the
  baseline JSON and one dimension spec; their data and expectations are unchanged.
- Native models remain independent of Angular components and services. No new hub behavior,
  component input API, CSS token, control, or parallel refusal-copy source was introduced.
  The existing panel revision counter is a private cache invalidation marker, not render
  state. The panel still uses the shared blocks and staging's permission model.
- Native fixture builders stay centralized under `src/test-utils/verification/native-*`.
  They cannot yet be opened by the legacy URL gallery: publishing native fixture URLs and
  gallery entries requires the S5–S6 reader/consumer cutover and remains an explicit gate.
  Do not add a throwaway native-to-legacy converter to satisfy the gallery rule at S4.

Artifacts are under `artifacts/bodies-and-joints/rebase-review/`. Fresh `npm ci` used Node
24.18.0 and staging's lockfile. `npm run check` passes with the same 15 existing warnings;
all **2938 unit tests / 328 files** pass, including MATLAB references and docs inventory.
The production build and Storybook build pass. No numerical ceiling was raised.

Live standard Codex computer use opened a new tab in the existing **incognito Chrome**
window at `http://localhost:4307`, loaded Four-Bar through Mechanism Library, selected BC,
played and paused it, rewound, and inspected its context menu. The angle changed with the
pose and returned to 12 degrees; length stayed 5.75 cm. Panel controls and menu fixed-value
labels agreed. The temporary tab was closed; the user's existing tabs were left intact.
Playwright's playback and paused-drag contact sheets were inspected: connected geometry,
selection, start ghosts, panel dimensions and playback controls stayed visually coherent.
These are rebased legacy-editor checks, not a claim that the native UI is wired.

Rebased browser gates passed: `link-pose-readout` 10/10, `posed-editing` 60/60,
`locking` 34/34, `ui-copy` 17/17, `two-mechanisms` 13/13, `export-flow` 50/50,
`mobile` 79/79 and `reduced-motion` 6/6 (exact logs under the directory above). No page errors were reported.

Representative playback frames below are in time order: start, motion across the cycle,
pause and rewind. The complete 35-frame sheet and paused-drag sheet remain in artifacts.

![Selected-link playback through pause and rewind](images/bodies-and-joints/rebase-playback.png)


## Full-PR Fable review after staging rebase (2026-09-13)

Draft [PR #13](https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/pull/13)
targets `staging`. Fable 5.1 reviewed the complete PR scope at `6f282d11`, base `c090dcc2`.
Session `b81ce334-134e-40d5-886e-91c8e653aa9b`; read-only tools; no dollar cap.
Actual cost **$24.8991255** includes $0.008045 of auxiliary Haiku usage. It read every new
production source file, fixture builders, governing documents and existing-file diff; about
one third of specs were read in full, others by titles or left unread as explicitly listed
in its report. This is full-PR scope, not a claim of line-by-line test coverage.
Artifacts: `rebase-review/Fable-full-pr-{input.txt,launch.json,findings.md,stderr.log}`
and `Fable-full-pr.json`. Fable independently re-derived the constraint/rate/force algebra
and the five cylinder closed forms without finding a sign or missing-term error.

Disposition of every reported finding:

1. **Confirmed:** the absolute four-epsilon edit residual refused a 12-bar held chain, a
   held bar rebased by 10,000 units, and a ram translated by (300, 200). The scalar edit
   algebra now propagates operand-based rounding uncertainty per row. Relaxation still
   targets the original precision; only a stalled/exhausted refinement can accept its own
   arithmetic bound. A large row cannot excuse an inconsistent small row. Fixed/unrelated
   locks add no zero-gradient rows; settled lock validation remains authoritative.
2. **Confirmed:** deleting guide artwork removed its physical joint, drive and limits.
   Surviving artwork now moves to a physical attachment on the same carrier, retaining
   heading, station, transverse offset and extent. Both prismatic carrier orderings and
   pin-in-slot are covered, including Undo/Redo. Shared artwork relocation was extracted
   in the separate move commit `3d9f4064` before the lifecycle behavior changed.
3. **Confirmed:** rounded underconstrained starts reported `singular-start`. Bounded initial
   correction now permits deficient rank; mobility and full driven rank still decide
   admission afterward. Inconsistent drawings and truly singular starts remain refused.
4. **Confirmed:** converting separated P/slot anchors to R without a point returned
   `invalid-document`. It now quotes the generalized `connection-point` model reason.
5. **Not a conversion bug:** production `b7ec8d7` explicitly converts object scale with
   length units (`settings-panel.component.ts:184–185`) and writes the value directly
   (`url-generation.service.ts:184`). SCALE is already a document-unit length. Added
   production-shaped cm/m/in payload probes preserve it and convert it exactly once with
   the drawing. The contract now explains the 0.7-unit new-document default; equal physical
   marker sizes across unrelated new unit systems are not a requirement. No erroneous
   second conversion was added.
6. **Accepted documentation request:** old compound records cannot distinguish customized
   aggregate mass, so import preserves the saved aggregate as an override. The contract
   now names the required explicit reset before a massive membership edit. It also explains
   independent mass/inertia overrides and the member-mass parallel-axis convention.

Stale S4-pending contract passages were replaced with the implemented boundaries. The future
S5 context-menu path and consumer rescan obligation now reflect staging's reorganization.
The original consolidation count is corrected: 18 deleted files, one new file, 17 fewer net.

Extra review evidence: a WORLD-hub three-ram junction survives assembly deletion in two
construction orders while preserving another ram's driven pair; R→P requires explicit
coordinate removal. An artwork heading distinct from the physical axis rotates by its
requested display delta. Clock recovery accepts the hand-derived close four-bar assembly
and rejects the opposite branch. A locked rod mount still refuses resizing atomically.
Existing F3 and fold/cycle tests remain in the full suite. Accumulated gesture replay cost
remains the already-planned S5 live performance measurement, not a new unbounded claim.

`Fable-probes-corrected-before.log`: all six defect probes fail against the old code. The
first draft translated a WORLD weld without its rest pose; that fixture error was corrected
before counting the ram refusal. `Fable-probes-fixed.log`: 13/13 pass across the new probes
and existing guide/admission boundaries. Extra probes required a WORLD type guard and
production-shaped settings sections rather than the current development writer; neither
was an implementation failure.

`unit-after-review.log`: **2950 tests / 329 files pass**. `check-after-review.log`,
`build-after-review.log` and `storybook-after-review.log` pass. Existing MATLAB ceilings
and the 15-warning lint cap remain unchanged. A focused review of the new fix is next.

### Focused Fable follow-up and final hold correction

Fable 5.1 reviewed `6f282d11..e9e0415f`, session
`28787990-28a4-4479-96dd-b550caeb5957`, with the same read-only tools. Cost **$7.22080625**
($7.21871425 Fable plus $0.002092 auxiliary Haiku). Total review cost for this rebase/PR task:
**$32.11993175**. Artifacts: `rebase-review/Fable-fix-review-{input.txt,launch.json,findings.md}`,
`Fable-fix-review.json` and `Fable-fix-review.diff`.

It independently confirmed the four fixes, the local arithmetic bound and structural lock-row
skip, and explicitly withdrew the object-scale finding. Its remaining comments are resolved:

- **Confirmed hold cancellation:** the proposed small held triangle at the far end of a
  12-bar chain reproduces `held-dimension` at side length 0.01. The row previously subtracted
  two translated world points, discarding precision that the final local-frame validator
  correctly demanded. `BodyEditModel.heldVector` now subtracts the local endpoints before
  rotating the vector. Common translation cancels analytically. This improves conditioning
  instead of widening the hold or lock validator. Both remain unchanged. The first probe's
  polygon fixture needed a TypeScript narrowing fix before it could execute; the corrected
  reproduction is in `followup-probes.log`.
- **Lock alignment concern not reproduced:** three far-end chain edits with a moving-frame
  attachment locked at world (0.5, 0.5) pass, retaining the point to 14 decimal places. The
  existing locked-rod resize still refuses atomically. No global or solver-origin tolerance
  was granted to final lock validation on the strength of an unconfirmed case.
- **Singular-start coverage:** the exact change-point four-bar (ground 4, crank 1, coupler 2,
  rocker 1) and the same drawing with 1e-10 rounding both refuse with `singular-start`.
  Fable expected `underconstrained`; the probes establish the actual intended boundary.
  Admission code needs no further change.
- **Slot-to-R UX coverage:** nonzero travel requires a chosen connection point. With that
  point supplied, conversion preserves body poses, places both physical anchors there,
  and undoes exactly; without it, refusal leaves the document and undo depth unchanged.

`body-review-followup.spec.ts` keeps these checks, including held triangles of side 0.1,
0.01 and 0.001, with and without an angle hold. The fixture stays in the native verification
builders pending the already-documented public-reader/gallery gate. `followup-fixed.log`
passes the original review probes and correction; `followup-matrix.log` passes the expanded
hold matrix and independent edit-Jacobian checks. The small final hold refactor was reviewed
locally against the rigid-transform identity R(b−a) = Rb−Ra; no third external review was needed.
