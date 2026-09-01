# Editing in Analysis mode — tuning a mechanism against its own curves

**Status: built.** Phases A, B and C shipped; `e2e/analysis-editing.mjs` is the suite that keeps
them honest. Follows `docs/edit-mode-playback-plan.md`, which built the machinery this
plan stands on. Read that one first; this one leans on its vocabulary (anchor, staged posed
edit, `EditPermission`) without re-arguing it.

The one-sentence version: **the analysis modes stop refusing drags, and every open graph shows
two curves while you drag — the solid curve from before your hand touched anything, and a
dashed curve that re-solves live under it — so a reader can grab a joint and watch an
acceleration peak shrink as they move it.**

---

## 1. The problem, and the feature

Today the analysis modes are read-only. `refusalFor` answers every non-transport action in an
analysis mode with one sentence — *"The graphs describe this exact cycle, so the geometry is
locked here. Switch to Edit to change it."* — and every surface quotes it: the canvas's drag
gate, the context menu's graying, the grayed "scenery" coloring, a `pointer-events: none`
layer, undo.

That lock protects a claim that is no longer true. It dates from when graphs were drawn once
and geometry moving under them meant stale curves. But the graph stack now redraws itself from
whatever `updateMechanism` last solved (`onMechUpdateState === 2` → `updateChartData()`), and
`updateMechanism` already re-solves the **entire cycle on every pointer move** of an Edit-mode
drag. The expensive half of live analysis editing is already paid for on every drag the app
has. The lock is not protecting the graphs; it is standing between the reader and the most
instructive loop the app could offer:

> See the acceleration curve of joint C. Notice the spike. Grab C. Watch the spike move and
> shrink — live, dashed, against the solid curve of where you started — until the peak is where
> you want it. Let go. The graph settles. Compare. Undo if you liked it better before.

That loop — *tune a dimension against its consequences* — is what commercial linkage tools sell
and what a kinematics course is trying to teach. Nothing in it requires new solving. It
requires permission, and one drawing change in the graph.

### What this plan is not

It is not "Edit mode inside Analysis mode". Adding links, welding, deleting, grounding,
changing the drive — restructuring — stays in Edit. The analysis panel is graphs; it has no
property fields to keep honest, and a delete that vanishes the selected part empties the very
panel the reader is watching. The killer feature is **tuning what exists**, and the scope is
exactly that: geometry by gesture, and the undo that makes gesturing safe.

---

## 2. What the code does today (the audit)

The Phase 1–3 work left the ground unusually well prepared. What follows is where the analysis
lock actually lives — the complete list, because the last plan's biggest lesson was that a
partial list of gates is how surfaces come to disagree.

### 2.1 The lock is one answer in one model

`model/edit-permission.ts` — `refusalFor` returns `IN_ANALYSIS` for every action except
`inspect` and `transport` when `state.mode === 'analysis'`, *before any question about pose*.
Every surface asks this model. Changing what analysis mode allows is therefore changing this
one `if` — the whole reason the model was built before the rules it would relax. The pose
half of the matrix (playing / at start / displaced / solve-deferred) is below the mode check
and applies unchanged the moment the mode check lets an action through.

### 2.2 The mode-lock's other outposts

Beyond the model, "analysis = untouchable" is hard-coded in exactly these places:

- `EditPermissionService.modeLocksGeometry()` — `mode() === 'analysis'`, used by the canvas
  to decide that a held press earns a *spoken* refusal (the reason is not on screen) and to
  skip grab-to-pause (`new-grid.component.ts`, `grabToPause`).
- `NewGridComponent.geometryLocked` — quotes `modeLocksGeometry()`; applied as a CSS class on
  the SVG root and as `[attr.pointer-events]="geometryLocked ? 'none' : null"` on one layer
  (`new-grid.component.html:1646`), and folded into the drag-vs-select decision
  (`new-grid.component.ts:1791–1798`).
- The grayed "scenery" coloring — the one exception in the joint-color rules: parts in
  analysis are deliberately drawn as scenery, not as things with states.
