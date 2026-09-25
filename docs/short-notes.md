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
directly, and a joint's type is four of them wrapped into two columns (`wrap`, with `icons`). The
pill under the chosen option is positioned by measuring that option (`--thumb-left`,
`--thumb-top`, `--thumb-width`, `--thumb-height`), so options may be as wide as their labels
(`[fill]="false"` at the end of a settings row), share the width equally (the default in a panel),
or sit on a second row. A `selected` of -1 chooses nothing, for a group whose parts disagree. Its
buttons carry the plain button role and `aria-pressed`, which is what the suites find them by, and
a grayed option's `reasons` hang on its `.cell` wrapper: a disabled button takes no pointer events,
so a tooltip on the button itself would never open.

### `finishStructuralEdit` puts the selection back on what the reader selected

`toggleSlider()` takes no joint: it reads `activeObjService.selectedJoint`. A service that points
the selection at a joint to drive it -- `MultiEditService.eachJoint`, `JointTypeService.set` --
has to point it again before every such edit rather than once, because each structural edit ends
in `finishStructuralEdit`, whose `reconcilePartSelection` sets `selectedJoint` back to the part
selection. Welded to Pin-in-slot is an unweld and then a block, and with the selection pointed only
once, the block landed on whichever joint the reader had selected (`joint-type.service.spec.ts`).

### Once welded, a joint's bars are one link

`weldJointTopology` fuses the bars at a joint into one compound `RealLink` and leaves the sliding
block out of it, so `joint.links.length` on a welded joint counts the compound once. A rule that
asks whether a weld has two links to fuse, put to a joint *already* welded, has to count the
compound's pieces instead: `weldOutlivesBlock` in `model/joint-operation-permission.ts` does, and
counting links refused Prismatic to Welded on a pin between two bars, whose weld the block's
leaving keeps. A Slide on one bar has no compound -- its weld is the bar held to the block -- and
`reconcileAssemblyWelds` strips that weld when the block goes.

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
a row sits finding it gone. Every row is permanent now (`jointAttachRows` and `jointStateRows` in
`context-menu-builder.service.ts`), and the refusals quote `weldRefusal`,
`describeActuatorRefusal` and the rest rather than restating them.

Those two rows are a choice at the top of the card now (`MenuChoice` in `menu-model.ts`): a joint's
four types, each with its own refusal. Its cells are `cdkMenuItemRadio` items rather than the
`segmented-block` the panel draws, because inside a CDK menu the arrow keys reach nothing but a
`cdkMenuItem` -- so the two share the look through the mixins in `segmented.look.scss` and nothing
else.

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

### `diagnoseMobility` counts every fix it offers, and a fix can still be wrong

`free-motion.ts` names what is loose by holding the input still (`holdTurn` / `holdSlide` in
`mobility.ts`) and looking for motion that is left, and offers an edit only when counting the
edited drawing comes back at one freedom as drawn and none with the input held. Four things
about that surprised the first version:

- **The advice it replaced was wrong on its own spec's drawing.** "Ground another joint" on the
  open chain A-B-C grounded at A grounds C and leaves a rigid pair, not a mechanism. No single
  ground fixes a dangling link; a link from its free end to a new ground does, and that is the one
  piece of advice that cannot be counted (the link does not exist yet), so it is said as advice.
- **Ungrounding has to assign the bodies again.** A bar pinned down at both ends is folded into
  the frame by `assignBodies`, and removing the world from one joint's `bodiesAt` leaves it
  frame. `assignBodies` takes a `groundedAt` override for exactly this. And when the *driven*
  joint is on such a bar, the partition does not count it as the machine's own joint at all, so
  there is no input to hold -- which is how "delete the coupler" once passed as a fix.
- **"Leaves one freedom" is not "fixes the mechanism".** Deleting a slider-crank's rod leaves the
  crank turning on its own; deleting a four-bar's coupler does the same. A deletion is offered only
  for a brace: every joint it meets keeps two links, or one and the ground (`staysHeld`). The
  driven joint is never ungrounded, and an edit that leaves the input nothing to drive is refused.
- **One freedom in total can be two machines.** Ground anchors without joining, so grounding a
  joint in the middle of a chain cuts it in two, and the partition then builds a machine that runs
  and a rigid piece that is a machine of its own at 0 degrees of freedom. The sum is one; the app
  shows two rows, one of them broken. So every edit is checked with `staysOnePiece`, which unions
  bodies the way `partitionMechanisms` does, before it is counted. Pinning each body to the world
  where it stood (the first version) got the count right and missed the split.

`mobility-diagnosis.spec.ts` builds each fix for real and asks the solver's count too, so the two
counts cannot drift apart; the drawings are in the fixture gallery (`MOBILITY_GALLERY`).
`mobility-diagnosis-sweep.spec.ts` does it to every library template broken one edit at a time --
about 900 drawings and 430 offered fixes -- and is where the split above was found.

### "A dead position" was also said of an input that cannot move at all

A four-bar with a bar across it counts zero; a link left hanging off it counts one. The total reads
one, Gruebler and the geometry agree, and the solver cannot take a step -- so `Mechanism` called it
a dead position and the drawer said to drag a joint off the limit. No drag frees it. `stuckInput`
in `free-motion.ts` tells the two apart: take the bodies that do not move in any freedom the drawing
has, find the group the input's body is in, and count that group's freedoms with nothing else
attached. Zero is a stuck input; a rocker at the end of its swing is still for an instant too, but
on its own it turns. The fixes are counted on that group alone (deleting a link that is not the
input's own, ungrounding, Pin-in-slot), since the freedom that dangles elsewhere is the next
problem, not this one.

Not every other "dead position" was one either. With the input moved to a different joint,
several library templates could not be started by the joint-by-joint walk, and that failure looked
exactly like a dead position. The simultaneous route solves them (Scissor_Lift at A and S,
Hood_Hinge at A, Slotted_Tool_Drive at E, Cylinder_Boom at G, Aircraft_Landing_Gear at I). So
`Mechanism.solveWholeInstead` asks it once, by setting `PositionSolver.forceCoupledRoute` for
one re-solve, when the walk cannot take a first step. If that fails too, the walk runs again, so
the failure and the solver's statics (`unsolvableJoints` among them) stay the walk's own.
`scotch-yoke.spec.ts` checks exactly that on the swinging block.

The two halves depend on each other. "Drag joint B a little" is said only where the geometry calls
it a limit: held still, the input keeps a freedom to first order that dies at the second
(`inputStart` in the diagnosis). Even then it only became true once the fallback existed. On the
Scotch yoke driven from its yoke, a drag that clears the dead center leaves the walk still unable
to start from a slider there, and the simultaneous route is what runs it. Where the input is clear
of any limit and neither route starts, the drawer says the solver cannot start it rather than
sending anyone to drag.

### A frame bar drawn at the input's pivot made the input "join 3 bodies"

Students draw the frame of a four-bar as a bar between its two pivots, the way a textbook does.
`assignBodies` has always folded such a bar into the world, but `incidentBodies` in `actuator.ts`
counted it as a body of its own, so the crank's pivot "joined 3 bodies" and its input was refused.
`isFrameBar` is now asked there, and `framePieceAt` became "every link on this pin is frame".
`PositionSolver.drivenBody` asked for the input pivot's *first* link, which would have driven the
frame bar if it was drawn first; it asks the actuator record now.

### `student-mistakes.spec.ts` follows the drawer's own advice, and its report is the point

It draws a few hundred small mechanisms (four-bar, one with a coupler point, one with a bent
coupler, slider-crank, Scotch yoke, Watt and Stephenson six-bars; ten links at most), makes one or two mistakes a student makes with a
click, and follows the first blocker's advice (`follow-advice.ts`) until the drawing runs or the
sentence names no edit. `artifacts/student-mistakes/summary.md` says, per mistake, how often the
advice ends in a drawing that runs and in the one that was meant, and quotes every sentence that
names no edit. That list is where each new message in `mobility-sentences.ts` came from.
Three things the harness had to get right before its numbers meant anything:

- **Scale.** Fixtures are written in the units a reader types; the app draws at `MODEL_SCALE`. The
  mobility count does not care, but the solver does: a slider input steps a fixed tenth of a unit
  in model units, which on an unscaled drawing is longer than the crank. "The solver cannot start
  a slider-crank from its piston" was this, not the app. `readDrawing` scales before it builds.
- **Welds are compounds.** A weld in the app merges the two links into one `RealLink` with a
  `subset`; the `welds` flag alone only marks the joint. And an unweld splits the compound at the
  remaining welds (`unweldJointTopology`), so a compound welded at two joints comes apart into a
  pair and a single, not three singles.
- **A member can hold a stale joint.** Leaves of a compound can keep the joint object a slider
  replaced; `unweldedAt` matches a leaf's joints by letter.
- **So could a slot.** `buildMechanism` binds a slot's two ends when its own slider is made, so a
  slot whose end became a slider later in the list named the discarded pin: a Scotch yoke whose
  yoke rides a rail, with the crank pin's slot cut from the rail's joint, solved against a slot end
  that never moved, and "the motion never repeats ... 0.00 units away" came from that. The builder
  rebinds every slot once all joints exist now, as the app's reader always did.

### A fix that joins two machines has to be counted on both

Grounding a moving joint, dropping a joint beside another, and deleting a link all split one
linkage into several machines, and each machine's diagnosis sees only its own partition. So the
readiness helpers carry `drawing()`, and three fixes count across machines: a merge said from
`besideAnother`, `ungroundAcross` (the union of every machine a grounded joint holds, reached
through pins *and slots*, with the frame bars each half is solved against), and `reconnectFixes`
(a free end and the pivot its deleted link left behind). A local unground of a pin another
machine also hangs from is not offered at all: it counts right for the half it can see.

### When two fixes both count, list them all rather than guess

The student-mistakes sweep knows which edit was the mistake. Where the drawer had more than one
counted fix, putting the first-counted one first matched the mistake's undo in 22 of 38 steps, and
ranking by the newest joint letter in 25. Ranking by "undo the last edit" from the history would
match more often, and would be the wrong design: a reader who wants the drawing back as it was
presses Undo. What they want from the drawer is the way forward they meant, and the drawing cannot
say which that is. So a check with more than one way out carries `ways` -- each an instruction and
its own Go To -- and the drawer lists them (`resolution` in `mobility-sentences.ts`). The meant fix
is on the list in 34 of 38. A link left hanging gets "Delete link BC" and "Attach a link from joint
C to a new grounded joint" side by side, because it is as often the first bar of more linkage as a
mistake. `follow-advice.ts` picks the way that matches the mistake when it is offered, which is the
reader who knows what they meant.

### A weld and a Prismatic slot are fixes too, and they are listed after what keeps the drawing

A drawing one freedom too loose can often be closed by fusing two bodies: welding a pin
(`weldedAt`) or making a Pin-in-slot Prismatic. Both are counted like every other fix (`typeFixes`
in `mobility-fixes.ts`), each refused where the joint's own type menu would refuse it
(`refuseJointType`). They multiply the ways out -- a bent coupler with its knee left unwelded counts
"Weld joint C", "Weld joint E", "Weld joint B" and "Ground joint E" -- so `keepingWhatWasDrawn` in
`free-motion.ts` lists last the ones that give part of the drawing up: a ground that pins a link
down at both ends, so a link drawn to move becomes frame, and a weld or a Prismatic slot on the
input's own link. The knee comes first, and on a Scotch yoke the guide comes before the crank pin.
A weld on a dangling link (an arm welded to what it hangs from) goes after deleting the link, and
"attach its end to a new grounded joint" is still offered beside both.

Two things the brace rule (`staysHeld`) did not know until a Scotch yoke asked: a slider pin's slot
holds it as a second link would, and the end of a slot is a point on the link it is cut in -- so a
brace from the yoke's pin to the yoke's end can be deleted. And a brace riding a Prismatic slider
is one body with the yoke; `withoutLink` assigns the bodies again without it rather than striking
the shared body out, and asks each joint about the links it has left, because its own `links`
still names the deleted one.

### The solver stops at the first thing wrong; the drawer does not

`Mechanism` asks for a slot on every slider, then one degree of freedom, then an input, and sets
one `failure` at the first that fails. A drawing with a wrong count and no input was told about the
count, fixed it, and only then heard about the input. All three can be read off the drawing, so
`readinessOf` says the missing input beside the other two (`BEFORE_THE_SOLVE`), and says a slot or
a count beside an input the actuator refuses. What stays alone: the count beside a slider with
nothing to slide along (the slot is part of what it counts), anything beside a joint dropped next
to another (joining them is the whole answer), a count beside an input whose own fix is counted
(deleting the brace mends both), and an input asked of half a linkage split at a grounded joint
whose input is on the other half (`splitFromADrivenOne`). What the solve finds -- a dead position,
a cycle that never closes -- still waits for these, because nothing is solved until they are fixed.

Saying the count without an input exposed a hole in counting a fix: with no input to hold, "one
freedom left" was enough, and grounding the crank of a four-bar with a link hanging off its coupler
leaves one -- the hanging link's, turning on a pin that joins three bodies. `leavesOneMachine` now
asks there that some joint between exactly two bodies, held, leaves nothing free
(`someInputHolds`), which is the input toggle's own rule.

### A setup message is a `SetupIssue`, and a part it names is a `PartRef`

The setup drawers' issues are structured (`model/mechanism/setup-issue.ts`): a title, a summary,
an explanation and up to three fixes, the summary and fixes built as `Prose` -- text and parts
(`model/prose.ts`) -- so the drawer draws each part as a `part-link` without parsing a sentence.
Write one with the tag: ``prose`Unground ${jointRef(e)}` ``. Two things follow:

- **Nothing reads a `body` any more.** A surface with room for one line quotes `issueText(issue)`,
  the title and the summary; the transport tooltip, the right-click menu's analysis refusal, the
  trace refusal and `invalidReason` all do. A test reads an issue through `read()` in
  `test-utils/verification/issue-text.ts`.
- **`setup-issue-budgets.spec.ts` holds every message to the spec's budgets** -- title 3 to 7
  words, summary 16, explanation 35, fix 10 -- over the fixture gallery, six hundred broken student
  drawings, every solver failure and every force state, and fails on an em dash, a semicolon, a
  part named in an explanation, or a part named as plain text. `listOf` names two parts and "N
  more" past three for that reason.

### `part-link` goes through `PART_LINK_TARGET`, which only the app provides

The block hands its two gestures to an injection token rather than to a service, so it can sit in
any panel and in the gallery. `main.ts` provides `PartNavigationService` for it; a Storybook story
provides `partLinkStub()` (Actions panel); a component spec provides a stub of its own. The block
injects it optionally, so a spec that forgot one renders the name and goes nowhere, rather than
failing to build -- which is also why a link that seems dead in a unit test is not a bug in the
block. Pointing goes through `MechanismService.linkedPart`, not `hoveredPart`: the export drawer's
pointing defers to a selection, and a part link's must not, because a reader following fixes has
usually just pressed the last one. It also wins over `joint-inert` and `link-inert`, the gray an
analysis mode draws a machine that can't run in -- which is every machine a setup drawer names.

### `prose-block`'s template is inline and on one line

Whitespace between the pieces lands in the sentence, and Prettier formats `.html` templates:
reflowed, `Delete` and `link BC` gained a space and a line break between them. An inline
`template:` string is left alone. Change it with care.

### `describeActuator` is written from `actuatorOrRefusal`

A refused input's issue needs the kind of refusal to write its own title, fact and fixes, and the
Edit panel and the menu need one sentence. So `actuatorOrRefusal` returns an `ActuatorRefusal`
kind, and `describeActuator` and `describeActuatorRefusal` format it -- the old route, reading the
sentence back to tell a weld from a frame bar, would have parsed the model's own words.

### `new RevJoint(id, x, y, input, ground)`: input comes first

A test that meant a grounded pin wrote `new RevJoint('A', 0, 0, true)` and got a driven, floating
one; the drawing then read as a chain that never reaches ground. Set `ground` and `input` by name
where it matters.

### Reset left a clock a few tenths of a microsecond short of zero

`easeToStart` eases each machine's clock back to its start, and skips drawing a frame that moves it
less than a microsecond. The eased curve is flat at its end, so on a short cycle -- a slider's can be
a tenth of a second -- the last few frames were all under that and were never written, and the clock
stopped at about 1.6e-7 s. `atStartPose` asks for exactly zero, so the edit gate called the machine
parked away from its start, and with the shared step at zero it said so in the unsynced wording:
"Return every mechanism to edit." The last frame now lands on zero and is always drawn.

### An input on a bar grounded at both ends belongs to no machine

Set a crank's input, then ground its far end: the bar is folded into the frame, the partition hands
the pivot to no machine, and `Mechanism` clears `input` on every joint it does not own. The machine
hanging off the bar was then told "No input is set" in the drawer, "Input joint: Not set" in its
facts, and "Ground a joint and set one joint as an input." in the playback row -- all beside the
input's arrow. `describeActuator` now refuses that joint (`framePieceAt`, "link is grounded" in the
menu), `readinessOf` finds the input among the frame joints it is handed (`inputOnTheFrame`), and
`inputSetFor` is the one question the other surfaces ask. A new surface that decides "no input" by
looking only at `ownJoints` reintroduces the bug; ask `inputSetFor`.

