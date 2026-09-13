# Short notes

> **Status:** Reference — one surprise each, searched by symbol rather than read through.

One surprise each, in no particular order, mostly charts, panels, solvers, cylinders and welds.
Each heading states the rule: **search this file for the symbol you are touching** rather than
reading it top to bottom. There is deliberately no index — the headings are the index, and a
hand-kept list of eighty-odd of them would be stale within a month.

Add to it whenever something surprises you. A surprise nobody writes down is one the next person
pays for again. A note that outgrows a heading is not a note any more: move it to the document
whose title covers it, and leave a heading here only if someone would still search for the symbol.

---

### An e2e suite that launches the machine's own Chrome is not portable

Eight suites read `PMKS_CHROME` and hand Playwright an `executablePath` rather than using the
Chromium it pins. On a laptop that is the Chrome sitting in `/Applications`; on a CI runner it is
whatever the image installed that morning, and it can be upgraded *during the job*. The first
Linux run of `phase2-floating-slot` passed both its own checks and then hung the full thirty
seconds inside a plain `page.screenshot({ path })` — fonts loaded, nothing else. Nothing was wrong
with the app or the suite.

So `e2e/suites.mjs` keeps all of them out of the `gate` lane: the gate installs Chromium only, and
anything wanting the machine's own browser runs in the nightly, where a retry tells a break from a
flake. If you write a suite that needs real Chrome, expect the same and say so in its lane note.

### `[disabled]` beside `formControlName` does not disable anything

A reactive form owns its controls' disabled state and pushes it onto the element whenever it sets a
control up -- `setDisabledStateDefault` is `'always'` in `@angular/forms` -- and that happens after
the element's inputs are applied. So `[disabled]="true"` next to `formControlName`, over an enabled
control, is overwritten on the first pass, and only holds if it changes *after* setup. One switch
could therefore be two things. A `toggle-block` disabled when it appeared was only grayed by the
block's stylesheet and still took focus and a Space: Gravity, in Settings opened while a mechanism
played, switched off with the drawing read-only. The same switch disabled a moment later was
really disabled. Angular warns once per element for asking (`It looks like you're using the
disabled attribute with a reactive form directive`).

Disable the control instead. A subscriber that reads the whole group then wants `getRawValue()`,
because a disabled control is left out of `value`. How `toggle-block` does it is under "A toggle
block's `disabled` goes through its form control".

### A scheduled workflow is read off the default branch, which here is a release behind

`on: schedule` and `on: workflow_dispatch` are taken from the default branch's copy of the workflow
file — and the default branch is `main`, which pull requests never target. So
`.github/workflows/e2e-nightly.yml` does nothing at all, and its **Run workflow** button does not
exist, until a release pull request carries it from `staging` to `main`. `on: pull_request` has no
such rule: it is read from the pull request's own branch, so `e2e-gate.yml` worked the moment it
was opened. A new scheduled workflow that "never fires" is almost always this and not the cron.

### Analysis graphs: keep annotations in the options, not on the chart

`ApexCharts.addXaxisAnnotation(…, pushToMemory=false)` draws onto the chart, and *any* later
`updateOptions` — the series changing, the axis refitting, the bridge's width watcher — redraws the
chart from its options and the drawing is gone. A row that has just opened redraws three times in
a few milliseconds, and chasing each with a fresh drawing (even one frame later) lost the race
every time: the playhead was simply absent on a freshly opened row, and present only after the
next playback tick. `showAnnotations` in `analysis-graph.component.ts` now writes the playhead
into `chartOptions.annotations` *and* draws it; the options are what every redraw reads, the
drawing is what makes a moving playhead cheap.

### A record read by several components has to be brought up to date before any of them

The tuning gesture (`AnalysisCompareService`) is polled, because every edit ends in a rebuild
that publishes on nothing. Polled from a component's own `ngDoCheck`, it was updated by whichever
component was checked first — after the ones checked earlier had already rendered the stale value,
which dev mode reports as NG0100 against the earlier one (the status strip, then the panel's
switch). `AppComponent.ngDoCheck` syncs it now, before any child is checked. The graphs' own
"before" curves are taken and dropped from that same sync for the same reason: a graph deciding in
its own check decided after the panel above it had asked whether there was anything to compare.

### `analysis-graph.component.spec.ts` builds its own injector

Its production-fixture tests construct the component with `withTestInjector([...providers])`, so a
service that is `providedIn: 'root'` is *not* available there: adding an `inject()` to the graph
means adding a provider (or a stub) to that list, or every fixture test fails with NG0201.

### The chart gets one series set per redraw, and the bridge redraws one at a time

`buildChart` used to assign every live series to `displayedSeries` and leave the chosen ones to
a 1 ms timer. Under a drag -- a redraw per frame -- ApexCharts drew the first set before the
second arrived: X and Y flashing through a plot set to Magnitude, and a live curve with no
earlier one under it. Screenshots never caught it; a `requestAnimationFrame` sampler reading
the `seriesName` attributes did (`e2e/analysis-editing.mjs`, "no frame of a Magnitude drag").
`updateChartData` now builds and applies the selection in one synchronous step, and the bridge
(`analysis-apex-chart.component.ts`) runs one `updateOptions` at a time, re-running once from
the options current at the end if more were asked for meanwhile.

### `segmented-block` is the pick-one control

Every "choose one of two or three" in the app is `segmented-block`: `radio-block` wraps it for
form-bound settings, the graph rows use it for Magnitude / X & Y, the export drawers use it
directly. The pill under the chosen option is positioned by measuring that option
(`--thumb-left`, `--thumb-width`), so options may be as wide as their labels (`[fill]="false"`
at the end of a settings row) or share the width equally (the default in a panel). Its buttons
carry the plain button role and `aria-pressed`, which is what the suites find them by.

### ApexCharts draws every annotation in front, and has no option about it

`annotations.position` is not a thing (only `grid.position` and the crosshairs have one), so a
zero line drawn as a y-axis annotation crossed the curve it was there to be read against. The
chart bridge moves the axis-annotation groups under the series group after each draw, from a
`MutationObserver` on the chart's host -- the one vantage point that sees Apex's own late
redraws too. The move must be a no-op once the order is right: moving a node that is already in
place is itself a mutation, and the first version of this looped the tab solid.

### `panel-section` has a live slot for what a frozen panel may still change

`[frozen]` makes the card's body `inert`. A child marked `panelLive` is projected after the
body, outside it, and stays usable while the rest is gray: that is how the mass fields are typed
while the machine plays. The frozen look in `edit-panel.component.scss` is scoped to `[inert]`
descendants for the same reason, so the live section keeps its ink.

### Template payloads outside the generated block are edited by hand

`npm run template-payloads` rewrites only the block between the `<generated …>` markers in
`template-linkages.ts`; the entries above it and everything in `dev-templates.ts` are typed in.
A default that lives in the URL's settings flags (joint labels, say) therefore has to be flipped
in those strings too: the first two characters are the packed bool settings in the URL's
base-64 alphabet, and the checksum on the end is a function of the length alone, so a flipped
bit needs no other change.

### A context menu is one menu per kind of thing

A row on the right-click menu never comes and goes with the situation. It is there on every joint
(or every bar, every cylinder, every force) and it grays, with the model's own reason in the slot,
when it cannot apply. The joint menu used to break this: a cylinder's joint lost its Slider row and
the slider itself lost its Weld row -- two menus under one name, and a reader who had learned where
a row sits finding it gone. Both rows are permanent now (`jointAttachRows` and `jointStateRows` in
`context-menu-builder.service.ts`), and the refusals quote `weldRefusal`,
`describeActuatorRefusal` and the rest rather than restating them.

There was briefly a *Free to Move* row as well, for a joint on a bar holding its length or angle
(`RealLink.hold`): such a joint still drags, but only along the arc or the line the hold leaves it.
The row was removed as more confusing than the thing it explained. What remains is the joint's
subtitle ("on fixed AB"), the amber guide drawn while the joint is dragged, and the hold's own rows
on the bar, which is where it is released.

The exceptions, on purpose: the multi-selection menu is its own kind of thing and shapes itself to
what is selected, and the synthesis-position rows (`positionRows`) ride along on every menu only
while positions exist, because a permanent grayed "Delete Synthesis Positions" on every joint in
Edit would be noise about a mode the reader is not in. `context-menu-builder.service.spec.ts` and
`e2e/context-menu.mjs` are the guards.

### The right drawer is as wide as the view controls and stops one gap above them

Both numbers are measured, not chosen: `ViewControlsComponent.publishGeometry` writes
`--view-controls-width` and `--view-controls-clearance` on the root, and
`right-panel.component.scss` sizes the frame from them. Every page is that width -- the export
page used to widen to 380px for the note beside each machine's name, which broke the shared left
edge; the note wraps now (`.mechNote`). Only the dev-only debug table is `.wide`.

The frame **clips and never scrolls**, and the reason is a contradiction worth knowing before you
reach for `overflow-y: auto` again. A scroll box clips at its padding edge. The card inside it needs
`$shadow-room` of padding below it for its shadow to fall into, so a scrolling frame either cut the
shadow off square when the page fit, or, with the padding kept, showed the page running 16px past
the card line when it did not -- and 16px past the card line is 4px under the view controls. So
when the tutorial is pinned above a page and the two do not fit, each card scrolls inside itself
(`.tutorialSlot` shrinks to a 200px floor, the page below keeps a 260px floor and takes the rest),
and the frame's bottom edge is never the visible one. `e2e/right-drawer.mjs` measures all of it.

### A force is anchored on the linkage, not on the skin

`model/force-anchor.ts` is the one rule for where a load may sit: on the line between a bar's two
joint centers, inside the polygon a plate's centers enclose, on any one piece of a welded
compound (each piece by its own rule, so two bars welded at an angle do not gain the corner
between them), and for a boom whose three joints lie on one line, the segment between the outer
two. The drawn outline is wider than that -- a bar has a width, a plate rounds its corners -- but a
load out at the drawn edge is on the skin rather than on the linkage the solver balances.
`constrainForceAnchor` answers with the nearest allowed point, and draws a point that comes within
`snapWithin` of the line between two joints onto it; Option suspends that snap, the way it frees a
joint from the grid.

Every placement goes through it: the anchor drag and the whole-arrow drag on the canvas, `dragForce`
in `GridUtilsService`, `createForce`, and -- the one that catches everything else --
`keepForcesOnTheirLinks` at the top of `updateMechanism`. Joints move under holds, solvers and
drags that never touch the forces riding the link between them, and a plate whose corner was
dragged in used to leave its load standing where the plate had been; the rebuild is the one funnel
every edit passes through, so that is where the rule holds however the joints got there. A URL
that arrives with a force off its link is put back on it at the first rebuild. The old
`pointIsInsideLink` / `closestPointOnLink` pair in the canvas, and the hull-projection block in the
delete path, are gone: they were three different answers to one question.

### The second click of Add Cylinder lands on a joint