- `showStartGhost()` — `TabID.EDIT` only, on the argument "the analysis modes are read-only,
  so nothing there can move the start". The argument dies with the lock.
- `ContextMenuBuilderService.analysisRefusal(part)` — grays the editing rows of the analysis
  menus; the analysis menus themselves are trimmed to traces plus "the way back into Edit".
- `refusalFor(action='history')` — undo/redo refused in analysis, for the once-good reason
  that replaying a URL swaps the geometry the graphs were drawn from. Graphs redraw now
  (`onMechUpdateState` 3 → the analysis panel promotes it to 2 when a valid mechanism exists,
  `analysis-panel.component.ts:249`), so the reason is gone here too.

That is the complete set. Nothing else asks about the mode before touching geometry — verified
by the fact that every gate added in Phases 1–3 was made to quote the model.

### 2.3 The staging machinery is mode-agnostic

`beginPosedEdit` / `capturingPose` / `finishPosedEdit` / `cancelPosedEdit` /
`closeStaleStaging` and the anchor map live in `MechanismService` and never ask which tab is
open. Neither do the per-machine clocks, `isAtStartPose()`, `pauseInPlace()`, or the ghost's
reachability lookup. A drag at a paused mid-cycle pose in an analysis mode would stage,
re-anchor and settle *today* if the gates let the gesture start. Phase A of this plan is
therefore mostly gate work, not machinery work.

### 2.4 The graph stack, and what a live drag would meet

- Each open graph is an `AnalysisGraphComponent` holding plain-array series built by
  `buildChart` from its part's own machine (`mechanismForId`), sampled through
  `AnalysisSampleService.sampleAt`. Chart is ApexCharts via the in-house
  `AnalysisApexChartComponent` bridge; **chart animations are already disabled** (a morphing
  tween "is drawing values the mechanism never had"), which is exactly the right setting for
  live redraws.
- Redraw triggers: `onMechUpdateState` — `1` sets `loading = true` (a spinner *over* the
  graph, emitted from the Edit-mode trace path in `showPathWhileDragging`), `2` redraws, `3`
  is promoted to `2` by the analysis panel. The playhead annotation rides the separate
  `onMechPositionChange`.
- The collapsed section headers (`AnalysisGraphSectionComponent.preview`) sample one pose and
  cache on a key that includes the sample index and units — but **not** `poseRevision`, so a
  header would show stale numbers through a drag that changes geometry without changing the
  sample index. Small, known, fixable.
- Y axes are fitted per redraw by `niceAxisScale`. Refitting on every pointer move would make
  the axis jitter under the very curve the reader is watching.
- Force graphs call `mechanism.getForceAnalysis(mode)` — a solve across all frames — per
  rebuild. The kinematic solves are already per-move; the force solve becomes per-move only in
  Force Analysis mode, and needs measuring (§8).

### 2.5 One timing fact that decides the comparison's x-axis

For a pin input, samples are spaced 1° of crank apart and one revolution takes 60/RPM seconds
— so **the time axis of a pin-driven machine does not move when its geometry does**. Dragging
a four-bar's coupler pivot changes every curve's values and none of its domain. Only a
slider-driven machine's cycle time changes under a drag (travel length changes). The
comparison overlay can therefore usually plot both curves on one honest time axis, and needs a
stated rule for the slider case (§5.3).

---

## 3. How much editing — the answer

The question this plan exists to answer, as a rule and then a matrix.

**The rule: analysis mode allows every edit that is made by gesture and undone by Undo, and
refuses every edit that changes what the graphs are graphs *of*.**

- **Allowed: `drag`** — joints, links, forces (endpoints and magnitude — dragging a load while
  watching the torque curve is the force-mode version of the killer feature), and a link's
  CoM. Dimensional tuning, the entire point.
- **Allowed: `history`** — undo and redo. Unlocking drags without them strands a bad drag
  behind a mode switch. The graphs redraw on the existing 3→2 path.
