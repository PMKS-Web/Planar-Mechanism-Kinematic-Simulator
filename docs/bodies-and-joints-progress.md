# Bodies and joints execution ledger

## Authority and status

- Goal: implement **all S0–S8** of [the plan](bodies-and-joints-plan.md), including native default editor, consumer cutover and obsolete-runtime removal. No push or publication.
- Implementation starting commit: `487d535` on `bodies-and-joints-plan`.
- Worktree: `.claude/worktrees/funny-swirles-3c6486`.
- Current checkpoint: **S0 and S1 complete; S2 in progress**. Native editor cutover has not begun. Concrete interface choices are in [the contract](bodies-and-joints-contract.md); frozen catalogs/reference hashes are in [the baseline](bodies-and-joints-baseline.json).
- Sole implementation owner: Codex. Fable reviews only at the four specified gates.
- Preserve other worktrees and unrelated changes. The starting tracked worktree was clean.
- Runtime for these commands: Node `v24.18.0`, explicitly prepended to PATH; the login shell otherwise selects unsupported Node 20.
- Owned dev server: `http://localhost:4307/`, Angular CLI started in this worktree. Recheck process, HTTP readiness and served source on resumption.

## Checkpoint gates

| Checkpoint | Status | Evidence / next work |
| --- | --- | --- |
| S0 | Baseline complete | Six unit suites pass (182 tests), seven new compatibility tests pass, build passes, template-open 11/11, template-graphs 3978/3978, ui-copy 17/17. Timing, visual baseline and operation-level consumer classification are recorded. Existing drag timing failures are reproduced on original test files, not waived; S7 must meet the measured comparison budget. |
| S1 | Complete | Native records, frames/rebasing, coordinates, material/group mass, weld compiler, pin bundles, cylinder factory and reference validation. F1 completed and resolved; final gate 12 files / 84 tests (`reviews/F1-final-unit.log`), build passes (`reviews/F1-build.log`). Earlier unchanged-editor browser gates: two-mechanisms 13/13, cylinder-mount 31/31 and ui-copy 17/17. No native UI cutover yet. |
| S2 | In progress | Native row compiler, physical Jacobians, SI groups/partitions, pivoted QR, local position correction and independent four-bar checks implemented. Mobility, admission, branch/limit continuation, full agreement and S2 gates remain pending. |
| S3 | Pending | Analytic rates, physical wrenches, independent examples and F2. |
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

Continue S2 with partition-local numerical coordinates, mobility/admission and continuation. F1 resolution is committed as `447dfb9`; its gates pass. F1 process 22599 completed successfully; no further F1 call is pending or required for routine fixes. The independent row/derivative derivation is in `docs/bodies-and-joints-equations.md`.

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