### The library's gripper counts one freedom and measures three, and runs on the count

`Cylinder_Gripper` -- the card, and `slideGripperFixture` the gallery generates it from -- has
Gruebler's count at 1 and `mobilityFromGeometry` at **3**. `determineDegreesOfFreedom` returns the
count wherever the count is at least one and never asks the geometry, so the drawing is admitted
and solved. Two of those three freedoms are therefore motions nothing in the drawing determines,
and the solver picks a pose for them.

The 3 is not a numerical artifact, which is the first thing to suspect and the first thing to rule
out. Perturbing a corner of one of its parallelograms by 1e-9, 1e-6, 1e-4 and 1e-3 -- the last of
which is the resolution the URL itself carries -- leaves it at 3 every time.

**What is not known is which two motions they are.** Grounding `B`, the barrel's near end, drops
the measurement to 1, which looks like the barrel's swing about its single mount until you notice
that `gripperFixture` beside it in the gallery has its barrel equally free on one pin and measures
1. So the barrel is not a sufficient explanation, and no better one has been written down. Note
also that grounding `B` is not a drawing a reader could make: `isInsideCylinder` counts the
barrel's near end as inside the part, so it is not an attachment point.

Three siblings in the gallery measure 1 and are worth comparing against before concluding
anything: `gripperFixture` (railed, hand-placed coordinates), `pivotingGripperFixture` ("the same
gripper, jaws pivoting instead of railed") and `parallelGripperFixture` ("the way a manufacturer
draws one"). The difference is not exact symmetry: `slideGripperFixture` builds its parallelograms
from shared constants and is exact, `gripperFixture`'s are hand-typed and only nearly so, but
breaking the exact ones by hand does not move the number.

One warning for anyone thinking of gating on the measurement. It is robust on this drawing and
knife-edge on a near neighbor: the same gripper with `B` grounded flips between 1 and 2 on a 1e-9
nudge to a parallelogram corner. Whether that shape is reachable by a reader is a separate
question, but a refusal rule reading this number needs to answer it first.

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

### A grounded Slide's rider is placed by the assembly step, never by a dyad

A grounded Slide holds its rider square to the world, so every joint of the rider moves by the one
vector the guide allows, and `orderSlideAssembly` moves them together. Every generic primitive
turns the body it places to reach its answer -- two circles meet where the dyad folds, a circle
meets a slot where the link tilts -- so `detJointOrder` and `orderRiderOnMovingSlot` leave a
rider's joints alone (`heldSquare`, which asks `slideAssemblies` rather than `rotates`, for the
reason `slide-assembly.ts` gives). Before that, a bar welded to its block on a guide with its far
end riding a slot cut into the crank was "solved" by placing the far end from the block's *seeded*
position -- a grounded slider is known before the walk starts and placed only by its own step --
and the block from the far end: self-consistent every sample, the block never slid, and the bar
swung through twenty-five degrees at a weld. Nothing refused it, because the count is right: one
freedom, and the walk had simply drawn a different mechanism with the same count.

`slideAssemblySource` has a fourth kind for that shape, `'guided'`: slide until the member lands on
the placed slot, `t = ((P − M₀) × v̂) / (û × v̂)`, one root or none, with the slot line read from the
carrier's pose each sample through `resolveSlotLine` like any rider's. It is the Scotch yoke's
`'slot'` source with the roles exchanged. `bar-on-a-slide-in-a-crank-slot.spec.ts` is the drawing.

Two things about that spec. The walk never corrects the drawn pose, and a rock passes back through
it: a hand-drawn far end sits a tenth of a model unit off its slot at frame 0 and at every return
to the start, and a difference quotient straddling those frames reads the jump as velocity, so they
are exempt. And the drawing rocks rather than turning through -- as the slot leans toward the
guide, the far end has to run further along it to stay at its height and reaches the end of the
channel first, which `ridersAreInTheirSlots` turns away like any other limit.

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

### A cylinder's four joints are not named A, B, C, D, and have not been for a while

Three of them take ordinary letters from `determineNextLetter` -- the two end joints first and
then the slide (decision S9) -- and the one the reader never sees, the barrel's buried end, hangs
off the barrel-side letter and is numbered `A1` by `determineInteriorNames`. That is deliberate
twice over: the hidden joint reads as belonging to the part, and the letter rule ranks ids by
their place in the alphabet, so it walks past `A1` instead of letting a cylinder push the
*visible* joints into double letters.

There were five joints and three hidden names (`A1`, `A2`, `A3`) before Stage 1 made a slider one
joint and Stage 2 made the slide selectable. **An old payload still carries an interior-named
seal**, and the reader gives it the next free letter as the last step of the build -- after every
id-keyed section, because locks, holds, colors and CoM anchors are looked up by the ids the URL
wrote.

The rule itself is `model/joint-letters.ts` and is asked from two places: the service asks it of
the drawing, the URL builder asks it of the list it is still assembling. It used to be written out
twice, once in each.

A suite that names a cylinder's joints should ask the model which joint plays which role
(`sealedStructures()[0]`, as `e2e/phase4-cylinder.mjs` does) rather than assert the naming scheme
by accident; a suite that spells out the scheme fails in a way that looks like a regression in
creation.

