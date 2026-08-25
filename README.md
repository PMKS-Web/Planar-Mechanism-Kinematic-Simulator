<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/logo-dark.png">
  <img alt="PMKS+" src="docs/images/readme/logo-light.png" width="300">
</picture>

### Kinematic and force analysis of planar mechanisms, free and in the browser

**PMKS+** is an open-source simulator for planar linkages, written for the kinematics and
machine-dynamics classroom. It runs in any browser, needs no account, and stores nothing on a
server.

[**Open PMKS+**](https://app.pmksplus.com) &nbsp;·&nbsp; [About](https://pmksplus.com) &nbsp;·&nbsp; [Mechanism library](#mechanism-library) &nbsp;·&nbsp; [Verification](#verification) &nbsp;·&nbsp; [Contributing](#contributing)

![License MIT](https://img.shields.io/badge/license-MIT-blue) ![Angular 22](https://img.shields.io/badge/Angular-22-dd0031) ![Node 22.22.3+](https://img.shields.io/badge/Node-22.22.3%20%C2%B7%2024.15%2B-5fa04e) ![No account needed](https://img.shields.io/badge/account-not%20required-brightgreen) ![Verified against MATLAB](https://img.shields.io/badge/solvers-verified%20against%20MATLAB-8a2be2)

</div>

<img width="2982" height="1970" alt="frame_chrome_mac_light-110" src="https://github.com/user-attachments/assets/4d63252a-63fa-421e-a1b4-eb923cc6aeb7" />


---

## Contents

**Using it**

- [What PMKS+ is](#what-pmks-is)
- [The interface](#the-interface)
- [What you can build](#what-you-can-build)
- [What you can measure](#what-you-can-measure)
- [Readiness: the app says what is missing](#readiness-the-app-says-what-is-missing)
- [Several machines in one drawing](#several-machines-in-one-drawing)
- [Synthesis](#synthesis)
- [Getting the numbers out](#getting-the-numbers-out)
- [A URL is the document](#a-url-is-the-document)
- [Mechanism library](#mechanism-library)
- [Units, settings and keyboard](#units-settings-and-keyboard)

**Working on it**

- [Verification](#verification)
- [Philosophy](#philosophy)
- [How it works](#how-it-works)
- [Development](#development)
- [Contributing](#contributing)
- [License and contact](#license-and-contact)
- [Acknowledgements](#acknowledgements)

---

## What PMKS+ is

A **four-bar linkage** is the first machine most mechanical engineering students meet, and the
first one whose behaviour is genuinely hard to picture. PMKS+ exists for that moment: draw the
bars, ground two joints, turn one of them, and the coupler curve appears.

It is a single-page web app. Nothing to install, no account, and no server holding your work. The
whole mechanism packs into a link, so "share this with my TA" is a copy-and-paste.

PMKS+ is the successor to **PMKS**, written by Prof. Matthew I. Campbell at Oregon State
University, and is developed at **Worcester Polytechnic Institute** by undergraduate and graduate
project teams.

| | |
| --- | --- |
| **Try it** | [app.pmksplus.com](https://app.pmksplus.com) |
| **Built for** | Kinematics and machine-dynamics coursework: four-bars, six-bars, slider-cranks, quick-returns, linkage-driven machines |
| **Solves** | Position · velocity · acceleration · static and dynamic joint reactions · required input torque or force |
| **Costs** | Nothing. MIT-licensed, no sign-in, runs in any modern desktop browser |

---

## The interface

The canvas is full-bleed and everything else floats over it, in cards.

![The seven regions of the PMKS+ interface, labelled on a running four-bar](docs/images/readme/interface-map.png)

| | Region | Holds |
| :-: | --- | --- |
| **1** | **Top strip** | Project menu · the four **mode tabs**, the analysis two carrying a readiness chip once something is drawn · a corner card that is Undo/Redo while building and becomes **Export Data** in the analysis modes |
| **2** | **Mode panel** | The current mode's panel: the Synthesis form, the Edit properties of what is selected, or that part's analysis graphs. 250px wide, widening to 400px in the analysis modes |
| **3** | **Canvas** | The grid, right-click menus, dragging, pan and zoom. It runs under everything else, and the view frames the linkage into whatever the cards leave free |
| **4** | **Playback** | Transport (speed · play/pause · return to the start pose) and a scrub card. Analysis modes only |
| **5** | **View controls** | Centres of mass · joint IDs · traced paths ‖ zoom out · zoom in · reset view |
| **6** | **Status strip** | Mode · what the mechanism is ready for · cursor position · units |
| **7** | **Right drawer** | Settings · Help and feedback · either analysis's setup list · the Export flow. One at a time |

### The four modes

| Mode | Key | What it is for |
| --- | --- | --- |
| **Synthesis** | <kbd>1</kbd> | Generate a linkage from three desired positions of a coupler |
| **Edit** | <kbd>2</kbd> | Draw and change the mechanism. Only available while the animation is paused at the start pose |
| **Kinematic Analysis** | <kbd>3</kbd> | Position, velocity and acceleration of a joint, or of a link and its centre of mass |
| **Force Analysis** | <kbd>4</kbd> | Joint reactions and the torque or force the input must supply |

The analysis modes are deliberately **read-only**. Playback lives with them, and editing lives
outside them, because a half-solved mechanism being dragged mid-cycle is a graph that lies.

On a phone the mode panel becomes a sheet along the bottom, pulled up by its handle when you want
it and out of the way when you do not, and **a held finger opens the right-click menu**, so a
linkage can be built with taps alone. The canvas pans and pinches as you would expect.

---

## What you can build

Everything is made by **right-clicking**: the grid to add, a part to attach.

### The joint set

Weldedness and sliding are two independent properties of a joint, which gives a 2×2 rather than a
list of joint types:

| | Not welded | Welded |
| --- | --- | --- |
| **No slider** | **Pin** (R): an ordinary revolute joint | A **rigid joint**, fusing what meets there into one compound link |
| **Slider** | **Slot** (RP): a pin riding in a channel, and free to turn in it | **Slide** (P): a body that translates without turning. This is what a cylinder is built from |

Each of those exists **grounded** (the slot is cut into the world) and **floating** (the slot is
cut into another moving link). A pin, a slot or a slide can be the **driven input**; a weld cannot,
because a weld is precisely the statement that two bodies do *not* move relative to each other.

### The parts

| Part | Notes |
| --- | --- |
| **Link** | Two or more joints. Length, mass, rotational inertia, centre of mass, colour, and a name |
| **Compound link** | Weld joints together and the bars become one rigid body: a bell crank, a bucket, a scoop |
| **Cylinder** | A first-class, menu-created part: barrel, rod and the sealed slide between them, drawn as the part and drivable as one. A slide you build by hand is an ordinary slide, not a cylinder |
| **Slider** | On a joint that is free to take one, along a guide at any angle |
| **Tracer point** | A point rigidly carried by a link, so you can graph a place that is not a pin |
| **Force** | Applied at a joint or on a link, in the **global** frame or **local** to the body it acts on |
| **Lock** | A mark that holds a joint (or a whole link) still against dragging, so a shared linkage can only be adjusted where its author intended |
| **Background image** | A photograph or drawing pinned behind the grid, scaled and rotated, to build a linkage on top of a real machine. Never uploaded anywhere |

![The Edit panel open on a joint of a welded loader bucket](docs/images/readme/edit-panel.png)

![A backhoe bucket driven by a hydraulic cylinder, with the boom's angular kinematics graphed](docs/images/readme/cylinders.png)

A driven cylinder is a *linear* input, and the app knows it. The transport row reads
**`Opening · Reverses`** and a distance rather than an angle; the scrub handle runs across the
travel the cycle actually uses rather than around a clock (and the setup drawer warns when that is
only part of the stroke you drew); and the speed is set in cm/s, under **Expansion Speed** in that
cylinder's Edit panel.

---

## What you can measure

### Kinematic analysis

![Kinematic analysis of a Whitworth quick-return, with position and velocity graphed](docs/images/readme/kinematic-analysis.png)

Select a **joint** for its position, velocity and acceleration. Select a **link** for its angle,
angular velocity and angular acceleration, plus the same three for its centre of mass. Each graph
opens from a one-line read-out that always shows the value **at the pose currently on screen**, so
scrubbing the handle moves the number.

Velocity and acceleration can also be drawn **on the mechanism itself** as vectors, live, while it
runs.

### Force analysis

![Force analysis of a toggle clamp: reaction forces on both links at the clamped joint](docs/images/readme/force-analysis.png)

Two modes, chosen in the panel:

- **Static (Equilibrium)**: the machine held at each pose, inertia ignored.
- **In-motion (Dynamic)**: full Newton–Euler, with the mass and rotational inertia you gave each
  link.

Forces are reported **per body at a joint**. The reaction on link *AB* and the reaction on link *BC*
are two different answers to two different free-body diagrams, and PMKS+ gives you both rather than
one merged number. It also reports the **input effort**: the torque a crank needs, or the force a
ram needs.

Gravity is on by default and can be switched off in Settings. A link left at zero mass is skipped
by gravity and inertia rather than silently given a mass.

### Playback that measures the input, not the clock

The scrub handle answers *"where is the input, out of everything it can do"*, not *"what time is
it"*:

- A **ram or slider** runs from one end of its travel to the other.
- A **rocking crank** runs between its two angular limits.
- A **crank that goes all the way round** spans the whole cycle (one turn usually, two where a rod
  swaps assembly branch at a slot tangency), with zero at the pose you drew.

Time is still what the machine is *at*, and still what the readout shows. Animation advances by
elapsed real time rather than one sample per frame, so at 1× a revolution takes 60/RPM seconds
whatever the frame rate. (The transport also offers 2× and 4×.)

---

## Readiness: the app says what is missing

![The Force Analysis setup drawer explaining that nothing loads the mechanism yet](docs/images/readme/readiness.png)

Once there is something on the grid, each analysis tab carries a chip: **`Ready`**, or a count of
what is in the way: **`2 fixes`** for kinematics, **`1 to set`** for forces. Pressing a tab that is
not ready opens that mode's setup drawer instead of switching to it. The drawer separates:

- **Blockers**: the mechanism cannot be solved at all until this is fixed.
- **Warnings**: it solves, and there is something worth knowing before trusting the result.

Most entries name the part at fault and offer to take you there. The Force setup drawer also holds
a mass table for the whole mechanism, so a student can fill in every link's mass in one place
instead of hunting for them on the canvas.

---

## Several machines in one drawing

![Three independent mechanisms on one grid, with the scrub card split into a row each](docs/images/readme/multi-machine.png)

A drawing is not assumed to be one machine. PMKS+ **partitions** it into independently solvable
mechanisms (`M1`, `M2`, `M3`), each with its own input, speed and direction. By default they share a
clock and the scrub card shows a single **`All`** row; the toggle on the card splits it into one row
per machine that solves, each with its own handle, angle and time readout.

This is why input speed lives **on the driven joint** rather than in global settings: a drawing
with three machines needs three speeds.

---

## Synthesis

![Motion synthesis: three coupler positions, a solved four-bar, and the Insert control](docs/images/readme/synthesis.png)

Give PMKS+ three positions and orientations of a coupler and it searches for four-bars that pass
through all three, offering up to eight distinct candidates. You steer that search by what you care
about:

- **Reaches all 3 positions on one assembly**: the mechanism never has to be taken apart.
- **Coupler pinned at the link's ends**. Switch it off and the search tries other attachment points
  along the end-effector link, and past its ends, which moves both ground pivots and produces
  genuinely different, often better, machines.
- **Ground pins inside a region** you draw.

Each candidate shows which positions it **reaches**, its assembly branch, which pin drives it, and a
preview transport so you can watch it move before committing, with any position it cannot reach on
that assembly marked rather than hidden. Where the geometry allows one, **Add driver** grafts on a
second ground pin and coupler so an ordinary motor can turn the thing: a six-bar, sized in closed
form so exactly one revolution walks the four-bar across its arc and back. **Insert into grid**
drops the result into the drawing as an ordinary, editable mechanism, in a single undo step.

---

## Getting the numbers out

![The Export drawer, step one: choosing which parts to export](docs/images/readme/export.png)

In either analysis mode, **Export Data** walks through the questions in order: which parts, which
kinematic columns, which force columns, and how to write the file.

| Format | What arrives |
| --- | --- |
| **CSV** | One file per table, or a `.zip` when there are more than two |
| **Excel** | One `.xlsx` workbook, one sheet per table |
| **Images** | Each graph as a PNG or SVG; a `.zip` past two of them |
| **Report** | A print-ready document: the drawing, the facts about the machine, every graph, the data table, and a share URL that reopens the mechanism. It opens your browser's print dialog, so "Save as PDF" is one step away |

Numbers can be written to 2, 4 or 6 decimals, or at full solver precision.

---

## A URL is the document

| Menu item | What it does |
| --- | --- |
| **New Project** | A blank grid, in a new tab, so what you have open is never taken away |
| **Open** | Load a saved PMKS+ file from disk |
| **Templates** | The mechanism library |
| **Save** | Download the current mechanism as a `.pmks` file |
| **Share Project** | Copy a link that reopens exactly what you are looking at |

Undo and redo are the same mechanism: the history is an array of these strings, and stepping back
re-decodes an earlier one. So an undo restores the whole drawing at once (geometry, welds, locks,
masses, colours and the document's settings) rather than reversing one field.

---

## Mechanism library

**41 mechanisms**, in eight families, each one a linkage the verification suite already covers.
The library filters by family and by name; opening one on an empty grid loads it in place, and
opening one over existing work offers a new tab, a replace (which is undoable), or a cancel.

![The Mechanism Library dialog, filtered to the Start Here family](docs/images/readme/templates.png)

*The top row below is running; the rest are stills. In the app every card animates when you hover
it.*

<table>
<tr>
<td align="center"><img src="docs/images/readme/library/four-bar.gif" width="190" alt="Four-Bar"><br><b>Four-Bar</b></td>
<td align="center"><img src="docs/images/readme/library/slider-crank.gif" width="190" alt="Slider-Crank"><br><b>Slider-Crank</b></td>
<td align="center"><img src="docs/images/readme/library/whitworth.gif" width="190" alt="Whitworth Quick-Return"><br><b>Whitworth Quick-Return</b></td>
<td align="center"><img src="docs/images/readme/library/jansen-leg.gif" width="190" alt="Jansen Leg"><br><b>Jansen Leg</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/drag-link.png" width="190" alt="Drag Link"><br><b>Drag Link</b></td>
<td align="center"><img src="src/assets/gifs/bell-crank.png" width="190" alt="Bell Crank"><br><b>Bell Crank</b></td>
<td align="center"><img src="src/assets/gifs/locked-four-bar.png" width="190" alt="Locked Four-Bar"><br><b>Locked Four-Bar</b></td>
<td align="center"><img src="src/assets/gifs/loader-bucket.png" width="190" alt="Loader Bucket"><br><b>Loader Bucket</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/watt-i.png" width="190" alt="Watt I"><br><b>Watt I</b></td>
<td align="center"><img src="src/assets/gifs/watt-ii.png" width="190" alt="Watt II"><br><b>Watt II</b></td>
<td align="center"><img src="src/assets/gifs/stephenson-iii.png" width="190" alt="Stephenson III"><br><b>Stephenson III</b></td>
<td align="center"><img src="src/assets/gifs/double-butterfly.png" width="190" alt="Double Butterfly"><br><b>Double Butterfly</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/scotch-yoke.png" width="190" alt="Scotch Yoke"><br><b>Scotch Yoke</b></td>
<td align="center"><img src="src/assets/gifs/radial-engine.png" width="190" alt="Radial Engine"><br><b>Radial Engine</b></td>
<td align="center"><img src="src/assets/gifs/elliptical-trammel.png" width="190" alt="Elliptical Trammel"><br><b>Elliptical Trammel</b></td>
<td align="center"><img src="src/assets/gifs/screw-jack.png" width="190" alt="Screw Jack"><br><b>Screw Jack</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/cylinder-boom.png" width="190" alt="Cylinder-Driven Boom"><br><b>Cylinder-Driven Boom</b></td>
<td align="center"><img src="src/assets/gifs/backhoe-bucket.png" width="190" alt="Backhoe Bucket"><br><b>Backhoe Bucket</b></td>
<td align="center"><img src="src/assets/gifs/scissor-lift.png" width="190" alt="Scissor Lift"><br><b>Scissor Lift</b></td>
<td align="center"><img src="src/assets/gifs/slider-crank-inversions.png" width="190" alt="Slider-Crank Inversions"><br><b>Slider-Crank Inversions</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/chebyshev.png" width="190" alt="Chebyshev Straight-Line"><br><b>Chebyshev Straight-Line</b></td>
<td align="center"><img src="src/assets/gifs/peaucellier.png" width="190" alt="Peaucellier–Lipkin"><br><b>Peaucellier–Lipkin</b></td>
<td align="center"><img src="src/assets/gifs/pantograph.png" width="190" alt="Pantograph"><br><b>Pantograph</b></td>
<td align="center"><img src="src/assets/gifs/windshield-wiper.png" width="190" alt="Windshield Wiper"><br><b>Windshield Wiper</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/toggle-clamp.png" width="190" alt="Toggle Clamp"><br><b>Toggle Clamp</b></td>
<td align="center"><img src="src/assets/gifs/punch-press.png" width="190" alt="Punch Press"><br><b>Punch Press</b></td>
<td align="center"><img src="src/assets/gifs/derrick-crane.png" width="190" alt="Derrick Crane"><br><b>Derrick Crane</b></td>
<td align="center"><img src="src/assets/gifs/crane-two-loads.png" width="190" alt="Crane with Two Loads"><br><b>Crane with Two Loads</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/pumpjack.png" width="190" alt="Pumpjack"><br><b>Pumpjack</b></td>
<td align="center"><img src="src/assets/gifs/oscillating-fan.png" width="190" alt="Oscillating Fan"><br><b>Oscillating Fan</b></td>
<td align="center"><img src="src/assets/gifs/pedaling-leg.png" width="190" alt="Pedaling Leg"><br><b>Pedaling Leg</b></td>
<td align="center"><img src="src/assets/gifs/three-machines.png" width="190" alt="Three Machines"><br><b>Three Machines</b></td>
</tr>
</table>

<details>
<summary><b>The full library, by family</b></summary>

| Family | Mechanisms |
| --- | --- |
| **Start Here** | Four-Bar · Slider-Crank · Drag Link · Bell Crank · Locked Four-Bar · Loader Bucket |
| **Six-Bars and Harder** | Watt I · Watt II · Stephenson III · Double Butterfly |
| **Slots and Sliders** | Whitworth Quick-Return · Shaper Quick-Return · Scotch Yoke · Radial Engine · Elliptical Crank · Engine with a Flywheel · Screw Jack · Elliptical Trammel · Parallel Gripper |
| **Cylinders** | Cylinder-Driven Boom · Backhoe Bucket · Scissor Lift |
| **Paths and Curves** | Chebyshev Straight-Line · Jansen Leg · Windshield Wiper · Peaucellier–Lipkin · Pantograph |
| **Forces** | Punch Press · Derrick Crane · Toggle Clamp · Offset Load Rocker · Crane with Two Loads |
| **Unusual Drives** | Oscillating Fan · Pumpjack · Pedaling Leg |
| **Many Machines** | Three Machines · Walking Pair · Approximate and Exact · Pumping Field · Four-Bar Inversions · Slider-Crank Inversions |

</details>

There is also a five-step **tutorial**: draw a bar, extend it into a chain, ground the ends, make
one joint the input, play it and read a velocity. It works out which step you are on by looking at
the drawing rather than counting clicks, so it can start on a half-built mechanism and follow an
undo backwards.

---

## Units, settings and keyboard

<table>
<tr><th align="left">Length</th><td>in · cm · m</td></tr>
<tr><th align="left">Angle</th><td>degrees · radians</td></tr>
<tr><th align="left">Force</th><td>lbf · N</td></tr>
<tr><th align="left">Mass · inertia</th><td>lbm, g, kg, paired with the length unit</td></tr>
<tr><th align="left">Input speed</th><td>RPM · deg/s · rad/s, or length/second for a linear drive</td></tr>
<tr><th align="left">Presets</th><td>English · Metric · SI</td></tr>
</table>

Settings also hold gravity, the major and minor grid, snap-to-grid, snap-to-alignment, and the
scale objects are drawn at. Snapping preferences are remembered on the machine.

<details>
<summary><b>Keyboard shortcuts</b></summary>

| | |
| --- | --- |
| **Modes** | <kbd>1</kbd> Synthesis · <kbd>2</kbd> Edit · <kbd>3</kbd> Kinematic · <kbd>4</kbd> Force |
| **Playback** | <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> step a frame · <kbd>S</kbd> cycle speed |
| **View** | <kbd>+</kbd> <kbd>−</kbd> zoom · <kbd>0</kbd> reset view · <kbd>M</kbd> centres of mass · <kbd>L</kbd> joint IDs · <kbd>P</kbd> traced paths |
| **Editing** | <kbd>K</kbd> lock/unlock · <kbd>Esc</kbd> deselect · <kbd>Delete</kbd> delete · <kbd>Ctrl/⌘ Z</kbd> undo · <kbd>Ctrl/⌘ ⇧ Z</kbd> redo |
| **General** | <kbd>,</kbd> Settings · <kbd>?</kbd> Help, and this list |

Each shortcut is defined once, in one table, and the tooltip on the control it doubles asks that
table for its keys, so a hint can never drift from the key that fires it.

</details>

---

## Verification

The solvers are not trusted because they look right.

**Against MATLAB.** Five mechanism configurations from the reviewed reference contract in
[PMKS-Web/PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification), namely a slider-crank
with a tracer, Stephenson III, Watt I and two teaching-lab cases, are rebuilt with the PMKS+ model
classes and compared row by row against MATLAB output at **one-degree increments of the input
crank**. Joint and angular kinematics are covered in all five; centre-of-mass kinematics in three;
full dynamics in two. The data is generated from a pinned commit and committed, so CI needs no
network.

**Against itself.** Around a hundred verification suites assert closed-form answers for named
mechanisms: the Chebyshev midpoint really is straight, the radial engine's piston stroke really is
twice the crank throw, the Jansen leg really walks. Alongside those sit mobility, assembly-branch,
slot-tangency and redundant-constraint cases that are easy to get subtly wrong.

**In a real browser.** Fifty-odd Playwright suites drive the actual app: every context-menu action on
every kind of part, drag gestures and snapping, playback timing measured against the wall clock,
the graphs of every template cross-checked against difference quotients of the series above them.

| | |
| --- | --- |
| Application source | ~55,000 lines of TypeScript |
| Unit + verification specs | 157 files (~27,000 lines) |
| Browser-driven scripts | 62 in `e2e/`, of which 57 assert and 5 are helpers or asset writers |
| MATLAB reference cases | 5 |
| Mechanisms published as links | 53, in [`docs/fixture-urls.md`](docs/fixture-urls.md) |

The gallery is published as URLs because a fixture is a TypeScript object and the app only speaks
URLs. Without it, a reviewer has to rebuild a linkage by hand to see what a failing test is about. A
spec fails if the generated file is stale, so adding a mechanism to the gallery without regenerating
cannot slip through.

---

## Philosophy

The project has named the same four principles since it started: **education, flexibility,
collaboration, accessibility**. Stated like that they are a mission statement, and a mission
statement explains nothing about a codebase. What they actually amount to, in the source, is four
fairly specific rules, and between them those four explain most of the decisions in the sections
either side of this one.

### 1. A mechanism is a URL

The whole mechanism packs into one compact URL-safe string: every joint, link, force, weld, lock,
mass and colour, plus the document settings that go with them. That one encoding does three jobs
at once: **sharing**, **saving**, and **undo/redo** (an undo step *is* a previous URL, decoded
again). Nothing is stored on a server, so nothing can be lost, expire, or require a login. Share
Project hands you the link; the app decodes it on load and then clears it out of the address bar,
so what you see there is never a stale copy of what is on the grid.

Two things deliberately stay outside it: a **background image**, which is a whole photograph, and
the preferences that belong to *you* rather than to the drawing, such as snapping and centres of
mass, which are remembered on the machine instead.

The consequence is a compatibility promise: **the encoding is a public surface**. Changing it
breaks links other people already sent, so an older build refuses a link written by a newer one
rather than silently misreading it, and every codec change is defended by round-trip tests.

### 2. Say what is wrong, and say the way out

A greyed-out button that will not explain itself is a dead end for a student. So a refusal in PMKS+
carries its reason in the same row. Wherever a rule is enforced somewhere real, the row quotes that
code (`describeActuatorRefusal`, `weldRefusal`, `locksHolding`) rather than restating it, so the
menu and the model cannot drift apart.

<img alt="Context menus showing refusals: 'unlock first', 'part is sealed'" src="docs/images/context-menu/refusals.png" width="820">

The same rule governs the analysis modes. A mode that cannot run does not go quiet; its tab carries
a **chip** counting what is missing, and pressing the tab opens a list of exactly what, usually with
a button that takes you to the part at fault.

### 3. One thing, one name

There is a written vocabulary the whole UI is held to
([`docs/ui-vocabulary.md`](docs/ui-vocabulary.md)): **Add** on the bare grid, **Attach** on an
existing part, **Weld**/**Unweld**, **Delete** for everything that is removed. Controls are Title
Case; everything else is a sentence written to the person, about *their* mechanism, not about the
program.

> Instead of `Cannot edit while in Synthesis mode` → **`Switch to Edit mode to change the mechanism.`**

### 4. Every claim is checkable

Which is what the section above is for. Two things follow from taking it seriously. The solvers
are held to numbers produced somewhere else, by something else: MATLAB, at one-degree increments,
committed rather than fetched. And every mechanism the suite is built on is **published as a
clickable link** ([`docs/fixture-urls.md`](docs/fixture-urls.md)), so a reviewer can open the
exact machine a failing test is about instead of rebuilding it from coordinates in a spec file.

---

## How it works

```
                    ┌──────────────────────────────────────┐
  ?<shared url> ───▶│  UrlProcessor  →  MechanismBuilder   │
                    └───────────────────┬──────────────────┘
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  MechanismService                    │  the editable drawing:
                    │  joints · links · forces at t = 0    │  create · delete · weld ·
                    └───────────────────┬──────────────────┘  ground · slider · drive
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  partition into independent machines │  M1, M2, M3…
                    └───────────────────┬──────────────────┘
                                        │
      ┌───────────────┬─────────────────┼─────────────────┬──────────────────┐
      ▼               ▼                 ▼                 ▼                  ▼
 loop-solver    position-solver   kinematic-solver   force-solver       readiness
(find loops)   (every timestep)   (velocity, accel)  (static/dynamic)   (blockers)
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  UrlGeneration  →  share · save      │
                    │                    · undo / redo     │
                    └──────────────────────────────────────┘
```

- **State lives in root services**, not in components. `MechanismService` owns the editable
  drawing; each partition is deep-copied into a `Mechanism` which, if that machine solves, walks
  its whole cycle up front so scrubbing is a lookup rather than a solve. A large drawing defers
  that work while you are still editing, and picks it up when you ask for an analysis.
- **Undo is a previous URL, re-decoded.** `SaveHistoryService` is an array of encoded strings.
- **Angular 22, fully standalone.** No `NgModule` anywhere; components declare their own imports.
- **The canvas is one SVG** with pan/zoom, and the right-click menu is built in a service from what
  was clicked plus the current mode, so the menu, the properties panel and the drag ring cannot
  disagree about what is allowed.

A fuller map of the codebase, and the conventions it is held to, is in
[`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

---

## Development

Requires **Node 22.22.3+, 24.15+ or 26+**, the range the Angular 22 toolchain declares.

```bash
git clone https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator.git
cd Planar-Mechanism-Kinematic-Simulator
npm ci
npm start          # http://localhost:4200
```

| Command | Does |
| --- | --- |
| `npm start` | Dev server with live reload |
| `npm run build` | Production build into `dist/pmksweb` |
| `npm test -- --watch=false` | The Vitest suite (drop the flag for watch mode) |
| `npm run format:check` | Prettier state; see the note below |
| `npm run fixture-urls` | Regenerate [`docs/fixture-urls.md`](docs/fixture-urls.md) |
| `npm run template-payloads` | Regenerate the mechanism library's payloads |
| `node e2e/readme-shots.mjs` | Regenerate the screenshots in this file |

Browser-driven suites live in [`e2e/`](e2e/README.md) and run under plain Node with a Playwright
install kept outside the repo. It is deliberately not a devDependency, because it would bloat deploy
installs.

**On formatting:** about fifty files predate the Prettier config. Format only the files you actually
edited. Running Prettier across an untouched file rewrites code you did not write and buries your
change.

### Branches and deploys

- **Never push to `main`.** Commits there deploy straight to production at
  [app.pmksplus.com](https://app.pmksplus.com).
- Every other branch publishes to `https://[BRANCHNAME]--pmksprod.netlify.app`.
- The `version` in `package.json` is what Settings shows to a user; raise it in the PR that ships
  a release.

---

## Contributing

Work happens on the [project board](https://github.com/orgs/PMKS-Web/projects/1). Fork, branch,
open a pull request against `main`.

What we ask of a change:

1. **Comment *why*, not *how*.** The code should say what it does; the comment should say why it
   had to be that way. Most files here open with a paragraph explaining the decision behind them;
   match that.
2. **Keep classes under ~200 lines** and functions short.
3. **Follow Angular naming**: `foo-bar.service.ts`, `FooBarComponent`, `app-` selector prefix.
4. **Add the mechanism to the fixtures**, not to a spec. New linkages go in `FIXTURE_GALLERY` so
   they get a published URL.
5. **Do not change the URL codec casually.** Links other people have already sent are a
   compatibility surface.

---

## License and contact

MIT. The full text is in [LICENSE](LICENSE) at the root of this repository.

Questions, bug reports and course-adoption enquiries: **help@pmksplus.com**, or the feedback form
inside the app (Help / Feedback in the project menu).

---

## Acknowledgements

PMKS+ is based on **PMKS**, developed by **Prof. Matthew I. Campbell**, Professor of Mechanical
Engineering, Oregon State University.

### Faculty

- Prof. David Brown (CS)
- Prof. Pradeep Radhakrishnan (ME, RBE)

### Contributors

<table>
<tr><td>David Peterson (CS '28)</td><td>Randy Gomez (CS '28)</td><td>Adel Benchemam (Mass. Academy of Math and Science '26)</td></tr>
<tr><td>Jeremy Bornstein (CS '25)</td><td>Jagruti Chitte (CS '25)</td><td>Gabriel Curet-Irizarry (CS '25)</td></tr>
<tr><td>Javier DeLeon (CS '25)</td><td>Matthew Gatta (CS '25)</td><td>Sebastian Gurgol (CS '25)</td></tr>
<tr><td>Jessica M. Rhodes (BS/MS RBE '25)</td><td>Ansel Chang (CS '25)</td><td>Lucas Panta (Worcester Technical High School '25)</td></tr>
<tr><td>Naseem Blount (Worcester Technical High School '25)</td><td>Jacob Adamsky (CS '24)</td><td>Kohmei Kadoya (BS/MS RBE '23)</td></tr>
<tr><td>Alex Galvan (BS ME/RBE '21)</td><td>Haofan Zhang (BS/MS CS '20)</td><td>Trevor Dowd (BS CS '20)</td></tr>
<tr><td>Robert Dutile (BS CS '20)</td><td>Milap Patel (BS ME/CS '20)</td><td>Peter Prygocki (BS CS '20)</td></tr>
<tr><td>Fabian Gaziano (BS CS '20)</td><td>Michael Taylor (BS CS '19)</td><td>Griffin Cecil (BS CS '19)</td></tr>
<tr><td>Dimitrios Tsiakmakis (BS CS '19)</td><td>Praneeth Appikatla (BS CS '19)</td><td>Zhihao Xie (BS RBE '19)</td></tr>
<tr><td>Albert Nana Beka (BS/MS ME '19)</td><td>Jonathan Andrews (BS RBE '18)</td><td>Brandon Knox (BS RBE '18)</td></tr>
<tr><td>Guillermo Rivera (BS RBE '18)</td><td>Brad Leach (BS ME '18)</td><td>Garrett Holman (BS ME '18)</td></tr>
<tr><td>Oluchukwu Okafor (BS ME '18)</td></tr>
</table>

<div align="center">

**[Open PMKS+ →](https://app.pmksplus.com)**

</div>
