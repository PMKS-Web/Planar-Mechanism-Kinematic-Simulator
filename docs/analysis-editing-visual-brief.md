# PMKS+ — Analysis-mode editing: visual brief

**For:** design review — and now the record of what shipped from it
**Scope:** the visual treatments added when we made the analysis modes editable. The first
version of this brief asked a designer's opinion of them; §1 now describes the design that came
back and was built, and §3 lists where each of the original questions landed.

---

## What the feature is

PMKS+ is a linkage simulator. Historically the two analysis modes (Kinematic, Force) were read-only:
you built a mechanism in Edit, switched to analysis, and looked at graphs of position, velocity,
acceleration and reaction force over one cycle of the machine.

That lock is gone. You can now **drag a joint while the graphs are open**, and the graphs re-solve
under your hand. The workflow this exists for is one sentence: *watch the acceleration peak, move
the coupler pivot, watch the peak come down.*

So the central design problem is **comparison**. A curve that changes while you drag tells you
nothing unless you can still see what it was.

---

## 1. The comparison, as one card

Designed with Claude Design from the first version of this brief; the mockup is the
"Analysis Panel Prototype" in that project, and this section describes what shipped from it.

**One card, a row per quantity.** The panel is a list rather than a stack of cards: each row is
the quantity's name, its value at the pose on screen with the unit once, and a chevron. Pressing
a row opens it in place. Joint rows are Position, Velocity, Acceleration; link rows are Angle,
Angular velocity, Angular acceleration, then under a *Center of Mass (CoM)* heading the CoM
position, velocity and acceleration.

**The head.** "Kinematics for Joint C" (or "Forces for …") over "Readings at 1.26 s". While a part
is under the hand the subtitle reads "Following your hand" and a chip on the title's line names
the part being held — *Tuning Joint B* — which need not be the part being graphed, because a
click selects and a drag tunes. Once a drag has been made, a **Compare with before drag** switch
sits on the subtitle's line and shows or hides the earlier curves on every open row at once. The
head is sticky, so the switch is at hand however far the rows have scrolled.

**The split.** An open row with a magnitude and its components offers a two-way segmented
control, *Magnitude* / *X & Y components*: two lines or four, never six, and never a lone
component. A quantity with only components (position) shows no Magnitude side; one with only a
magnitude (an angle) shows no split at all. Kinematic rows open on Magnitude, force rows on the
components.

**The plot.** Short and wide, no y-axis title (the row and the table carry the unit), gridlines
faint, zero a shade darker. The playhead is a plain line with a dot on each curve; the value it
marks is the row's own number.

| | Before curve | Live curve |
|---|---|---|
| Colour | the series' own colour, faded (34% alpha; 42% for amber, which vanished at 34%) | full |
| Stroke | 1.8px, dashed | 2.6px, solid |
| Draw order | behind | in front |

The live curve is solid throughout. Nothing on the plot changes at the moment of release; what
tells the two curves apart is only that the earlier one is faded and dashed.

**The table.** Under the plot, a row per series: its **max** and **min** with the unit, and under
each the value from before the drag while the comparison is on. This replaced a pill that quoted
only the larger peak and coloured the change green or amber — a value judgement about a number a
student may have wanted larger. Negative numbers use a typographic minus.

**Lifecycle.** One baseline per gesture, taken on the first travel of a drag in an analysis mode
and kept until the next drag replaces it or undo/redo restores a drawing it may have been taken
from. The switch hides it without dropping it; the axis stays where the comparison put it while
the switch is off, so flipping it moves nothing.

**The y-axis rule** is unchanged from the first version: frozen to the range the before curve
was drawn to, widened but never shrunk while the hand is down, with outlier trimming applied to
the live curve only.

## 2. The status strip

"Tuning Joint B — release to keep" in the accent while the hand is down, "Joint B moved" after,
and the usual "Drag to tune · build in Edit" otherwise.

## 3. Where the first version's questions landed

- The green/amber peak pill is gone; max and min per series, before and now, replaced it.
- Amber's ghost got its own alpha.
- The live curve no longer changes stroke on release.
- The chip row above the chart is gone, so nothing competes with the no-solution banner.
- Every number in the table carries its unit.
- The one thing not taken from the mockup is a second, pre-drag ghost of the linkage on the canvas
  — the start-pose ghost is the only ghost drawn there.