Three more things a cylinder suite can assert by accident, all consequences of deliberate
changes: a cylinder joint's card carries the four-way **Joint Type** choice and grays the values it
cannot take (every joint's card is the same shape now, each refusal explained); the whole-part card
is gone and a click on the barrel, the rod or the slide opens that thing's own card, so an
exact-list assertion goes red whenever one of them legitimately grows; and the panel's speed field
is **Input Speed** writing `Joint.driveSpeed` on the driven joint, not "Expansion Speed" writing
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

### Two questions about a cylinder, and a body has to be asked the right one

`ownsMember` is deliberately recursive: a compound that has itself been welded into something
larger still owns the member, and a delete or a drag that missed it would tear the part it was
carrying. That is the right question for a **cascade**. It is the wrong one for **identity**, and
until an end joint could be welded nothing could tell the two apart, because no compound ever held
a cylinder leaf.

`MechanismService.cylinderAt` is the carrying question and `cylinderOfBar` the identity one, and a
body must be asked whichever it means:

- **Carrying** -- a delete, a copy, a body drag or swing, and `frozenCarriedJoints`. Missing a ram
  welded under a body tears it, so these stay recursive, and each of those sites says so.
- **Identity** -- everything that *names* a body, and everything that decides what kind of body it
  is: both panels, the context-menu builder's title and its delete row, the debug table, the
  analysis and export member lists, `bodyLabel`, `canDuplicate`, the lock mark, the CoM handle,
  the label ink, `isSelectedBody` and `isPointedAtBody`.

Asked the carrying question, a bracket welded to a rod mount opened the cylinder's panel, wore
"Cylinder AB · Barrel and rod" as its menu title, lit up when the part beside it was chosen, and
offered a Delete Cylinder that took the part and left the bracket standing -- while Delete on that
same selection took the whole body. It reads as the compound it is now -- "Edit Link ⟨its own
letters⟩", "Link ⟨the same⟩ · Compound", and "Delete Link (and Cylinder, 3 joints)" -- which is
what both routes actually do. (The letters themselves moved in Stage 2: a seal that was stored
under an interior name is given a real one on decode, so a compound holding one is no longer named
after a joint nothing shows.)

There was a third name for the identity question for a while: `MechanismService.cylinderOfLink`,
which the hold path asked through a members map keyed by link id -- which is why holds were the one
surface a welded bracket never confused. It became a one-line delegation to `cylinderOfBar` and
then went, so a body has two questions to choose between rather than two questions and a synonym.

### A compound has to draw a welded cylinder member, and with the skin's shape

`RealLink.getCompoundPathString` used to *drop* a leaf a cylinder's skin draws, on the reading
that the skin would paint it anyway. What that produced is a bracket standing beside the part
rather than one body with it: the bracket its own shape in its own color with its own edge, the skin laid
over it with a seam and no fillet, and at a barrel mount the bracket's round end showing as a
circle inside the barrel. A weld means the two are rigid, and two ordinary welded links draw that
as one fill, one continuous outline and a fillet in the elbow.

So the union takes the member's **silhouette** instead of dropping it (decision S16): the barrel's
real profile, or the rod's from behind the head to its end joint, built by the skin's own path
builders and carried on `RealLink.skinSilhouette`. `buildCompoundPath` then does exactly what it
does for two bars.

Three things that are not obvious about it:

- **A union fillets every corner it finds**, and it cannot tell the elbow, where two parts meet,
  from the barrel's mouth or the rod's back, where nothing does. Filleted at the weld's radius the
  mouth came out a capsule and the rod's square back lifted off the black head block it is flush
  with, letting the black through at both corners. The fix is `CYLINDER.cutEase`: those four
  corners are eased by a twentieth of R before the union, which puts every turn in them under
  `buildCompoundPath`'s fifteen-degree corner threshold, so they come back out exactly as drawn.
  It is the same mechanism that lets a black block keep its own rounded corners through a weld
  plate.
- **The body cannot stay in the links layer.** The skin is a stack -- barrel, head block, rod --
  and a body holding a member has to stand in that member's place in it. A rod drawn under the
  black head is hidden by it entirely and the band that says how much rod is still in the bore
  simply goes. `fusedBodiesOf` in `model/cylinder-fusion.ts` assigns each welded body exactly one
  pass to be painted in, the rod's winning when one body holds both kinds (two cylinders welded to
  one bracket, or both ends of one cylinder), and `bodyDrawnByACylinder` keeps the links layer off
  it.
- **The export is not the picture.** `outlineLoops()` gives the DXF the body *without* the member
  fused in, by rebuilding the union from the other leaves. A cylinder is already exported as its
  own barrel and rod on their own layer, so a fused face would lay a second, differently shaped
  barrel over the first.