- **Allowed (already): `inspect`, `transport`.**
- **Refused: `build`, `structure`** — adding links, welding, deleting, grounding, set-input.
  Restructuring re-enumerates the force rows, can vanish the selected part from under its own
  graphs, and needs the Edit panel's affordances around it. New wording, since "the geometry
  is locked here" stops being true (§6).
- **Refused (moot but stated): `placement`, `properties`, `drive`** — typed fields. No surface
  in an analysis mode offers them; the refusal exists so the matrix has no blank cells and so
  any future surface inherits an answer instead of inventing one.

The pose half of the matrix applies unchanged beneath this: playing still refuses `drag`
(grab-to-pause turns the refusal into a pause, §4.3), a displaced pause stages and re-anchors
exactly as in Edit, and a solve-deferred drawing refuses posed edits for the same cost reason
as before. **No cell of the analysis column is ever more permissive than the Edit column** —
analysis unlocks a subset of Edit, never a superset, so there is one gradient of freedom
across the modes rather than two regimes to learn.

| Action | Edit (today) | Analysis (today) | Analysis (this plan) |
| --- | --- | --- | --- |
| inspect | ✅ | ✅ | ✅ |
| transport | ✅ | ✅ | ✅ |
| drag | ✅ (paused, any pose) | ❌ mode | ✅ (paused, any pose — same staging) |
| history | ✅ | ❌ mode | ✅ |
| build | ✅ | ❌ mode | ❌ "lives in Edit" |
| structure | ✅ | ❌ mode | ❌ "lives in Edit" |
| placement | 🔶 at start only | ❌ mode | ❌ "lives in Edit" |
| properties | 🔶 at start only | ❌ mode | ❌ "lives in Edit" |
| drive | 🔶 at start only | ❌ mode | ❌ "lives in Edit" |

---

## 4. Phase A — the lock becomes a door

Everything needed for "dragging works in analysis mode and is safe", with the graphs still
redrawing only on release. Shippable on its own; the comparison overlay (Phase B) is worth
much less without this and this is worth something without it.

### 4.1 The model

In `refusalFor`, the analysis branch stops being a blanket. `drag` and `history` fall through
to the pose logic (the same `switch` Edit uses). `build` and `structure` return a new
`ANALYSIS_RESTRUCTURE` refusal; the typed trio returns `ANALYSIS_TYPING` (§6 for wording).
`displacementRefusal` is untouched. The matrix spec in `edit-permission.spec.ts` grows an
analysis column identical in shape to the Edit column — the table stays the documentation.

### 4.2 The outposts follow the model

- `modeLocksGeometry()` becomes `modeLocksStructure()` — same tab test, honest name — and the
  canvas re-derives what it actually wants from it: the *spoken* refusal on a held press now
  fires only for the gestures still refused (a build gesture; a plain drag just works), and
  `geometryLocked`'s CSS class, `pointer-events` freeze and scenery coloring go entirely. In
  analysis, parts are things again: hover states, drag cursors, the drag ring — the same
  visual language as Edit, because it is the same permission.
- `grabToPause` drops its `modeLocksGeometry()` skip. Grabbing a moving joint in Kinematic
  Analysis pauses it in place and begins the drag — one behavior on every pointer, in every
  mode that can drag. A press on empty canvas still pans; a press that was a selection still
  selects (the existing slop/threshold logic already distinguishes them).
- `showStartGhost()` drops its `TabID.EDIT` condition: displaced editing in analysis needs the
  same Back-to-start target and the same live reachability warning, from the same getters.
- The context menu's analysis build stops graying drag-adjacent rows via `analysisRefusal` and
  keeps graying the structural rows — with the new refusal's `short` so the grayed row says
  *"lives in Edit"* rather than the dead "geometry is locked". Rows the analysis menu never
  had (delete, weld) stay absent, not grayed: absence for "not this mode's job", graying for
  "this mode's job, not right now", as the menus already distinguish.
