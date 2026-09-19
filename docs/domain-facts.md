# Domain facts, and reading what the app produces

> **Status:** Reference — what a mechanism actually is here, and how to check an export.

What the solvers, units and coordinates really do, stated once. Most of a debugging
session in this app is spent rediscovering one of these, usually after assuming the obvious thing.

Open it before debugging anything about a mechanism, a unit, a direction or an exported file.

---

## Contents

- [Domain facts worth knowing before you debug](#domain-facts-worth-knowing-before-you-debug)
- [Checking an exported file](#checking-an-exported-file)

---

## Domain facts worth knowing before you debug

- **The transport's handle measures the *input*, not the clock, and the start pose is usually not at
  either end of it.** `drive-profile.ts` maps each solved sample to `along` ∈ 0..1 across everything
  the input does: end to end of a stroke, limit to limit of a rocker's swing, or once round for a
  crank. Only the crank is measured *from* the drawn pose, so only there does the start sit at
  `along = 0`. A rocker drawn mid-swing starts four tenths along its own track, which is why the
  start marker is `profile.along[0]` and not zero, and why "is this parked away from its start" is a
  question about `secondsOf(index)` rather than about how far along the handle is. Ask the wrong one
  and the card claims a machine standing exactly on its start is 24 degrees from it, with 0.00 s
  printed beside the claim.

- **The grid's minor step has to be a round number too, and that decides how many there are.**
  `cellSizeFor` picks the major off the one-two-five ladder; `minorDivisionsFor` then splits it 10,
  4 or 5 ways depending on which of those it landed on, so the minor comes out a 1, a 2 or a 5 as
  well. A fixed five-way split only works for the fives: at a major of 2 it drew 0.4, 0.8, 1.2 and
  1.6, so a reader looking at a line labeled 2 had no way to find 1. Snapping reads `minorCellSize`,
  so the two cannot come apart. Note the half is *not* always a line — half of 5 is 2.5, which is not
  a number anybody would choose, and being round wins over being halved.

- **`MODEL_SCALE` is 200** (`model/render-scale.ts`) — model units per centimeter. A coordinate of
  600 is 3 cm. Most solver code is in model units and most panel code is in the reader's unit.
- **`partition.joints` are the same objects as the editable drawing** (not copies), and `animate()`
  mutates them in place. If something reads the "drawing" while the mechanism is not at timestep 0,
  it reads an animated pose.
- **`partition.joints` vs `partition.ownJoints`**: the first is everything the solver must be handed,
  shared frame pieces included; the second is what that machine is actually made of. "Is this mine?"
  is `ownJoints`.
- **Do not assume mechanism index 0.** One drawing can hold several machines, each with its own
  input, speed and playback row. Ask `partitions`. `mechanisms[0]` is not necessarily the master —
  `masterMechanism()` is, and the transport steps by *its* frame count.
- **A cycle's last sample repeats the first**, and the period *is* the last sample's time. A step
  that lands exactly on the period wraps to zero, so the final frame is reachable only by accident
  unless you index frames rather than add time.
- **Samples are one degree of crank apart**, except where a fold made the walk cut finer — see
  `Mechanism.addedSamples`. Time per sample is therefore not always uniform; `stepAtTime` and
  `timeAtStep` binary-search the real sample times, and code that divides the period by the frame
  count is making an assumption.
- **Some edits are gated on being at the start pose.** `isAtStartPose()` is false while playing or
  parked away from the start. Playing refuses everything; paused away from the start, a drag, a
  build, a structural edit and undo still go through in Edit, but the pose-bound fields (joint X/Y,
  link angle, masses, forces, cylinders, input speed) are refused, and an analysis mode also refuses
  building and restructuring (`refusalFor` in `model/edit-permission.ts`). If a UI test cannot
  edit, check the playhead before checking the feature.
- **A big drawing arrives unsolved.** Past 24 joints solving is deferred out of Edit and paid when
  an analysis mode is pressed, behind the loading cover. `mechanisms` being empty in Edit is normal
  for those.
- **Only two templates draw their frame as a link** — `Four_Bar_Inversions` and
  `Slider_Crank_Inversions` — so all-ground links are rare and easy to forget about.

---

### Gruebler's count is one-sided, so the geometry gets the last word

`determineDegreesOfFreedom` counts bodies and joints, and that count is wrong in exactly one
direction: it charges twice for constraints that say the same thing, so a linkage whose redundancy
is *geometric* comes out too low. The textbook case gets drawn here — a parallelogram with a third
parallel crank counts as zero and turns perfectly well, because the third crank repeats what the
first two already said. So when the count says a mechanism cannot move, and only then,
`model/mechanism/mobility.ts` asks the drawing instead: **freedoms = coordinates − rank(J)**, over
three coordinates per moving body and two rows per joint.

**A rank deficiency is not a motion, and believing it is will break a working app.** It says the
linkage can move *at this instant*. A slider-crank whose coupler is welded to its block, drawn with
the crank square to the slot, has the pin's circle touching the block's line: first order says they
agree and second order says they part immediately. So every freedom the rank finds is stepped along
and put back together — if the gap that opens has a part no first-order correction can close, it was
a tangency and the freedom is dropped. Two existing specs (`slide-mobility`, `motiongen-gripper`)
encode exactly that case and are what caught it.

Two rules keep the whole thing conservative, and both matter:

- The geometry is asked **only when the count says < 1**, so nothing the count already gets right can
  be reached.
- Its answer is taken **only when it is ≥ 1** — a rescue, never a demotion. Where both agree nothing
  moves, Gruebler's own number is the more useful: `-2` says how much has to come out, and a flat
  zero from a rank count says only that it is stuck. `e2e/phase1-drag.mjs` pins that.

The projection in `outsideRange` orthogonalizes the Jacobian's columns against each other before
projecting. Subtracting each column in turn without that leaves part of the span behind and reports
every genuine motion as a tangency — which is the answer exactly inverted, and it passes the whole
unit suite while doing it.

---

### A template can ship a picture to build on

A card in `template-catalog.ts` may carry a `backdrop`: an asset under `src/assets/backdrops/`, a
width in centimeters, and where to center it. `Backhoe_Bucket` has one. The picture is never in the
URL — an image is megabytes and a shared link is a few hundred characters — so what a *new tab*
carries is the card's name, in the **hash**, because the query is the mechanism and a second
parameter beside it would not decode past the checksum. `placeTemplateBackdrop` is the one door,
called from the library and again on arrival.

Two things it deliberately does not do. It does not clear a picture the *reader* dropped in: opening
a template replaces the mechanism, which is what the dialog warns about, and a file they chose is not
the library's to delete — so only backdrops under `assets/backdrops/` are taken down. And it does not
put the image in the undo history or the codec, the same as any background image.

---

### A force is stored in one unit and read in another

`settings.forceUnit` is what the reader is *reading*, and it is not what a magnitude is kept in.
`Force.mag`, the solver's `siUnitFactors`, and every URL in circulation are written in the length
system's own force unit — lbf under inches, newtons under centimeters and meters — and
`ForceUnit.KGF` is a third way of reading those newtons rather than a third way of keeping them.
`NumberUnitParserService.storedForceUnit` names the one, the settings subject names the other, and
`formatStoredForce` / `parseStoredForce` are the only crossing. Multiply a magnitude by 9.8 on its
way anywhere else and the solver is handed a load nine times the one that was typed. This is the
same split `displayInertiaUnit` / `storedInertiaUnit` already keeps for `g·cm²`.

**A torque is a force times a length, and both halves are the reader's.** `torqueLabel(force,
length)` is `lbf·in`, `N·cm`, `N·m`, `kgf·cm` or `kgf·m` — one rule, no cases. Centimeters used to
be the one system whose moment did not follow it, so a reader measuring in cm was shown a moment in
meters with a silent hundredth in the middle of it. `AnalysisSampleService` divides the solver's
newton-meters by both factors, and `analysis-sample.service.spec.ts` pins all four combinations.

**Adding a unit to one of these enums means appending it, after `NULL`.** The URL codec encodes an
enum setting as the *index of its key* in `Object.keys`, one base-64 character, so a value inserted
anywhere but the end renames every value already in circulation. `InertiaUnit.G_CM2` and
`ForceUnit.KGF` both sit past `NULL` for that reason and no other.

---

### The drawing is y-up, the screen is y-down, and two directives say so

Model coordinates follow the math convention: +y is up. The screen's is down.
The app reconciles the two once, in the template, and there are exactly two
words for it -- both in `src/app/model-frame.directive.ts`:

- **`modelFrame`** on a drawing layer turns it over, so everything inside is
  written with the numbers the solver produced: a joint is `[attr.cy]="joint.y"`
  and no arithmetic. Two dozen layers of `new-grid.component.html` wear it.
- **`upright`** on one thing inside undoes that flip for itself, because text
  drawn under it reads upside down and an asset authored y-down comes out
  mirrored. `[upright]="chip"` hangs the thing on a point in the drawing;
  bare `upright` flips in place, for something already positioned by its own
  `x`/`y`; `[uprightTurnedBy]` turns it first, for a mark bolted to a part.
  Inside an `upright` the axes are the screen's again, +y down, which is what
  lets a pill or a glyph be laid out with ordinary SVG numbers.

Both used to be spelled `style="transform: scaleY(-1)"`, which is why they are
directives now: **the frame and the escape from it were the same string**, and
eleven counter-flips were indistinguishable from the layers containing them
without tracing the nesting by hand. If you add a layer, say `modelFrame`; if
you add words to one, say `upright`.

What follows from the flip, and what has cost an hour more than once:

- **`SvgGridService` has one symmetric pair, and both halves carry the flip.**
  `screenToModel(Coord)`, `screenToModelFromXY(x, y)` and `modelToScreen(Coord)`.
  The pan-zoom matrix they go through is the *viewport's*, and the viewport
  sits outside the flipped layers, so the negation in those functions is the
  step the matrix is missing. They replaced a `screenToSVG` that negated y and
  an `SVGtoScreen` that did not -- two functions named as each other's inverse
  that were not one, with nothing saying which carried the flip. `svg-grid.spec.ts`
  round-trips a point and pins that a point above the origin in the drawing
  lands above it on screen.
- **`getScreenCTM()` on a layer already contains the flip** (`d < 0`), so
  mapping a model point through *that* lands on the right pixel with no
  negation. Mixing it with the viewport's matrix is how a probe reports a crank
  turning the wrong way. `revealOnCanvas` does the flip by hand for the same
  reason the pair does, against the matrix the canvas is drawn under right now
  rather than the one the library last announced.
- **The same angle has opposite signs on the two sides.** An angle measured in
  screen pixels grows clockwise; measured in model coordinates it grows
  counterclockwise. The synthesis preview's `phase` is a model angle, so
  advancing it turns the preview counterclockwise on screen -- which is why
  `SynthesisPanelComponent.step` negates the stride for a clockwise preview.
- **A hand-written flip can be a hand-written bug, and counting elements will
  not find it.** The start-ghost's warning pill hung on `translate(x, -y)
  scale(1,-1)`, which is `upright` with the y mirrored: measured on the 4-Bar,
  `ghostTagAt` named a point 123px down the window and the pill was drawn at
  729px, the same distance the other side of the axis. It survived because
  every check on it asked whether the pill was *there*, never where. The
  placement check in `posed-editing.mjs` compares the pill's box against
  `modelToScreen(ghostTagAt(ghost))` and is what that lesson is worth.
- **If you touch a direction, look at it.** Play, take a few frames clipped
  around the driven pin, and see which way the crank goes. A numeric probe is
  only as good as the matrix it chose, and two of them in one session disagreed
  with the screen.

### A negative drive speed is clockwise, and `turnsClockwise` is the only place that knows

`model/drive-direction.ts` holds the pair: `turnsClockwise(signedSpeed)` reads
the sign and `speedTurning(clockwise, magnitude)` writes it. Every "is this
clockwise?" in the app goes through the first -- the pin's arrow glyph, the
transport's note and its rotate icon, the Edit panel's direction control, the
analysis setup's `12.00 RPM CW`, `travelingForward`, the DXF export and
synthesis' Insert -- and everything that has a direction and needs the number
goes through the second.

**Do not re-derive the convention; it does not follow from anything.** You can
talk yourself into either answer from the y-flip, and reasoning about it gets
it wrong about as often as right. It was settled by playing the four-bar
template and watching four frames of the crank. `drive-direction.spec.ts` is
what holds it there, and it exists because those eight readings used to be
eight copies of `speed < 0` -- one of which, the transport's row for a machine
whose solve is deferred, was backwards for a week (a7b83a8).

The same sign runs through `inputAngularVelocities`, which is the joint's rpm
through pi/30: a different quantity, the same convention.

### "Loops" is a claim about the drawing, not a count of samples

The sweep in `findFullMovementPos` closes a crank's cycle on a *count*: 360 one-degree samples and
the input is back where it started. That is only a cycle when the rest of the drawing is back too,
and there are two ways for it not to be. A rod that passes through tangency with its slot comes home
on the other assembly branch and needs two turns. And an input can be a **rocker whose swing is
wider than a turn** -- the ten-pin linkage in `wideSwingRockerFixture` turns a full revolution and
75 degrees more before it stops, so after 360 samples its crank is home and every other joint is
half a mechanism away. The old sweep tried a second turn, hit the limit, fell back to the one-turn
cycle "the old behavior kept", and warned about the seam *in the console*. The playback bar said
"Loops" and the drawing teleported once a turn.

Now: a solve that fails past a full turn is a limit, wherever it falls, and the input reverses
there like any other rocker; a crank gets up to three turns to bring the whole drawing home; and a
crank that is in a different pose after every turn it was given is refused as `cycle-never-closes`
rather than shown with a seam. "Different pose" is the solver's own line between a step and a jump
(`JUMP_LIMIT_FRACTION` of the span), not a thousandth: a linkage drawn at one of its own limits
comes home a few thousandths of its span off, because at a fold the pose is exquisitely sensitive to
the crank, and the one-joint-to-a-hundredth-of-a-pixel test the rocker closure used to run could
never pass there.

**A rocker walks home over the poses it found on the way out, literally.** The walk back used to be
re-solved, and near a limit the two branches meet: after adaptive subdivision has crept to within a
sixty-fourth of a degree of the fold, "the root nearest the current position" is a coin flip, and a
retrace that lost it came home on the other branch -- which the one-joint closure test then passed,
because the *crank pin* was home. `visited` maps each travel to the sample standing at it, and a
step onto covered ground puts the position solver back on that pose (`reinstatePose`). Three things
follow: the seam at home is exactly zero; a rocker found to be somewhere else when its travel is
back at zero is refused on the spot, since no further walking can fix a branch; and the adaptive
fine pass over a sliver such as Watt I's now closes instead of sailing off into the lobe the sliver's
branch never visits.

When a mechanism's cycle looks wrong, get the truth before touching the solver: a pseudo-arclength
continuation of the constraint equations in a hundred lines of node (unknown joint positions plus
the crank angle, distance constraints, tangent from the null space) traces the whole configuration
curve and reports the crank's range and its turning points. That is how the 444-degree swing above,
the boundary six-bar's 382-degree swing with the drawn pose at a limit, and Watt I's eleven-degree
sliver were each established, and each contradicted what the spec at the time asserted.

### Supports that share a line get the evenest split, not a refusal

Two rails holding one jaw at one height, two pins on one line: equilibrium alone cannot say how
they share the load, and the elimination in `ForceSolver.solveLinearSystem` finds no pivot. That
used to make every frame `singular` and refuse the whole cycle with a message about "this
position", which sent readers looking for a dead point that was not there. Now
`analyzeMechanism` makes two passes: the ordinary solve first, and only when *more than half*
the frames of it failed a second in which `evenestSolution` takes the minimum-norm answer at
*every* frame -- the ones the first pass happened to solve included. A cycle read half from the
exact answer of a nearly dependent system and half from the even split of a dependent one
alternates between two curves, and the chart draws a solid band where there should be a line;
one rule for the whole cycle is what keeps it a line.

The split itself is the normal equations with a ridge, refined three times against the original
system (`EVENEST_REFINEMENTS`). The ridge is sized to `SINGULAR_PIVOT_TOLERANCE` on rows scaled to
unit size, the way the elimination scales them: a direction the matrix holds firmly passes through
and the refinement takes away what the ridge cost it, while a direction it barely holds -- the hair
between two rails meant to share a line -- is damped to the even split instead of followed into an
enormous canceling pair. The first cut used a ridge a million times smaller, which put the
change-over among round-off, so the answer could flip between the two from one pose to the next.
`frame-body-forces.spec.ts` walks the hair from 1e-9 to 1e-1 and requires the answer to move
smoothly from the even split to the exact one. The residual is measured against the loads, not
against the size of the solution as the main solve does, because the exact answer of a nearly
dependent system is a huge canceling pair that would make an unbalanced load look balanced.
`SHARED_SUPPORT_RESIDUAL` (1e-3 of the largest load) accepts the even split. The frame carries
`sharedSupport`, the series counts `sharedSupportFrames`, and the setup drawer says so as a
warning. A toggle that loses its pivot at two poses in the cycle keeps its gaps, because the first
pass solved the rest, and a load nothing balances fails the residual and stays singular either way.

### A force is placed at fifteen-degree bearings unless Option is held

`forceEndSnapped` in `new-grid.component.ts` rounds the bearing from the anchor to the cursor to
the nearest fifteen degrees while a force is being placed -- preview and commit alike -- keeping
the cursor's distance; Option (`altKey`) frees it, the same key that frees a joint from the grid.
Only placement snaps: dragging an existing force's handle is left exact, because
`e2e/force-edit.mjs` and the panel both expect a handle to land where it was put.

### The rate solver walks dyads; where it cannot, the graphs difference the poses

`KinematicsSolver` finds velocities and accelerations along the same chains of dyads the position
walk uses. A mechanism the position solver had to settle all at once (§2.7a of `docs/joint-types-plan.md`: the gripper on rails,
whose carriage, four links and two jaws no two known joints locate) solves its poses and then has
no rates at all, and every velocity graph was a row of gaps over a mechanism that visibly moved.
`AnalysisSampleService` now fills the blanks from the solved positions
(`model/mechanism/finite-difference-kinematics.ts`): a central difference for velocity, and for
acceleration the derivative of that velocity series rather than a second difference of positions
-- a settled pose carries the solver's tolerance as a zigzag of a hair between neighbors, invisible
to a first difference and a spike of several units to a second. Only blanks are filled; where the
analytic answer exists it stands. `slide-gripper.spec.ts` pins it, and `e2e/template-graphs.mjs`
checks every plotted rate against a difference quotient of its source.

### A link pinned to ground twice is frame, and the force solver treats it so

A bar with two distinct ground pins cannot move. The position solver never minded one (it holds
both pins still), but statics wrote three equilibrium equations for the bar against four ground
reactions, and a drawing with such a bracket refused with *"more supports than equilibrium can
determine"* -- correctly, in a sense: the split of load between the two pins has no unique answer.
Nobody needs that split. `ForceSolver.frameBodies` sets such bodies aside: no rows of their own,
their other joints act as ground pins for whatever hangs on them (`jointsOnFrame`), a slot cut
into one pushes against the world, and the reaction index lists nothing for them. A four-bar whose
ground link is drawn as an actual bar now solves to the same torque and pin reactions as one whose
ground link is left implicit -- `src/tests/verification/frame-body-forces.spec.ts` asserts exactly
that, and also that the reported drawing (a cylinder-driven bucket on a twice-pinned bracket)
solves.

### A machine *owns* some parts and is *handed* others, and analysis asks the second question

`partitionMechanisms` gives each machine two joint lists. `ownJoints` is what it is made of;
`joints` is everything the solver has to be handed, frame included -- a rail anchored at every
joint is the world, so it and the pins holding it go to every machine bolted to them and belong
to none. That distinction is what stops a neighbor's driven joint being read as this machine's
input, and `ownJoints` is the right answer to *whose input, whose clock, which machine did the
reader just merge*.

It is the wrong answer to *where do I read this part's solved values*, which is what every
analysis panel is really asking -- and the panels all asked through ownership. The owner index
claims `partition.links`, frame pieces included, so a rail's **link** found its machine and
graphed its angle and its center of mass, while the two **pins** at that rail's own ends found
nothing: `mechanismForId` returned undefined, `determineAnalysis` returned three empty arrays,
and the reader got fourteen empty charts per pin with no explanation, over a panel saying the
mechanism could not be solved about a machine reading Ready. The built-in gripper template rides
two such rails, which is where `analysis-audit` found it -- 56 blank findings on `Cylinder_Gripper`, on
joints K, L, O and P.

So there are now two lookups. `indexOfMechanismContaining` / `mechanismContaining` is ownership,
unchanged, and is what the canvas, the merges and the input scoping ask.
`indexOfMechanismSolving` / `mechanismSolving` is "whose samples hold this", ownership plus the
shared frame, and is what `mechanismForId`, `isPartSimulatable`, `readinessOfPart` and the vector
refusals ask. Both are prebuilt maps filled in one pass over the partitions, because these are
asked of every part on every change-detection pass. `isFramePart` is the difference between them:
solved by a machine, owned by none. A frame pin now graphs the way every other ground pin does --
a constant position, zero velocity, zero acceleration -- and its **reaction** graph declines with
a sentence, because statics really does write no equation there (see the entry above). That
sentence is `noReactionSentence`, written once and read by the graph, the panel heading and the
gray force chip, so the three cannot disagree.
`src/tests/verification/frame-joint-graphs.spec.ts` holds the gripper to all of it.

### A hold is a constraint, not a lock, and every move goes through the solver

A bar can hold its **length** or its **angle** against edits (`RealLink.hold`, the menu's Fixed
Length / Fixed Angle rows, the padlocks on the Link Length and Link Angle fields). It is not a Lock:
the joints stay free to move, on the arc or the line the held value leaves them. One or the other,
never both -- both is what a Lock on the joints already means -- so asking for the second moves the
hold and says so, with "Fix length instead" on the message.

**To the reader the word is "fixed", and never "locked".** The padlock inside a field says
**Fixed**, the menu rows say **Fixed Length** and **Fixed Angle**, a refusal says "Held by fixed
length AB", and the way out of one is **Release**. "Locked" and "Unlock" belong to the *joint mark*
and to nothing else. That is the opposite of the rule this file used to state -- one word for both,
told apart by context -- and it was reversed after an exploratory sweep watched a reader go looking
for a padlock they had never pressed. `hold` stays the code's name for it.

`e2e/link-holds.mjs` asserts these words, so a drift shows up there.

The rules are the CAD ones, and they live in one place, `model/hold-solver.ts`: the joint that was
asked for reaches its ask when the holds allow and lands on the nearest allowed place when they do
not; every other joint on a held bar moves as little as it must (drag the free end of a held bar and
its far end is towed; drag it when the far end is grounded and it rides the arc); grounded, locked,
slider and cylinder joints never move. A joint the holds have fully determined -- between two held
lengths from two fixed points -- is refused at the grab, naming the holds, exactly as a locked joint
is; an ask no configuration satisfies (a four-bar dragged past where its coupler can follow) is
refused *whole* -- the half-settled positions the sweep stopped in have a hold false in them, and
writing those was how a locked length once changed under a drag. A typed length or angle near a
lock is a constraint, not a place: `setBarValue` adds the number to the holds and lets the solver
move whatever must move, which is also what typing into a locked field does -- the number typed
becomes the number locked. **Every route that moves a joint lands in `GridUtilsService.dragJoint`, and that is where the
solver is asked**, so a typed coordinate, a distance-to-joint field and a link drag get the same
answer as a canvas drag. `settled` is how the solver writes its answer back through the same door
without being asked again; forget it and you get a recursion.

A hold is only meaningful on a plain two-joint bar, and `holdOf()` in `model/link-holds.ts` reads
one as absent on anything else -- which is why nothing has to clear the flag when a bar is welded or
given a third joint. It rides the URL as an `H` entry in the trailing section (`HlAB`, `HaAB`),
beside the locks, so it survives undo and travels in a shared link; the decoder refuses a hold on
anything but a bar. The held-value chips and the amber guide are canvas state
(`heldChips()`, `holdGuide`, `holdRing` in `new-grid.component.ts`), shown only when the lock marks
are (`lockVisualsOn`), and the hover dimensions for a length or an angle -- the link's and the
joint panel's distance-to-joint ones alike -- are now a hairline with a pill, sized in screen pixels
through `svgGrid.scaleWithZoom`. `e2e/link-holds.mjs` walks all of it.

**And a Lock is about position, full stop.** It refuses every gesture that would *move* what it
holds -- a drag, a typed coordinate, a merge -- and refuses nothing else. Two other rules had grown
onto the same mark, and neither was anything the padlock claimed:

- **Deleting** a locked part was refused, directly and through the cascade (a link whose deletion
  would orphan a locked joint), so a reader who locked a joint to stop nudging it found they could
  not delete it either. `MechanismService.deleteRefusal` and `SelectionBatchService`'s cascade check
  were where that lived; both are gone.
- **Attaching** a link, cylinder or force to a locked *joint* was refused, while attaching to a
  locked *link* was allowed -- an inconsistency that was really the same mistake. Nothing a lock
  holds moves when a bar is drawn out from a joint: the joint keeps its coordinate and the new joint
  lands under the pointer. `frozenRefusal` in the menu builder is gone with it; the attach rows still
  refuse what a third body would actually break (driven, welded, several links sharing the joint).

`e2e/locking.mjs` and `e2e/context-menu.mjs` pin both the other way round now, and the locking suite
draws a real bar onto a locked joint rather than only reading the row's state.

#### A force is in the selection, and it is not in the geometry

`SelectedPart` is `RealJoint | RealLink | Force`, and the third one is the odd one out. Joints and
links *are* the drawing; a force is a reading anchored to a body, and where it sits is decided by
the link it acts on. So a force joins a selection for everything the group can *say* about it --
one magnitude, one direction, one frame, one color, one Lock, one Delete -- and
`canonicalSelectionClosure` deliberately gives it no joints. Three consequences follow, and each
is load-bearing:

- A selection that is nothing but forces has an empty closure, so `canTransform` is already false
  and `selectionBounds()` returns nothing: no box, no handles, nothing to drag. That is the right
  answer, and it falls out rather than being special-cased.
- Duplicate is refused on a force-only selection, with words, because a copy of a force has nowhere
  to go. A force alongside its link is copied *by* the link, so its ref is simply dropped from the
  closure and from the selection the copy leaves behind.
- A force *does* move with a group -- `SelectionTransformSnapshot` already maps every force on a
  moving body through that body's frame, and has since long before any of this.

`MechanismService.batched` is what makes any of the group switches one press of Undo: it holds
`save()` for the length of the work and writes one entry at the end, the same mechanism
`capturingPose` uses, and nests with it. Every group setter returns early when the selection is
already in the state asked for -- a no-op that writes a history entry costs the reader a press of
Undo that puts nothing back.

**The default force arrow is sized from `objectScale`, not from a number of centimeters.** It used
to be a little over three user units long whatever it was drawn on, which is about right on a
library crane and twice the length of the mechanism on a four-bar whose bars are one and a half
centimeters -- the first force a reader added ran off the top of the window. Same family as the
mark size and the start-pose ghost: anything with a *drawn* size takes it from how big this drawing
is.

#### A cylinder holds its angle, and it is the two *mounts* that are held

A cylinder points somewhere the same way a bar does, so it can hold that direction -- and the pair
the hold is about is its two mounts, which is what the reader sees and what the panel's Angle field
states. The part as a whole has no *length* to hold: mount to mount is the span, and the span is
exactly what the drive changes, so holding it would be holding against the drive. Each member's
own length is a different question and is held on the member. The flag is written on the **barrel**
by preference, so whichever member was clicked gives one answer and one `H` entry rides the URL.

**Either member may carry it, and `cylinderAngleCarrier` is who to ask** (Stage 2b, decision S5).
Each member now has a *length* of its own to hold as well, and a member holds one thing -- so a rod
fixed at its length leaves the barrel free for the angle, and a barrel fixed at its length pushes
the angle onto the rod. The angle reads as held when *either* flag says `'angle'`, and `heldBars`
still emits exactly one bar, on the two mounts, under the id of whichever member is carrying it.
A member's `'length'` hold is **never** handed to the hold solver: it constrains a length the
*layout* chooses, and `model/cylinder.ts` is where it is honored (`CylinderHolds`).

Three traps, all of which this walked into:

- **A cylinder cannot be recognized from a link.** It resolves from the joints of its *slide* -- the
  one prismatic joint the ram rides on -- and a barrel carries none: a barrel's joints are its mount and its
  buried end, and its only tie to the rest of the part is the slot, an edge that points from the
  prismatic joint *outward*. So there is no walk from a barrel to its own assembly, and every
  question of the form "is this link part of a ram?" has to be asked of the **drawing**
  (`cylinderMembers` in `model/link-holds.ts`). Without that, a barrel answers the plain-bar test --
  it is a two-joint `RealLink`, after all -- and the solver is handed the barrel's own two joints,
  a pair the part re-derives from its mounts after every rebuild anyway. The hold then holds
  nothing anybody can see, and it looks exactly like a solver bug.
- **`holdAnchor` counted every cylinder joint as immovable**, mounts included, on the older rule
  that a cylinder's joints live on a line the solver does not know. True of the interior and wrong
  about the mounts, which are ordinary joints a reader drags -- and the failure is silent in the
  worst way: the drag is not refused with a message, the mount simply does not move, because the
  goal joint has weight zero and `settleHolds` returns a satisfied solution in which nothing moved.
  Only the two joints inside the part are an anchor now (`isInsideCylinder`).
- **The mount-drag branch never asked the holds anything afterwards.** `jointStates.dragging` has a
  branch of its own for a cylinder mount (it re-poses the ram parametrically), and it called
  `dragJoint` -- so the constraint was applied -- but not `afterHoldMove`, so no guide line and no
  refusal ever appeared for a mount. Two symptoms, one cause, and the second only became visible
  once the first was fixed.

The moral for the next one of these: when a hold "does not work", ask what pair of joints
`heldBars` actually emitted before suspecting the solver. A unit test on `heldBars` found this in
one run after an hour of browser probing found nothing.
`src/tests/verification/cylinder-angle-hold.spec.ts` is that test.

### A reversing drive's handle is answered by continuity along the track

A machine's own scrub handle measures its input's *position* (degrees of crank, extension of ram),
not time. A ram passes every extension at least twice a cycle, and a drawing authored mid-stroke
passes its start three times -- the leg it opens on, the return, and the leg that closes the cycle.
`fractionalSampleAlong` used to pick between those moments by which *half* of the sample list the
machine was in, which lands nowhere near the turnarounds of a mid-stroke start: dragging the boom's
handle back across about a third of its stroke jumped the machine, and the graphs' marker, a third
of a cycle. `nearestPlaceOnTrack` (drive-profile.ts) answers by continuity along the track instead:
every moment at the asked place is a candidate, the winner is the one nearest walking the samples
with the cycle's two ends as one place, and a tie -- which only a turnaround produces -- goes
forward in time. Pulling the handle back retraces; pushing it to the end of the stroke and back
brings the ram home. The one visible marker jump left is the seam, end of cycle to start, which is
the same pose. `drive-profile.spec.ts` walks the boom's handle out and back and bounds the step.

### Where a drag's time goes, and how to re-measure it

Profiled in a real Chromium with the DevTools profiler and tracer, on the production build and the
dev server (`e2e/drag-profile.mjs`). The lag was JavaScript, not rendering: paint is about 1% of a
drag second, style and layout at most 12%, and production was only 15 to 20% faster than the dev
server. Each of these once ran on **every pointer move**, and each is cached or deferred now. Keep
it that way:

- **Link artwork is not copied per sample.** A solved sample's link keeps its `visualSource` and
  realizes the path on the first read of `d` or the outline (`link.deferred-artwork.spec.ts`);
  re-tokenizing and reformatting every path was two thirds of the sweep.
- **An open graph does not re-solve the cycle.** `AnalysisSampleService` keeps the solver's answer
  per sample, weakly keyed on the mechanism a drag replaces on every move.
- **The chart is not rebuilt under a drag.** While the hand is down the bridge draws the live
  curves as paths over the standing plot (`showLive` in `analysis-apex-chart.component.ts`) and
  hands the chart the final series once, on release. The overlay goes up before the chart drops
  its live series and comes down only after the chart has redrawn them, so no frame ever shows the
  earlier curve alone -- `e2e/analysis-editing.mjs` samples every frame for exactly that.
- **A machine whose inputs did not change is not rebuilt.** `updateMechanism` fingerprints each
  partition from everything its solve reads and keeps the `Mechanism` whose fingerprint did not
  change (`mechanism.rebuild-reuse.spec.ts`).
- **A template binding costs a comparison, never a walk of the drawing.** `getJointPath` keeps its
  strings per solved machine, and `drawingDigest` rebuilds the mark cache's fingerprint only when
  `poseRevision`, `solveRevision`, `cylinderRevision` or the object scale has moved, while
  `channelsCutInto` / `markChannelsCutInto` keep their merges per carrier and per piece. The app
  runs about a hundred change-detection passes a second *at rest*, so a walk in a binding is paid a
  hundred times before a finger has moved. The `workbench-joint` scenario in
  `drag-perf-harness.mjs` is the 49-joint, four-machine drawing that shows it.
- **One solve per frame.** A pointer can report faster than the screen refreshes, so the canvas
  takes the latest move on the next animation frame; a release lands the move still waiting before
  it is read.

Still true and worth knowing: change detection runs about a dozen times per pointer move (the
Edit panel's two `setTimeout`s per selection publish, the top bar's animation frame from every
`ngAfterViewChecked`, the grid's settle loop, each graph row's frame request and
`ResizeObserver`). Each pass is cheap now that nothing heavy hangs off a template binding, but
anything that does will be multiplied by twelve. Not it: the before-drag comparison, forces in
Edit mode, joint labels, the center-of-mass marks, the canvas SVG itself.

**The frame p90 in the baseline is the display's refresh interval, not the app's.** Written on a
120 Hz display it reads 9; run headless on a 60 Hz one every scenario reads 17 and the whole
suite "regresses" while the app-time column has gone *down*. Read the two columns separately, and
when every scenario fails by the same frame number, it is the environment. The honest comparison
for a perf change is the same suite against HEAD served beside the change (see "Working out
whether a failure is yours").

**Guarding it.** `node e2e/drag-perf.mjs` drags every scenario with nothing attached and fails
any that runs more than 35% above `e2e/drag-perf-baseline.json`. The baseline is for the
machine that wrote it; after a change that deliberately moves the numbers, run it with
`--baseline` and commit the rewrite with the change. Since moves are coalesced to one solve per
frame, the suite's "ms per move" counts the work the frames actually did, and the 90th-percentile
frame is the number a reader feels. To see *why* a number moved, `node e2e/drag-profile.mjs
<scenario>`. Both subtract the DevTools protocol's own ~8 ms per pointer event, measured on a
blank page at the start of each run, and profile the second drag on a page, because the first
runs 15 to 25% slower while the JIT warms up.

**The deferred link artwork is a snapshot, and has to stay one.** A solved sample's `RealLink`
carries its outline across from the editable link lazily (see above). The first version kept a
reference to the editable link and read its `d` and its joints when the outline was first asked
for -- which is the first frame of a seek, after the display has already moved those joints and
written the previous frame's path over `d`. The rigid move from source to sample was then the
identity: bodies lagged their pins by a degree in playback and by the whole jump after any seek,
and a delete at a displaced pose left the linkage drawn in two places at once. The sample now
snapshots the path, the lines and the two pin coordinates at construction, which costs a few
numbers and keeps the string work deferred. `e2e/posed-edit-audit.mjs` checks every link body
against its pins after every action; the pixel diff that cleared the original change compared
poses reached by playback, where a one-sample lag is invisible.

---

## Checking an exported file

**Draw it.** A DXF or SVG export can pass every assertion you thought to write and still be wrong
in a way that is obvious the moment you look at it. Two real examples, both caught by rendering and
neither by a test: every `DIMENSION` named an anonymous block that was emitted *empty* (AutoCAD and
Fusion redraw the picture from the measurement and never complained, but a reader that draws only
the block shows nothing -- and R12 exists to be read by exactly those readers), and the dimension line
was offset a fixed distance in -Y, so on a vertical link it lay exactly along the centerline it was
dimensioning.

Parse the download with `dxf-parser` (it is already a dependency, at
`node_modules/dxf-parser/dist/dxf-parser.js` -- there is no `index.js`), flatten the entities *and*
every block's contents into line segments, emit an SVG, and screenshot it. Remember DXF's Y axis
points up and SVG's points down, so negate Y or the drawing arrives upside down. Keep the script in
the scratchpad rather than `e2e/`; what belongs in `e2e/` is the assertion the picture taught you to
write.

**R12 is the only format PMKS writes, on purpose.** `AC1009` predates `LWPOLYLINE`, the `100`
subclass markers, entity handles, the CLASSES section and the OBJECTS dictionary -- which is exactly
why every CAD program, laser cutter and CAM tool still reads it, and why it is hard to get wrong.
The R2000 path was deleted rather than fixed: what it bought was a units hint, a tidier polyline
entity, and real `DIMENSION` entities, and Fusion and Onshape do not turn a DXF dimension into a
sketch dimension anyway. The units hint lives in the file's *name* now (`mechanism (cm).dxf`) and in
its notes layer, because both importers make you choose units regardless.

**Arcs ride on polyline vertices.** A rounded link outline is one closed `POLYLINE` whose vertices
carry a `bulge` -- `tan(theta / 4)`, signed counter-clockwise. That is what lets a part arrive as a
face CAD can pick and extrude rather than a heap of lines and arcs to stitch. `RealLink.outlineLoops()`
is where the canvas's own geometry gets translated; the sign follows the ring's winding rather than
the arc's endpoints, because a half circle's start and end angles are the same pair whichever way
round it goes.

**Two checks run themselves; the third is yours.**
`src/app/services/export/dxf/gallery-round-trip.spec.ts` exports every `FIXTURE_GALLERY` mechanism
in both presets and parses it back. `e2e/dxf-sweep.mjs` does the same through the real dialog for
all 42 templates -- which is the only way to reach the solved slot travels and the file names -- and
leaves every DXF in `artifacts/dxf-sweep/`.

**Then audit those files with `ezdxf`.** `dxf-parser` tells you the file parses; it does not tell
you an importer will accept it without quietly repairing it first. Install `ezdxf` into a throwaway
venv in the scratchpad and print `auditor.fixes` as well as `auditor.errors`:

```python
import sys, ezdxf
from ezdxf import recover
for path in sys.argv[1:]:
    doc, auditor = recover.readfile(path)
    print(path, doc.dxfversion, len(auditor.errors), len(auditor.fixes))
```

A clean parse with four silent `INVALID_TABLE_HANDLE` repairs is how the old R2000 tables went a
long time without their handles. Every file should report zero of each. Once a release, import one
into Fusion or Onshape by hand as well -- translator strictness is the one thing no parser here can
stand in for.

**Check the units convert, not just that they are labeled.** `$INSUNITS` and the coordinates are
written by different code. Export the same drawing as cm, m and in, and check `$EXTMAX` scales by
1, 1/100 and 1/2.54 -- it did not, for a while, and the file looked completely correct until you
measured something in CAD.