The leaf still cannot work any of this out for itself. After a weld its joints list only the
compound root in `links`, and the sealed `PrisJoint` -- which is the one object that knows the
pairing (`carrier` is the root, `slotJointA`/`slotJointB` are the barrel's two joints) -- is
reachable only from the rod's pin, which a barrel-welded compound does not contain. So both
answers are *told* to it: `drawnByACylinderSkin` and `skinSilhouette`, set by
`MechanismService.tellEachBarHowItIsDrawn` wherever the sealed structures are resolved. They are
cleared over the bars marked *last* time rather than over the drawing, because deleting a cylinder
takes its bars out of `links` before the next resolve runs, and a bar that keeps the flag is a bar that
stops drawing itself the moment it is welded into anything else. The silhouette is told a second
time, from `updateMechanism` after `deriveCylinderInteriors`: *which* bars only a structural edit
changes, but *where* they are is something the derivation may have just moved.

### A link's id is a key, and on a welded barrel mount it is not a name

`mergeLinks` builds a compound's id from the sorted ids of its joints, and a bracket welded to a
cylinder's barrel mount holds **N**, the buried inner end. N has no marker, no letter and no
hitbox, and is left out of every count the app shows (D14, S11) -- so the id `AA1D` named a joint
the drawing has never drawn, and it named it in four places at once: the canvas tag, the panel
title, the right-click header and the delete cascade of every joint on the body. The menu's
subtitle said "Joints A, A1, D" over a canvas showing two, and the center-of-mass frame dropdown
offered "Joint A1" as something to anchor a point to.

`visibleBodyName` in `model/body-label.ts` is the one answer, and `MechanismService.visibleBodyName`
/ `bodyLabel` are how everything asks it. Three rules in order: a cylinder member is named by its
own two ends (S10) -- *never* by this rule, which on a barrel would leave the single letter of its
mount; a name somebody typed wins untouched, "typed" being a name that differs from the id, which
is what `mergeLinks` already means by it; otherwise the visible joints' ids, sorted the way
`mergeLinks` sorts. With nothing hidden to drop it returns the id as it stands, so an ordinary body
is untouched by construction rather than by accident.

The id itself does not move. It is the key the URL, the solver, `mechanismForId`, the export
columns and the DXF layers are built on, and a display rule that changed it would change all of
them. Three surfaces keep it on purpose: a graph's `mechPart`, which is a lookup key and only ever
*shown* in a fallback label no panel reaches; the export's column keys and DXF layer names; and the
dev-only debug drawer, which is there to show what is stored.

One that is easy to miss: `describeHold` falls back to `link.name || link.id`, and the cylinder
branch above it names the *part* by its mounts. `GridUtilsService`'s `heldBy` deliberately wants the
*member* named instead -- with both lengths fixed there are two padlocks to choose between -- and
landed on that fallback, which for a barrel is the id with N in it. It passes a namer now.

### The loop walk misses a chain that was already complete when it started

`determineLoops` takes each ground joint, and for every neighbor of it calls `findGround` *from
that neighbor* -- which records a loop only when it finds a ground among the neighbor's own
neighbors. So a chain that is one edge long, ground to ground, is never written down: the walk
starts past the end of it.

That was invisible for as long as it was only true of pins. A bar pinned to the frame at both ends
is frame, and a loop for it says nothing. It became reachable when a slider became one joint
(Stage 1 of `joint-type-and-cylinder-plan.md`): an elliptical trammel is a bar with each end in a
grounded **guide**, which before the fold was guide, pin, bar, pin, guide -- two non-ground joints
in the middle for the walk to find -- and afterwards is one edge between two ground joints. With no
loop, `solveRates` falls to `determineLooplessKinematics`, which models the drive as a rotation
about the input joint: the joint on the 90-degree guide was handed a velocity with a large X
component, which is the one thing its own constraint forbids, and the driven end was left at
exactly zero.

Positions were fine throughout, which is what made it quiet: the mechanism solved, animated and
drew correctly, and only the graphs were wrong. `e2e/template-graphs.mjs` is the only thing in the
suite that asks -- it differences every plotted series against the position it derives from -- and
it runs in the nightly lane, not the gate. `src/tests/verification/slider-rate-agreement.spec.ts`
asks the same question in a second rather than a two-minute browser run, which is where it belongs.
The fix is one condition in `determineLoops`: record the chain when the neighbor is itself a
remaining ground *and* the body between them can move -- a slot at either end, or a step taken
along one.

One harness trap comes with it: `ellipticalTrammelFixture(true, 1)` built through
`buildMechanism` is `dead-position` with a single sample at *every* object scale tried, a quarter
of `MODEL_SCALE` through four times it. The template payload encoded from that same fixture solves
to 363 samples. Ask this mechanism anything through `TEMPLATE_LINKAGES`, not through the fixture.

### `npm run template-payloads` rewrites the hand-authored templates too, not just the fenced ones

`template-payloads.spec.ts` regenerates the block between its `<generated>` markers *and* runs
`replaceHandAuthored` over the six templates that predate the generator, because color is assigned
from structure and those six would otherwise be colored by whatever order somebody drew them in.
It does that by decoding, repainting and re-encoding -- and its docstring used to promise the
round trip came back byte-identical but for the six color fields, which was what made it safe to
do to strings nothing else can regenerate.

Stage 1 broke that promise quietly. The reader folds a three-object slider into one `PrisJoint`
and the writer cannot emit the old spelling any more, so the first `npm run template-payloads`
after the fold landed rewrote `Slider_Crank`'s **geometry** -- dropping its `YPCD` piston record
and merging `C` with `D` -- and moved its rod's color as a consequence, since the fill rule reads
structure. Nothing announced it. Two tests in `template-url.spec.ts` that pinned the old stored
form went red, and that is the only reason it was caught.

The normalization is wanted -- the dialog should hand out what the app writes today -- but a
silent one is not. The docstring says so now, and
`services/transcoding/url-slider-fold.spec.ts` is what proves the fold loses nothing: it builds
the legacy trio and encodes it rather than pasting bytes that could drift from what the app used
to produce.

### A ram's bore is a channel, and welding its barrel mount gave the channel to the bracket

`SliderMarkService.channels` walks every floating `PrisJoint` and emits a capsule for its carrier
-- the sealed one included. That never showed while the barrel was the carrier: a barrel is
skinned, so `linkPathWithChannels` returns `''` for it and the bore goes with it. Weld the barrel
mount and the carrier becomes the **compound**, which is not skinned, so the bore was appended to
the compound's outline as a second subpath -- and since it does not overlap the bracket, even-odd
filled it in rather than subtracting it: a capsule the length of the barrel, in the bracket's
color, laid over the part it is supposed to be inside. The plan asks for exactly this ("the
internal bore stays hidden even when its carrier root also contains a neighboring leaf with a
visible slot"), and the fix is one `if (joint.isSealed) continue;`. Still one `if`, and still the only
thing holding the bore out: a welded barrel's body is painted by the cylinder's own pass now
(decision S16) rather than by the links layer, but it is painted from the same `bodyPath`, channels
and all, so removing the guard would put the capsule straight back.

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

### A key pressed into an open menu is the menu's

`KeyboardShortcutsService` listens on `window` and answered every keystroke that was not typed into
a field, aimed at a button, or fired under a dialog — the arrows included, which is what a menu
walks its items with. A right-click *selects* what it opened its card on, so Down on a joint's menu
nudged that joint behind the card, and `ContextMenuComponent`'s "any shortcut closes the card" rule
then shut the card on the shortcut it had just fired: the joint moved and the card vanished, in that
order. The gate is `insideAnOpenMenu`, asked of the focused element (`[role="menu"]`) rather than of
any open overlay — a card can stand while focus is elsewhere, and those keys are still the canvas's.
The CDK does move focus into the card as it opens it, for a button-2 `contextmenu`; `menu-focus.mjs`
is the same rule for the project menu, and `joint-type.mjs` walks the card's choice with the arrows.

### A disabled button cannot take focus, so stepping through a list sticks on it

`focus()` on a `disabled` button does nothing at all -- no error, no move -- so a list that walks
its items by index stops dead on the row *above* the grayed one and never gets past it, however many
times the key is pressed. The project menu did this at Export Data, which is grayed until something
has been solved: with nothing solved, ArrowDown went New Project, Open, Mechanism Library, Save,
Share project, and then stayed on Share project forever. `menuItems()` in
`top-bar.component.ts` leaves the disabled rows out now. The right-click card never had it, because
a `cdkMenuItem` stays focusable and says `aria-disabled` instead.

The other half of that menu's keyboard trouble was the opposite of sticking: opening it focused the
first row, and Space and Enter press whatever row has focus, so New Project sat under the next press
of Space -- which is also the play/pause key. Nothing is armed until an arrow says which row.

### `:focus-visible` is wrong for focus the app moved itself

A popover that takes focus as it opens -- the project menu, the right-click card -- cannot use
`:focus-visible` to decide whether to *draw* that focus. The browser treats a script moving focus as
keyboard work unless the reader's last act was a pointer that moved focus itself, so a card opened
by right-click came up with a ring around its first item. It is not only the first menu after a
load, which is how it was described the first time it happened: pressing Escape is enough to make
the next card ring too, because the last thing that happened was a key. On the joint's card the
first item is the *chosen* type, so the ring sat on the value already wearing the chosen pill and
read as a second kind of selected.

Both menus answer it themselves now, from the event that opened them -- `menuByKeyboard` in
`top-bar.component.ts`, `byKeyboard` in `context-menu.component.ts`, each turned on by the first key
the reader presses -- and the ring hangs off that class instead. `menu-focus.mjs` is the guard for
both, and it uses a fresh browser context per case on purpose: the trap only shows before the page
has recorded an interaction.

### A suite that buffers its checks loses them all to a throw

`phase4-stack-and-menu` collects its answers in `out[]` and prints them at the end. When Stage 0
removed the Edit panel's `weld` control, `jointForm.get('weld')` returned null inside a
`page.evaluate`, and the throw took the whole report with it: the run printed no checks at all,
said `0 FAIL`, and exited 1 -- while three checks in it had been failing for a while. `phase1-drag`
was quieter still. Its weld section is an `if (enabled) { ... }` guarded by a locator that no longer
matched anything, so the assertions inside it -- the weld goes through, the mechanism comes back
over-constrained, the app says so -- stopped running rather than failing, and the suite stayed
green while proving three things fewer.

So when you remove a control, grep the suites for **the symbol you removed** (`get('weld')`,
`hasText: 'Weld'`, `toggle-block`), not for the label you expect to read: searching `'Welded'`
matches neither of these, and the gate found both after the push instead.

### `anyComponentStyle` is 6 kB warning / 10 kB error

Raised from 4/6 for the CAD Export dialog
— a whole screen of UI in one component, where the cap was written for panels. It is a global
cap with no per-component override, so the choice is one number for everything; 10 kB still
catches real bloat. `npm run build` is where you find out, and it fails the build rather than
warning.

### A cylinder's derivation cannot tell a moved mount from a stretched rod

`derivedInterior` reads both lengths off the joints it is given: the barrel from A to N, the rod
from S to B. It writes N and S back onto the axis at exactly those lengths, so it straightens a
bend and holds the size it finds. Which means it has **no opinion at all** about a mount that has
moved -- carry B two units further out without touching S and the rod is simply two units longer,
and the pass that runs on every rebuild agrees with that reading.

That is why a mount drag goes through `layoutCylinder` (which re-lays the part against its stops)
and a carried mount through `stretchedCylinderPose`, and why neither of them may be replaced by
"move the mount and let the rebuild sort it out". The derivation is the thing that runs when
nobody has said what the edit was.

### *Starts at* is read from the seal, not from the distance between the joints

`cylinderSizeAt` used to report `start` as `(span - closedSpan) / stroke`, which quietly subtracts
the **barrel** where it means to subtract the rod. That was exactly right while the two had to be
equal, and wrong the moment decision S3 gave them their own lengths: carrying mount B further out
without touching the seal makes the *rod* longer -- which is what `derivedInterior` already
believes -- and the panel would have said the cylinder had opened. It reads `(|AS| - min) / stroke`
now, off the seal's own place along the barrel, and `|AS|` is a projection onto the axis so a part
a rounding error has left a hair off it still reads as standing somewhere on it.

### The barrel at its floor measures a stroke an ulp short of the floor stroke

`cylinderBarrelFloor(r)` is `(MIN_STROKE_R + HEAD_CLEARANCE_R) * r` -- a product of a sum -- and the
stroke is `barrel - HEAD_CLEARANCE_R * r`, a difference. In floating point the second comes out
just under `MIN_STROKE_R * r`, so `cylinderStrokeAlong` calls the barrel it was just handed
*unusable* and collapses its travel to a single point. Anything that searches a barrel length
starting at the floor was therefore handed a meaningless lower bound: a `Starts at` on a doubly
grounded cylinder accepted a barrel below the floor instead of refusing.

`cylinderHeadTravel` is the raw interval for exactly this, and `cylinderStrokeAlong` is the guarded
reading built on it. A *layout* has already put the barrel above its floor and wants the
arithmetic; a *reader* (the panel, the solver) wants the verdict. When they are both usable the two
agree to the last bit.

### The rod's path covers the cylinder's black square exactly, so the square takes no clicks

`rodBodyPath` starts at `-headHalf` and is drawn at `CYLINDER.rodHalf`, which is
`MARK.blockAcrossHalf` -- the same half-height `cylinderBlockPath` uses. The rod is therefore
*exactly* the square's own rectangle plus everything beyond it, drawn after it so the band inside
the bore reads darker through its 0.7 alpha. Every pointer event aimed at the square landed on the
rod, which nobody noticed while both selected the same body.

When the square became joint S (Stage 2c) that mattered: the handlers on the painted block were
dead code. The square's hitbox is a separate transparent path drawn *after* the rod --
`.cylinder-seal-hit` -- and the painted block takes `pointer-events="none"`. It carried
`#joint_<id>` while the block was the seal's marker; the cream bar the joint layer draws above the
head is the marker now (decision S13) and the id went with it, because a hit area is a handle and
not a joint.

### A decoded joint always has an explicit name, even when nobody named it

`Joint.name` falls back to the id when `_name` is empty, and the encoder writes the *getter's*
answer -- so every joint in a URL carries a name, and `buildJoint` assigns it unconditionally.
After a decode nothing is unnamed. That is invisible until something renames an id underneath it:
re-lettering a cylinder's seal (decision S9) left the joint reading as its old interior name `A2`
while its id was `E`. The reader clears a name that is only the old id back to empty, so the new
letter is what a reader sees; a name somebody actually chose is left alone.

### Three shipped templates carry an interior-named seal, and are not regenerated from anything

`Excavator_Bucket`, `Hood_Hinge` and `Aircraft_Landing_Gear` were drawn in the app and pasted into
`template-linkages.ts` as the URLs it wrote -- there is no fixture behind them, so
`npm run template-payloads` does not touch them. They are the payloads decision S9's re-lettering
actually fires on, which is why the only thing Stage 2c changed in `template-baseline.ts` is one
sample id in each of those three. The `joints` and `links` snapshots above them are untouched,
because they pin what the *stored* URL says and the codec did not change.

### A weld plate is the union of its rider and its block, so a Slide's block cannot be clicked

`plateFor` runs `buildCompoundPath([riderOutline, blockPath(r)])`, and a union contains both --
so the plate drawn over a welded slider covers every pixel of the black block, ends included. The
block group's own `pointerdown` still exists and still routes to the slider, and on a **Slot** it
is what makes the block the big handle §4.4 promises; on a **Slide** nothing ever reaches it,
because the plate above it takes the gesture for the rider instead. A Slide is grabbed through the
joint's own hitbox at its center (`objectScale / 4`, drawn in `jointHolder`, which is above
`sliderHolder`). Worth knowing before writing a test that means to point at a Slide's block: it
will select the rider link and say nothing about the joint.

`riderOutline` is no longer the rider's `d`, though: it is **what is drawn** at that rider
(`drawnOutlineOf`), which for a cylinder member is the skin's silhouette (S18). Two consequences
for anything looking for a plate in the DOM. A plate holding a member is **not in the slider
layer** -- it is painted in that member's place in the skin's stack, inside the cylinder group,
and it carries the body's own `id`, so `[id="DD1"]` finds the plate rather than an empty
links-layer element. And a **Pin-in-slot** at a cylinder end now draws no rider at all: the skin
is already above the block, so there is nothing for this layer to hoist.

### `channels` skips a ram's bore and `channelsInLocalFrame` did not, which only a real silhouette showed

Both build the same capsule for the same floating sliders, and only the first carried
`if (joint.isSealed) continue` -- the bore is drawn by the skin, mouth and all, so it is never an
ordinary channel. The second is the plate's copy, and the omission was invisible for as long as a
plate drew the thin bar a member's two joints describe: the capsule is wider than that bar, so the
subtraction removed a shape that was not there. Give the plate the barrel's real profile and the
same subtraction hollows the part into a long fork with a rounded slot down the middle of it --
`fill-rule="evenodd"` doing exactly what it was asked. If a fused shape comes out hollow, look for
a second subpath before you look at the union.

### `SliderMarkService.marks` maps every `PrisJoint`, and a cylinder's seal is one

Four cylinders put four extra marks in the list nothing ever draws -- `isSkinned` skips them in
`slotStack` -- and until S18 each of them still ran `plateFor`, a Boolean union per seal per pose,
and each of them claimed its riders in the `claimed` set the list shares. That set exists so one
link pinned to two blocks is not drawn twice, and it is walked in joint order. So a rod welded into
a body lost its plate to the seal at the *other* end of the same rod: N comes before O in the joint
list, N took the body, and the Slide at O was left with no rider to fuse and a bare black block on
screen. A seal now plates nothing and claims nothing, which is the honest rule -- the skin draws
its whole part -- and is also four fewer unions per pose. `fuseSharedPlates` had to learn the same
thing: a seal is `welded` (`rotates === false`), so it was leading weld groups too.

### The traced-path layer is drawn over every joint marker, slider marks included

`#pathsHolder` sits *after* `#jointHolder` in `new-grid.component.html`, so a joint's own swept
path is painted across its marker. On a pin the line disappears under the circle's own diameter
and nobody notices; on a grounded slider, whose path is a straight line along the slot, it runs
edge to edge through the cream bar and stops dead at the joint's center. It is the layer order, not
the mark: a `+` and a circle get the same treatment. Do not go looking for an element drawn above
the mark -- `elementsFromPoint` will not find one, because the trace has `pointer-events: none`.

### A driven slider's arrows start exactly where its mark ends, and only because two numbers agree

`MARK.arrowTail` is 1.4 and `MARK.slideAlongHalf` is 1.4, so the tails of `straightArrowPaths`
(and of `cylinderArrowPaths`, which scales the pair by the head) begin on the cream bar's end caps
with no gap and no overlap -- the bar reads as the thing the two arrows are pushing. Move either
number and a driven Slide either grows a sliver of black between mark and arrow or paints the mark
over the tails.

Nothing enforced the equality, because each constant was tested against its own reference and
neither test could see the other. `joint-marks.spec.ts` now asserts the two are equal, and the
comment on `arrowTail` says which fact it is standing for. It is a pin rather than a derivation:
neither number is the cause of the other, and writing `arrowTail: MARK.slideAlongHalf` would claim
a driven *pin's* arrows are about a mark pins do not wear.

### `app-notification` is not a selector, so a suite counting notifications counted nothing

The stack's host element is `app-notification-stack`; there is no `app-notification`. A suite
asserting "nothing was said" with `page.locator('app-notification .notification').count()` gets
zero whatever the app did, and passes for the wrong reason forever. `e2e/phase1-drag.mjs` has the
right form -- `app-notification-stack .notification ... .notificationText` -- and is worth copying
rather than retyping.

The shape of the trap generalizes: a Playwright locator that matches nothing is indistinguishable
from an assertion that holds, so a check written as *count is zero* needs a companion that proves
the selector can be non-zero. The quickest one is to do something that is definitely refused and
watch the same count go up.

### A cylinder's `hiddenByCylinder` asks one predicate of two lists on purpose

`isCylinderInner` is the whole rule -- N, and nothing else -- and `model/cylinder-skin.ts` asks it
twice: of the skins the canvas has drawn, and of the record the service resolves. Not redundancy:
the marks are rebuilt from geometry on a cache key of their own and can lag a frame mid-edit (a
weld landing, a drag in flight), which was long enough for an interior label to blink into view.
The marks used to carry their own copy of N's id, which was a second answer to the question rather
than a second place to ask it, and carrying the record instead is what makes the pair safe.

### The Edit panel's `jointForm` has controls the template does not bind

Its blocks take a control by name -- `_formControl="ground"`, `formControl1="xPos"` -- so a control
that stops being named in the template goes on existing, goes on being patched by
`syncJointFields`, and goes on running whatever `valueChanges` was wired to it. Nothing in the
panel looks wrong, because nothing in the panel can reach it.

That is how a second door to the drive survived Add Input becoming a button: `jointForm`'s `input`
control wrote the flag straight onto the joint and called `updateMechanism()` with no save, so a
drive switched off through it could not be undone. Only `e2e/posed-edit-audit.mjs` could still
press it, by poking the control directly, which is what found it.

Worth a `grep '_formControl='` over `edit-panel.component.html` against the control list in the
form when a control's behavior looks unreachable. A form control nobody binds is not harmless: the
audit will find it, and so will anything else that drives the panel through its form.

### An unsolvable rebuild inside a posed edit took the machine's anchor with it

Park a machine away from its start, right-click a **grounded** pin and choose Joint Type →
Prismatic: the pose you were looking at quietly became the start. On `Cylinder_Boom`'s grounded
end joint `G`, a third of the way round the cycle, the anchor goes from 424.16 to 49.81 — and a
plain `4-Bar`'s grounded pin `D` does exactly the same thing, so it is nothing to do with
cylinders. `e2e/posed-edit-audit.mjs` says it as `anchor moved from 424.16 to 49.81 without saying
so`; it only ever reaches the cylinder's `G` because that table names a grounded pin and the
four-bar's does not.

The cause is the rebuild in the *middle* of the edit. `JointTypeService.set` runs the change as
`add-slider` and then puts the ground back (`services/joint-type.service.ts:129`), and between the
two the joint is an ungrounded slider: the machine counts 2 DOF and `isMechanismValid()` is false.
`refreshAnchors` (`services/mechanism.service.ts:6256`) collects only the machines it can solve
into `alive` and then deletes every anchor whose key is missing from it, so the staged machine's
anchor is dropped for being *momentarily* unsolvable. The next rebuild is valid again and has no
anchor, so one is taken fresh from `frames.joints[0]` — which, while the machine is staged, is the
pose under the reader's hand. `carriedAnchorFor` cannot rescue it: that covers a machine arriving
under a **new** key, and here the map is simply empty. `settleToAnchorNow` then finds the new
anchor sitting on sample 0, returns `{ reanchored: true }`, and there is nothing left to narrate.

Held across that one invalid rebuild, both drawings do what the plan says: the four-bar re-anchors
exactly (its start keeps `B` where it was, the display stays where the reader was), and the
cylinder honestly reports `lost: 'M1'`, because a barrel travel of 424.16 along `G`–`N` no longer
exists once `G` itself slides.

The second half has a fault of its own, and it is the one the audit's wording is about.
`capturingPose` reads only `.reanchored` off the settle (`services/mechanism.service.ts:6589`) and
throws the `lost` half away, so a menu or panel edit that really does move the start says nothing
at all. Only the canvas's `closePosedEdit` (`component/new-grid/new-grid.component.ts:3706`) calls
`markStartMoved` and raises `anchor.unreachable` — which is why a drag narrates a moved start and a
right-click does not.

Both predate the cylinder work: a detached worktree at `477f2f7c`, the parent of
`feature/cylinder-sealed-slide`, reproduces the same two numbers.

**Both are fixed now**, and the row is green. `refreshAnchors` adds a machine's key to `alive`
before it asks whether the machine can be solved, so "still here" is about the owned-joint set and
not about the solver: the four-bar re-anchors exactly, and the cylinder honestly reports
`lost: 'M1'`, both as the paragraph above predicted. `capturingPose` then narrates that `lost`
through `MechanismService.sayStartMoved`, which is the sentence and the transport chip the
canvas's `closePosedEdit` used to own alone — so the same words now come out whether the edit
arrived by hand or through a menu row. `e2e/ghost-is-the-start.mjs` holds the second half by name.

### Recoloring a *link* never saved, so the color rode in on the next edit

`ColorPickerComponent.selectColor` called `updateMechanism(true)` for a joint and for a force, and
for a whole selection through `parts`, but the single-`link` branch set `link.fill` and stopped.
A link's fill has ridden the URL since the format was written, so nothing was lost — it was simply
written the next time something else saved. What that cost was Undo: recolor a bar, move a joint,
press Undo, and the color went back with the joint, because the color had never had an entry of
its own. Now fixed, which decision S15 needed anyway: a rod's `KR` entry is written at the same
moment, and a reload from the address bar has to find it there.

### A collapsed `collapsible-subsection` still has its content in the DOM — under the next section

The block animates `[@openClose]` on `.panel-content` rather than removing it, so a collapsed
section's rows are still queryable and still report a 28×28 bounding box — laid out *over* whatever
section follows. An e2e suite that opens a section by asking "are the swatches there yet" therefore
believes it is already open, and the click that follows lands on the next section's sticky header
(`<button class="panel-header__toggle">… intercepts pointer events`). Read the chevron instead:
`.panel-header__toggle mat-icon.rotate180` is set only while the section is open. `e2e/cylinder-colors.mjs`
does it that way, and centers the swatch in the panel before clicking it, because the headers above
and below are both sticky.

### Clicking a field that already has focus: Chrome sets the caret *after* the click handlers

Every BLOCKS field selects its value on click, and it worked on the first click and failed on every
one after. On a field that does not yet have focus the browser has settled the caret before the
handler runs, so `field.select()` sticks. On a field that *already* has focus, Chrome applies the
caret that click asks for after the handlers — an instrumented run shows `select()` called while
the selection still reads `0-7`, doing nothing because nothing changed, and the selection reading
`7-7` a moment later. Asserting the selection again on the next frame is what survives it, and
`BLOCKS/select-all.ts` is the one place that does: it re-selects only when the value is unchanged,
the field is still focused, and the selection collapsed to a caret, so a drag across part of the
value and a keystroke that arrived first are both left alone.

### A pose built from fitted lengths and then handed a requested mount is two different parts

`stretchedCylinderPose` laid a carried cylinder out from the lengths a fit had chosen and then
wrote the *requested* rod mount back over the fitted one, on the reading that a carried mount
belongs to whatever moved it. When the fit had to clamp — a member holding its length, or the part
already at its floor — the two points are not the same point, and the difference lands in the rod:
a rod holding its length was silently stretched from 1242.6 to 5647.16 model units to bridge it,
and the planner's rigid-body check could not see it, because a ram it has marked as reshaped has
its interior exempted. The rule now is that a pose is only ever `cylinderPoseAlong` of the fitted
lengths and the fitted span, a clamped fit answers `undefined` (which `planEdit` turns into
`cylinder.carried-too-far`), and `planEdit` measures every cylinder it settled against its own
pose's lengths before committing.

### With both cylinder mounts pinned, the barrel cannot move the seal — only relabel it

The seal's place along the barrel is `span − rod` whenever both end joints are held, and neither
term mentions the barrel. So the barrel rung of `whatGives` (S17) never moves the head one model
unit: it changes the *travel*, and therefore what percentage the same point reads as. It is the
last rung for that reason, and it is reachable only with both ends **locked** — grounded ends move
instead, which is why a both-grounded ram now expands and contracts under a drag of the head rather
than appearing to ignore it. Both doors stay on the one ladder so they cannot answer one drawing
two ways: `poseForSealAt` converts the pointer to a share and hands it to the same function the
field uses.

### A cylinder with both mounts locked gives its member panels a lock banner, not a padlock row

`frozenJoints` closes a lock on a mount over the part's consequences, so locking A *and* B holds
all four joints, and the Barrel and Rod panels then show the lock banner in place of their
`hold-field-block` rows. An e2e that wants a ram both locked and fixed at a length has to press the
padlocks first and lock afterwards; `e2e/cylinder-members.mjs` does it in that order and says so.
While there: a `.notification` carries a refusal's **long** sentence, never its `short`, so a check
that greps for the short string passes only by accident.

### A Material tooltip takes the pointer, and `matTooltipClass` is not where to say otherwise

`.cdk-overlay-pane` is `pointer-events: auto`, so an open tooltip is what a press over it lands on
— reported on the Joint Type choice, where a grayed option's reason opened over the options beside
it and ate the press meant for one of them. `matTooltipClass` cannot fix it: that class goes on the
tooltip's inner element, and turning the pointer off there only hands the press to the pane behind
it. The switch is `disableTooltipInteractivity` in `MAT_TOOLTIP_DEFAULT_OPTIONS`, which adds
Material's own `mat-mdc-tooltip-panel-non-interactive` to the *pane*;
`BLOCKS/tooltips-are-labels.ts` is that provider, given by `segmented-block` and the right-click
card. Also worth knowing: a tooltip has exactly two positions, the one asked for and its exact
inversion, and the overlay picks the inversion whenever the first does not fit — so `above` becomes
`below` in a short window, over whatever is under it, and no API stops it. Which side a reason opens
on (`sideFor`, `reasonSide`) is therefore the tidy half of the answer and the inert pane is the
half that holds when the window is small.

### A body carried rigidly must not write a joint some cylinder places for itself

`planEdit`'s `settle` skipped its *own* cylinder's N and S when carrying a body, which is the same
rule as "skip every cylinder's" for exactly as long as no two cylinders share a body. Weld two
barrels into one bracket and it stops being the same rule: laying the edited part out put its N
where the new length wanted it, placing the joint the two share woke the other part, and the other
part carried that bracket — N and all — back to where it started. The lengths check added in
`8e511611` then found the part the reader had just resized was not the length they typed, and
`cylinder.carried-too-far` came out on every Barrel Length, Rod Length and *Starts at* typed at
either of them. The set is `derivedByARam`, over `context.cylinders`, and the fixture is
`src/tests/verification/cylinder-shared-bracket.spec.ts`.

### Two cylinders in one body have to ride its motion, not be re-laid between their own ends

The sequel to the note above, and the reason an Angle typed at one of them was still refused. A
cylinder whose barrel is a *leaf* of a body this edit is carrying has already been told where to
go; asking `layoutFor` to re-lay it between its two joints reads the far end's **old** position as
a constraint, so the second part wrote the bracket back flat over the turn the first had just been
given and `rigidityRefusal` called it a change of shape. `ridingOn` in `cylinder-pose-plan.ts` is
that case: one side carried, the other not, and a far end that is free — no ground, no Lock, no
other body on it — takes the carry whole. Waking is guarded too, by `stationary` and `sameMove`: a
body standing still, or being carried through the motion it was already being carried through, is
not news, and without that the two parts wake each other over one rotation until the visit limit
calls an ordinary turn a conflict.

### The start-pose ghost is a painter of a cylinder, and `GhostBody.fill` is not what is on screen

`buildGhosts` fills each body from `getLinkProp(link, 'fill')` and its shape from `link.d`, and
both of those are records rather than what the canvas draws. A rod that has chosen no color is
painted in its barrel's (S15) while its own `fill` still holds the palette color creation handed
it, and a member's `d` is the two-joint capsule the skin replaces — so the ghost of a navy ram was
a mint-green rod in a lavender barrel, drawn as two plain bars. `model/ghost-paint.ts` is where the
canvas asks the two rules instead (`fillShownOn`, `memberSilhouette` with no `cutEase`, since the
easing exists for a union and the ghost has none), and anything else that paints a body from a
record has the same bug waiting in it — `services/export/mechanism-svg.ts` still strokes every link
with `link.fill`.

### A cylinder's slot is cut in its barrel, so ask the barrel whether it holds the slider

`PrisJoint.isSlotWellFormed` refuses a carrier whose joints include the slider itself, and it asked
the *carrier* — which is a root. Weld a cylinder's two end joints into one body and the rod becomes
a leaf beside the barrel, so the root holds the seal while the bore in the barrel is as real as it
ever was. `MechanismService.reconcileSlots` answered by calling `detach()`, which is not
recoverable: unwelding rebuilds the two bodies but cannot invent a bore, so the ram never came
back, and the URL the state then wrote was one the decoder refuses (*"URL seals a joint that is not
a floating slider"*) — a reload or a share opened an empty grid, and undo and redo threw where they
stood and said *"That shared link could not be opened"*. The question is asked of the **slot's
host** now, the smallest part of the carrier that still holds both slot ends, and only for a sealed
seal: an ordinary slider whose rider is welded into its carrier really does have nothing left to
slide, and is judged exactly as before. The same exception lives in the codec's
`validateDecodedSlotCarriers`, in the same words, because the two disagreeing means the app writing
a URL its own decoder refuses. The fused part resolves with `barrelRoot === rodRoot`, which is the
state `cylinder-pose-plan.ts` already had an answer for (`cylinder.both-ends-fused`): it can be
moved, it can never extend, and unwelding gives back exactly what was there. The drawing side is
robust either way: `RealLink.leafOutlines` only treats a rod as drawn elsewhere while its seal is
still floating, so a body holding a member no skin is drawing draws it itself.
`e2e/cylinder-mount-render.mjs` and section 16 of `e2e/cylinder-members.mjs` carry the scene.

### `vi.spyOn` over a method that is already spied hands back the mock that is there, calls and all

So a per-test helper that re-spies `NotificationService.prototype.refusal` gives the second test the
*first* test's `mock.calls`, and `calls[0]` is a message from a drawing that test never built. It
passes for as long as the check is on the refusal's code, which two tests in a row are likely to
share, and lies the moment the check is on the sentence. `mock.calls.at(-1)` is what a test that
provoked one refusal means; `cylinder-edit-transaction.spec.ts` says so where it uses it.

### A sliding joint's own point body carries *both* of its reactions, summed

`ForceSolver.pointBodies` makes one `Link` per `PrisJoint`, keyed by the joint's own letter, and
two reactions are written on it: the normal force in the slot (against the slot's carrier) and the
pin force on the rider. `jointReactionsByLink.get(S).get(S)` is therefore their sum, which is not a
force on anything a reader can name — while `get(S).get(carrier)` and `get(S).get(rider)` each are.
The panel used to show the point body's row labelled after the *carrier*, on the reading that what
a block has of its own is the force in its slot; with a grounded slot, where there is no carrier
body and so no second row, that reading holds. With a floating slot — and a cylinder's always is,
cut into its barrel — it produced two rows under one name over two different numbers. A cylinder's
seal drops that row (`isOwnPointBody` in the analysis panel, and the same filter in
`ExportColumnsService`); a grounded slider keeps it, because there the slot force is reported there
or nowhere.

### `ForceSolver` solves the moment a welded guide carries and nothing reads it

`guideCouples` — one scalar per welded slide, the couple the slot supplies because the rider cannot
turn in it (`docs/phase-3-slide-spec.md` §3.8) — is computed, returned on every frame, and consumed
by two specs. No panel, no graph and no export column asks for it, and `AnalysisSampleService`
knows no `mechProp` that would reach it. So a cylinder's barrel can report the force in its slot
and not the moment, which is a real gap rather than an oversight to fix in passing: surfacing it
means a new series, a torque unit on it, and a column in the drawer.

### A cylinder member is named by its ends even when somebody typed a name for it

`visibleBodyName` asks `memberEnds` *before* it looks at the written name, so the barrel of
`Cylinder_Gripper` — stored with the name `Barrel` — reads `AC` everywhere, and its rod reads `CD`
rather than `Rod`. That is decision S10 working as intended (a member is named by its own two
joints, so the two halves can be told apart), but it means routing a surface through
`visibleBodyName` can *replace* a name the reader typed. It only happens on the two members of a
cylinder; every other body keeps a typed name.

### A CAD export's zip is stored, not deflated, so its tables can be read without unpacking

`services/export/zip.ts` is `zipStore`: method 0, no compression. A suite that wants to check what
went into `mechanism.zip` can read the file as `latin1` and search it for the string it cares
about, which is what `e2e/hidden-joint-audit.mjs` does rather than carrying a zip library.

### The linkage table renders in exactly one place, and it is the developer drawer

`<app-linkage-table>` appears once in the app — inside `#debugWrapper`, right-panel tab 4, which is
dev-only and unreachable in production (the copy in `app.component.html` is commented out). So a
change to it is a change to a developer surface, and anything written about "the linkage table" as
a thing readers see is describing a door that was closed a while ago.

### `reseatFloatingSliders` cannot just write a block that is a cylinder's end joint

Every other floating block is a point, so the pass projects it back onto its channel and writes the
two coordinates. An end joint is one end of a rigid part, and writing it leaves the barrel and rod
the lengths they were; `deriveCylinderInteriors`, which runs next and never clamps, then puts N and
S back on the *new* axis at those lengths and draws the head as far outside its own barrel as the
stretch. So the pass collects those moves and hands them to `GridUtilsService.runEdit`, whose
`layoutFor` re-lays the part from its two ends through `stretchedCylinderPose` and resizes it to
reach — with `rebuild: false`, because every caller of the reseat runs `updateMechanism` straight
afterwards and asking for one here comes back through the same pass.

A carrier dragged until the span is under what the part closes to would be refused there, with a
good sentence — and then the block sits off its rail for good and *every later edit anywhere in the
drawing* asks the same refused question again. So `model/slot-reseat.ts` asks the layout first and
takes the channel's answer as far along the channel as the part can follow, which is what a rail
and a collar do. The answer is always on the channel: a point between where the block was and where
the hole went is a block in neither. A Lock on the end joint skips the whole branch — a lock says
the joint does not move, and a reseat is nobody's gesture.

### A cylinder's URL has never re-encoded byte for byte

Create a cylinder, change nothing, reload from the address it wrote, and the two strings differ:
the two member links' centres of mass come back one encoding unit apart. They are *derived* (S14),
so they are recomputed from joints that arrived at the URL's own precision rather than from the
unrounded ones the first encode saw. An ordinary bar dropped on a slot at the same fractional
coordinates round-trips exactly. So a check on a cylinder drawing compares the *drawing* — roles,
carrier, lengths, pose — and not the string; `e2e/cylinder-mount-slot.mjs` says so where it does it.

### A rail square to a cylinder's axis is a dead centre, and the solver is right to refuse it

Drop a cylinder's end joint on a fixed rail that crosses the part at a right angle and the mechanism
reads one degree of freedom and then reports "Nothing moves when the input turns". Both rows that
touch the end joint — the slot's `onLine` and the drive's commanded span — have the same gradient
there, so `hasFullColumnRank` refuses the system. That is the geometry: extending the cylinder pushes
the joint along the part's own axis, and the rail only lets it go across. Slant the rail, or start the
part off the perpendicular, and it runs. Worth knowing before hunting a solver bug that is not there.

### An end joint that has gained a slot can no longer be merged onto a joint

`refuseJointMerge` refuses a `PrisJoint` *source* outright ("a slider cannot merge"), and a cylinder
end that has been dropped on a bar is one. So the way back is Joint Type → Revolute on that joint,
or pulling the block clear of the bar and then dragging it onto the joint — not a second drag at the
joint, which shows the red ring and the reason. The same has always been true of an ordinary block;
it is only surprising at a cylinder, where the joint was an ordinary pin a moment earlier.

### `resolveSlotDropTarget` already kept a cylinder's own two members out, for two different reasons

Dragging an end joint, neither the rod nor the barrel is ever offered as a carrier — and not because
either is a member. The rod is a body the dragged joint *belongs to*, which the first line of the
loop skips; the barrel is a body holding the part's **other** end, which `slotWouldFoldACylinder`
skips. The canvas's own `isCylinderMemberLink` filter is about *other* cylinders. Worth knowing
before adding a rule that is already there twice.

### A welded bracket is rigid in the simulation and not in the editor

`planEdit` / `settle` in `model/cylinder-pose-plan.ts` carries a welded body **only for a body
drag** — `dragCylinder` and `rotateCylinder`, which say `motion: 'body'` on the pose (S21). Every
other edit of a cylinder writes its own four joints and lets the bracket welded to a member change
shape around them, exactly as a compound link does when one of its joints is dragged. The file used
to argue the opposite, in so many words: that moving a member and not the bracket does not deform
the body but *tears* it. It reads convincingly and it is wrong for this app — nothing else here
treats a welded body as rigid at edit time. Three things fall out of it that surprise in their own
right: a Lock out on a bracket no longer freezes the cylinder welded into it, a cylinder whose two
end joints are welded into one body now takes a length (the `cylinder.both-ends-fused` sentence is
gone), and `rigidityRefusal` is asked about carried bodies only, because a body the edit
deliberately let change shape is not a failed rigid motion.

### A joint's own hitbox is `objectScale / 4` and did **not** follow the bar down

When the bar's half-width became the rod's (`barHalfWidth`, decision S23) every restatement of
`objectScale / 4` was rewritten to ask for it -- except the transparent circle in `jointHolder`
that a joint is grabbed by, which is still `settings.objectScale / 4`. It reads the same number by
coincidence rather than by derivation: it is a grab radius, sized so a pin is easy to hit, and a
bar's edge is not what it is measuring. Narrowing it with the bar would have made every joint 9%
harder to grab for no reason anybody could see. The nearby `0.25 * settings.objectScale` on the
force anchor is the same kind of number.

### `SynthesisCanvasService.barHalfWidth()` existed for months and nothing called it

It returned `0.25 * objectScale`, the bar half-width, while seven `this.settings.objectScale / 4`
sat beside it in the same file building pose bars, previews and the selection box. `max-lines` and
`no-unused-vars` both let a private method nothing calls through. It is `barHalf()` now and every
one of the seven asks it. Worth a glance whenever a file has a well-named helper *and* the number
it wraps spelled out nearby -- the helper may never have been wired up.

### The middle of a cylinder's head is the seal's cream mark, so a pixel there says nothing

Sampling `#fff8e1` at the centre of every head in every scene is not evidence that the layering is
right; it is the slide mark (`slideMarkPath`) the joint layer draws over the head. To read the band
that says how much rod is in the bore, sample **along the head's own axis** -- `headAlongHalf * 0.8`
through the element's `getScreenCTM()` clears the mark at full size and on a shrunken head alike,
and stays inside the block's end cap. `e2e/cylinder-mount-render.mjs` does exactly that.

### Two barrels in one bracket were never painted wrong, and two rods always were

`fusedBodiesOf` claimed a shared shape for the *first* mark in list order that held it, rods first.
A barrel unit was therefore always claimed by the earlier cylinder -- whose group is painted first
-- so the bracket landed before both heads and the drawing was right by luck. A rod unit was
claimed by the earlier cylinder too, which painted it *before* the later cylinder's group: the
later head came out bare `#000`. The chain was right or wrong depending only on which of the two
cylinders was drawn first. Decision S24's order removes the luck; the asymmetry is worth knowing
before reading a bug report that says "sometimes".

### `refreshAnchors` held an anchor across an edit made *at* the start pose

The anchor is held across a rebuild on purpose — that is what carries a machine's start through an
edit made at some *other* pose. Held whenever the topology and the rule were unchanged, it also
outlived the ordinary case. Drag the driven crank's own pin, or the ground it turns about, while
the drawing is showing its start: the design's t = 0 is the drawing as edited, and the anchor goes
on naming the angle the crank used to stand at. Nothing looks wrong, because at the start pose the
canvas draws no ghost (`showStartGhost`). Press play, pause anywhere, and the ghost appears a
third of a turn from where stop-to-start lands — which is the report this was found from, and it
reproduces on a plain `4-Bar` with no cylinder anywhere.

`reanchorIfStartMoved` is the guard, and the condition is worth understanding: for a machine this
rebuild did **not** stage, `restoreStartPose` has just put the editable arrays on that machine's
own t = 0, so the sample 0 it has just been solved into *is* its start. `anchorStillNames`
(`model/mechanism/anchor.ts`) compares the anchor's seed against that sample rather than re-reading
the coordinate, because the coordinate is stored on purpose: re-derived every rebuild it would walk
the start a fraction of a sample at a time and no single edit would look wrong. Pre-existing —
`origin/staging` gives the identical numbers.

### `isAtStartPose()` believed a synced drawing whose second machine was mid-cycle

`seekMechanism` writes the shared sample index only for the **master** machine, the one with the
longest cycle. Any other machine can therefore be parked a third of the way round with
`mechanismTimeStep` still reading zero — and a posed edit's closing re-seek (`seekToCoordinate`)
leaves it exactly there. `atStartPose` only consulted the per-machine clocks while *unsynced*, so
synced it answered yes, and that is the answer `restoreStartPose` asks before every rebuild: the
next edit anywhere on the drawing wrote that machine's displayed pose down as its t = 0. Its start
moved 692 model units on `Three_Machines`, the URL saved the new one, and no ghost was drawn over
it, because at the start pose there is nothing to draw. `model/edit-permission.ts` has described
this answer as "every machine parked at its own start" the whole time; it is that now. Needs two
machines to reach — one machine is always its own master.

### An amber ghost outlived the anchor it was warning about

`buildGhosts` falls back to `lastGoodGhost` when the anchored pose is out of reach, which is right
during a drag: the ghost has to stay on screen at the moment it is warning that the start is about
to be lost. It also ran when there was no anchor **at all** — switch a machine's drive to a joint
whose input has no coordinate rule and the anchor goes while the cycle stays — so the amber ghost
stood there between gestures over a machine that had no start to lose, and disagreed with
`anchorIsReachable`, which has always answered that a machine with nothing anchored is not a
machine in trouble. No anchor now means no ghost, and the held pose is dropped with it.

### A machine that cannot be solved *this rebuild* has not stopped existing

`refreshAnchors` collects the machines it can solve into `alive` and drops every anchor whose key
is missing from it. One edit is often several steps, though, and the drawing between two of them is
one nobody asked for: `JointTypeService.set` un-grounds a pin, retypes it and grounds it again, and
in the middle the machine counts a freedom it will not have a moment later. Judged by the solve,
that one rebuild dropped the anchor — and the next valid rebuild took a fresh one from sample 0,
which while the edit is staged is the pose under the reader's hand. `alive.add(key)` now happens
before the validity check, so the set means "this machine still exists" and nothing else. A machine
that stays unsolvable keeps a stale anchor, which costs nothing: every surface that reads one asks
about validity first.

### `orderCoupledPartition` can leave nothing to solve, and then has to say so

Its `'nothing-to-solve'` branch is reached when the drive's own walk has already placed every joint
— which is what a drawing whose every joint rides the input's body looks like, a cylinder welded
into one body at both ends on a grounded driven pin. The branch checked that the drawn pose
satisfied its own constraints and returned, without touching `PositionSolver.stepCount`. The reset
leaves that at zero, so `attemptPositionAnalysis` ran none of the steps the walk had emitted and
reported success — and `Mechanism.findFullMovementPos` then read `jointMapPositions` for a joint
nothing had placed and threw a `TypeError`. `stepCount = orderNum - 1` is the whole fix, and the
number matters: the `'solved'` branch adds one more step at `orderNum` and sets `stepCount` to it.

### A thrown solve leaves `MechanismService.mechanisms` holding the *previous* machine

`updateMechanism` builds into a local and assigns at the end (`this.mechanisms = buildEach()`), so
an exception inside any `new Mechanism(...)` escapes with the old array still in place. Nothing
resets it and nothing says so: the panels go on reading a machine solved before the edit, and every
sentence they draw is about a drawing that no longer exists. That is how "Nothing drives this
mechanism" came to be shown about a joint that had just been given Driven Input — the machine
answering was the one built the moment before the toggle. When a readiness sentence contradicts the
drawing, look for a throw before you look at the sentence.

### `partition.links` holds root bodies, so a welded cylinder member is in none of them

`indexOfMechanismSolving` and `partById` both searched the top level only, and a cylinder's barrel
or rod that a weld has folded into a compound is a leaf. Both answered "no such part" — so
`isPartSimulatable` was false and the analysis panel told the reader that a body of a running
machine "is not in a mechanism that can be solved", and `mechanismForId` returned nothing so every
graph drew dashes. `bodiesUnder` in `model/link.ts` is the one flatten the three places share; the
rate solver's `fillRatesByDifference` walks it too, for the same reason.

### A slot constraint between a body and itself is `0 = 0`

Which is harmless in the least-squares position solve — a redundant row, and the gate is on column
rank — and not harmless in the force solve, where the guide couple it implies is a column no row can
pin. `ForceSolver.analyzeFrame` skips a frozen cylinder's slide outright (`frozenCylinderAtSeal`),
and `enumerateReactions` gives its seal an ordinary two-component pin pair with the body instead of
a normal force, because a point body has two rows and a rigid attachment at a point is two unknowns.
Getting either half alone gives a matrix one unknown short of its rows, which reports as "a body
here has nothing to react against".

### `admitCoupledSystem` was judging the URL's rounding, not the mechanism

Its residual gate asks the drawn pose to satisfy its own constraints to
`scale * 1e-6` — one part in a million of the mechanism's size — before the
coupled solver will answer for it. That is the right shape for what it is
refusing (a structure somebody has bent by hand) and far tighter than the
precision a pose actually arrives at: the transcoder packs a coordinate onto a
step of about a thousandth of a user unit, absolute, the same on a four-unit
drawing and a two-hundred-unit one. On the maintainer's cylinder-on-a-slot that
was 5.1e-4 against a 0.2 grain, and the riding end joint was stored 7.6e-2 off
its slot line — so a mechanism that ran in the session it was drawn in refused
to run when it was reopened, with `nothing-can-move` and every non-ground joint
named unsolvable. The tolerance is floored at `4 * URL_COORDINATE_GRAIN` now
(`drawnPoseTolerance`, shared with `prescribedGeometryHolds`), and
`settleInitialPose` — which runs *after* the gate, and is the reason the gate
could afford to be generous all along — puts the admitted pose exactly on its
constraints. Nothing is moved at decode.

### Undo replays a URL, so a decode-only bug is an every-undo bug

`SaveHistoryService` stores states as encoded strings and restores by re-running
the decoder. Anything that only goes wrong on the way back in therefore goes
wrong on every undo and every redo, not merely on a reload — and the symptom is
not "undo is broken" but a drawing that has no cycle, no anchor and no ghost
until the next drag happens to reseat it. When a ghost or anchor report names a
particular drawing, check that the drawing still solves from its own URL before
looking at the anchor code.

### A fixture's link string is one character per joint

`buildFixtureLink` spreads `spec.joints`, so a link written `'DD1'` asks for
joints `D`, `D` and `1`. A cylinder's buried inner end is named `A1` in the app
and cannot be written in a fixture at all; published cylinder fixtures give it a
single letter (`N`) instead, and every reader-facing name still drops it because
`visibleBodyName` finds it by identity rather than by the shape of its id.

### A published cylinder fixture has to carry its colors

`cylinder-rod-color.spec.ts` sweeps `FIXTURE_GALLERY` for S15 — a cylinder is
one color — and a fixture that says nothing about `fill` gets the palette
cursor's next color per link, so its barrel and rod come out different and the
sweep fails. Write the fills the drawing was shared with: the barrel, the rod
and, where a weld has swallowed the rod, the body holding it.

### A throw inside `new Mechanism(...)` used to leave every panel describing the previous drawing

`MechanismService.updateMechanism` assigns `this.mechanisms` only after every
partition has been built, so an exception from one solve escaped before the
assignment and the service went on holding the machines from before the edit —
readiness, the chips and the playback rows all true of a drawing the reader was
no longer looking at. That is how a body with Driven Input on was told nothing
drives it. `Mechanism`'s constructor now catches a throwing solve, logs it with
`console.error`, and comes back invalid as `'solver-error'`, which readiness
answers with its fallback. So a red console line plus "This mechanism could not
be solved" means a solver bug to go and find, not a drawing to fix.

### Split Joint treats a floating slot's carrier as a body

A floating `PrisJoint` is absent from its carrier's `joints`: that absence is what makes it a slot rather than a pin. Split Joint counts the carrier so the action is offered, but releases that constraint instead of inserting a carrier pin. The same `PrisJoint`, drive units, and all rider memberships remain; it becomes dangling and moves a small distance normal to its former slot. Ordinary shared pins spread by a small fraction of the drawn joint scale. Both motions use the constrained drag path, so position locks and holds remain authoritative. Counting only `joint.links` makes every ordinary floating pin-in-slot look like a one-link refusal.

### A force flip needs a solve-cache key even when no point moves

`Flip Force` keeps `startCoord`/`endCoord` fixed and toggles `arrowOutward`. Omitting that bit from the solve fingerprint reused the old solution, which overwrote the new orientation when the paused pose was restored. Include the bit, carry it through posed edits and pose interpolation, and test both the endpoints and the sign of the physical components. Numeric exports use `directionCoord` because their endpoint-only representation cannot encode an inward arrow.

### Numeric drags should commit once, through the field

Previewing each pointer move through Angular's input event made a gesture produce several undo states. `NumberDragDirective` previews the text locally and dispatches input/change/blur only on release; Escape and pointer cancellation restore the original text. The browser regression checks that one Undo restores the value before the whole drag.


### PR32 follow-ups: animation anchors, orphan cleanup, and vector drag cost

A bar label's offset must choose an end from the authored pose, then follow that end during playback. Choosing the currently higher end flips the label across its CoM every horizontal crossing (`bar-label-axis.ts`). Deleting a link or cylinder must prune only its own newly unlinked joints: sweeping every orphan also deleted unrelated standalone inputs.

Number adjustment now starts on the field label, preserving the value's native text selection. Tables without an individual label keep ordinary text editing. Deletion consequences occupy a second menu line, keeping the 320px cap and Delete shortcut. The Edit panel measures horizontal overlap with playback cards before reserving their height.

Vector paths were rebuilding all cycle samples on every drag move. In a four-bar drag with velocity and acceleration on B and C, this cost 30 rebuilds / 254ms and 143,144 sample reads. Reusing the cycle paths during the gesture and refreshing on release reduced this to one rebuild / 7ms and 20,032 reads; the current-pose arrows continue updating. The measured frame p90 fell from 17ms to 9ms on this machine (`e2e/vector-drag-profile.mjs`). Ask `DragStateService.isDragging`, not `onMechUpdateState`: a solve emits state 2 during the drag, so that observable alone cannot guard the expensive work.

Shared reproductions: [Luffing crank label](https://deploy-preview-32--pmksnew.netlify.app/?2v.Ay,1E8.A,1V.1011.4O,O,0,0,0.0C,C,Qv,cP,0.0T,T,rn,1Co,0.6G,G,YO,09O,0.1K,K,Fs,Me,0,OCT,O,T..ARGK,Luffing%20crank,mr0,1T,P7,6e,303e9f,G,K,,.MROCT,Boom,4a_0,S7,LX,Uk,0d125a,O,C,T,,..1F1,OCT,F1,rn,1Co,sg,1X7,d4..N_P*2IoWB5), [HI beside orphan G](https://deploy-preview-32--pmksnew.netlify.app/?2v.EK,1E8.A,0.1011.6G,G,YO,09O,0.9H,H,1C4,0F2,0.0I,I,1TR,051,0..ARHI,HI,0,0,1Km,0A2,303e9f,H,I,,...N_d*1yshxG), [Standalone input A](https://deploy-preview-32--pmksnew.netlify.app/?2v.Ay,1E8.A,0.1011.6A,A,0d1,8J,0,,,,02SG....N_k*418cfy).


### A tracer selected through a compound primitive still belongs to the root

The second click on a compound now selects a primitive object, not the root with a remembered leaf. `graftJoint` must grow that primitive and every containing compound, while the new joint’s `links` and `connectedJoints` name the rigid root. Growing only the leaf left a point visible but absent from the topology serialized and solved. Preserve force `anchoredTo` identities when the growing primitive changes its ID. `e2e/force-frame.mjs` exercises the supplied HI/IJ drawing through add, drag, undo, redo, and URL reconstruction.

The designer’s “Force rendering and frame visualization-2.zip” final card 2a replaces the older force weld-plus grammar: a disc and ring/keyway stay at the application point, independent of arrow sense. The inward tip stops one shaft width before the anchor. The lock badge is offset beside the disc so the frame stays legible. The panel Angle and its hover/focus guide both measure from the owning body for Local, and from +x for Grid; stored `angleRad` continues to be the physical world direction.

[Compound tracer reproduction on PR32](https://deploy-preview-32--pmksnew.netlify.app/?2v.9x,1E8.A,0.1011.0H,H,ve,0Cg,0.8I,I,11m,He,0.0J,J,1YS,01G,0..ARHIJ,HIJ,0,0,17v,5L,303e9f,H,I,J,,HI,IJ.aRHI,HI,0,0,zi,2V,303e9f,H,I,,.aRIJ,IJ,0,0,1I6,8C,0d125a,I,J,,...N_l*2yNYpD).


### Force marks need one geometry scale, and inward shafts end at the head’s base

The final force designer SVG uses the same proportions at every zoom: a 9-unit shaft, 2.7-unit selection stroke and handle outline, 3-unit white disc outline, and 3.2-unit keyway at object scale 90. Mixing screen-sized strokes with model-sized discs made the mark lose its proportions. Keep those marks in model scale, with the angle assistance remaining screen-scaled. The selected centerline is amber, the datum follows the force ink, and the square is cream. Hover lightens the chosen color rather than replacing the whole palette with one blue. An inward triangle’s tip is inset from the application disc, so its shaft must stop three shaft widths before the anchor, at the triangle base. `e2e/force-precision.mjs` compares actual Angular-rendered glyphs against the designer’s final card 2a, isolates them on identical scenery, and exercises all six colors.

### Delete must address a selected primitive through its owning compound

After a second click, `selectedLink` is a primitive absent from the root link array. A root-only index lookup made Delete silently return. Release that primitive through the existing compound split operation, remove forces anchored to it, and prune only its newly unlinked joints. Deletion previews must check surviving primitive membership rather than the compound’s old joint union. The HI/IJ reproduction is covered through keyboard Delete, panel Delete, and Undo in `e2e/force-frame.mjs`; a unit test preserves the remaining multi-member weld and its force.

- **Display size must not become cylinder geometry.** `cylinderStrokeAlong`, member edit constraints,
  Starts at, and the head's axial size used to read Object Size. Preserve the legacy physical scale
  before changing display thickness and serialize it separately; changing only the solver default
  misses explicit radius arguments in grid edits and the Starts at overlay. See [object sizing](object-sizing.md).
- **An Angular template guard must see the same pruned trace state as its child.** `anyVectorTrace`
  checked a Set before `vectorTracePaths()` removed deleted parts; the next verification pass saw
  the guard change and raised NG0100. Resolve the cached paths before returning the guard.
- **Synthesis length conversion must finish before recomputing pose endpoints.** Moving centers
  before converting the shared length leaves endpoint caches in the old unit even though fields
  look right. Recompute after both are converted.
- **Scale synthesis chip outlines with the SVG viewport.** Chip circles and text already use
  `scaleWithZoom`, but a CSS `stroke-width: 1` stays in model units. Switching from centimeters to
  meters then magnifies each white outline into a large halo. Bind the stroke width through
  `scaleWithZoom(1)` on the SVG circle so it stays about one screen pixel in every unit.


### Drawing scale cannot publish into OBJECT_SCALE

`Coord` closeness tests, slot travel and solver fingerprints still read the legacy object scale.
Automatic zoom limits must use an independent presentation scale. Keep display copies out of
`RealLink.d`/`outlineLoops()` as well: those paths are CAD data, and solved frames carry deferred
snapshots of them. Cache display copies by shape and size and rigidly place them for playback.
`cylinderSkinFrame` must use the physical clearance even when `preservedCylinderScale` is zero;
falling back to the requested display radius makes old cylinder heads change length during zoom.
A held start-pose ghost also needs a geometry snapshot before rebuilding it at another display size.
Do not add `non-scaling-stroke` to a weld whose inline selection stroke is already inverse-zoom
scaled: at extreme zoom-out it turns into a huge solid block. Check the rendered ink, not just
the path bounds or pin radius, in the zoom filmstrip.

### A weld's inline stroke width beats any stylesheet width

The weld cross binds `[style.stroke-width]`, because a picked weld's selection ring is that same
stroke. An inline style beats a class rule that is not `!important`, so a Schematic hairline set in
`new-grid.component.scss` was drawn at the ring's width instead: the welds came out as solid ink
squares. Give the weld's unselected width through the same binding (`scaleWithZoom(1)` in
Schematic) and keep `non-scaling-stroke` off it, for the reason in the note above.

### Schematic riders are drawn by the slider layer, not the link layer

`#linkHolder` is under every block, so a rider drawn there disappears under the block it is pinned
to. In Schematic the slot stack draws each rider's and weld plate's line at its depth, and the link
layer skips every link `drawnBySlotStack` names. Selectors that count schematic bars must include
`.schematicRider` as well as `#linkHolder > path`.

### A cylinder member's tag is its own name, on its own half

The barrel and the rod each have a Rename, so each wears its own tag: `linkDisplayName` is
`visibleBodyName` for a member as for any body, and `linkLabelStyle` puts the barrel's between A
and S and the rod's between S and B. The one tag that named the part by its two mounts is gone,
along with `isSecondaryCylinderTag`: renaming a member changed nothing on the grid. A member welded
into a compound is still named by the compound's tag, as every primitive in a compound is.

### A cylinder member's center of mass takes the grab only to refuse it

A member's center of mass follows its shape (decision S14), so its mark is not a handle. It still
takes the pointer while its member is selected (`comGrabbable`), and `startComDrag` answers with a
refusal rather than a drag. Left transparent to the pointer, the grab fell through to the member
and dragged the whole cylinder.

### The start ghost's own rule takes the stroke off every body

`.startGhost .ghostBody { stroke: none }` is right for a filled ghost and fatal for a schematic one,
whose bodies are nothing but their stroke: Schematic also sets `fill: none`, so the ghost drew
nothing while its transparent grab lines still took the click and jumped the drawing to its start.
The schematic ghost's stroke is bound as an inline style, which the class cannot override.

### A CSS `drop-shadow` on an SVG shape is measured in the drawing's units

A `filter: drop-shadow(0 0 2px …)` on a path inside the canvas blurs by two *user units* of that
path, not two screen pixels, so a selection glow that looked right on a four-bar vanished on a
drawing at another scale. Safari applies no CSS filter functions to SVG shapes at all. Schematic's
selection is a band of its own, drawn under the line with a `scaleWithZoom` width.

### `#primitiveSelection` holds two paths when the part belongs to a body

A part picked inside a compound draws its own solid edge, `.link-selected`, over a dashed edge
round the whole body, `.compound-context`. A check aimed at `#primitiveSelection path` found one
path until the dashed edge arrived, then failed Playwright's strict mode in `editor-bug-fixes` and
`editor-followups`. Aim at `.link-selected` for the part and `.compound-context` for its body.
Both are in the selection yellow, so compare the path's `d` against the part's own shape, such as
a cylinder mark's `barrel` or `objectDisplay.path(part)`, to tell the two apart.

### The left panel's `.panel` is the frame; measure `#normalPanel` for the card

`app-left-tabs .panel` keeps `$shadow-room` (16px) of padding under the card for its shadow, and
since ac24921a the Edit and analysis clearances subtract that padding so the *card* stops one
`$card-inset` (12px) above the playback cards. The frame therefore reaches 4px into the controls
by design, and the controls, on `--layer-cluster` above `--layer-panel`, still take the press there.
`editor-followups` measured the frame and failed at 506 against 502 for as long as the rule had been
right; measure the card, as `bug-fixes-2` does, and hit-test the strip if the press matters.