`commitCylinderCreation` reads `lastLeftClickType`: on a joint, the rod's far end *is* that joint,
folded in through `mergeJoints` -- the same door a mount dragged onto a joint goes through, so
every refusal that merge has (a cylinder's interior, a joint of the same bar) this has too, in the
same words, and a refused end stays free where it was clicked. The joint the gesture *started* on
is skipped, since a ram from a joint back to itself is not a ram. `e2e/cylinder-end-on-joint.mjs`
guards it; when writing a suite like it, start the gesture from a point chosen on the *screen*
below the lowest joint, because a joint's hitbox is a screen size and the drawing's own units say
nothing about it -- the first cut started three model units from C and got C's menu.

### The analysis panel's four chips are the menu's Traces rows

Under every joint's and link's graphs, in Kinematic and Force Analysis alike, sits "Show Vectors
on Drawing": one row of four outlined chips -- Path, Velocity, Force, Acceleration (the design's
option 2c). They are not a second implementation: `ContextMenuBuilderService.drawingSwitches`
hands the panel the part's own `MenuRow`s -- the same `traceRow` and `vectorRow` the right-click
menu shows, with the same refusals from `vectorSwitchRefusal` -- and the panel renders each as a
chip. On, the glyph takes `VECTOR_INK`, the arrow's own color, so a reader learns the color here
and meets it on the drawing; the path chip swaps `show_path` for `hide_path` when off. Gray
carries the menu's reason on hover (`drawingSwitchTip`: the row's label, the short reason, the
long one) and does nothing when pressed. A link keeps the two rows the menu leaves off it (path,
force) in place and gray as "joints only", because a chip that comes and goes with the selection
is harder to find than one that stays and says why. A press runs the row's `action`; lit-or-not
is read from the drawing each time (`drawingSwitchIsOn`), so a flip made from the menu shows on
the chip with no form to keep in step. The chips grow from their natural widths to the panel's
edge (`flex: 1 1 auto`); four equal shares (`flex: 1 1 0`) cut "Acceleration" off at the
panel's width, where at its own width it fits. The Force chip, and the menu's Force Vectors row with it,
is gray whenever `forceAnalysisRequirements()` has an unmet, non-warning row -- the same gate
that keeps the Force Analysis tab shut -- so a reaction is never drawn from an analysis the
setup drawer still refuses. The rows are cached on the part, `solveRevision`,
`vectorTraceVersion`, the force mode and the joint's own `showCurve`.
`e2e/analysis-drawing-switches.mjs` guards it, and presses the chip through the element rather
than the pointer: the row sits at the bottom of a scrolling panel under a sticky head, and a
pointer click there landed on the row below the one it was aimed at.

### A recolor moves no revision, so the paint has a revision of its own

The cylinder skins and the slider marks are cached on `drawingDigest`, which is memoized on the
pose, solve and cylinder revisions and the object scale. A recolor from the Visual Settings
picker writes `link.fill` and bumps none of those -- nothing moved and nothing needs solving --
so the memo answered with the old paint and a cylinder kept its old color until a drag or a play
happened to rebuild the digest. `RealLink.paintRevision` is bumped by the `fill` setter and is
the memo's fourth key. Not by reading `linkPaint()` on every call: `new-grid.component.spec.ts`
counts that walk once per revision, and that count is what keeps a forty-nine-joint workbench
from lagging. `e2e/cylinder-skin.mjs` checks the repaint with no gesture after it.

### "The loads push along a motion the linkage locks only at second order"

`SECOND_ORDER_LOCK_MESSAGE` is what a cycle gets when the elimination is rank-deficient at most
poses *and* the evenest split still leaves the loads unbalanced. A left null vector of the
equilibrium matrix is a virtual motion every constraint allows at first order; the loads doing
work along it means nothing finite reacts, which in a rigid model is a toggle at dead center --
except that here it is the whole cycle. The gripper with masses and gravity is the example: its
cylinder hangs on one ground pin, so the assembly can swing about that pin while the carriage
rides up the rails, and the rails bind against that only at second order. Take the weight away
(masses zero, or gravity off) and the same drawing solves, because the loads then do no work
along that motion. The first attempt at this added a "binding couple" between a jaw and its two
rails; it was the wrong motion -- the residual barely moved -- and the diagnosis that found the
right one was the left null vector, labeled by body row. When a drawing refuses force analysis
everywhere with a large residual, look for the motion, not for a bad pose.

### A body grab selects the force, or the last-pressed handle drags instead

`beginDraggingForceBody` now calls `updateSelectedObj(force)` before recording the grab offset. A
press on the base or the head leaves that end selected (`isStartSelected` / `isEndSelected`), and
the body's pointerdown never re-selected the force, so the drag state machine at the press saw a
selected handle and dragged that one end to the pointer instead of carrying the arrow whole.
`e2e/force-edit.mjs` presses the base, then grabs the arrow, and requires both ends to move
together at the same length.

### A force anchor refuses a shared pin out loud

Dragging a force's anchor onto a pin several links meet at still holds it short of the pin along
its bar (`heldOffJoint`), and now says so: `forceRefusedJoint` rings the pin in the same red
`.snapRefused` circle a refused joint drop wears, and `notify.refusal('force.shared-joint', ...)`
names the pin and the bar it is held on. Said on every pointer move, deliberately: the
notification service holds a repeat while the same id is on screen and for its cooldown after,
so the sentence does not stack. The ring is cleared on `mouseUp`, which is where every force drag
ends -- `letGoOfEverything` is not on that path.

The hold is by distance from the pin, not by whether the pointer is over it. `forceAnchorAt` only
reports a shared pin within its snap radius, so a hand pushed hard past the pin -- along the bar
and beyond its end, where `constrainForceAnchor` clamps the anchor to the segment's end, which
*is* the pin -- left the anchor standing exactly on the pin with nothing said. `moveForceAnchor`
now looks for any shared joint of the link within the margin of where the anchor came to rest, and
holds off from that one. `e2e/force-edit.mjs` pushes three pin-lengths past C and requires the
anchor to stop short.

### A force chip that would draw nothing is gray, and says so

`vectorTraceRefusal('force')` refuses a joint whose reaction is zero at every solved sample
(`reactionIsZeroAllCycle`, measured against the largest reaction anywhere in the cycle so
round-off is not a load): "carries no load". The case that found it was a four-bar with the load
on the crank -- the follower rides along unloaded, the reaction at B is zero all cycle, and the
chip lit while `buildVectorTrace` had no arrow of any length to draw. A switch that lights for
nothing is a switch that lies, so the refusal is the answer rather than a longer arrow.

### The gripper's drag lag was the simultaneous solver's normal matrix

A drawing the walk cannot solve is re-solved simultaneously, all its samples, on every pointer
move (`solveDamped` and `solveLinear`, under `reachSpan`), so that solve's arithmetic is drag lag.
Two things keep it cheap; do not undo them. `normalEquations` walks the Jacobian's nonzeros (each
row touches a handful of columns) and is built once per Jacobian, not once per damping attempt.
And the damped normal matrix is symmetric positive definite, so `solveSymmetric` (Cholesky) solves
it, with the elimination kept as the fallback where a pivot is not positive. To find a drag's cost,
profile it (`Profiler.start` / `Profiler.stop`, self time by function) before suspecting the
loads: forces on a link add about a millisecond a move.

### The geometry rescue asks which freedoms survive *together*

`mobilityFromGeometry` used to put each null-space basis vector to the second-order test on its
own. The elimination hands back *a* basis, not the natural one: a parallelogram drawn with its
cranks lying along the coupler (a coupler on three equal parallel cranks, every joint on one
line) has two first-order freedoms there -- translate the coupler, and turn it -- and came back
as translate-plus-turn and translate-minus-turn, each of which dies at second order alone. The
count was zero for a linkage that runs, and nudging one crank off the line made it run.
`survivingSubspace` treats the closable-gap test as what it is, a vector-valued quadratic on the
freedoms: it searches each pair of basis vectors round their plane for a root direction (a scan of
the half-turn and a golden-section refinement, each candidate then checked as a displacement in
its own right), adds the basis vectors that survive alone, and counts the largest subspace the
form's bilinear part vanishes on among them. Not the radical of the whole form: the true motion
pairs to a nonzero cross term with the dying one, so the radical was empty there. The answer is
never less than the one-at-a-time count. `flat-parallelogram.spec.ts` holds the user's drawing;
the MotionGen gripper (`motiongen-gripper.spec.ts`) now counts at one as its own comment always
said it should, and is still refused, by the position solver, which cannot yet walk a redundant
constraint set from that pose -- that spec says which limitation is left.

### A grounded slider is refined like a rocker, and a piston carries its crank through