- Undo/redo buttons in the top-strip corner: the corner card swaps to Export Data in analysis
  modes today. Keep the swap (export is that corner's analysis job) — undo in analysis rides
  the keyboard shortcut and the project menu, both of which already quote `may('history')`.
  If Gate A review finds that too hidden, the corner card can stack both; decide on review,
  not now.

### 4.3 Staging in analysis — verify, not build

The posed-edit machinery should work unchanged. Phase A's job here is adversarial
verification, not construction — the last plan's dominant defect class (a path that ends a
gesture without ending its staging) gets re-run against the new mode: Escape mid-drag in
analysis, mode keys mid-drag, tab-away, right-click mid-drag, grab-to-pause into drag into
Escape. `closeStaleStaging` in `updateMechanism` is the central net and is mode-blind, so
these should all pass; the point is to have proved it.

One real interaction: a drag commit in Edit shows its "start pose could not be kept"
snackbar through `NotificationService`. Same words in analysis — the anchor rules do not
change per mode, so neither does their narration.

### 4.4 What redraws when (Phase A only)

During a Phase A drag the graphs do nothing new: `updateMechanism` re-solves per move, and on
release the commit's rebuild lands on the existing `onMechUpdateState` path, so the curves
update at gesture end. The `.next(1)` spinner from the trace path must not blank analysis
graphs mid-drag — in Phase A the graph's `loading` overlay is dropped for states raised by a
drag (the graph is about to be told the answer; a spinner over the old curve is worse than
the old curve), which also retires a state the comparison overlay would otherwise fight.
Section-header previews get `poseRevision` added to their cache key.

**Gate A:** all four modes exercised; the staging adversarial list green in analysis;
`e2e/ui-copy` updated for the new sentences; the permission matrix spec is the table in §3.

---

## 5. Phase B — the comparison overlay (the killer feature)

One graph, two curves. The solid curve is the cycle as it was when the gesture began; the
dashed curve re-solves under the reader's hand. This is view state, not document state — it
never touches the transcoder, the URL, or history.

### 5.1 Capture: when "before" is taken

A new, deliberately narrow signal from the canvas: `onGeometryGesture` (a `Subject` on
`MechanismService`) emitting `begin` / `move` / `end` from the same three places that already
call `rememberBeforeDrag`, the per-move solve, and `putBackTheDrag`/commit — so it cannot
disagree with what a gesture is. Not `onMechUpdateState`: overloading the numeric channel with
a fourth meaning is how the last plan found six gates disagreeing.

On `begin`, each **open** graph whose `mechPart` belongs to the dragged part's machine
(`indexOfMechanismContaining`; other machines' curves are not changing — a baseline there
would draw two identical lines) snapshots its current series as `baseline`: plain copied
number arrays plus the y-scale in force at capture. Graphs opened mid-gesture take no baseline
(they have no honest "before" to show) and simply draw live.

### 5.2 The live redraw

On `move`, throttled to one refresh per animation frame (coalescing, trailing edge — the last
move always lands), the graph rebuilds its series from the freshly solved mechanism and pushes
`baseline + live` to Apex in one `updateOptions` call:

- **Baseline:** solid, its own series colors at ~35% opacity. Unmistakably "the same thing,
  ghosted" — the visual grammar the start-pose ghost already established for "where this was".
- **Live:** full color, dashed (`stroke.dashArray` is per-series in Apex — baseline entries 0,
  live entries dashed). Dashed-and-moving reads as provisional, which mid-gesture it is.
- The playhead annotation and point markers are suppressed for the duration — recomputed
  per-move they are noise between the reader and the curve; they return on `end`.
- The section-header preview reads the live pose (it already samples the current mechanism;
  the `poseRevision` cache key from Phase A makes it tick).
- The custom legend does not grow chips: baseline series reuse the same X/Y/Magnitude
  identities and follow the same visibility toggles, so hiding Y hides both Ys.

### 5.3 The two axes, held honest

- **Y:** on `begin`, freeze the axis at `niceAxisScale` over the baseline; while dragging,
  widen (never shrink) only when live values leave the frozen range, re-running the same
  nice-scale so gridlines stay on round numbers. A rescale per move makes the axis swim; a
  clipped peak lies. Widen-only is the compromise, and the release refits cleanly.
