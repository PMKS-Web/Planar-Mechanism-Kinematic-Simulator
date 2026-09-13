# Gotchas in the UI layer

> **Status:** Reference — what bites you in the stylesheets and in the editing rules.

Two traps that are not obvious from the code and have each cost somebody an
afternoon: how these stylesheets actually reach the page, and which of the several things that can
refuse an edit is refusing this one.

Open it when you are working in a panel, a stylesheet, or anything that can say no.

---

## Contents

- [SCSS gotchas](#scss-gotchas)
- [Editing, playback, and who is allowed to say no](#editing-playback-and-who-is-allowed-to-say-no)

---

## SCSS gotchas

**A panel's `styleUrls` does not scope it. The `@mixin` does the opposite.** Most component
stylesheets are written as `@mixin css($theme)` and `@include`d from `src/mytheme.scss`, and a mixin
emits nothing where it is declared — so the `styleUrls` entry on the component is inert and every
rule in the mixin lands in the *global* stylesheet exactly as written. `.check { padding-top: 10px }`
inside `some-panel.component.scss` styles every `.check` in the app. Which panel wins a shared name
is decided by the order of the `@include` lines at the bottom of `mytheme.scss`; the later one wins
ties.

Rules written *outside* the mixin — `edit-panel.component.scss` has a run of them after it — get both
treatments: Angular emits an `_ngcontent`-attributed copy from `styleUrls`, and `mytheme.scss` emits
an unscoped copy from the `@use`. The attributed copy wins, so the global one is dead weight that
still leaks.

This has bitten more than once, as a panel whose spacing is set by a panel it has nothing to do
with. `analysis-setup` is scoped now, but bare class names are still shared across components
(names like `.row`, `.label-help`, `.chip` and the `.help*` family) — some deliberately
(`blocks.common.scss` and the help panel exist to be shared) and some not. Read the shipped rules rather than the sources to tell which is which. Guard
the cross-origin sheets and recurse into `@media`, or you will miss most of them:

```js
const all = [];
const walk = (rules) => { for (const r of rules) { if (r.selectorText) all.push(r.selectorText); if (r.cssRules) walk(r.cssRules); } };
for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* Google Fonts */ } }
```

To ask the narrower question — *what is reaching into the component I am working on* — filter those
rules to the ones that actually match it: skip selectors containing `_ngcontent` (the component's
own) and `.mat-`/`.cdk-`, then call `el.matches(rule.selectorText)` for every element under it.
Anything that comes back is coming from outside. That is how `.check { padding-top: 10px }` from
`analysis-setup` was found sitting five pixels under the CAD Export dialog's tick.

**Declaring a property is what protects you from a leak, if you are not scoping it.** A component
rule wins wherever it *declares* the property and nowhere else, so the defensive `padding: 0` in
`drawing-export.component.scss` is the fix for one of these — leaving a property unset is what lets
the global one through. Scoping the offending sheet is the better fix where you can afford the
verification; the defensive one is what to reach for when you cannot.

**Scope such a file with `:where(app-thing) { ... }`, not `app-thing { ... }`.** `:where()`
contributes no specificity, so every rule keeps exactly the weight it had and nothing starts or
stops winning. A bare element wrapper adds a type selector to all of them at once, which sounds
harmless and is not: rules that had been quietly losing to Angular Material start winning, and the
panel changes appearance in a commit that was supposed to be a no-op.

**A `/* */` comment directly inside a wrapper emits an empty rule.** Sass opens the parent to place
a loud comment, so `:where(app-thing) { }` appears in the bundle once per comment. Use `//` for
comments at a wrapper's top level.

**Not every leaked rule is doing anything.** Before treating a shared name as load-bearing, check
whether the receiving component already overrides it — `mechanism-panel` writes
`.mechanismPanel .sectionHeader` and `edit-panel` writes `.massArea .dot`, both of which outrank the
bare rule and were covering its whole rendered appearance. Not every declaration, though:
`mechanism-panel` never restated `min-height`, and only got away with it because it pins `height`.
The way to find out is to diff computed styles before and after, not to read the two stylesheets and
reason about them. Diff the *properties*, not screenshots — the canvas camera settles differently
between runs, so a pixel comparison of this app has a noise floor in the tens of thousands of pixels
and will bury a real one-property change.

**There is more than one `@media (max-width: 600px)` block in a file.** `playback-bar.component.scss`
has two, hundreds of lines apart, and the later one wins. A rule added to the first that already
exists in the second does nothing at all, and looks correct while doing it.

**A length times a percentage is not a thing `calc()` can work out.** The scrub card's start marker
was placed with `calc(... + (100% - 24px) * var(--at) / 100)`, and `--at` was bound from Angular as
`[style.--at.%]` — so the multiplication read `<length> * 41.7%`, the whole `left` declaration was
invalid, and the marker fell back to its static position at the left of the well. The value it was
*given* never mattered. Bind a custom property that gets multiplied as a **bare number**
(`[style.--at]`), and keep the `.%` suffix for properties that are used as a percentage outright, the
way `--along` is used as a gradient stop.

This one hid for a whole feature because the value was always zero: a marker pinned to the left is
indistinguishable from a marker correctly placed at zero. If a positioned element only ever gets
tested at one value, set it to a second one and measure — `getBoundingClientRect()` against the
control it is supposed to line up with, not a screenshot.

**On a phone browser the page is not the screen, and `env(safe-area-inset-*)` is zero.** Measured on
an iPhone in Safari with the bars showing: `innerHeight` 654, `vh` and `lvh` 754, `dvh` and `svh`
654, and all four safe-area insets **0**. Safari lays the page out in the band between its own bars,
which is already inside the safe area — so `viewport-fit=cover` has nothing to do there and the
`env()` readers all return zero. They are for a Home Screen web app, where the page really is the
screen. Do not debug a phone layout by reasoning about which inset applies; put a fixed `<div>` on
the page that prints `innerHeight`, `visualViewport`, `documentElement.clientHeight`, each of
`vh/dvh/svh/lvh` measured off a probe element, and the four insets, and read it on the device.

**A browser tab cannot go edge to edge, and no amount of CSS changes that.** Measured, not guessed:
Safari hands the page 654pt of an 852pt screen and paints no page *content* outside it — a canvas
laid out 100pt taller draws nothing in the strip past the viewport, and neither does a
`background-image` on the root element. The one thing that reaches the whole screen is the root
element's background **color**, which the browser propagates. So in a tab the grid stops where the
page stops, with matching white either side, and that is the end of it.

Installed to the Home Screen the same build reports `innerHeight` 874, `safe-area-inset-top` 62 and
`-bottom` 34, and the canvas spans the whole screen. That is what `manifest.webmanifest`,
`apple-mobile-web-app-capable` and — the load-bearing one —
`apple-mobile-web-app-status-bar-style: black-translucent` are for: the last puts the status bar
*over* the web view rather than above it. A standalone web app also gets its **own storage jar**, so
`tutorialSeen` and every other `localStorage` mark starts empty there; the tutorial opening on first
launch of the installed app is correct, not a bug.

`start_url` is deliberately absent from the manifest so it defaults to the installed page. A
mechanism here is a URL, and a manifest naming `/` would turn every pinned linkage into a blank grid.

**The canvas takes `100lvh` and is `position: fixed`; everything else takes the small viewport.**
The drawing is the app's background, so it is the size of the screen: `100vh`/`100lvh` (the same
number on every browser that matters — it is what iOS has always meant by `vh`), and fixed, because
the body is the small viewport and clips. The chrome keeps measuring from `100dvh` so its cards stay
above the browser's toolbar. The consequence to remember is that `canvas.getBoundingClientRect()` is
now *larger than the reachable page*: `freeCanvasRect` trims it to `documentElement.clientHeight`
before framing anything, or the mechanism is centered partly under Safari. Trim with
`documentElement`, not `visualViewport` — the latter rescales under a pinch, so at any zoom but 1 the
two are in different coordinate systems.

**Check where a block sits before adding to it.** The phone layout is spread over several media
blocks by concern, not gathered in one place.

**The phone's spacing is a single value.** Every gap in the bottom stack is `$card-inset`, the same
one the top strip keeps from the window, and `e2e/mobile.mjs` measures the strip and compares. Do
not adjust a gap there to make something fit — shrink the thing instead.

**The phone layout was fitted to 390px.** `top-strip-states` also exercises 360, where thirty fewer
pixels are available; anything you add to the bottom row has to survive that.

---

**Reduced motion is one rule in `styles.scss`, not one per component.** Under
`prefers-reduced-motion: reduce` every transition and animation is cut to almost nothing, with
`!important`, from the one global stylesheet. If something still moves with the preference on it
is script-driven -- the Web Animations API does not read the stylesheet -- and needs its own
`matchMedia` check, as `LeftTabsComponent.slide` has. `e2e/reduced-motion.mjs` opens the app with
the preference on.

## Editing, playback, and who is allowed to say no

**Context menus share pose-preservation rules across Edit and Analysis.** Their rows come from
one builder; `menuRefusal` distinguishes topology changes (start only), independent metadata
(locks, holds, shape), invertible body attachments (tracers and forces), and view switches.
Everything requires paused playback. Traces save without rebuilding; attachments use the
existing body transform to place the new point at t=0, preserving the old coordinates exactly.
Do not wrap force creation in the canvas's generic `capturingPose`: that would re-anchor the
whole mechanism before the exact attachment mapper can run. Force property edits must capture
the requested displayed values before restoring t=0, because restoration also restores old
force values. Posed drags still use their separate anchor-preserving edit path.

**Bulk dimensions must be solved together.** Submit selected bars to `setBarValues`; precomputing
endpoints and calling `dragJoint` in a loop uses stale shared anchors and retains old dimension
holds. A failed simultaneous constraint solve must leave every joint unchanged.

- **One model answers "may this edit happen".** `model/edit-permission.ts` is a pure function from
  a described state to a refusal-or-nothing; `services/edit-permission.service.ts` describes the
  current state to it. Six surfaces quote it — the canvas's drag gate, the Edit panel's banner,
  the context menu's graying, undo/redo, the analysis geometry lock, and the transport's hint.
  **Do not re-derive the rule at a new surface.** Three of those six used to read the *shared*
  clock, and with the machines unsynced they disagreed with the three that did not: a row scrubbed
  mid-cycle left the canvas editable while undo refused.
- **Ask `isAtStartPose()`, never `mechanismTimeStep === 0`.** The second is the shared clock only.
  An unsynced machine can be parked anywhere while it still reads zero.
- **The transport's visibility is decided by mode alone.** It is on screen in Edit and both
  analyses, including over an empty grid, and hidden only in Synthesis. That is what keeps its
  `riseFromBottom` entry animation off the drawing-changed path: a bar that slid in when the first
  link was drawn was animating on something that is not a mode change.
- **The Edit panel does not vanish any more.** It stays with its body `inert` and dimmed, and a
  banner across the top carrying the permission model's own words. `inert` rather than a
  `disabled` on each control: it removes the whole subtree from pointer, keyboard and focus reach
  in one attribute. The fields still tick — `ngDoCheck` patches the selected joint's coordinates,
  because `animate()` mutates the joints in place and publishes on nothing you could subscribe to.
- **The anchor is what stops the ratchet.** The editable joints are the design,
  the drawn pose, and the solver's t = 0 all at once, so a rebuild that runs while playback has
  moved them redefines "start" as wherever playback was. `model/mechanism/anchor.ts` keeps, per
  machine, the driven joint's *coordinate at t = 0* -- measured absolutely, and **stored**, not
  re-derived. Re-derive it and every posed edit rounds to the nearest sample and the next rounds
  from there; store it, and the error stays bounded however many edits are made.
- **Anchors are keyed on the whole owned-joint set, never `partitionKey`.** That key is the lowest
  owned moving-joint id, which a fusion usually lets one parent keep. A wrong resume point is a
  nuisance; an inherited anchor is a corrupted design.
- **`restoreStartPose` skips exactly one machine**, for exactly the length of one gesture
  (`seedFromDisplay`). Skipping it globally would turn *every* displaced machine's shown pose into
  its provisional t = 0, corrupting machines the edit never touched.
- **Drop anchors before the rebuild, not after.** `UrlProcessorService` calls `forgetAnchors()`
  ahead of `finishStructuralEdit`; after it, the call threw away the anchors that rebuild had just
  taken, and every freshly opened mechanism had none until its first edit.
- **A held clock only holds the pose while the machine is measured the same way.** A rebuild
  carries each machine's elapsed seconds across and lays them back on afterwards, which is right
  for an ordinary rebuild and wrong for one that re-parameterizes the machine: move the drive from
  joint A to joint B and t = 0.7 s stops meaning "0.7 s of A turning" and starts meaning "0.7 s of
  B turning", so the same clock reading is a different pose. A four-bar parked mid-swing jumped
  ~800 model units the moment its input changed. The *start* pose was never in danger -- the anchor
  looks after that, and it is why the bug is easy to miss -- but the pose the reader was looking at
  teleported. `posesAcrossReparameterization` notices the rule changing (compared whole, like
  `ruleStillHolds`), measures the drawn pose in the **new** rule before `restoreStartPose` moves
  the arrays, and `restoreHeldPoses` finds it again in the cycle the rebuild solved. The pose is
  held and **the clock is what jumps** -- the same trade `reverseDrive` makes, and the same one to
  make at any future rebuild that re-measures a machine.
- **`findPose` exists because a heading you do not know is worse than none.** `reachAnchor` prefers
  crossings matching the heading it is given, so passing a guess actively steers it to the wrong
  leg of a reversing cycle. `findPose` searches both and lets the pose itself decide.
- **`inert` cannot be un-inherited, so plan what it covers before you reach for it.** The Edit
  panel's refusal strip has to stay pressable while the panel it describes is out of reach, which
  means it cannot be *inside* the frozen subtree. `panel-section` therefore has three slots -- the
  title, an attached slot, and the contents -- with the freeze on the first and third only. If you
  add a control that must survive the freeze, it goes in `[panelAttached]`, not in the card body.
- **`display: contents` keeps an element in the DOM, so `>` still has to pass it.** The freeze
  wrappers above have no boxes, which is deliberate -- a real box there breaks the height chain the
  card scrolls on -- but `#normalPanel > title-block` stopped matching the moment one appeared, and
  the sticky panel title silently unstuck. Selectors that reach through them say `.sectionBody >`.
  `e2e/detail-fixes` catches this one, by way of the title's scroll shadow.
- **A component's styles do not reach a CDK overlay.** An overlay renders outside the component
  that opened it, so `:host`-scoped rules never apply: the transport's start-pose menu and the
  phone's view drawer both live in `src/styles.scss` for that reason. Put the trigger's styles in
  the component and the panel's styles in the global sheet.
- **A range input's thumb does not travel edge to edge.** Its center runs from half its width to
  half its width short of the far end, while a `linear-gradient` percentage on the track is measured
  across the whole thing -- so a mark positioned as a plain percentage drifts from the handle by up
  to half a thumb. The anchor seat uses the thumb's own geometry
  (`calc(12px + (100% - 24px) * var(--at) / 100)`), and is additionally *not drawn* when the handle
  is on it, so the two can never be seen disagreeing.
- **Angular collapses the whitespace around an `@if` inside a run of text.** A sentence with an
  inline link -- "Drag to edit, or *return to the start* to type." -- came out as
  "orreturn to the start" because the space before the block was eaten. Write it as `&#32;`, and
  keep the trailing space out of the model string so `long` does not end up double-spaced.
- **An analysis mode edits now, and the line is `build`/`structure`, not `drag`.** The old
  blanket -- "the graphs describe this exact cycle, so the geometry is locked here" -- is gone,
  along with four outposts that hard-coded it: a `pointer-events: none` layer, a cursor rule, a
  scenery class, and `refuseAnalysisDrag`. `modeLocksGeometry` is `modeLocksStructure` now,
  because that is what is left of it. **No cell of the analysis column is ever more permissive
  than Edit's** -- a spec asserts it over every pose state.
- **Click selects, drag tunes -- and the drag still works through the selection.** Nineteen
  reads in the drag paths take their target from `activeObjService.selectedJoint`, so the press
  still selects. What is held is what the panels are *about*
  (`ActiveObjService.holdGraphSubject`), and the canvas puts the selection itself back when a
  gesture that traveled ends. The hold has to live on the service: the selection changes on
  pointer-down and the drag state that would gate it is not armed until after, so a panel
  gating on `isPointerDown` in `ngDoCheck` sees the swap and keeps it.
- **Read `travelled` off the gesture's own outcome, not off the service.** `release()` clears
  the flag as part of returning it, so a question asked later in the same handler always
  answers "no". This cost an afternoon.
- **A toggle is a singularity, and it will own any axis fitted to its maximum.** Two samples
  out of 360 read twenty thousand where the curve's real range is nought to twelve; the axis is
  then *correct* and the plot says the curve is flat, which is false. `readableRange` in
  `analysis-graph.component.ts` trims the tails when they are outliers -- and only while a
  comparison is on the plot, because a spike in a drawing somebody built deliberately is the
  answer rather than the noise.
- **A comparison axis must widen and never shrink.** Refitted per frame it moves as much as the
  curve does and every frame looks the same height as the last.
- **SCSS appended before a file's last `}` lands inside the last rule, not at the top level.**
  Two chips came out as `.analysis-gap .baselineChip` and silently did nothing. `grep` the
  built CSS for the selector, not just the class name.
- **A second mouse button pressed during a drag arrives as `pointermove`, not `pointerdown`.**
  The Pointer Events spec fires `pointerdown` only for the *first* button. These bindings are
  `pointerdown`, so the right- and middle-button teardown written into `mouseDownNow`'s button
  cases could never run during a drag -- the gesture was left standing, and the next rebuild
  settled the moved geometry onto the anchor as though it had been asked for, with nothing to
  undo it. The hook that actually fires is `contextmenu`, and `onContextMenu` runs the same
  `putBackTheDrag(); letGoOfEverything(true)` the pinch and the long press do.
- **`putBackTheDrag()` must rebuild while the machine is still staged.** The cancel that follows
  is what finds the anchor *in those fresh frames* and makes it t = 0 again. Un-stage first and
  the settle searches frames solved from the geometry the drag had already changed.
- **A comparison's baseline keeps the axis it was drawn to, untrimmed.** Only the live curve can
  contain a singularity the reader has just created, so only the live half is worth trimming --
  and running the baseline through the same trim rescaled the plot the instant a drag began,
  clipping the very curve the overlay promises is "what you were looking at".
- **Do not run `npm test` and a large Playwright sweep at the same time.** Six heavy fixture,
  codec and graph specs time out under the load and fail together, which reads exactly like a
  shared-state bug in whatever you just changed. Re-run the unit suite on a quiet machine before
  believing it.
- **A machine being edited at a pose must have its clock read as zero for that rebuild.** Its
  displayed pose *is* its provisional t = 0 while the gesture is in flight, so holding its elapsed
  seconds and laying them back on afterwards moves it that far along a cycle that now starts under
  the reader's hand -- on a four-bar two seconds in, every pointer move threw the joint two
  seconds' worth of motion away from the cursor and the drag flew apart. Measure a drag rather than
  watching it: the offset between cursor and joint should hold still, and with Alt (snap off) it is
  0.00px on both axes.
- **The staging closes itself.** Three rounds of review each found another path that ended a
  gesture without closing its posed edit -- Escape, a right or middle click, a mode key, Space,
  tabbing away, a delete held mid-drag. Rather than a fourth list of paths to keep in step,
  `updateMechanism` refuses to run with a staging behind it that no gesture owns:
  `closeStaleStaging` settles it first. A staging opened without a pointer (a menu action, a test)
  closes itself and is never treated as abandoned, and a deliberate commit says so with
  `committingPosedEdit`, because by then the pointer is already up.
- **Canceling a posed edit is a commit without the save, not a `= null`.** Every pointer move has
  already solved a provisional cycle whose sample 0 is the pose under the hand, so a machine merely
  unstaged has the displaced pose as its canonical t = 0. But only settle when a rebuild *has* run
  while staged (`stagedRebuilt`) -- otherwise a click that selects and releases without moving
  anything settles onto its own anchor and rewinds the drawing under the reader.
- **An edit that captures the pose it is made at must be staged like a drag.** Adding a link,
  welding, dropping a cylinder: §6.2 of `docs/edit-mode-playback-plan.md` calls these *capturing*, and they rebuilt directly, so the
  restore ran over them. `MechanismService.capturingPose` stages, runs and settles, holding the
  inner save so the gesture is still one undo entry.
- **`updateLinkageUnits` scales the live joints, which mid-cycle are a solved sample.** Rewind
  first -- the clocks too, not just the joints, or the rebuild's own restore undoes the scale --
  then put the reader back afterwards.
- **Every path that abandons a gesture must abandon its staging.** `letGoOfEverything` is the one
  a pinch and a long press take, and a `seedFromDisplay` left behind outlives the gesture: the next
  ambient rebuild reads "seed this machine from what is drawn" and the displaced pose becomes the
  design. Four unrelated Playwright suites failed on that one leak, none of them about posed
  editing.
- **A comparison that lists the fields it checks stops checking whatever is added next.** The
  anchor copied two fields out of its `CoordinateRule` -- the two a grounded crank needs -- so the
  floating-actuator halves added later were dropped on the way in and invented on the way out. It
  carries the whole rule now and compares it whole.
- **Slipping a wrapper div into a panel breaks its scroll.** The mode panels are a chain of flex
  items that give up their height so the card inside can cap itself at `max-height: 100%` and
  scroll its own contents. A plain `<div>` inserted anywhere in that chain leaves the percentage
  nothing definite to resolve against, and on a short window the card overflows its frame instead
  of scrolling -- visible only below about 600px tall. Any new wrapper needs
  `flex: 1 1 auto; min-height: 0`.
- **A getter the template calls must be a question, not a step.** The ghost's warning counter was
  advanced inside the getter that read it, so Angular's second check -- the one that proves nothing
  moved -- got a different answer, and every drag past the Grashof boundary raised `NG0100`. Key
  such a counter on `solveRevision` and advance it once per solve.
- **"No ghost" is not "reachable".** A machine that cannot be solved draws no ghost, and reading
  that absence as a yes said yes to the exact case the warning exists for.
- **An actuator's coordinate is a *relative* freedom.** A grounded crank's angle can be read off
  the world; a floating pin's cannot, because neither of its bodies is the world. Same for a slot
  cut into a moving link: the axis is fixed in the carrier, so it is re-read from the carrier in
  every pose rather than stored as a world vector.
- **Losing Grashof is not the same event as losing the anchor.** A rotating crank passes every
  angle, and a rocker's range still contains the pose the mechanism was drawn in. The start goes
  out of reach when the *new limits* exclude it, which depends on where in the cycle the edit was
  made -- so drive such a test by `anchorIsReachable`, never by a distance worked out in advance.
- **Grab-to-pause fires in `setLastLeftClick`, before the gesture is classified.** That is
  deliberate: what follows is a drag, a tap or a long press, and every one of them wants the
  machine standing still. It is also why touch needs no second code path.
- **Aiming at a moving joint in a test is a press on empty canvas.** A crank at ten rpm crosses a
  joint's own width in less time than it takes to read its position and put the pointer there, and
  the miss reads exactly like the app refusing the gesture. Set `driveSpeed` low first.
- **A four-bar a third of the way round its cycle puts a joint several hundred pixels below the
  window.** A Playwright press aimed there lands on nothing and reads exactly like the drag being
  refused. Re-frame (the **Fit to view** control) after seeking, before aiming at anything.
- **The phone's bottom stack is two rows now**, not one: the shared scrub row came back so a phone
  can park mid-cycle. Per-machine rows and the sync toggle stay desktop-only. Two consequences for
  tests: **a fixed canvas coordinate near the bottom of a phone viewport is no longer open grid**
  (compute a free point with `elementFromPoint`), and **the canvas re-frame after the sheet opens
  takes longer** because the drawing has further to travel — poll until it settles rather than
  waiting a flat second.

---

### Editing away from the start: three doors, and the sweep that tries them all

An edit made while a machine is parked mid-cycle goes through one of three doors, and the plan
(`docs/edit-mode-playback-plan.md` §6.2) names them. **Identity-addressed** edits -- delete,
ground, drive, lock, trace -- apply to the design without reading the pose; the rebuild's restore
puts every joint back on its start first, so they are safe as they are. **Capturing** edits read
geometry off the pose they are made at -- a drag, a link drawn from a joint, a cylinder, a force,
a tracer point, a weld, a slider -- and *must* be staged (`capturingPose` / `beginPosedEdit`) so
the rebuild solves from the displayed pose and the settle puts the machine back on its anchor.
Rebuilt directly, the restore sends every existing joint home and leaves the new part where the
hand put it: that is exactly what a tracer point, a force and a slider did until September 2026.
**Pose-bound numbers** -- a joint's X and Y, a link's length and angle, the CoM, a force's
endpoints, a cylinder's travel -- are refused with the banner until their transform back to t = 0
is written (§5.5).

Two things follow for anyone adding an edit. Stage it if it reads the drawing as shown; the
service methods stage themselves (`weldJoint`, `addJointAt`, `createForce`, `toggleSlider` are
the pattern), so a new caller cannot forget. And if it changes the owned-joint set, know that the
machine's anchor is keyed by that set: `carriedAnchorFor` carries the anchor to the new key and
`stagedPartitionIndex` finds the staged machine by its joints, so a part drawn from a joint or a
drop that merges two keeps the start it had.

The panel's handlers ask the permission model about *their own* action: the pose-bound fields
ask `placement`, and the toggles the freeze leaves live ask `structure`. A handler that asks the
wrong question does not misbehave loudly -- it returns, and the switch it sits behind still flips.

The anchor lookup (`reachAnchor`) has a hundredth of a sample of slack, and needs it: the pose a
re-anchor puts at sample 0 is interpolated between two solved samples, and the coordinate read
back off a point part-way along a chord is a few thousandths of a degree from the stored one.
Without the slack, a drag that changed the cycle could leave a crank's own start "unreachable",
with the ghost drawn at the last pose it could reach and a "starts here now" it had no cause for.
`e2e/posed-drag-fuzz.mjs` is the seeded random-drag sweep that found it.

And the lookup looks for the start angle at *every* whole turn inside the cycle, not just the
stored value: a provisional cycle's angles are unwrapped from wherever the hand is, and on a
rocker whose swing is wider than a turn the same crank angle is reached on two assembly branches.
The winner is the crossing nearest the anchor's seed, and a winner more than a fifth of the
drawing from the seed is refused as the other branch, which turns the ghost amber and moves the
start on release instead of drawing a design the reader never made. The seed is re-taken from the
new start on every successful re-anchor, so it stays a description of the current design.

`e2e/posed-edit-audit.mjs` tries every row, field and key at a displaced pose on three
mechanisms and judges what is left behind (nothing staged, clocks agreeing, the start pose or the
anchor kept, Undo exact). Run it after touching the canvas gestures, the menu builder, the panel
or the anchors; `e2e/README.md` says how long it takes.

### A drag in an analysis mode tunes; it never merges, snaps to a joint or cuts a slot

The analysis modes allow a drag (see the plan in `docs/analysis-mode-editing-plan.md`) so a reader
can nudge a pivot and watch the curve move. What they do not allow is a drag that *restructures*:
in `NewGridComponent.updateDropCandidate` the merge candidate and the slot candidate are both
withheld whenever `tabService.isAnalysisMode()`, exactly as they are while Alt is held. Dropping a
joint on another joint in Kinematic or Force Analysis therefore leaves two joints, and dragging a
joint across a bar cuts nothing. Grid and alignment snapping still apply, because they move the
joint without changing what the drawing is made of. `new-grid.component.spec.ts` has the guard
(`offers neither a merge nor a slot while dragging in an analysis mode`), and the reason is in the
user's own words: movement there is for tuning.

One trap this exposed: the canvas spec's `drag()` helper used to park one joint exactly on another,
which *merged* in Edit and so passed by accident. Two coincident joints in a loopless two-bar are an
invalid machine, `isPartInert` says so, and the next press on its bar is refused. Drag past, not
onto.

### An analysis mode refuses to restructure at a *pose*, not at a mode, so displace it first

`refusalFor` in `src/app/model/edit-permission.ts` allows every paused edit action the moment
`state.atStart` is true, and that test sits **above** the analysis-mode branch. (Not quite *every*
action: transport, synthesis and "something is playing" are all decided before it, so the sentence
is "every edit action, paused, in Edit or an analysis mode".) So a reader who opens Kinematic
Analysis and touches nothing may still build and restructure: the drawing standing on its own start
*is* the design, and there is nothing to refuse about. The branch below only fires once the machine
is parked somewhere that is not the design.

Which makes the shape of any check about it load-bearing. `phase1-drag.mjs` asserted that
`permission.may('build')` was false right after a drag in Kinematic Analysis, having never played
or scrubbed — so it was asserting the mode refuses outright, which the model has never said, and it
failed for exactly that reason. Park the mechanism first (play, then pause, as
`analysis-editing.mjs` does in `parkMidCycle`), **and record that it actually left the start**:
`!isAtStartPose()` as its own check. A refusal assertion made against a mechanism still standing on
t = 0 either passes vacuously or asserts the opposite of the rule, and neither reads as wrong from
the check's name.

Note also that a posed drag does not clear the refusal. It re-anchors — the start of the *new*
geometry is re-derived at the anchored input value — but `settleToAnchor` closes by putting the
display back where the hand was, so the machine is still displaced afterwards and restructuring is
still refused. The way out is the one the refusal itself names: back to the start.