Two things about a drawing driven by a slider on a ground rail. Its samples were a fixed tenth of a
length unit apart (`PRISMATIC_INPUT_STEP`), which sampled a long stroke finely and a small
drawing's stroke into six frames. A cylinder already cuts its stroke into `SAMPLES_PER_STROKE`
because it knows the stroke up front; a grounded slider's stroke is only known once walked, so it
now gets the same refinement a rocking pin gets: walked once at the fixed spacing, then again with
`PositionSolver.drivenSampleStep` set so the same stroke has about 360 samples
(`findFullMovementPos`'s third argument, and `incrementPrisInput` reads the refined step).

And a slider that reverses at a crank's dead center is a piston: the wheel it pushes carries
through on its momentum while the piston runs back. The walk used to swing the wheel back, for two
reasons that were each deliberate for a rocker. `clearMotionHistory` at every reversal -- now only
for a rocking pin, since for a prismatic input the history is exactly what picks the continuing
root over the retrace a step past the dead center. And the `visited` map, which puts a step onto
covered travel back on the pose found there so a rocker comes home exactly: for a prismatic input
that reinstatement now happens only when the re-solve *retraced* (landed within half the step it
just took of the visited pose) or *jumped* (moved further than the jump limit, which is the crossed
assembly a rocker's limit offers, not a wheel turning on). A continuous move onto the other branch
is kept. Not the jump limit as the retrace test: just past a dead center the two branches stand
about two steps apart, well under 5% of the span, and the first cut reinstated the retrace anyway.
`piston-driven-wheels.spec.ts` requires a monotone full turn; `linear-actuator-rocker.spec.ts` is
the rocker that must still retrace; the template baselines pin every cylinder's out-and-back.

### A toggle block's `disabled` goes through its form control, and hands back only what it took

`toggle-block` used to pass `[disabled]` to its `mat-slide-toggle`, which lost to the form (see
"`[disabled]` beside `formControlName` does not disable anything"): "Draw as a Disc" on a coupler
looked live and snapped back when pressed. The first answer was CSS -- `.toggle-block--disabled`
grays the label and the switch at Material's 0.38, with no pointer on the switch -- chosen over
disabling the *control* because a disabled control drops out of `form.value` for every reader of
that form. The gray fixed the look and left the switch itself live for a keyboard.

`holdDisabled` in the component now disables the control, with `emitEvent: false`, and enables
only a control it disabled itself -- also when the block is destroyed, because the Edit panel's
link form outlives any one block. The multi-selection panel disables its own switches' controls
and passes that on as `disabled`; those stay its business. The `form.value` objection was checked
rather than kept: the link form and the settings form have no whole-group reader at all, and the
synthesis switch form's one reader now reads `getRawValue()`. The gray stays on top of Material's
disabled look, because that is how a disabled switch here has always looked.
`e2e/disabled-toggles.mjs` checks the opacity and that the switch's own button is disabled, on a
coupler selected first and on a crank; `toggle.component.spec.ts` holds the hand-back rules.

The same suite holds the Elliptical Crank card's trace on C. It sat on D, whose comment in
`slot-fixtures.ts` called it the ellipse; D swings on the rocker D-F and draws a circle about F,
and C, the coupler's own point, draws the ellipse the mechanism is named for. A library template
is generated from its gallery fixture, so the fix is the fixture's `trace` flag, then
`npm run template-payloads`, `npm run fixture-urls`, and the card art (`ONLY=Elliptical_Crank`
through `e2e/template-thumbnails.mjs` and `e2e/template-animations.mjs`).

### A contact sheet needs Pillow, and no python on this machine has it any more

`contactSheet` in `e2e/filmstrip.mjs` skips the sheet, with `contact sheet skipped`, when no python
it can find has Pillow; the setup is under [Environment](environment.md#environment). A suite that exits 1 after
every check has passed is worth checking for that first. The other thing that stops a suite short
is a stale persistent Chrome profile (`/tmp/pmks-chrome-undo`, `/tmp/pmks-chrome-attachcyl`): a cdk
overlay backdrop intercepting every click is the What's New dialog of a profile that remembers an
older visit. Delete the profile and rerun.

The `link-holds` and `edit-playback` suites also carried expectations from before the analysis
modes took a drag: a hold's chip stays up in Kinematic Analysis now, because a drag there is held
exactly as in Edit, and stands down while it plays; and the menu's Grounded row refuses
restructuring mid-cycle on purpose, so the gate check compares the Locked row and checks that
refusal by name.

### The grid is black at a low opacity, not a baked-in gray

`.gridLineMinor` and `.gridLineMajor` are `rgba(0, 0, 0, 0.05)` and `rgba(0, 0, 0, 0.1)` -- the
fractions the old two grays amounted to on white. A gray line is the right shade over white and a
bright lattice over a background image, brightest exactly where the picture is dark; a transparent
black darkens whatever is under it by the same fraction, so it is the same grid on paper and a
faint shadow on a photograph.

### A traced template ships its picture, and the card's art shows it

"Real-Life Use Cases" (`realworld`) holds mechanisms drawn by hand over a picture of the machine.
The picture cannot ride the URL, so the card names it: a `backdrop` row on the card
(`TemplateBackdrop`), in centimeters whatever unit the payload opens in -- the steering linkage is
drawn in meters, so its 2.26 m width is written as 226. `placeTemplateBackdrop` puts it up when the
card is opened in place, and a card opened in a new tab carries `#backdrop=<card id>` after its
query, which the URL processor reads before the decode strips it. The card art scripts use that
same fragment, so a still and a loop are what the reader will see, picture included -- and they
hide the ruling as *elements* (`.gridLineMinor, .gridLineMajor, #axes, #axes_numbers`) rather than
through `tempGridDisable`, which takes the whole paper group down, backdrop and all; the first cut
shot every traced card over blank white. `templates.component.spec.ts` requires every named
backdrop to exist under `src/assets/backdrops/`.

Two traps met adding the four. `Landing_Gear` already names a library template (a two-machine
drawing under Many Mechanisms), so the aircraft is `Aircraft_Landing_Gear`; a duplicate key in
`template-linkages.ts` is a compile error the dev server shows as an overlay, and a Playwright
run that lands on that overlay shoots the overlay. And card names follow `docs/ui-vocabulary.md`
like any other copy — "Car Steering", never "Steering Linkage" — but `e2e/ui-copy.mjs` does not
open the library, so nothing checks a card name for you. The animation script's `pngjs` and
`gif-encoder` live in the Playwright install (see [Environment](environment.md#environment)) and vanish with it.

### "A part of this mechanism is tied to nothing" is the geometry's second opinion on a dead position

Gruebler's count is believed whenever it reads one or more, and the geometry rescue only runs
when it reads less -- and that leaves a drawing that counts one *low* with a count of one. A
locomotive drive is the case: its crosshead is held to its line by two slides, which the count
charges twice, so a valve gear whose combination lever hung from the valve rod with its lower end
W attached to nothing still counted as a mechanism. The solver was handed two freedoms, could not
take its first step, and said "starts at a dead position -- drag a joint off the limit", which is
false in every particular. `explainDeadPosition` now asks `mobilityFromGeometry` at that one
moment; when it reports more freedoms than the count, the failure is `hidden-freedom` and the
readiness row says a part is held by nothing but its own joints, and how many ways the drawing
can move. `locomotive-valve-gear.spec.ts` holds the drawing, and the same drawing with W grounded
runs.

Deliberately *not* believed upward before the solve: the gripper on rails, and any ram on a pin
whose carriage rides guides, has a second freedom in the geometry's eyes -- the ram can swing on
its mount while the carriage rides up -- that the solve never stirs, because the least-norm step
keeps what the reader drew level. Refusing such drawings for a freedom they do not use would take
the gripper template away; letting the solver try first and asking the geometry only when it
fails keeps them, and answers the locomotive honestly. (The gripper's force analysis meets the
same freedom from the other side: that is the motion its weight escapes along.)

`survivingSubspace` accepts a root in a pair's plane only where the form truly vanishes on that
circle -- small against the most it reaches anywhere on it -- rather than only small against the
gap. A direction that is nearly all of a genuine motion with a hair of a dying one leaves a
residual of the hair's square under a gap of the motion's size, and the relative test alone let
every such direction through.

### A slotted lever swings about any known pin of its own, not only a slot joint

The inverse-slot primitive (`orderCarrierFromBlock` / `inverseSlot` in `position-solver.ts`)
places a slotted link from the block riding in it: swing the carrier about a joint of it the
walk already knows until the slot passes through the block. It used to insist that joint be one
of the slot's two ends, which every Whitworth and shaper in the library satisfies -- and a
locomotive's combination lever, pinned to the frame at a *third* joint with its slot cut between
the other two, did not. The walk left the lever unplaced, the simultaneous fallback refuses any
slot on a moving link by policy (§4 of `docs/phase-3-slide-spec.md`), and the reader was told the part was "tied to nothing".

Now the pivot may be any known pin of the carrier, a slot joint first when one is known. In the
carrier's frame the slot is a line at a fixed signed distance `offset` from the pivot, and the
block sits `along` from the foot of the pivot's perpendicular: `pivot→block = along·û +
offset·û⊥`. `offset` never changes, `|pivot→block|` is known each sample, so `along` follows,
and its sign is settled once at t = 0 -- the block can only change sides of the foot through
the tangency where `|pivot→block| = |offset|`, which returns "no solution" and reverses like a
rocker's limit. With the pivot on the slot, `offset = 0` and this is the old ray.
`offset-pivot-lever.spec.ts` holds a closed form; `locomotive-valve-gear.spec.ts` holds the
drawing that found it.

### "Hidden freedom" is more freedoms than the drive has, not more than Gruebler counted

`explainDeadPosition` compares the geometry's freedom count against `dof`, the number that let
the solver run, and not against Gruebler's. A crosshead on two slides counts -1 and is rescued
to one by the same geometry; comparing against -1 called the solver's every failure on such a
drawing a hidden freedom, when the rescue was the count agreeing with the drawing.

### The mobility count reads a floating slot's live direction

`constraintsOf` in `mobility.ts` writes a slide constraint from `joint.slotAngle`, never from
`joint.angle_rad`. The stored angle is what a *grounded* guide keeps; a slot cut into a link has
its direction in the two joints it runs between, and the stored number is stale (usually zero).
Read it and a slanted slot counts as horizontal: the pin was free to leave its slot sideways, the
count found a freedom the drawing does not have, and a lever locked by a weld -- see the next
entry -- was rescued to "one freedom" and handed to a solver that could not step it.

### A weld at a block joint holds the rider level, and a level rod cannot follow a swinging pin

Welding the pin where a rod meets its slider block makes a *Slide* (§2.1 of `docs/joint-types-plan.md`): rod and block are one
body, and on a grounded guide that body cannot turn. A rod pinned at its other end to a lever
that swings about a fixed pivot is then locked -- the pin on the lever moves on a circle, the
rod's end may only move along the guide. The locomotive drawing had exactly this at T, so the
honest verdict is "over-constrained; a weld also removes freedom", which the readiness row says.
Unweld T and it runs. The position solver's ordinary dyad walk does *not* honor that weld -- it
places the welded rider with `circleLineIntersectionPoints` as if it could tilt -- so before the
slot-angle fix above the drawing "ran" with its valve rod tilting through a weld, and its
velocity graphs, which do honor the weld, were a least-squares compromise between two
mechanisms. The count now refuses it before either solver is asked.

### The loop matrices are sized by loops and solved by least squares

`KinematicsSolver.determineArrays` allocates `max(unknowns, 2·loops)` rows, and `determineAng`
solves with `matLeastSquares` (normal equations; square systems go straight to the inverse as
before). A drawing whose loops are independent as topology but not as geometry -- a crosshead on
two parallel slides, a parallelogram with a third crank -- has more loops than it has rates to
find. The `LoopSolver` keeps only a cycle basis, which is right, but a redundant *geometric*
constraint is still a distinct cycle, so the extra loop's rows have nowhere to go when the
matrix is sized by the unknowns: `B_matrix[rowIndex]` was undefined and the Kinematic Analysis
panel threw on the three-crank parallelogram. The extra rows repeat what the others said, so the
least-squares answer is the exact one. `redundant-parallel-crank.spec.ts` asserts the rates.

### A slotted carrier's joints are carried from a grounded pin first

`KinematicsSolver.knownCarrierSeed` prefers a grounded member of the carrier, then the slot's
anchor, then anything settled. The maps are cleared once per mechanism and not once per frame, so
from the second frame on every joint reads as "settled" -- with the previous frame's number.
Seeding from the anchor when the walk reaches the carrier *through* the slot carried last frame's
velocity into this one and gave the grounded pivot a velocity of its own; every joint of the
lever was then off by that same vector. A grounded pin is exact in every frame.

### A welded slide assembly can be located by a link onto it, not only by a slot

A rod welded to its block on a grounded guide is a rigid body with one freedom -- how far it has
slid. `orderSlideAssembly` knew two ways to pin that down: a member of the assembly some earlier
step had already placed, and a slot cut *into* the assembly with a known block riding it, which is
the Scotch yoke's case. The commonest arrangement of all was missing: a link from elsewhere in the
mechanism pinned onto the rod, which is how a locomotive's radius rod drives its valve rod. The
walk left those joints in `unsolvableJoints`, `attemptPositionAnalysis` refused before its first
step, and an ordinary mechanism was reported as starting at a dead position.

`slideAssemblySource` now has a third kind, `'link'`. The assembly's joint runs along `M0 + t*u`
and the link holds it `L` from the placed joint `S`, so with `w = M0 - S` the travel solves
`t^2 + 2t(w.u) + |w|^2 - L^2 = 0`. A negative discriminant is the link losing reach of the guide's
line -- a limit, answered by reporting no solution so the walk reverses. Both roots keep the
link's length, so the branch is chosen by `solutionNearestCurrent`, the same extrapolation every
other two-root primitive here uses.

The far end has to be a joint outside the assembly. Measuring to one of its own members would be
measuring to the answer, since the step is about to move the whole assembly. A *grounded* joint
outside it is a fine reference, unlike the `'member'` case where reading travel from a seeded
member reports the assembly permanently at rest.

`guided-rod-on-a-link.spec.ts` is the primitive in its smallest form, checked against a closed
form and its hand-differentiated derivative; the same spec shows that unwelding the rod leaves two
freedoms, which is why the weld is what makes the arrangement a mechanism at all.

### A URL can say a mount is welded, and the decoder drops the flag

Welding a cylinder's mount is refused by the app today, and the natural way to test what the
model does with one anyway is to hand-build a payload that says a mount is welded. That does not
work, and it fails quietly. `reconcileAssemblyWelds` repairs a weld flag that has outrun its
compound only where there is a slide assembly or a compound to repair *to*; a mount has neither,
so the flag is stripped on decode and the drawing comes back unwelded, with no message.

Two consequences. Testing the resolver against a welded mount means building the graph by hand
-- which is fair, since the resolver is a pure function of the graph -- and that is what
`src/app/model/cylinder-ownership.spec.ts` does, mirroring `rebuildJointGraph` and
`reconcileSlots` in a local helper so the fixture is the graph the app actually produces. And
when the weld is opened up, the decode path has to *build* the compound rather than merely keep
the flag, or a saved drawing will come back with its bracket detached and nothing said.

### A ram's five joints are not named A, B, C, D, and have not been for a while

The two mounts take ordinary letters from `determineNextLetter`; the three the reader never sees
hang off the barrel mount's letter and are numbered -- `A1`, `A2`, `A3` -- by
`determineInteriorNames`. That is deliberate twice over: the hidden joints read as belonging to
the part, and `determineNextLetter` ranks ids by their place in the alphabet, so it walks past
them instead of letting a cylinder's interior push the *visible* joints into double letters.

A suite that names a cylinder's joints should ask the model which joint plays which role
(`sealedStructures()[0]`, as `e2e/phase4-cylinder.mjs` does) rather than assert the naming scheme
by accident; a suite that spells out the scheme fails in a way that looks like a regression in
creation.

Three more things a cylinder suite can assert by accident, all consequences of deliberate
changes: a cylinder joint's menu **grays** the Slider row
rather than omitting it (every joint's menu is the same shape now, each refusal explained); a
cylinder body's menu has gained Fixed Angle and the vector switches, so an exact-list assertion
goes red whenever the menu legitimately grows; and the panel's speed field is **Input Speed**
writing `Joint.driveSpeed` on the driven joint, not "Expansion Speed" writing
`settingsService.linearInputSpeed` -- a drawing can hold several machines, so a speed belongs to
the thing being driven rather than to the document.

### A drawing with a welded mount is solved as one system, not walked

`orderCoupledPartition` in `position-solver.ts` sends a whole partition to the constraint set
instead of walking it, whenever a ram has been attached to the drawing *at a mount* -- welded into
a neighboring body, or carrying a block of its own. The walk is a sequence of closed forms, each
claiming a joint and writing it; a mount welded to a bracket has no primitive, so the walk places
the ram from its mounts and the bracket from its own pin, and the two disagree about a body that
is meant to be rigid. Nothing downstream catches that, because the walk leaves no joint pending
and `finishOrder`'s fallback only ever sees what the walk could not reach. One authoritative
writer per coordinate is the point.

Grounded sliding joints are **unknowns** on that route, not boundary: "grounded" on a PrisJoint
means its slot line is fixed, not that the joint sits still.

`PositionSolver.forceCoupledRoute` sends every drawing that way. It is for tests, and is
deliberately not cleared by `resetStaticVariables`, because the whole point is to compare a
mechanism solved both ways *before* anything depends on the new route:
`coupled-route-agreement.spec.ts` does that on seven mechanisms whose answers are already
trusted. They agree to a unit in the last recorded decimal on the four-bars and a few units on
the six-bars, against the 0.01 the MATLAB verification asserts to -- and they agree on sample
count, which is cycle closure and reversal in one number.

**It costs 2x to 5x the precompute time**, measured over five runs each: a four-bar 6.8ms walked
against 14.1ms coupled, a Stephenson III 2.8 against 9.0, and an equal-sided four-bar -- which
folds flat twice a turn -- 2.6 against 13.0. The near-toggle case is the expensive one, which is
what a dense normal-equations solve near a rank deficiency costs. Absolute numbers are small
enough not to matter for a 361-sample precompute; they would matter if this route ever became
the default.

### A residual of zero does not mean the parts are the right way round

Two poses satisfy every row and are wrong. A `fixedDirection` row is a cross product, so it is as
happy with the welded body turned end for end as with it held where it belongs; and a ram's
mount-to-mount span says how far apart its ends are and nothing about the order of the part
between them, so a ram assembled inside out -- head behind its own mount, rod reaching back
through the barrel -- has every length right. `headingsHeld` and `cylindersAreIntact` ask for the
branch separately, at the point a sample is accepted, and `solver-branch-acceptance.spec.ts`
shows the residuals vanishing on exactly the poses they refuse.

### A cylinder fixture built by `cylinderBetween` is laid out at object scale 1

It takes a mark radius of 0.15, which is what a scale of 1 means, while the stroke bounds the
solver records come from the *live* `SettingsService.objectScale`. A spec that builds one and
then asks the solver about it has to set the scale to match, or the bounds describe a different
part entirely and a perfectly good ram reads as being past its stop. `buildMechanism` sets the
scale to `1 * MODEL_SCALE` and does not scale the fixture's coordinates, which is why
`cylinderBoomFixture` comes out of it reporting no travel -- that is the mismatch, not the ram.

### A wrong branch is not a limit, and only one of them is worth a shorter step

`solveLookingAhead` in `mechanism.ts` used to read every refusal as the end of the input's
travel. Two of the acceptance checks do not describe travel at all: `headingsHeld` refuses a
welded body turned end for end, and the axis-order half of `cylindersAreIntact` refuses a ram
assembled inside out. Those are facts about the *step*, not about the mechanism -- the solver
continues from the pose before it, so near a toggle the two roots of the next pose sit close
together and a whole degree can land on the far one when the near one was reachable the whole
way. Reversing there turns a linkage round in the middle of travel it has.

So a **branch** refusal is retried at half the step, down to the same sixty-four cuts the
boundary solver caps itself at, and only then read as a limit. `PositionSolver.refusedOnBranch`
is how the caller is told which kind it was; `refuseBranch()` is the only thing that sets it.

**A travel bound is left as a limit, and that is not conservatism.** A rider at the end of its
slot or a ram at its stop reads the same however finely it is approached, and refining at one only
creeps up on a wall, spending six extra solves and a sample to land 1/64 of a degree nearer it.
Retrying every refusal costs ten fixtures their cycle -- `adaptive-sampling`, `reversed-cycle`,
`template-url` and the force fixtures all fail -- which `near-toggle-continuation.spec.ts` now
states directly. `refusalKind` is `'travel'` for these.

**`'unsolved'` is the third kind, and it is a weaker claim than either.** An iteration that came
away with nothing says this seed and this step found no pose, not that none exists. It is treated
as a limit all the same -- the solve is already subdivided internally where it is commanded, and
retrying it out here is what costs those ten fixtures -- but do not read the code as asserting a
geometric impossibility, because it is not one.

**The retry exists on two paths, and the second one is easy to miss.** `solveLookingAhead` covers
a crank under adaptive sampling. A *commanded* drive -- a ram, a floating slot, a floating pin --
never reaches it: `canSubdivide` requires `stepsByRevoluteSampleStep`. Its continuation is
`reachSpan`, which subdivided when the **solve** failed and accepted a converged pose on the far
root; `settledOnItsBranch` is where that path asks the same question now.

`headingsHeld` also only ever looked at `fixedDirection`. The floating half of the same weld -- a
rider held at an angle to a slot that moves -- is a `fixedAngle` row, whose residual vanishes at
the captured angle and again half a turn from it, exactly as the grounded one does. The branch
condition is `cos*(u.v) - sin*(u x v) > 0`, which reduces to `u.v > 0` for the aligned case.

### A coupled partition's rates come from its constraints too, and there is no second opinion

`constraintKinematics` used to answer only for a cylinder or pin drive; a coupled partition
driven by a grounded crank fell through to the loop solver, which cannot see through a sealed
cylinder and has no equation for a mount welded into a bracket either. `PositionSolver.coupledRoute`
is now part of that gate, and `KinematicsSolver.solveRates` **returns rather than falling back**
when it is set: a confident answer to a different question is worse than an empty graph.

`constraintRates` therefore differentiates against a *moving boundary* as well as a command:

    J_q qdot  = -J_b bdot - F_c cdot
    J_q qddot = -(dJ_q/dt) qdot - (dJ_b/dt) bdot - J_b bddot - (dF_c/dt) cdot

Three things about that are easy to get wrong and were:

- **The time derivatives run along the whole motion.** Differencing the Jacobian down a path that
  held a turning crank still reads the mechanism's shape as changing in a way it does not.
- **The boundary has an acceleration of its own.** A crank at constant speed still has one,
  pointing at its pivot. (It contributes nothing in `coupled-mount-examples`, where it happens to
  be orthogonal to every row the crank touches; `coupled-route-agreement` is what catches it.)
- **The prescribed joints are part of the answer.** Left out, `applyConstraintKinematics` fills
  them with the zero it keeps for ground, so a crank body is drawn moving and reported still. They
  are taken as everything the system does not hold *unknown*, not as the joints its rows happen to
  name: a third joint on a crank body is stepped by the drive and mentioned by no constraint at
  all, and the four-bar in the agreement spec has exactly one.

Least squares returns the nearest thing to a solution whether or not one exists, so the answers
are checked against the rows they were fitted to (`solves`), the pose is required to have full
column rank at the command in hand, and non-finite values are refused outright.

**A singular starting pose is still unsupported.** A drawing placed exactly on a toggle has no
rank there and no rates, and this route reports nothing rather than guessing; `settleInitialPose`
nudges a *commanded* drive off such a pose, and there is no equivalent for a boundary-driven one.

### These solvers are static, so a machine has to be put back on its own route

`Mechanism.prepareSolvers` exists because the last mechanism built owns `PositionSolver`'s
statics, and the panel graphs whichever machine the reader is looking at -- routinely not the
last one solved. `PositionSolverDriveState` is the list of what a machine can be put back on, and
it now carries `coupledRoute` and `sliderAngleMap` beside the drives and the constraint system.
Anything new the *rate* solver reads out of a static belongs in that struct; a machine standing
beside another one is the case that finds it, and a single-mechanism spec never will.

### The mount-attached examples are the only ones checked against arithmetic

`coupled-mount-examples.spec.ts` is the one file in the suite whose mechanisms the walk cannot
solve at all, so there is nothing to compare them with -- every joint of every sample is checked
against a closed form written beside the example instead. That is also what makes them fragile in
a particular way: a prediction is as likely to be wrong as the solver. Two that bit, both worth
remembering when adding one:

- **The pin is not carried by the barrel.** It slides inside it. Predict it from the *rod* -- the
  rod's own length back from whichever end of the rod is not the pin -- or the answer is out by
  exactly the drive's speed, which looks like a unit error and is not.
- **The drive has to be pinned as arithmetic first**, or the closed forms are restating the
  motion rather than predicting it. Each example asserts its command advances by one constant
  step per sample, changing sign only where the input reverses, before anything is derived from
  it.

`permuted()` in `coupled-mount-fixtures.ts` renames every joint and turns every list round --
joints, links, subsets, sliders. It cannot tell a weld's reference bar from its neighbor on a body
that only translates; `constraint-emitter.spec.ts` is where that lives.


### A body's angular acceleration is read off two joints, and the centripetal term cancels

`applyConstraintKinematics` gets `alpha` from `cross(r, a2 - a1)/|r|^2` and nothing else. It is
tempting to "take the centripetal term back out" first, because `a2 - a1 = alpha x r - omega^2 r`
looks like it has one -- but `r x r` is zero, so `omega^2 r` contributes nothing to the cross
product and subtracting it is a no-op at best. Written out and subtracted with one sign wrong it
was not a no-op: it added `2 omega^2 rx ry / |r|^2`, which is **exactly zero on a bar lying along
an axis** and wrong on every other bar. That is why it survived so long, and why a constant-speed
crank drawn at 30 degrees was the thing that finally showed it.

It reaches further than the graph of that link: `linkAccMap` builds the center of mass from
`alpha`, and the force analysis builds inertia terms from that. **Joint accelerations can be
exactly right while every body-level number is wrong**, so a spec that asserts joint rates only --
which `coupled-mount-examples` did -- proves less than it looks like it does.

### A sample with no answer has to take back the one before it

`KinematicsSolver`'s maps are written per sample and carry no sample number. Refusing to compute
is therefore not the same as reporting nothing: a refusal that simply returns leaves the previous
sample's velocities, angular rates and centers of mass in place, and the reader sees a plausible
curve where there should be a gap. `forgetRates` deletes this partition's own ids from every rate
map, seeds included -- a ground's zero is as much a claim about this sample as a solved velocity
is. Test it as success -> refusal -> success; a refusal on its own cannot tell a cleared map from
one that was never written.

### A difference step is a fraction of the mechanism, not a fixed number of units

`constraintRates` differentiates in time by central difference, and the step was `1e-4 / fastest`
-- an absolute displacement of a ten-thousandth of a unit. In model units, where a drawing is
about a thousand across, that is a relative perturbation of 1e-7 and the truncation error is
nothing. In a spec's own units, where the same drawing is five across, it is 2e-5 -- and at a size
of 0.01 the perturbation is a hundredth of the mechanism and the answer is wrong in its fifth
digit. It is now `1e-5 * span(...)`, the span being the bounding-box diagonal of the points the
constraints actually read.

**The bounding box, not the distance from the origin.** A one-unit mechanism drawn a million units
away is still a one-unit mechanism, and a step scaled to where it happens to sit would step clean
over it.

**And only the points the constraints read.** A prescribed joint no row mentions belongs in the
*output* and nowhere in the arithmetic -- but it was in the set `fastest` is taken from, so a fast
witness bolted to a slow mechanism shortened the step until the difference was noise. Adding a
point that appears in no equation must return bit-identical answers, which is what
`constraint-rate-scaling.spec.ts` asserts, at twelve decades of witness speed.

### A compound is a new object every time, and a slot names its carrier by reference

`splitCompoundAtRemainingWelds` rebuilds a compound whenever a weld is taken apart or a leaf is
removed from it, and `createNewCompoundLinkFromSubset` makes a **new `RealLink` with a new id**
from the surviving leaves. Anything holding the old one by reference is now holding something the
drawing has never heard of.

A floating slot does exactly that: `PrisJoint.carrier` is the link object. `reconcileSlots` used
to ask `rootLinkOwning(carrier)` and detach when the answer was nothing -- which is right for a
carrier that has genuinely gone and wrong for the usual case, where it is the same body under a
new name. Deleting one of two rams welded to a shared mount detached the *survivor's* sealed
slider, and a ram with no bore is drawn as a bare slide with nothing said. It now looks for the
live body holding the slot's own two joints first. Repair before you strip, which is what that
function's own comment always said.

### Removing a leaf from a compound is not the same as unwelding it

Two deletion paths reached into a compound by calling `unweldTopology` on the mount first, so the
member links became top-level again and could be filtered out. That works, and it silently
performs a second edit: a mount holding a bracket of two bars and a ram is one body of three, and
dissolving it to take one leaf out leaves the two bars merely pinned where they had been welded.

The right move is what `removeCompoundJoints` already did for a *joint*: take the leaves out and
rebuild whatever is still welded together (`releaseFromCompounds`). A weld left holding one thing
still comes off -- but that decision belongs to `reconcileAssemblyWelds`, which makes it once,
after the topology has settled.

### A hold lives on a leaf, and the URL only wrote the top level

`setHolds` filtered `mechanism.links`, and a weld swallows its members -- so a bar that held its
length or its angle went into a compound and came back out of the next save with no hold at all.
The encoder writes leaves too now, and `MechanismBuilder.getLinkByID` searches subsets, because
by the time a hold is resolved by name the bar is no longer in the top-level list. Anything else
addressed by link id from a URL has the same exposure; check it against a compound.

### A creation gesture is a structural edit, and all six ended in the wrong place

The six link-creation cases in `new-grid.component.ts`'s mouse-**down** path (the bar is committed
by the second click, not by a release) end at `finishStructuralEdit`, and any new creation path
belongs there too. `updateMechanism` alone runs `normalizeSealedCylinders` without
`reconcileSlots` or `reconcileAssemblyWelds` before it, so a bar drawn at a joint that was already
welded would leave the joint flagged welded with a loose bar beside it -- welded and pinned at
once, which the repair has an answer for and never gets to give.

### Building a welded mount in a test: the order is the only way in

Two public guards still refuse it and both are step 5's to lift -- `refuseJointMerge` returns
`'welded-mount'`, and `createCylinderFrom` refuses a `mountAt` that is welded, in the *mutation*
rather than only in the UI. So a fixture cannot weld first and attach after. Attach everything to
the mount while it is plain, then weld: same topology, no guard in the way. `toggleSlider` is
guarded too; `sliderTopology()` is the entry point underneath it.

### `determineDegreesOfFreedom()` answers NaN on a mechanism that failed

`setMechanismInvalid` clears the frames, so counting again afterwards finds `joints[0]` empty, no
ground in it, and returns NaN by the no-ground rule. Read `mechanism.dof` -- the number the build
settled on -- rather than recomputing. A spec that asserts a zero-mobility drawing counts zero
will otherwise be asserting the NaN guard instead.

### A welded ram is still a two-force member; a *loaded* bracket is what stops it

Welding a rod into a bracket changes what the body can transmit, not what it does. With nothing
hung on the bracket the assembly still meets the world at two pins, and equilibrium alone puts
both reactions on the line between them -- `cylinder-forces.spec.ts`'s property survives the weld.
Hang a load on the bracket and it does not, because the part is now carrying a moment. That is the
case the universal "replace a cylinder with a force along its mount line" wording is wrong about,
and `welded-mount-forces.spec.ts` asserts both halves so the qualification cannot be lost again.

### A welded mount is an ordinary joint now, and the refusals mean something narrower

Four bans came off in step 5 of `docs/cylinder-mount-joints-plan.md`: a cylinder mount could not be
welded, could not take a block, could not be merged onto by anything welded, and could not have a
ram created on it while welded. None of them was a rule about cylinders — they were a fence around
an unfinished path. What is sealed is the ram's **inside**: `barrelNear`, `pin`, `slider`. When
reaching for a cylinder rule, ask `cylinderInteriorsAt`, not `cylindersOfJointIn` — membership was
what made a mount refuse a block for a slider the ram keeps somewhere else entirely.

Two consequences that are easy to miss:

- **A lone mount still refuses a weld**, with `needs 2 links`. That is arithmetic — a weld fuses
  what meets at a joint and one bar does not meet — and a test that asserts "the ban is lifted" by
  welding a bare mount passes for the wrong reason. Give it a real neighbor first.
- **Asking for a state a joint is already in is a no-op, and a no-op is allowed.** The pin already
  carries the ram's block, so "add a slider" there returns `undefined`; it is *removing* it that is
  refused. Ask for the state the joint is not in — `sliderRefusal(joint, !isAttachedToSlider(joint))`
  — which is how the menu asks.

### A weld absorbs whatever you attach to it next

Attach a bar to a welded joint and it joins that joint's compound, because the weld says every body
meeting there is rigid. This is right, and it is also a shape trap when building a mechanism: a boom
pinned to a welded mount is not pinned, it is welded, and the mechanism loses the freedom you were
drawing. Hang it on the bracket's far joint instead.

`weldedBoomFixture` is written the other way — three bodies at the welded joint, only two of them in
the compound — because a *solver* fixture is a constraint set rather than a drawing, and that set is
coherent. `reconcileAssemblyWelds` would repair it into one body. Do not cite it as a drawing
somebody made.

### The rule and the ring have to be asked with the same facts

`refuseJointMerge` takes the resolved cylinders now, not a joint list. The live drop ring holds an
already-resolved set from its per-revision cache and a joint list too *filtered* to resolve one
from — the interior pins are gone from it — so passing the ingredients meant the mount rules
silently skipped the drag, and the ring grew a private copy of one of them. Passing the answer is
what lets the ring, the drag and the merge be the same function. A rule that has to be repeated
somewhere is a rule that will be repeated wrongly.

The group edit had the same shape of bug in the other direction: `MultiEditService.weldRefusal`
waved every *unweld* through, on the grounds that anything welded can be unwelded. A sealed pin is a
weld that never comes off, so the row was offered un-grayed and the mutation then declined it.
`weldRefusal(joint)` already asks about whichever way the joint would go; let it.

### `.find` is the wrong verb wherever a mount can be shared

A cylinder mount is an ordinary attachment point, so two rams can share one — one ram's rod mount
is the next one's barrel mount, which is how a boom and a stick are drawn. Four separate defects
have now come from asking for *the* cylinder at a joint:

- the own-cylinder merge guard compared the first ram found at each end, got two different rams,
  and let a fold through that collapsed one of them;
- the live drop ring excluded one ram's joints and offered the other's;
- `deleteJoint` removed one ram and left the other's interior joints hanging on nothing;
- and dragging a shared mount re-posed one ram parametrically and left the other to the normalizer.

`cylindersAt` / `cylinderInteriorsAt` / `cylinderMountsAt` are the plural forms and are what these
questions want. When you write `cylinders.find(...)`, say out loud why one answer is enough.

### A slot's carrier is found by two questions, not one

`reconcileSlots` recovers a carrier that has been rebuilt under a new id, and both halves of the
test are load-bearing — each was added after the other one alone got it wrong:

- **Continuity**: the candidate must own one of the old carrier's own members. A body that merely
  holds the slot's two end pins is not evidence; two separate bodies can share a pair of pins, and
  a slot cut into one was handed to the other when the first was deleted.
- **Capability**: the candidate must hold the slot's two ends. Taking the first surviving member's
  body hands a ram's bore to a bracket, which cannot define one — so the slider is detached and a
  ram loses its bore on nothing but the order of a `subset` array.

And the answer has to be unambiguous. Two surviving bodies that both qualify is a guess, not a
recovery; detach instead.

### A commit that writes before it refuses has already half-happened

`cutSlotOn` is the commit half of a slot drop. It checked only that the pin it was handed was
prismatic, then moved coordinates, then reassigned the carrier — so handed a sealed ram's interior
pin it pointed the bore's own block at a bar somewhere else in the drawing. Refusals in a commit
belong before the first write, not after it, and "may this joint gain a block" is not the same
question as "may this block's carrier be changed".

### The drawable example and the algebra fixture are different things

`coupled-mount-fixtures.ts` holds constraint sets handed straight to the solver; `weldedBoomFixture`
has three bodies at its welded joint and only two in the compound, which is coherent as a
constraint set and is *not* a drawing the editor would leave alone. `welded-mount-release.spec.ts`
is the other kind: built through the service so the reconcilers run, saved and reopened, and
checked for the same bodies, the same DOF and a bracket that stays rigid. Cite that one when
claiming the feature works; cite the fixtures when checking arithmetic.

### Four things that cost an afternoon while writing `e2e/cylinder-mount.mjs`

Building a fixture *through the service*, the way the canvas does, is the only honest way to write a
browser suite here — and four of the doors have a shape their names do not give away.

- **`animate(progress)` takes a sample index, not a fraction of the cycle.** It rounds and clamps to
  `masterMechanism().joints.length`, so `animate(0.35, false)` is `animate(0)` — the start pose,
  silently. A test that means "a third of the way round" has to ask the machine how many samples it
  has and name one. This is why "the mount really is somewhere else mid-cycle" is its own check in
  that suite rather than an assumption inside the paused-editing one.
- **A component that never reaches ground is not one of the partitions.** `partitionMechanisms` says
  so in as many words: no anchor, no solvable position, so it is reported as unassigned instead. A
  drawing of two floating pieces therefore has *zero* partitions, not two, and "a second machine on
  the same grid" needs a ground on each chain before the count means anything.
- **`toggleSlider()` leaves the slot dangling.** A fresh slot is neither anchored in the world nor
  riding a carrier, and a dangling slot is not solvable — the mechanism comes back `dof: 1` and
  `isMechanismValid(): false`, which reads like a solver bug and is not one. Ground it (`toggleGround`
  with the pin selected pins the direction it is already pointing) or give it a carrier.
- **A joint drawn below about y = 900 on a 1000px-tall viewport is under the playback bar.** The
  right-click meant for it lands on the bar, so the menu never opens and the failure is a locator
  timeout with nothing to read. Put fixture geometry in clear canvas rather than trusting that a
  `boundingBox()` came back.

### `filmstrip()` clears its directory, so one run gets one filmstrip

`filmstrip(page, dir)` starts with `rmSync(dir)`. Two filmstrips on the same directory therefore
destroy each other's frames -- the second one wipes the first's, and the only symptom is a
contact sheet that is missing the half you captured first. Make one at the top of the suite and
pass it around, or give each its own directory.

### A cylinder's cycle runs out and back, so its last sample is its first

A pin turns one way and comes back to where it started; a ram extends and then retracts. Both
are one cycle, but for a ram that means sample `n-1` is at the *same pose* as sample 0, and a
check that seeks to the last sample to see full extension sees the start pose instead and reads
as "the animation does nothing". Full extension is the sample furthest from the start -- scan for
it. (`animate()` also takes a sample index rather than a fraction; see above.)

### Two questions about a ram, and a body has to be asked the right one

`ownsMember` is deliberately recursive: "a compound that has itself been welded into something
larger still owns the member, and a delete or a drag that missed it would tear the ram it was
carrying." That is the right question for a **cascade**. It is the wrong one for **identity**, and
until a mount could be welded nothing could tell the two apart, because no compound ever held a
cylinder leaf.

`MechanismService.cylinderAt` is now the carrying question and `cylinderOfBar` the identity one,
and a body must be asked whichever it means:

- **Carrying** -- a delete, a copy, a body drag or swing, and `frozenCarriedJoints`. Missing a ram
  welded under a body tears it, so these stay recursive, and each of those sites says so.
- **Identity** -- everything that *names* a body, and everything that decides what kind of body it
  is: both panels, the context-menu builder's title and its delete row, the debug table, the
  analysis and export member lists, `bodyLabel`, `canDuplicate`, the lock mark, the CoM handle,
  the label ink, `isSelectedBody` and `isPointedAtBody`.

Asked the carrying question, a bracket welded to a rod mount opened the cylinder's panel, wore
"Cylinder AB · Barrel and rod" as its menu title, lit up when the ram beside it was chosen, and
offered a Delete Cylinder that took the ram and left the bracket standing -- while Delete on that
same selection took the whole body. It now reads "Edit Link A2BC", "Link A2BC · Compound", and
"Delete Link (and Cylinder, 3 joints)", which is what both routes actually do.

Note `MechanismService.cylinderOfLink` (via `link-holds.ts`) has *always* asked the identity
question, through a members map keyed by link id -- which is why holds were the one surface a
welded bracket never confused. It delegates to `cylinderOfBar` now, so there is one answer rather
than two names for it.

### The compound path drops a welded *rod* leaf and keeps a welded *barrel* leaf

`RealLink.getCompoundPathString` filters out `isSealedRodLeaf` -- a leaf recognized "through its
pin: the joint that shares a SliderBlock with a sealed slider". A **barrel** leaf has no such
joint (its two joints are the mount and the buried near end), so welding a bracket to a ram's
*barrel* mount leaves the barrel in the compound's union: it is drawn once by the compound, in the
bracket's color, and once by the cylinder skin over the top. With a random palette the two are
often near enough to hide it; recolor the two bodies and the barrel comes out painted the
bracket's color with a hard seam partway along the part. The rod case is clean, and the difference
is only which leaf the filter knows how to name.

The information needed to recognize the barrel is not reachable from the compound: after the weld
the leaf's joints list only the root in `links`, and the sealed `PrisJoint` -- which is the one
object that knows (`carrier` is the root, `slotJointA`/`slotJointB` are the leaf's two joints) --
is reachable only from the rod's pin, which a barrel-welded compound does not contain. So the
answer is *told* to the leaf instead: `RealLink.drawnByACylinderSkin`, set by
`MechanismService.tellEachBarWhoDrawsIt` wherever the sealed structures are resolved, which is the
one place it exists. It is cleared over the bars marked *last* time rather than over the drawing,
because deleting a ram takes its bars out of `links` before the next resolve runs, and a bar that
keeps the flag is a bar that stops drawing itself the moment it is welded into anything else.

### A ram's bore is a channel, and welding its barrel mount gave the channel to the bracket

`SliderMarkService.channels` walks every floating `PrisJoint` and emits a capsule for its carrier
-- the sealed one included. That never showed while the barrel was the carrier: a barrel is
skinned, so `linkPathWithChannels` returns `''` for it and the bore goes with it. Weld the barrel
mount and the carrier becomes the **compound**, which is not skinned, so the bore was appended to
the compound's outline as a second subpath -- and since it does not overlap the bracket, even-odd
filled it in rather than subtracting it: a capsule the length of the barrel, in the bracket's
color, laid over the part it is supposed to be inside. The plan asks for exactly this ("the
internal bore stays hidden even when its carrier root also contains a neighboring leaf with a
visible slot"), and the fix is one `if (joint.isSealed) continue;`.

Worth knowing while chasing this: the compound's `d` and what the canvas *draws* are two different
strings. `linkPathWithChannels` is `outlineWithMotor(link)` -- which is `link.d` plus any motor
bodies, cached per pose -- followed by `channelsCutInto(link)`. A discrepancy between
`getLinkProp(link, 'd')` and the element's `d` attribute is the channels, not the outline.

### The component gallery borrows the app's styles from `angular.json`

`npm run storybook` serves the BLOCKS gallery on port 6006; `npm run build-storybook` writes a
static copy to gitignored `storybook-static/`. That copy is what [docs.pmksplus.com](https://docs.pmksplus.com)
serves: the `pmksdocs` Netlify site, linked to this repository on `staging` with
`npm run build-storybook` as its build command and `storybook-static` as its publish directory,
so every merge to `staging` republishes it. Node comes from `.nvmrc` and the Playwright browser
download is skipped by `netlify.toml`, the same as the app sites. To publish a one-off build by
hand, `netlify deploy --prod --no-build --dir storybook-static --site <site id>` (the CLI wants the
id from `netlify sites:list`, not the name). `docs.pmksplus.com` is a `NETLIFY` record in the
`pmksplus.com` zone, created by attaching the domain to the site; the site's "built with Netlify"
badge is switched off in its settings, which new free-plan sites have on. The CLI leaves a
`.netlify/state.json` link file behind; it is gitignored. The Storybook builder only loads the global
stylesheets listed on its *own* target, so an unstyled gallery is the first thing you see if that
list drifts. `.storybook/main.ts` avoids the second list entirely: it reads `styles` and
`includePaths` from the app's `build` target in `angular.json` and prepends them to the preview.
Add a global stylesheet to the app's target, or `@use` it from `src/styles.scss` as the token file
is, and the gallery picks it up with no change.

Storybook 10 with `@analogjs/vite-plugin-angular` would not install on Angular 22.0 without
`--force`: the plugin's optional `@angular/localize` peer resolves to the newest 22.1, which demands
a matching `@angular/compiler-cli`. That is why Angular moved to 22.1 first. If a later Storybook
upgrade refuses the same way, keep Angular's minor in step rather than forcing the lock.

**The gallery runs the app's modules unbundled, and that is what found the import cycle.** Vite
serves each file as its own ES module in the order the graph demands, so a cycle esbuild quietly
tolerates -- `color-picker` → `mechanism.service` → `svg-grid.service` → `new-grid.component` →
`edit-panel` → `multi-edit-panel` → `color-picker` -- became `Cannot access 'ColorPickerComponent'
before initialization`, and every block that injects `MechanismService` rendered nothing. The
cause was three services importing components (`docs/code-style.md`, "A service never imports a
component"); the fix was three registries the components fill in. `node .storybook/tools/import-path.mjs
<from> <to>` (paths relative to `src/app`) prints the shortest import path between two files, which
is how to find the next one. `require()` fails the same way: the environment files used it for the version and now
import `package.json`.

**Three gallery traps.** Storybook's MDX does not render Markdown tables (a table comes out as raw
pipes); use a list, or the `Markdown` block, which does. That block turns an inline code span that
wraps a line into a source block inside a paragraph, which React logs as a nesting error on every
docs page that renders `docs/*.md` -- pass `options={{ overrides: { code: 'code' } }}`. And a
Playwright `goto` with `waitUntil: 'networkidle'` never returns on the notification story, because
the stack and the dev server's HMR socket keep the page busy; wait for `load` and a fixed pause.
`node .storybook/tools/sweep.mjs` (against a running gallery; `SB_URL` picks another port) visits
every entry in `index.json` and fails on a console error or an empty render; it is the check to run
after touching a block. `node .storybook/tools/token-usage.mjs` counts where each token is used,
least-used first, which is how to spot a shade nobody needed.

### A lazy `injector.get(...)` can outlive the injector it resolves from

A predicate or key handler registered
with a root service keeps running after the component that registered it is torn down, and a
service that resolves its dependencies on first *use* then reads a destroyed injector —
`NG0205`, seventy-two times, in a suite whose tests all passed. Two halves to the fix: resolve
eagerly where the ring allows it, and hand the predicate back on destroy
(`destroyRef.onDestroy`). `NewGridComponent`'s `whenArrowsNudge` is the example.

### `anyComponentStyle` is 6 kB warning / 10 kB error

Raised from 4/6 for the CAD Export dialog
— a whole screen of UI in one component, where the cap was written for panels. It is a global
cap with no per-component override, so the choice is one number for everything; 10 kB still
catches real bloat. `npm run build` is where you find out, and it fails the build rather than
warning.




### Rotate a ternary input body once, then carry its other points

The native/reference migration test found the teaching four-bar's tracer H drifting 0.00215
from its body near the end of a revolution. The old grounded-input ordering rotated B and H
independently, rounded each position to four decimals, and used each rounded angle as the next
step's start. Each radius stayed right while the angle between them changed. Additional points
on the driven body now use its rigid-tracer placement from one already-rotated direction.
The 0.001 reference-agreement ceiling then passes without changing any reference table.

Even the chosen crank direction accumulates a little phase rounding, so a comparison against
legacy samples must use the input coordinate actually stored in those points. A nominal degree
counter is a different command. Native/MATLAB comparisons use the published unwrapped input
angles instead and do not inherit this rounding.

### Native frame feasibility needs arithmetic precision, not a fraction of WORLD

A relative weld comparison at x=1e9 used to accept a 0.01 displacement because its tolerance
was 1e-10 times the transform's magnitude. Conversely, the factory's fixed absolute 1e-10
anchor tolerance refused a perfectly assembled million-unit four-bar after a rotation. Both
checks now account for the floating-point operands that produced the compared coordinates.
Include those operands when comparing a canceled transform: two large translations can leave
an almost-zero result whose own magnitude does not describe its rounding error. The native
frame tests keep distant weld cycles, tiny/large bodies, and rebased oblique mechanisms together
so fixing one side cannot silently break the other.


### A coincident pin has no span, and a zero rate still has arithmetic error

The native moving-boundary rate test put two revolute anchors at the same point, to within
floating-point rounding. Using that tiny difference as the whole mechanism's length made
its normalized position residual enormous and refused an assembled pin. Numerical scale
must account for the precision of the point calculation and the referenced moving-origin
lever arms; an absolute WORLD coordinate is not a lever arm. The native scale tests cover
rebased and very small/large mechanisms alongside this one-pin case.

A separate rate check rejected an oblique carriage because its mathematically zero angular
rate inherited tiny QR elimination error. Checking the residual only relative to that tiny
computed component is circular. Include a floating-point allowance scaled to the matrix and
solution, but no absolute one-unit floor: that floor would accept contradictory rates in a
slow mechanism. The native rate tests pair valid 1e-12 motion with conflicting 1e-12 versus
1.01e-12 commands so both sides stay covered.

### A one-pin rebasing error cannot supply its own numerical scale

The first native loaded-rod force test failed admission only after a material-frame rebase.
Both coincident anchors were near zero in the numerical frame, so a tolerance proportional to
their final coordinates could not recognize the earlier cancellation error. Their tiny gap
became the mechanism length and normalized itself to order one. Position scaling now uses
within-group anchor spans, guided axial separation and moving-origin lever arms. A revolute
anchor mismatch is a constraint error, never a physical length. The one-pin fallback remains
one SI unit when the equations have no physical length at all. Keep the rebased force fixture
beside the very small/large and distant-world position tests when changing this scale.

Shared-support force output is also a policy, not proof of uniqueness. The native equilibrium
result labels the evenest split explicitly and leaves condensed internal reactions unavailable.
A nullspace pivot answer must never appear as a unique reaction, and a zero column inside a
weld group must never become a displayed zero because the external supports use that policy.

### A condensed pin can still make a weld reaction indeterminate

A weld group already moves rigidly, so an extra internal R joint may have zero group Jacobian.
Dropping it from member force recovery nevertheless changes the answer: it can share the
same reaction force with the weld. The native recovery step restores every internal R/P/slot
row to its original material pair. A weld cycle stays indeterminate, but a bridge from that
cycle to a loaded leaf remains recoverable. Moment channels are solved about one common
origin, then transported to the named material origin; “equal and opposite” moments at two
different origins is not a valid check.

The two-stage group/member force calculation also needs the scale of the terms before they
cancel. A loaded four-bar with an unloaded welded leaf left only floating-point error after
subtracting its known pin reactions; comparing that error to itself refused a zero-force
weld. Recovery carries the contributing load/reaction magnitudes for an epsilon-sized
arithmetic allowance. It does not use an absolute load floor: the same test adds 1e-10 N of
real imbalance and must still refuse.

### A material frame need not be welded to WORLD

The first native two-clock force probe put both cranks on a bar pinned to WORLD at two
distinct points. Treating only WORLD weld groups as fixed merged the machines and refused
their two inputs. Derived fixedness now also follows consistent, full-rank passive relations
to already-fixed neighbors; it propagates without merging material or weld IDs. Exclude
driver rows, retain all fixed constraints for admission, and do not infer fixedness from a
zero instantaneous velocity in a moving mechanism. Two coincident pins still allow rotation.

The force consequence is just as important: a moving partition owns its reaction on that
frame, not all the frame's ground supports. Those need the complete clock context and the
frame's own loads. A valid force sample from the first crank is not evidence of the total
support load. Keep different-clock sample identities and `frame-context` availability visible
until the complete fixed-frame result has actually been assembled.

The native fixed-force producer now accepts every needed clock explicitly. Its gravity and
mode must match those stamped on the moving samples. Feed reactions into the material load
calculation as SI wrenches at material origins, not as new persisted loads or already-summed
group loads: premature summation loses both ownership and cancellation provenance. A fixed
member's own inertia is zero even in a dynamic context; its attached machines' dynamic
reactions are not zero. This lets an inertia-only group override coexist with a valid fixed
support result while retaining genuine gravity/load-distribution refusals.

Fixed **force** components exclude WORLD as an intermediate material connection. Two
independent WORLD-welded brackets must not require each other's clocks, even if their pins
share one visible point. A real joint between the brackets does join their force contexts.
The simulation consumer should call `solveFixedForceComponents`; the all-fixed diagnostic
wrapper deliberately cannot provide this per-component availability.

Large-coordinate fixed forces exposed two precision losses. Refer the equilibrium matrix to
nearby material, and reconstruct its CoM from local geometry before applying its override.
Moving the numerical origin after a small offset was already rounded into a cached WORLD CoM
cannot restore that offset. The fixed-bracket probe at 1e9 needs both corrections; its local
hand answer and its tolerance remain the same at the origin and far away.


**A body can be still for one instant without being part of the frame.** Native fixed-group
compilation now recognizes regular rigid sets of several bodies, but a zero component in the
passive nullspace is only a candidate. Remove moving neighbors and their rows, then require
consistent full-column-rank constraints on the retained set. Otherwise a four-bar rocker at
its turning point gets frozen, even when its pins belong to a valid rigid triangle foundation.
Keep the single-body propagation first so an inconsistent attached branch cannot hide a frame
that is independently proved fixed. `collective-fixed-groups.spec.ts` covers both traps.


**An endpoint pass is not a safe playback interval.** The cosine carriage fixture has two
safe endpoints with a stop excursion between them. Native playback must use
`inspectBodyInterval`, not expose `advanceBodyCommand` directly as a cycle step. Keep the
outside crossing probes private. Near a shallow stop, ordinary pose residuals can create a
much larger command error; event probes polish more tightly without changing the default
position tolerance. At a geometric input fold, use the regular passive curve's oriented
slope for stop detection, never publish it as a velocity at reversal. Reuse accepted poses
for a retrace so a singular endpoint does not have to pass singular-start admission again.


### A moving boundary's material origin can disappear during numerical compilation

For the native rotating-carrier cylinder example, an offset artwork origin was not enough
to exercise boundary linear acceleration. `solverGroupFrames` centers numerical origins
on referenced connection anchors; the carrier's pivot and slot originally used the same
anchor, so its numerical origin became the fixed pivot. The companion fixture now gives
these two connections distinct points along the same carrier axis. Their mean rotates,
and the test checks the **linear** acceleration projection into the rows, separately from
angular acceleration. See `native-cylinder-boundary.spec.ts`. Supply the prescribed hand
pose as well as its derivatives; retaining a separately rounded solved boundary pose mixes
two samples. Neither a nonzero material CoM acceleration nor a nonzero angular command
alone proves the moving-boundary acceleration term is tested.

### A fold's arc correction must be as accurate as the event probes that consume it

Native fold localization uses a regular passive curve when its scalar input reaches an
extremum. A 1e-11 arc residual could report a span about 5e-12 past the actual minimum;
the interval's 1e-13 Newton polish then refused a midpoint between two apparently accepted
commands. Enumeration changed whether it happened. `body-fold-order.spec.ts` permutes
all six moving-body and 24 joint-row orders on both roots of an oblique cylinder mount.
Arc correction now uses the event precision. A bound on the driver itself stays affine in
the command even at a fold; it does not need the tiny geometric enclosure reserved for
passive coordinates. Neither change turns exhausted computation into a claimed limit.


### A small input step can skip two real reversals

The native `x(theta)=cot(theta)+r sin(theta)` carriage has two nearby extrema for r just
above 3sqrt(3)/2. Newton can accept an endpoint beyond both, and even fixed passive-arc
steps can miss the small reversed interval. `body-fold-pair.spec.ts` keeps that actual
mechanism with a scalar hand-derived first stop. Use adaptive curve evidence before
accepting the endpoint; a Hermite hint requests refinement but does not prove a stop.
Never let an exhausted arc search mean the interval was clear. Keep the admitted length
scale as a floor during refinement, or a lone P's halved command also halves its scale,
leaving the normalized search distance unchanged.

A fold exactly on a requested sample is also a stop. Separately, a passive stop just before
it can require more refinement after the command bracket looks tiny: coordinate residual,
not command width alone, decides whether the retained inside pose is accurate. Published
native cycle/window samples intentionally omit continuation tangents; physical rates must
come from the availability-aware derivative result, especially at reversals.


### Native pin deletion distinguishes lost material from removed connections

`body-pin-lifecycle.ts` preserves a shared pin through a deleted material hub. Remove explicitly
deleted edges from the original connectivity graph **before** collapsing that hub, or a batch
that removes a hub and a connection will quietly recreate the connection. Changing a joint
away from the pin also disconnects that edge. An unweld at the same world point reuses the
existing attachment IDs; duplicating those anchors loses bundle identity without moving a pixel.

Native group lineage retains source material records. Validate newly supplied annotations even
if their members do not describe a real group; dropping them is data loss disguised as repair.
Zero mass does not imply zero contribution when the member has custom nonzero inertia. A
custom aggregate cannot survive that member's deletion without an explicit reset decision.

Playback/selection changes in `BodyDocumentAuthority` snapshot local state only. Cloning the
whole document on every clock update would change its identity on every tick and invalidate
caches despite unchanged authored data. Shared URLs never include those local clocks/selections.


### A structurally typed point can carry a pose's extra fields into a strict document

TypeScript accepts a `Pose` wherever a `Point` is required. Spreading it into an attachment
also copies `angle`, which the native codec correctly rejects as an unknown point field.
`BodyFactory` now captures the declared point/pose/vertex fields explicitly. The linear-carriage
save/reopen test exposed this; do not weaken the codec's unknown-field check to accommodate it.

Generated synthesis ownership is authored state, including its partial flag and original
placement baseline. Deletion can prune IDs that existed and were deleted; it cannot prune
arbitrary invalid IDs out of a newly supplied design and then claim the batch was valid.


### Recomputing a force result does not reset the mechanism's clock

The native edit effect list contains all changed records. Using that list directly to reset
clocks made a paused mass edit start the machine over. `bodyMotionRecord` retains only data
that changes the motion's parameterization/geometry. Loads, mass, paint, traces and edit marks
can invalidate analysis or drawing caches while preserving the exact input command and time.
`body-property-edit.spec.ts` catches the reset by editing a crank at a nonzero command.

A zero-magnitude force still has an arrow direction. When its vector becomes zero, retain the
previous heading as presentation metadata in the same reference axes; otherwise making a
locked force zero silently swings its handle toward +X. Changing axes or material ownership
must preserve world load direction, not reinterpret the same two vector components.

A deleted CoM editing anchor falls back only if it was the center's existing reference before
the transaction. Pruning every missing anchor can hide a newly supplied reference to the wrong
material when that material is deleted in the same batch. The aggregate and member checks
share the reference policy; neither changes the physical body-local center during simulation.


### A custom center's editing frame must survive a change in the longest diagonal

The native geometry editor stores the named vertex pair for a body-relative custom center in
`editAxis`. Choosing the longest pair afresh after each deformation passes a two-pin bar test
but changes a polygon's frame halfway through editing it. `body-geometry-properties.spec.ts`
stretches a triangle until another pair is longer, saves/reopens, then turns the original pair
and checks the centroid offset by hand. Array order never chooses the reference. Removing its
vertices rebases the center in place; copy must remap the pair along with vertex identities.

Deleting a CoM's attachment reference and turning its body in one edit is another ordering
trap. Map the retained world point through the old/new body frames before falling back to the
body anchor. Falling back first makes the center ride the turn and loses the reference that
explained why it should have stayed on the grid. This is editing policy only: playback always
transports the resulting stored body-local center rigidly.


### A held bar must carry its off-axis material when its endpoint moves

The native point-edit solver initially satisfied a held endpoint distance by changing local
vertices while leaving an unbound witness behind. Endpoint-only assertions cannot see that
distortion. A length hold between a bar's two actual bound vertices makes its material move
rigidly; a hold between unrelated unbound attachments does not freeze the underlying shape.
`body-point-edit.spec.ts` checks the witness against hand rotation, and removing the rigid
classification makes those assertions fail. Keep a separate unbound-point derivative fixture:
otherwise rigidifying the bar makes its length row identically constant and silently removes
the intended local-geometry Jacobian coverage.

An antipodal pointer target on a held circle has zero tangent slope at the farthest point.
A small Newton correction is not sufficient evidence of the nearest allowed pose. Probe for
an improving feasible direction before accepting a stationary projected point. A typed exact
coordinate must still pass an exact correction even if projection supplies the starting guess.

Grounding an attachment does not lock its authored grid position. The existing grid editor
allows an explicitly requested ground pin to move; it holds only the unrequested ground pins.
The native point command follows that distinction without permitting a mutable WORLD pose.


### A displayed frame and an authored frame answer different force questions

At a paused sample, switching a force between body and world axes must preserve what is on
screen. Converting through the body's authored angle preserves a different load. The native
posed-property tests use a rod authored at 0.4 radians but displayed at 1 radian, and a second
independently translating material owner. Both locked arrow ends must stay in place through
axis/owner changes. The resulting local force record belongs in the authored document; its
displayed body pose does not. A zero force still carries its direction through the same map.

A free tracer is similar: its world pointer target maps through the displayed body transform,
but changing that local point does not change the machine's motion clock. Treating every
attachment edit as a clock reset made a valid posed tracer edit jump from command 0.6 to zero.
`body-posed-property-edit.spec.ts` checks the local point by hand and keeps both clocks through
Undo/Redo. `body-edit-frame.spec.ts` adds a ram's return leg, where matching positions alone
cannot identify the sample: direction and time are local state too.


### One blocked route does not make an angular anchor unreachable

After enlarging a crank, a passive carriage stop can lie between its current angle and its old
starting angle while both poses remain valid. `body-anchor-alternative.spec.ts` uses the hand
relation y=r sin(theta): radius 0.8 becomes 1, the upper guide stop is y=0.95, and theta=2.8 can
still reach theta=0.4 around the other side of the rotation. Direct backward continuation stops
at the forbidden sine peak, so it cannot justify resetting the anchor. A completed rebuilt
cycle supplies the alternate route. Adding an input limit that also closes the alternate route
makes the reset justified. Do not substitute a numerical refusal for either physical proof.

When that cycle names the same displayed angle on another turn, the material angles must use
the same turn as its command. Wrapping each material independently breaks P angle rows and
newly inserted members without an old angle seed. `body-anchor-turns.spec.ts` includes a floating
carrier, a welded barrel and its rod. `body-anchor-clock.spec.ts` checks that a nonlooping window
cannot claim a positive elapsed time across a passive stop merely because both endpoints fit.


### Reversing a drive reverses the selected leg, not just the stored speed

A returning cylinder can occupy the same pose twice in a cycle. When speed changes from +0.2
to -0.4, looking up that pose with its old negative direction produces a plausible time but
keeps it returning. `body-drive-edit.spec.ts` starts at travel 1.3 on the return from 1.5, with
anchor 0.4 and lower stop 0. The new negative-speed cycle reaches that pose going outward at
(0.4+1.3)/0.4 seconds. Carry coordinate-order reversal separately: negating both the coordinate
and its speed is only a different representation, and must not reverse physical motion.

An input resuming from zero speed has no previous motion leg. Its new signed speed chooses
the direction, even when another machine keeps the drawing globally away from the start.
The same spec verifies both new directions and preserves the other machine's clock.


### Unit conversion must reach fixed clocks and marker lengths too

A native drive on a fully fixed P can have a clock even though it has no moving partition.
Scaling only invalidated partitions converted its profile to centimeters but left the clock
in meters. Convert travel clock values explicitly, then ask whether the batch also changed
physical motion. Density scales by mass/length²; stored inertia has its own unit factor and
cannot be inferred from mass×length² (the centimeter convention uses grams and kg·cm²).

Object scale is a marker length in document units. Scale it with camera span so a conversion
keeps the marks the same size on screen; never use it for cylinder stroke or other physics.
An incognito legacy-UI check exposed a related display trap: 0.27 cm rounded to 0.00 m in
Object Size, and a coverage warning appeared despite unchanged screen size. The native S5
settings checks must use readable nonzero precision and actual settled screen coverage.


### Copying changes IDs, not the member that supplies a group's appearance

A copy of eleven materials exposed an ordering trap: IDs ending in body:10 sort before
body:2. The copied weld group then displayed a different member's name and paint, even
though every member record had been copied correctly. Capture a complete group's current
presentation before remapping identities; keep the leaves' own presentation for later
unwelds. A one-member group can still carry a custom mass/CoM override and must not be filtered
out as if it had no annotation.

WORLD is another identity boundary. Grounded copies share the same derived WORLD weld group,
so inserting a second partial group annotation creates an invalid drawing. Let the existing
presentation lineage govern that shared group, and refuse ambiguous aggregate mass copying.
The copied ground attachment itself must get a new ID and translated point; recompute a
WORLD weld's rest transform in either A/B order.

A new fixed member can invalidate an existing machine's analysis without changing its
motion. Rebuilding its old anchor nevertheless perturbed an otherwise exact return-leg
clock. The native edit path now compares the machine's actual material, incident connections,
referenced boundary points, drives and limits before doing that work. A displayed copy starts
at the captured pose; its untouched source keeps its original authored pose and clock.


### Clipboard storage units and paste placement units are different

A native clipboard is a minimal validated drawing with its own units. Convert its stored
material, mass, inertia and loads into the destination units before adding the pointer's
placement offset. Copying the source settings as well would silently change the destination
project. Capture the accepted displayed pose, not the authored anchor, and keep the resulting
payload immutable so deleting or seeking the source cannot change a later paste.

A complete WORLD-welded aggregate can travel in that isolated clipboard. Joining it to an
existing zero-mass support is harmless only if the support also has zero inertia and no
custom aggregate of its own. The first paste gate refused that valid case. Its retained CoM
must be transformed into the destination group's frame; copying its two local numbers into
a differently placed frame changes the physical center. Keep the hand world-position test
beside the nonzero-inertia refusal rather than testing only that a mass field survived.


### A paused analysis view still shows edit locks

`locking.mjs` used to expect lock marks to disappear whenever Edit was left. That assertion
survived the cross-mode editing change in `7ec4721`, even though `lockVisualsOn` and the project
guidance already said every paused mode shows them. Test the actual state boundary: paused
Edit/Kinematic/Force Analysis retain the same locks and badges; Play hides their marks while
simulation still moves; Pause restores the marks without clearing stored locks. The locking
suite now captures those transitions and a moving cycle. Keep the capture wide enough for
the entire path: a crop that fits the starting pose can hide the rocker's later motion.


### A coordinate edit can change only the paused view

Moving a returning ram from travel 1.3 to 0.8 can recover exactly the original authored start
at 0.4. Looking only at document effects then calls the operation a no-op and discards its new
pose and clock. Native posed planning also compares the resulting display and local clocks;
that change belongs to one Undo entry even when no authored record changed.

A legal endpoint can hide a passive stop: the cosine-carriage fixture starts at angle -0.025
and ends at +0.075, both below x=0.99999, but passes x=1 in between. Exact coordinate edits need
interior extrema checks, including loose sketches with an additional freely pinned member.
Regular mechanisms reuse the motion kernel's fold and interval search rather than treating
small Newton corrections as proof that a physical interval was clear.

### Rebuilding a rocker changes its sampled track range

The paused-editing browser gate compared the old normalized scrub fraction with the fraction
after “Move the start here” rebuilt the motion. The isolated reference-app probe retained every
joint exactly but changed that fraction from 848 to 851. Compare the actual displayed input
angle and joint positions across the promotion, then compare the anchor and seat against the
new track. Keep the rendered pixel check; allowing a different sampled fraction is not a reason
to accept a moved drawing or a marker at the wrong position. `posed-editing.mjs` also captures
intermediate drag frames instead of asking before/after screenshots to prove the gesture.

### A guide's drawing origin is not an attachment to move

An authored guide can use a material vertex or a traced/locked attachment as the origin of
its artwork. Turning its axis by moving that attachment would also reshape the body or move
another connection. Re-express the artwork's offset about the physical guide origin, preserve
both its axial station and normal offset, and rotate that metadata instead. Discarding the
normal component silently changes previously valid artwork. Those distances scale with
units; they are neither physical coordinates nor travel limits. Internal cylinder P artwork
uses a station at the barrel mouth, independent of extension and symbol size.

Changing a guide's heading also changes its constraint set. Two guides on one carriage may
need one simultaneous batch: changing either alone can be inconsistent. Keep the physical
carrier and its welded material fixed during this edit, preserve signed travel, and move the
connected material rigidly. On a paused drawing, explicitly transport that travel anchor to
the authored new axis; otherwise one P order can reset its start while the reversed order
retains it. This mapping is authorized by the typed axis command, not by any arbitrary edit
that happens to alter a joint frame.

### Rewinding does not reselect a link

A live incognito check selected AB, paused it at 23°, then returned to the 80° start. The
canvas and transport returned, but the selected Angle field still read 23° until Undo. The
legacy panel patched link fields on selection and edits only. It now refreshes pose-dependent
link/cylinder values when `poseRevision` changes; polling every change-detection pass would
instead erase unfinished typing. `link-pose-readout.mjs` keeps the seek/play/pause/rewind/Undo
sequence and the typing check, and records a full-cycle filmstrip. Wait for the existing rewind
animation to settle before starting playback; pressing Play during that transition lets the
pending rewind stop it again. Fit full motion before filming the full cycle, not just the
starting pose. Native cutover must keep these same readout and typing invariants.

### Lengthening a free fabrication should not turn it

The first native cylinder dimension solve held the barrel attachment and internal extension,
but its least-motion answer rotated the whole floating cylinder slightly. A welded bracket's
off-axis geometry shifted the numerical group center, making that turn cheaper than a purely
axial move. Prefer the captured heading if it satisfies the new shape's connections; if a
real connection requires rotation, solve those constraints without that preference. A vertical
external slot supplies the independent check: its fixed x coordinate and the new span determine
the positive square-root y coordinate. Keeping heading unconditionally would refuse that valid
resize. Keeping neither heading nor the attachment would make an ordinary loose cylinder drift.

Resize each member around its outer material attachment. Moving the rod's inner end locally
preserves a bracket welded to its outer end without changing the weld rest or rebuilding either
body. The internal P origins and barrel-mouth drawing station change with those dimensions.
Locks during this solve must compare against the original point locations, not the reshaped
candidate's zero-correction positions; the latter would quietly move a lock's reference.


### Native import and draft gestures (S4)

A compound load's reference BodyId is not a material ownership decision. If partial deletion
removes that reference leaf, test the complete frozen scope before automatically deleting the
force. Otherwise choosing a different reference frame changes whether the same load survives.
The native production-import test reproduces this with the frozen 2.0.3 compound load.

Native codec ordering is canonical. Lifecycle tests should compare retained records by ID
(or canonical encodings), not compare pre-save array order against post-load arrays. The
schema also distinguishes a geometry vertex `{id,x,y}` from a point `{x,y}`; reusing the former
as a circle center is refused, even when the TypeScript structural type permits it.

Native gestures are private drafts until `finishGesture`; do not publish `advance` previews
through the document service or send each pointer event into Undo. They capture revision,
displayed pose and clocks, retain a bounded continuation, and reject a foreign editor token.
S5 must keep its visual draft separate and coalesce pointer events; S4 does not wire a DOM
pointer handler. Production import deliberately excludes unreleased staging extensions.

### Native commands and final editing references

Native generated IDs derive from the command ID. Allocate a fresh UUID for each new committed
action, and keep that ID while previewing and committing the same action. To commit a shown
paste, pass its plan to `NativeBodyDocumentService.commit`; `paste()` deliberately starts a new
action and allocates new IDs. Reusing a committed command ID fails duplicate-ID validation
atomically; it is not an idempotent retry protocol.

Resolve both material and group center edit anchors before a delete removes their final
placement. An attachment anchor contributes its displacement before falling back to the body;
it must not become grid-fixed merely because its attachment was deleted in the same command.
An unchanged frame needs no coordinate round trip. Likewise, restore unchanged world-angle
holds from their authored records when returning from a paused frame: subtracting the display
rotation numerically can invent an edit to an unrelated machine by one ulp. F3 follow-up probes
cover both failures. Removing the last input at a paused pose still emits an anchor notice;
there is no surviving driver over which the ordinary reset loop can iterate.