- **X:** both curves plot against their own solved times on the shared numeric axis; the axis
  end is the longer of the two. Pin-driven machines (§2.5) make this a non-event. A
  slider-driven machine whose cycle time stretches shows the baseline ending early — which is
  the truth, and the axis label already says seconds.

### 5.4 Phase alignment at a displaced pose

A drag away from the start stages the machine, and mid-gesture the provisional cycle's
sample 0 is *the pose under the hand* — so plotted raw, the live curve is the baseline
cyclically rotated by wherever the reader happened to pause, and every comparison is garbage.
The commit fixes this at gesture end by settling to the anchor; the plot needs the same answer
per frame, and it is already computed: the ghost's reachability lookup finds the anchor
coordinate in the provisional cycle (`reachAnchor` over `coordinatesAcross`). The graph
rotates its live series by that index (blend ignored; half a sample of phase is invisible at
360 samples) before plotting, so both curves start at the same place along the input's travel.
When the anchor is unreachable — the exact case the ghost's warning covers — the live curve
draws unrotated and the ghost's existing warning is the narration; the graph adds none of its
own.

At the start pose — the common case — nothing is staged and nothing rotates.

### 5.5 After release: the comparison outlives the gesture

On `end`, the live series settles into the ordinary solid curve. The baseline **stays**,
ghosted, with one small chip on the graph card: *"Before your drag — clear"*. The tuning loop
is drag → look → drag again, and taking the "before" away at the moment the reader finally has
a still frame to compare in would serve the code, not the reader.

The baseline is dropped when any of these happens: the reader clears it; the next gesture
begins (re-baselined from current — each drag compares against the pose it started from);
the selection or the open graph changes; the mode is left; or an undo/redo lands (the curve
it described may be the one the undo just restored — a baseline identical to the live curve
is confusion, not comparison). Baselines are never serialized anywhere.

**Gate B:** drag a four-bar's coupler pivot in Kinematic Analysis with the acceleration graph
open — baseline solid-faded, live dashed, values moving, axis steady; release keeps the ghost
and the chip clears it; the same in Force Analysis over a torque curve; a displaced-pose drag
shows phase-aligned curves; unsynced machines: dragging M2 leaves M1's graphs untouched.

---

## 6. The words

New and changed `EditRefusal`s, all in the model so no surface paraphrases:

- `ANALYSIS_RESTRUCTURE` (build/structure): short `"lives in Edit"`, long *"Adding and
  removing parts lives in Edit. Here you can drag what exists and watch the graphs follow."*
  — a refusal that teaches the feature it guards.
- `ANALYSIS_TYPING` (placement/properties/drive): short `"lives in Edit"`, long *"Typed
  values live in the Edit panel. Drag on the grid to tune dimensions here."*
- `IN_ANALYSIS` retires, and with it "the geometry is locked here" — asserted nowhere once it
  is true nowhere. `e2e/ui-copy.mjs` gets the new sentences; the copy audit doc gets a row.

Everything else already speaks correctly because it quotes shared rules: the displaced
refusals, the anchor-lost snackbar, the ghost tag.

---

## 7. Phase C — the tuning loop made legible, and the hardening

- **Peak readout.** The workflow is "reduce acceleration peaks", so say the peaks: while a
  baseline exists, the graph card shows `peak 14.2 → 11.8` (max |value| of the shown series,
  baseline → live, in the axis's unit, colored by sign of the change). One line, computed from
  arrays already in hand, and it turns squinting at two curves into reading a number.
- **Force-mode pass.** Verify the force-drag loop end to end (drag a load's endpoint against
  the input-torque curve), including the gap banner: a drag that pushes the mechanism through
  a toggle position mid-gesture creates solver gaps — the existing null-point handling draws
  the hole honestly, and the gap banner must not thrash per move (compute on release only).
- **Performance budget, measured.** Per-move cost = cycle re-solve (existing) + series
  resample + Apex update, plus a full force solve in force mode. Budget: a four-bar with two
  open graphs holds 30 ms/frame kinematic, 60 ms in force mode, measured by the new e2e suite
  on the standard fixtures. If force mode misses, degrade stated-ly: live force curves refresh
  at half rate while the drag ring is live, never silently.
- **Docs.** `tips-and-tricks.md` entries for the traps met on the way (the `.next(1)` spinner,
  the header cache key, the phase rotation); CLAUDE.md's UI-layer sketch updated; the §3
  matrix folded into `edit-mode-playback-plan.md`'s matrix section as its successor.

**Gate C:** budgets green in e2e; adversarial staging list re-run once more over the finished
surface; fixture gallery gains a "tune the peak" mechanism if none of the existing ones shows
the effect well.

---

## 8. Risks, named

- **Force-solve cost per move** is the one real performance unknown (kinematic cost is proven
  by every Edit drag). Measured at Phase C with a stated degradation path; nothing in Phases
  A–B depends on the answer.
- **Apex update thrash.** `updateOptions` per frame on four open graphs is untested territory;
  the bridge already avoids full rebuilds and disables animations, and the throttle coalesces,
  but if Apex still stutters the fallback is redrawing only the *expanded* graphs (already
  true — collapsed sections have no chart) and capping live graphs at two, stated on the card.
- **Gesture-teardown paths, again.** Every new mode a gesture runs in re-exposes the "staging
  left open" class. Mitigation is inherited (`closeStaleStaging` is central and mode-blind)
  plus the re-run of the adversarial list at Gates A and C.
- **Mode identity blur.** Unlocking drags moves Analysis toward Edit; the counterweight is the
  hard build/structure line and refusals that name it. If review at Gate A finds the modes
  reading as duplicates, the line holds and the wording sharpens — the scope does not creep.
- **The scenery coloring removal** touches the joint-color rules, which are precise about
  reading as "one object resting, pointed at, picked". Needs the same visual pass in analysis
  that Edit got, not just deletion of the gray.

## 9. Open questions — as answered

1. **Per-gesture re-baselining.** Each drag compares against the pose it started from; no pin.
2. **The corner card carries both**, in the order Undo · Redo · Export, with Export sliding in
   from the right-hand edge it lives on as Edit gives way to an analysis mode.
3. **Multi-select drags are included**, and cost nothing extra: the gate they pass is the same
   `may('drag')` a single part passes.

And one the build itself raised, decided after seeing it: **click selects, drag tunes.** A drag
works through the selection, so grabbing a joint to tune it stole the graphs from whatever was
being studied — backwards for the move this whole unlock exists for. The selection is still
made on the press, and a gesture that travelled puts it back; `ActiveObjService` holds what the
panels are *about* in between, so the swap is never on screen.

Two things the build found that the plan had not:

- **A singularity must not own the y axis.** Acceleration near a toggle is unbounded, so two
  samples out of 360 can read twenty thousand against a curve whose real range is nought to
  twelve. Fitted to that the axis is correct and the plot is useless. `readableRange` trims the
  tails, but only when they are outliers and only while a comparison is on the plot.
- **The axis has to hold a *running* range.** Recomputed per frame it shrank as readily as it
  grew, so it swam under the very curve being watched. Widen only.

## 10. Keeping it verified

- `edit-permission.spec.ts`: the §3 matrix, as a table, analysis column included.
- `posed-editing.spec.ts`: the staging cases re-parameterized over mode where the mode is not
  part of the point.
- New `e2e/analysis-live-edit.mjs`: baseline appears and is faded-solid; live series dashed
  and moving; axis widen-only during gesture; release keeps ghost + chip; chip clears; undo
  drops baseline and restores curves; peak readout arithmetic; per-frame budget; unsynced
  two-machine isolation; displaced-pose phase alignment against a known rotation.
- `e2e/ui-copy.mjs`: the new refusal sentences.
- Fixture gallery: any new mechanism used by the suite goes through `FIXTURE_GALLERY` and
  `npm run fixture-urls`, as always.
