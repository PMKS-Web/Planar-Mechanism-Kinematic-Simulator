# Joint friction

> **Status:** Partly built — prescribed-motion sliding friction and local static limits are implemented on `feature/friction`; forward dynamics and static holding solves remain future work.

**Current app limit:** Friction in **Static analysis** (which omits inertia) is supported.
This does not solve stationary holding friction. In-motion friction is refused for
bodies with nonzero mass or inertia because an inherited force-solver drawing-scale error changes
their bearing loads. Zero-inertia In-motion cases and unscaled domain calculations remain supported.
See the audit below; this restriction prevents unverified physical results from reaching users.

## How friction is presented

Friction is a **calculated contact load**, not a user-created applied force. It never creates a
`Force` object or an editable load handle. The solver continues to apply both contact actions;
the drawing shows just one, on the receiving body named in the panel and SVG description. For a
slider that is the block at the visible pin. For a bearing it is the solver's positive-body link.
The equal/opposite action belongs to the contact partner, including ground where applicable.
Selecting another body does not silently reverse this convention.

### Settings and feedback

The joint's Friction header carries an **Enabled** or **Off** chip, visible even when collapsed.
Single-contact panels use that header state alone. A selected slider pin can expose both its
saved bearing contact and its guide, with independent coefficients. Such multi-contact panels
retain per-contact Enabled/Off text because the header aggregates whether **any** contact is
enabled. **Save Friction Settings**
commits the form; it does not apply an external load or start playback. A confirmation appears
beside the save control, and **Disable Friction** resets both coefficients to zero in one undo
step while retaining the effective radius. Unsaved typing does not claim a new enabled state.
The existing edit-permission gate controls the native fields and buttons. Settings cannot be
typed during playback or at a posed state where the existing editor requires a return to start.

### Contact results and actuator consequences

For a solved moving contact, the panel shows **Contact State: Sliding** or **Relative Rotation**,
**Normal Load** for a guide / **Radial Load** for a bearing, the signed **Friction Force/Torque**,
and **Static Friction Limit**. The expandable calculation shows the coefficient, load, optional
physical radius, resulting magnitude and the opposition-to-relative-motion rule.
The default view keeps the contact identity, Enabled/Off state, these readings and the separate
**Additional from Friction** input summary. Coefficients, direction conventions, reaction
decomposition and startup interpretation live inside **How Friction Is Calculated**, closed by
default. Expanded content uses labeled groups: coefficients, Magnitude, Direction, Reaction,
Static Limit and Drawing. Substituted equations sit next to the values they explain.

The existing **Static / In-motion** mode labels and help tooltip retain the distinction:
**Static omits inertia; In-motion includes it. Moving contacts use kinetic friction in both
modes.** The redundant permanent helper paragraph has been removed from the friction panel.
No-inertia force balance, contact motion state and static friction capacity remain separate
concepts without renaming force analysis across the app.
The guide's existing reaction results include the friction component. The panel explicitly says
so: the contact arrow is a decomposition of that resultant, not another force to add to it.

A separate **Input Force/Torque at [input]** section shows **Additional from Friction** by default.
Its closed-by-default **Input Effort Details** shows **Without Friction**, **With Friction**, and
the additional effort together, explaining that all contacts contribute at the same prescribed
pose and motion. All values use the input's force or torque units. It appears once in
the contact panel, outside its per-contact rows. These are mechanism-level quantities at the
same pose and prescribed motion, not a local contact force. The frictionless value is total minus
the already-solved additional effort, through `AnalysisSampleService` so display conversions and
its existing numerical-noise policy also apply. Existing export columns retain the total and
additional effort and the individual contact results.

### Canvas overlays

In Force Analysis, supported enabled contacts show their current solved loads by default:

- **Guide:** an open arrow along the guide tangent, signed by the solved friction force. A short
  leader locates the contact while the arrow is offset clear of the guide artwork. The pin's
  visible name identifies the contact; a hidden prismatic joint ID is not presented as a new pin.
- **Bearing:** a curved arrow around the joint, with positive torque counterclockwise in the
  model's y-up frame. Reversing the prescribed input reverses the solved resisting moment.
- Both reuse the analysis force ink and `vector-trace.ts` arrowhead geometry. A dashed stroke
  and explicit **Friction at [pin]: [value]** label distinguish them from the solid applied-load
  arrows. The SVG description names the receiving body and direction convention; the panel's
  calculation uses the shared compact collapsible section and is keyboard accessible.
- Magnitude is encoded relative to **that contact's cycle maximum**: force length uses the
  existing 8.5% of swept-span scale, and torque sweep reaches 225 degrees at its maximum, with
  radius 2% of the swept span. The radius is constant throughout that cycle; torque magnitude
  changes only the sweep. This reduces the previous radius by 60%, keeping the arc close to its
  pin. The numeric label sits above the arc with the existing zoom-stable text offset and surface
  halo, clear of the joint label in the checked fixtures. Read it for physical magnitude. Arrow lengths must
  not be compared across contacts, between force and torque, or with user-applied load artwork.
- The overlay reads each mechanism's own current sample. Scale data is cached by its force-frame
  array, so edits, unit changes, and reversed-drive solves replace the cache. It does not draw a
  full-cycle field of friction arrows or create overlapping action/reaction pairs.
- **Friction on Drawing**, in the read-only friction panel, shows/hides all friction glyphs.
  It is a session view preference, initially on, not a serialized property or an undo step.
  It does not turn off physical friction. Other modes and disabled/zero/unavailable contact
  results draw no glyph. Changing coefficients follows `updateMechanism(true)`, rebuilding
  force results before either the panel or canvas can show a new result.

### Refused and stationary results

At approximately zero relative velocity the domain's refusal identifies the stationary contact.
Its panel says **Stationary** and **Indeterminate at Rest**; another contact whose coupled result
is unavailable says **Unavailable**. Neither invents zero friction, a unique holding force, nor
a static capacity from an unsolved normal load. Unsupported and failed solves retain their
diagnostics and suppress numeric contact and actuator results and glyphs.

The In-motion inertia guard is unchanged. The visible summary says **In-motion inertia scaling
issue. Use Static analysis.** Its **Why Is This Unavailable?** disclosure retains the full reason:

> Friction results are withheld because the existing In-motion inertia calculation has a scaling error for bodies with mass or inertia. Use Static analysis.

The detailed factor-of-200 reproduction remains below and in `friction-inertia.spec.ts`.
`Bearing friction with inertia safeguard` in the fixture gallery opens this state reproducibly.
The standalone driven-slider fixture is a domain force benchmark: the current application needs
a motion range before that isolated block can run. Use the slider-crank for the interactive demo.

### Scope and UI limitations

The Storybook introduction, shared input/button/view-button/section components, and existing
semantic tokens govern the presentation. The new SVG component owns the overlay; the grid only
mounts it. Its one additional Angular imports-array entry is the documented one-line exception
to the grid's lint ceiling, with no rendering logic added to that hub. The shared collapsible
header now exposes its expanded state to assistive technology and browser checks.

Dense mechanisms can still have overlapping labels; there is no new label-placement or global
overlay-management system. The visibility switch is reached through a friction contact's panel.
The input comparison is a current-pose readout, not three new history graphs. This pass does not
change motion laws, solve stationary holding/startup/stall, or correct the general inertia solver.
### Prescribed motion, scrubbing and rewind

**Play** advances each running machine's own clock through its precomputed cycle, at the chosen
playback multiplier. Cycle time wraps. A reciprocating input already has both motion directions
in that cycle: its return leg uses the corresponding solved sample rates, not a UI sign flip.
Normal forward traversal therefore shows the current friction solution on both legs.

For a fully rotating input, **Reverse** replaces the prescribed drive with `withReversedDrive`,
negating prescribed rates and reflecting its phase to preserve the pose. The force cache is
cleared and the coupled friction solution is recalculated. That physical drive reversal is
different from the traversal flag returned by `directionOf`.

For a reciprocating input, the transport now explicitly offers **Rewind M1 playback**, followed
by **Resume M1 prescribed playback**. Its help explains that this traverses existing samples;
the visible direction note says **Rewinding**. The existing `setPlaybackDirection` implementation
is unchanged. A reversed traversal does not solve a new physical motion, so `FrictionService`
returns Unavailable while that machine's traversal direction is negative. This suppresses its
contact numbers, input comparison and drawing glyphs, including while paused or scrubbed in
rewind mode. The visible reason is **Playback rewind does not reverse the prescribed drive.**
Its **Why Is This Unavailable?** disclosure retains the full explanation:

> Friction results are hidden while playback is set to rewind. Rewind traverses existing samples; it does not reverse the prescribed drive. Switch to forward playback to show friction.

Resuming prescribed playback restores the same solved cycle's readings. Nothing negates only
an arrow or guesses a new normal load. This is a presentation guard; the solver cache, exports,
general force graphs and reaction readouts still describe the **prescribed solution**, not a
physical rewind. Extending physical reverse solving to every playback path remains separate work.

**Timeline scrubbing** selects a solved pose. One machine's handle measures input travel and
selects the nearby leg of a reciprocating cycle; a combined handle measures shared time. Neither
drag direction changes the prescribed speed nor sets the rewind flag. Forward and backward mouse
drags therefore show the actual selected sample's friction, not friction inferred from the mouse.
If rewind was already selected, the guard stays in place until prescribed playback is resumed.
The browser suite films real drags and both reverse actions; the adapter tests also read the same
sample after visiting an earlier/later one and verify unchanged friction.

Eased returns to the start pose are likewise navigation through samples, not a newly prescribed
motion. This pass leaves their existing navigation behavior intact. No forward dynamics or new
motion-system normalization is introduced.

### Final density audit and accessibility

The panel follows **Result first. Explanation on demand**, also recorded in the shared UI style
guide. The deliberate classification of the previous default content is:

| Content | Presentation | Why |
| --- | --- | --- |
| Contact identity, Enabled/Off, motion state | Always visible | Identifies which result is being read |
| Normal/radial load, friction effort, static capacity | Always visible | Core engineering results |
| Input identity, additional effort | Always visible | Immediate mechanism-level consequence |
| Without/with/additional comparison and prescribed-motion explanation | Input Effort Details | Full comparison on demand |
| Coefficients, radius, equations, sign, reactions, capacity and drawing conventions | How Friction Is Calculated | Engineering explanation on demand |
| Static analysis versus kinetic friction | Existing Force analysis type help | Avoids a permanent paragraph |
| Drawing visibility versus disabling friction | Existing view-button tooltip | Explains the eye without extra panel prose |
| Stationary, In-motion, rewind and unsupported states | Visible diagnostic summary | Warnings cannot disappear into an explanation |
| Diagnostic reasoning | Why Is This Indeterminate? / Why Is This Unavailable? | Full reasoning on demand |

Only applicable disclosures are present, all closed by default. Normal solved contacts use
Calculation and Input Effort Details; unresolved contacts use the relevant diagnostic disclosure.
Stationary results still say **Indeterminate at Rest** and **Static holding force is not solved**.
Unsupported guides say **Unsupported Friction Contact**, with the original bearing-spacing and
contact-load explanation retained. No warning manufactures numeric capacity or friction.
Collapsing the entire Friction section retains Enabled/Off and adds **Unavailable** or
**Indeterminate at Rest** to its header when applicable.

The shared `collapsible-subsection` gains a backward-compatible `compact` appearance, with no
new accordion implementation. Its button retains `aria-expanded`; closed content now has
`inert`, `aria-hidden` and hidden visibility. Enter/Space operate both disclosure styles, focus
remains visible, and closed content cannot receive focus. The view button's optional `help`
extends its existing tooltip without changing its accessible name or pressed state.

An axe audit caught the existing input-unit suffix at 4.45:1 contrast; it now uses the existing
secondary-text token. Friction warning text uses primary text on the warning surface for readable
contrast. No palette or general warning-token redesign was introduced. The Storybook browser
suite runs the installed axe engine against every friction state, including the 250px compact,
expanded, saved, disabled, stationary, unsupported and rewind layouts.

## Branch and purpose

Develop on `feature/friction`, created from `origin/staging` at `acba1b77` on September 12,
2026. The worktree is `.claude/worktrees/friction`. Keep this feature independent of
`feature/analysis-results-table`; its uncommitted work stays in the original checkout.
Any eventual pull request targets `staging`.

The requested feature covers friction between a slider and its guide, the distinction between
static and kinetic friction, and friction in revolute joints. Default friction must remain zero
so existing mechanisms and shared URLs retain their results.

## Physics

Friction acts between contacting bodies. Static and kinetic friction describe the state of the
same contact, rather than additional forces to add together.

### Prismatic joints

For a guide tangent **t**, signed guide-normal reaction Rn, and relative sliding velocity v:

- Normal load: `N = abs(Rn)` for the proposed ideal single-resultant guide contact.
- While sliding: `Ff = -muK * N * sign(v)` along **t**.
- While sticking: `abs(Ff) <= muS * N`, with the actual force determined by equilibrium.
- At impending slip: the force reaches the static limit in opposition to the proposed motion.

The normal load must come from the coupled force balance. It is not generally the slider's
weight: link forces, guide angle and inertia contribute, and friction changes the reactions.
Apply equal and opposite forces to the block and its carrier; ground is the carrier for a fixed
guide. In a moving slot, evaluate velocity relative to the carrier at the contact point, including
the carrier's rotation. World velocity alone gives the wrong friction direction.

A welded guide can also transmit a couple. Its net normal resultant does not determine the sum
of contact loads at separated bearing surfaces: a pure couple can exist with zero resultant.
Supporting load-dependent friction for that physical model requires bearing spacing and a contact
load distribution, or an explicitly identified approximation. Do not silently treat a loaded,
moment-carrying guide as frictionless because its net normal reaction is zero.

### Revolute joints

Use an explicitly labeled effective-radius bearing approximation for a simple pin connection:

- Radial load: `N = hypot(Rx, Ry)` for that bearing pair.
- Relative angular velocity: `omega = omegaBodyA - omegaBodyB`.
- Sliding friction torque: `Tf = -muK * N * effectiveRadius * sign(omega)`.
- Static limit: `abs(Tf) <= muS * N * effectiveRadius`.

Apply opposite torques to the connected bodies. The radius is a physical parameter, independent
of the SVG joint marker's radius. Ground has zero angular velocity. A welded connection has no
relative rotation and must not acquire a rotating-bearing friction torque.

A multi-link pin needs explicit bearing pairs and their loads. A single resultant at the joint
does not identify every rubbing interface. Either represent the pairs or explain that friction
is unavailable for that topology; do not assign the same torque to every incident body.

These are Coulomb approximations. Lubrication, viscous drag, Stribeck behavior, wear, temperature
and rolling-bearing losses are separate extensions; no material coefficients should be guessed
from the drawing.

Sources: MathWorks describes the [static/kinetic contact law](https://www.mathworks.com/help/sdl/ug/clutches-clutch-like-elements-and-coulomb-friction.html),
[loaded sliding contact](https://www.mathworks.com/help/sdl/ref/loadedcontacttranslationalfriction.html),
and [loaded rotational contact with an effective radius](https://www.mathworks.com/help/sdl/ref/loadedcontactrotationalfriction.html).
The particular bearing approximation and supported topologies above are proposed PMKS choices.

## Scope decision

PMKS currently prescribes the input motion, precomputes its positions, and then solves for the
input effort and reactions. Its existing Static and Dynamic force modes select whether inertia
is included. They do **not** select static versus kinetic friction: a quasistatic analysis of a
moving slider still uses kinetic friction.

Two distinct capabilities are possible:

1. **Required input effort and breakaway limits.** Retain prescribed motion. Include friction in
   the equilibrium equations, report the extra required torque/force and dissipation, and expose
   static holding limits or direction-specific impending-motion calculations. Friction changes
   the required effort; animation continues at its prescribed speed. A local static limit is not
   by itself the actuator torque needed to start the whole mechanism.
2. **Sticking, starting and stalling under an applied input.** Add forward dynamics with an
   applied force/torque input, evolving speed, and contact state transitions. The motion must be
   solved together with friction and inertia; editing a force-balance result cannot provide this
   behavior. This also changes input controls, sampling, animation, kinematic graphs and export.

**Maintainer decision, September 12, 2026:** implement the first option. Keep the second option
in these notes to revisit later. The implemented first step reports local static contact limits;
it does not yet solve the complete mechanism's startup effort envelope. Do not label it a stall
simulation.

At zero relative velocity, never automatically set friction to its maximum static value or
switch it off. Equilibrium may admit a range of forces. At a reversal, the moving solution can
have different one-sided limits. State the ambiguity or solve a specified impending direction;
do not invent a unique force by borrowing a sign from an unrelated previous frame.

## Implementation for prescribed motion

Select a supported pin or a slider's visible pin in Edit and open **Friction**. Set the static
and kinetic coefficients, and the **Effective Radius** for a pin bearing. **Apply Friction**
saves one undoable edit. Setting both coefficients to zero restores a frictionless contact.
The same section in Force Analysis reports normal load, signed friction effort, and the local
static limit at the current sample. Export Data offers these three quantities alongside the
existing reactions and input effort, which include the effect of friction.
It also reports **additional input effort from all friction**, computed as the total input effort
minus the frictionless solve at the identical pose, acceleration and external loading. This is a
signed force or torque in the input's convention, not a per-contact allocation. Export offers it
on the driven joint (or the visible pin of a driven guide).

`joint-friction.ts` owns parameters and validation. `friction-contacts.ts` resolves the contacts
behind a selectable pin and the refusal for a moment-carrying guide. `friction-analysis.ts`
iterates equilibrium and Coulomb loads with relaxation and an explicit convergence check.
`friction-motion.ts` supplies missing rates from the existing sampled-rate fallback. The URL
appends optional friction fields after the drive-speed field; decimal text uses `~` in place
of the section delimiter `.` so small radii and coefficients do not round to zero.

Supported contacts are simple grounded/floating guides with a free-turning block, and simple
pin bearings between two rigid root links or a rigid link and the frame. Moment-carrying guides,
multi-link bearings, pin friction against a free-turning block, and ambiguous shared support
loads require additional contact models. Existing settings remain accessible for removal when
a topology edit makes their contact unsupported. Zero relative velocity produces an explicit
diagnostic and a gap in force results, rather than a guessed static holding force.

The integration requirements were:

1. Add a dedicated friction model and validation, with per-contact static and kinetic coefficients
   and a physical effective radius for supported pin bearings. Reject nonfinite or negative
   values. Explain any chosen restriction such as `muS >= muK` rather than silently clamping.
2. Extend the URL codec additively. Omit default fields, decode old URLs as frictionless, and
   preserve settings through undo/redo, reload, joint cloning, unit changes and topology edits.
   `Mechanism.cloneJointAt` explicitly copies analysis properties and needs the new fields.
3. Add controls to the existing joint properties panel using the shared form blocks and edit
   permission service. A slider's marker may be a revolute joint attached to a `SliderBlock`;
   resolve its prismatic contact so its guide friction and pin friction have distinct settings.
4. Supply relative velocities for both force modes. The existing static force solve does not
   request kinematics, and acceleration-only `FrameKinematics` cannot determine friction signs.
   Any sampled fallback must respect moving carriers, nonuniform times and reversals.
5. Couple friction to the reaction solve in `ForceSolver.analyzeFrame`. Iterating once from a
   frictionless normal load is insufficient. Check convergence, equilibrium residuals and
   dissipative sign, and diagnose nonconvergence or an unsupported contact explicitly.
   Treat ambiguous shared-support load splits carefully: friction depends on those loads.
6. Include friction in body resultants, input effort, graphs and export. Expose contact load,
   friction force/torque, static limit and contact-state assumptions through an analysis service.
   Diagnostics must reach the existing readiness and result views. Do not depend on the separate
   analysis-table branch to make these results inspectable.

## Verification gates

- Zero coefficients reproduce the existing MATLAB and force fixture baselines.
- A driven slider under a known transverse load has `abs(Ff) = muK * N`, reverses sign with
  relative motion, and dissipates power: `Ff * v <= 0`.
- An inclined guide under gravity separates normal and tangential weight components correctly.
- A loaded slider-crank satisfies every body's force and moment balance with friction included;
  a second calculation that holds the frictionless normal load fixed must not be the oracle.
- A floating guide has equal and opposite contact forces, with sign set by relative motion.
- A supported pin bearing has the expected torque for known radial load and radius; opposite
  torques balance and `Tf * omega <= 0`.
- Static friction below the limit balances the required load without being forced to saturation.
  At the limit, direction-specific breakaway is distinguished from ongoing sliding. A reversal
  or ambiguous resting pose is reported according to the selected scope.
- Unsupported multi-link bearings and moment-carrying guide contact models are identified.
- Units, multiple independent mechanisms, parameter validation, save/load and undo/redo work.
- Publish any new mechanism in `FIXTURE_GALLERY` and regenerate `docs/fixture-urls.md`.
- Run relevant solver and codec unit suites, `npm run check`, production build, and targeted
  browser checks. Inspect screenshots of controls and a filmstrip for changing results.

If forward dynamics is selected, add event and energy checks for sticking, breakaway, stopping,
and restart, including timestep refinement. Numerical smoothing near zero is not proof of a
static sticking constraint.

## Deferred work

The maintainer is interested in returning to force-driven sticking, starting, slowing and
stalling later. That option needs an applied input force/torque instead of prescribed speed,
forward integration of the mechanism's motion, static-contact feasibility or complementarity,
and event handling at breakaway and stopping. Animation and all kinematic results must follow
that solved motion. Validate energy balance and timestep refinement before presenting it as
a physical simulation.

Related future work: direction-specific whole-mechanism breakaway effort, static holding
feasibility at rest, multi-link bearing pairs, and moment-carrying guides with bearing spacing
and separated contact loads. These are recorded here rather than represented by unverified
values in the current results.

## Validation on September 12, 2026

The final focused solver, parameter, URL, fixture-gallery and template-payload suites passed
106 tests. `e2e/friction.mjs` passed all 13 checks, including editing, invalid input, undo/redo,
reload, displayed torque units, export columns and live sample updates. Its screenshots and
animation filmstrip were inspected. `npm run check`, the production build, the Storybook build
and `git diff --check` passed.

The full unit run passed 2,512 tests and failed four. Three failures reproduce on unchanged
staging: two MotionGen gripper reference assertions and the Windows path handling in the
stylesheet color fence. The fourth was the template-payload check's literal-LF assumption;
it passes after normalizing this worktree's line endings. See
[tips-and-tricks.md](tips-and-tricks.md#friction-reads-motion-even-in-static-force-analysis).

## Rigorous follow-up audit

The baseline was commit `75ef54ee`, reviewed in full against `origin/staging` `acba1b77`.
There were no subsequent friction commits or uncommitted changes before the audit. A fresh fetch
confirmed that origin/staging remained current; local staging was older, so no backward rebase
was performed. Other worktrees were left alone.

### Corrections and numerical conventions

- Fixed single-link Duplicate dropping friction properties. Both single-link and batch copies
  now retain independent property objects. URL history, refreshed browser state, tiny radii,
  old records, malformed records with valid checksums, and the actual cm/inch conversion path
  have coverage. SVG/DXF are drawings, not mechanism-state import formats; friction persists
  through PMKS's URL/file/history codec, and numeric friction results through data export.
- Fixed the stationary threshold ignoring the internal drawing scale. Linear motion is
  approximately stationary when `abs(v_relative) <= 1e-9 m/s + roundoff`, with the floor converted
  into the supplied coordinate system. `FrictionMotion.coordinateScale` is 200 for application
  samples and defaults to 1 for direct unscaled domain calls. Angular motion uses `1e-9 rad/s`.
  Roundoff is `32 * Number.EPSILON * max(abs(incoming rates))` in the same rate units, accounting
  for cancellation when a carrier moves. These are deterministic deadbands, with no memory,
  smoothing, force blending or guessed static holding force. They are distinct from the force
  matrix's dimensionless singular-pivot tolerance. Sampled-rate truncation error may exceed
  roundoff near a reversal; exact one-sided breakaway calculations remain future work.
- The guide tangent is `(cos(slotAngle), sin(slotAngle))`; its positive normal is `(-ty, tx)`.
  Normal load is the absolute normal projection, never the total guide resultant. Pin load is
  the radial resultant for one supported pair. Output signs identify the receiving body.
- Force and moment equilibrium are re-solved with equal/opposite contact loads, with relaxation
  0.5 and a 100-iteration ceiling. Convergence requires a friction-effort change below
  `1e-10 * max(1, abs(old), abs(new))` for every contact. This finds a consistent equilibrium,
  not a proof of global uniqueness for arbitrary high-friction geometry. It may reject a
  physically solvable but poorly conditioned case. Failure returns a diagnostic and gaps,
  never the initial frictionless values as a successful friction result.
- Added the additional actuator-effort result to the domain frame, display adapter and export.
  Static capacity remains `muS*N` or `muS*N*r`, using the converged moving load. It is not the
  actuator breakaway torque. At rest the current inverse problem leaves friction/actuation
  underdetermined: below/at/above static-demand comparisons are **not** reported as solved.
- Native fields and Apply are disabled during playback, with the model's reason. Read-only
  results do not query edit permissions. Changing selection clears obsolete validation errors.
  The reusable section exposes its expanded state; nine gallery stories cover its states.

### Inherited In-motion limitation, reproduced on staging

A 1 kg bar drawn 4 cm long has its CoM at 2 cm. At 1 rad/s with no external forces, its required
centripetal reaction is `1 * 0.02 * 1^2 = 0.02 N`. The app's internal coordinates and linear
accelerations are 200 times the physical values. Staging's force assembly multiplies that
internal acceleration by cm-to-m without removing the drawing scale and returns **4 N**.
Angular-inertia moments and applied-force lever arms also use different scale conventions.

The no-friction probe was run against unchanged staging source and reproduced exactly.
`friction-inertia.spec.ts` retains the reproduction and verifies the refusal for affected
friction cases. An unscaled physical case verifies the expected 0.02 N bearing load and
0.00002 N*m resisting torque. Fixing the general inertia normalization must be a deliberate
force-analysis change: this branch preserves the explicitly required friction-disabled staging
behavior. Until that correction is verified, application In-motion friction with nonzero mass
or inertia is refused, including static-capacity readouts derived from those loads. Static mode
omits inertia and remains available. This is a material V1 limitation, not forward dynamics.

Internal torque outputs retain the existing force solver's drawing-length factor so existing
graphs remain compatible. `AnalysisSampleService` removes that factor and applies the shared
force/length conversions for display/export. Raw `valueSI` on an app frame is therefore not a
standalone physical torque API; a future stress/energy consumer must use the same boundary.

### Independent verification repository

Downloaded copies were found under `C:/Users/adg66/Downloads/PMKS_Verification-master/`.
They were preserved. The audit created a clean checkout of PMKS-Web/PMKS_Verification at
`artifacts/PMKS_Verification` in this worktree, on its own `feature/friction` branch, based on
`5882a1a`. Its local commit `0f2d7745efef285e35574878592ec09141fc1f5b` adds the independent reference.

The repository's reviewed v1 contract explicitly excludes friction. Its legacy teaching friction
script also uses frictionless pin loads and CoM-to-pin distances as radii, so agreement with
those old outputs would not establish this model's correctness. New cases live separately in
`verification/friction/`, labeled experimental. No reviewed v1 data was changed.

The Python generator derives closed-form guide equilibrium with signed-normal branch checks.
The MATLAB function independently solves the two-unknown equilibrium matrix for each branch;
neither imports PMKSWeb's implementation or uses its iterative algorithm. There are 560 rows:
70 crank angles, both motion directions, both transverse-load directions, with and without
ground-bearing friction. Power and rod moment balance are checked; deliberate corruption of
friction, normal load, bearing torque, and row count must be rejected.

PMKSWeb vendors the CSV in `src/test-data/friction/`, with source commit and normalized-LF SHA256
in `provenance.json`. The actual PMKS force solver is compared against all 560 rows in both
meters and centimeters (1,120 pose comparisons), including actuator effort and dissipation.
The independent generator and comparison can be rerun with:

```text
python verification/friction/reference.py --check verification/friction/reference.csv
```

No MATLAB or Octave executable was located. The new manually dispatched `friction-reference.yml`
workflow is ready to run MATLAB R2024a and compare its output, but it has **not** been executed:
the user explicitly prohibited pushing. Python checks are not labeled MATLAB verification.
Existing verification-repository schema checks (six cases), dynamics checks (two cases), and
14 contract unit tests pass locally.

### Examples and remaining extensions

The fixture gallery now contains a simple driven slider (100 N normal, 20 N kinetic resistance,
30 N static capacity), a loaded slider-crank, a loaded pin bearing, and combined pin/guide
friction. The simple block has no rigid-link manufacturing outline; its DXF reference entities
still round-trip. The gallery test now applies its rigid-body assertion only to rigid links.

Bearing friction is an effective-radius Coulomb approximation. It is not a rolling-bearing
catalog model. Future work includes the inertia correction above, stationary feasibility and
direction-specific startup envelopes, explicit multi-link bearing pairs, separated guide
contact loads, viscous friction, rolling resistance, lubrication/Stribeck curves, seals,
backlash/contact effects and user-defined laws. Arbitrary surface contact, stress/FEA, thermal
effects, wear and forward stick-slip integration are outside this branch.

### Final follow-up validation

- Focused friction domain, reference, component and persistence tests: **64/64**, eight files.
- Full application suite: **2,566 passed, three failed**, 2,569 tests in 245 files. The only
  failures are the two MotionGen gripper assertions and the Windows stylesheet path fence.
  A fresh unchanged-staging run of those two files reproduced all three (four tests passed).
  The separate unchanged-staging inertia reproduction also passed its one diagnostic test.
- `npm run check`: passed, zero errors and the existing 15 permitted lint warnings.
- Production build and static Storybook build: passed.
- Storybook/application TypeScript source check: passed using
  `tsc -p .storybook/tsconfig.json --noEmit --rootDir . --skipLibCheck --types node,vitest/globals`.
  The command supplies the repository root and globals needed by the configuration's broad
  source include. Dependency declaration checking is skipped because installed Storybook
  declarations reference the absent React renderer; this is not a dependency-type audit.
- `e2e/friction.mjs`: **15/15**; `e2e/friction-stories.mjs`: **9/9**;
  `e2e/ui-copy.mjs`: **17/17**. No uncaught browser errors. Gallery screenshots and the final
  14-frame interaction/animation filmstrip were inspected. On Windows the automatic contact
  sheet helper could not find its Unix Python candidates; the captured frames were tiled with
  the installed Pillow runtime and inspected separately.
- Independent Python reference: **560 rows and four corruption checks** passed. Existing
  PMKS_Verification contracts remain green: six schema cases, two dynamics cases, 14 unit tests.
  MATLAB execution is pending, as described above.
- `git diff --check`: passed. Builds, logs, screenshots, and the independent repository checkout
  are in this worktree's ignored `artifacts/`; only source, tests, provenance and notes are
  included in the application commit. No push or merge was performed.

### Friction presentation pass validation

This UI follow-up preserves `75ef54ee` and `6110b2c7` on `feature/friction`. A fresh fetch
confirmed the branch base remains `origin/staging` at `acba1b770a20551b37a9b2f24b459c224c8ed0fc`.
The changes above expose the reviewed results; they do not change the Coulomb equations or
remove the inertia/stationary refusal guards.

- Focused friction, vector geometry, analysis adapters and components: **131/131**, 13 files.
- Full suite: **2,588 passed, three failed**, 2,591 tests in 247 files. The same two MotionGen
  gripper assertions and Windows stylesheet path fence were reproduced on unchanged staging
  during this pass: four passed, three failed. Both baseline spec files matched their staging
  Git blob hashes. No newly failing test remains.
- Fixture gallery: **4/4**, including regeneration of the example URL table.
- Browser checks: `friction-visualization.mjs` **25/25**, `friction.mjs` **15/15**,
  `friction-stories.mjs` **13/13**, and `ui-copy.mjs` **17/17**. No uncaught browser errors.
  The visualization suite captures 34 frames across saving, motion, both contact reversals
  and the In-motion refusal. Static screenshots cover slider, bearing, combined contacts and
  the diagnostic; the Storybook suite captures all 13 states.
- `npm run check`: passed, zero errors and the existing 15 permitted warnings.
- Production and static Storybook builds: passed. Source type checking passed with the same
  command and dependency-declaration limitation recorded in the prior audit above.
- `git diff --check`: passed. Screenshots and logs remain in ignored `artifacts/`.
- The independent PMKS_Verification reference and its local commit are unchanged in this UI
  pass. The application full suite still includes the 1,120 reference pose comparisons.
  MATLAB execution remains pending; no new MATLAB verification is claimed.

Nothing was pushed or merged. A future force-analysis pass should address the documented
inertia scaling and reciprocating playback convention before broadening the supported scope.

### V1 polish validation

The finishing pass preserves all three earlier friction commits (`75ef54ee`, `6110b2c7`,
`c0eb0fa4`) on the same staging base, `acba1b77`. No friction equation, inertia normalization,
serialization format or physical stationary-contact behavior changed.

- Focused friction domain, result adapters, components, vector geometry and existing
  reversal/time-based playback tests: **174/174**, 15 files.
- Full application suite: **2,594 passed, three failed**, 2,597 tests in 247 files.
  The two MotionGen gripper assertions and Windows stylesheet path fence were rerun on the
  unchanged staging snapshot: **four passed, three failed**. Both baseline spec files have
  identical Git blob hashes to `origin/staging`. There are no new failing application tests.
- Fixture gallery: **4/4**, including the new reciprocating slider-crank URL.
- `e2e/friction-visualization.mjs`: **37/37**, no uncaught browser errors. Its **66-frame**
  capture covers saving, motion, forward/backward mouse scrubbing, prescribed guide/bearing
  reverse, reciprocating rewind, scrubbing while rewinding, a full forward reciprocating
  cycle including both motion directions and its seam, and the In-motion refusal.
- `e2e/friction-stories.mjs`: **15/15**, including compact default analysis, visible Static
  helper, expanded calculation and playback rewind at 250px panel width. Existing off,
  enabled, collapsed, stationary, inertia refusal, saved, invalid and disabled states remain.
- `e2e/friction.mjs`: **15/15**. Its static-limit assertion now opens the disclosure where
  that explanation lives. `e2e/ui-copy.mjs`: **17/17**, zero console errors.
- `npm run check`: passed, zero errors and the existing 15 permitted warnings.
- Production and Storybook builds: passed. Source type checking passed with the same
  `--skipLibCheck` dependency-declaration limitation documented in the earlier audit.
- Screenshots and filmstrip sheets were visually inspected for the compact and expanded
  panel, slider force, bearing torque in both directions and two zoom levels, combined
  contacts, reciprocating motion/rewind, stationary and In-motion refusal states. Labels
  keep the existing text halo and zoom-stable offset. Dense-label layout remains deferred.
- `git diff --check`: passed. Artifacts remain ignored; no push or merge was performed.

The independent PMKS_Verification checkout and reference data are unchanged by this polish.
Its 1,120 application reference-pose comparisons remain in the full suite; MATLAB execution
is still pending. The next separate physics task should be the inherited In-motion inertia
scaling correction, retaining its factor-of-200 reproduction and friction refusal until the
general force path is independently verified.

### Final UI-density validation

This pass follows `949d6fcb` on `feature/friction`, preserving the staging base `acba1b77`
and all earlier friction commits. It changes presentation and shared UI accessibility only;
no domain/solver, result adapter, persistence, export or canvas-geometry file changed.

- Focused friction model, component and result-adapter tests: **127/127**, 12 files.
- Full suite: **2,595 passed, three failed**, 2,598 tests in 247 files. Both MotionGen gripper
  failures and the Windows stylesheet fence were reproduced on unchanged staging again:
  **four passed, three failed**. Both baseline spec files match their staging Git blob hashes.
- Friction visualization browser checks: **41/41**. Existing friction browser checks:
  **15/15**. No uncaught browser errors. Disclosures preserve current calculated values;
  the existing motion, reverse, rewind and canvas checks remain unchanged in meaning.
- Storybook: **17/17** friction states at 250px, with **zero axe violations across all 17**.
  Meaningful additions are expanded input effort and an unsupported guide. The shared
  subsection also has a Compact story. Keyboard checks verify Enter/Space, `aria-expanded`,
  visible focus, refusal of focus inside closed content, and warning state in a collapsed header.
- UI copy: **17/17**, zero console errors. Its shape-button check now opens Visual Settings
  before reading a control that the shared collapse correctly hides.
- Production build, Storybook build, source type checking and `npm run check`: passed.
  Lint retains 15 existing warnings and zero errors. Source type checking uses the same
  dependency-declaration `--skipLibCheck` limitation documented in the earlier audit.
- Visual inspection: before/after compact panel comparison, expanded calculation and input
  comparison, stationary/inertia/rewind/unsupported states, and disclosure motion. The browser
  suite captures **84 frames**, including 18 added disclosure frames. The screenshots and
  comparison sheet are in ignored `artifacts/friction-density/` and `artifacts/friction-stories/`.
- `git diff --check`: passed. No push or merge. The independent verification checkout and data
  remain unchanged, and MATLAB execution remains pending as previously documented.

The panel is sufficiently compact for V1 review. General inertia correction, static holding
feasibility and physical reciprocating reverse remain separate physics tasks; general label
layout remains separate UI infrastructure.

### Final micro-polish and V1 readiness review

This review follows `46059f6a`, preserving it and every prior friction commit. The sole product
change removes the body `Friction: Enabled/Off` line when the panel contains one contact.
Multi-contact panels retain it because their individual configuration can differ from the
aggregate header. The existing **Contact State** wording stays; no new badge, spacing value,
shared component, story variant, solver, adapter, persistence, export or drawing change is needed.
At the actual 250px width, removing one line improves the contact hierarchy while preserving
the numeric rows and existing separators. The two educational disclosures remain closed by
default. Warnings remain visible, including their existing collapsed-header status.

#### Implementation walkthrough

1. `joint-friction.ts` defines and validates the saved coefficients and bearing radius.
   `FrictionService.set` commits settings through the existing undoable mechanism update;
   the URL transcoder and mechanism builder preserve them across save/load and undo/redo.
2. `force-solver.ts` invokes `analyzeWithFriction` only for enabled friction. That function in
   `model/mechanism/friction-analysis.ts` iterates equilibrium and Coulomb contact loads together,
   applies equal/opposite actions, and returns converged contact loads and input effort.
3. `AnalysisSampleService` converts the selected sample's solved values into display units.
   `FrictionService.reading` supplies the state, diagnostic, contact readings, receiving-body
   convention and separate actuator comparison. It also withholds results during playback rewind.
4. `FrictionPanelComponent` presents those readings using shared controls and disclosures.
   `FrictionOverlayService` and the dedicated SVG component draw the same sample's dashed
   analysis loads. The panel and drawing do not calculate a second friction solution.

#### Readiness answers

| Review question | Finding |
| --- | --- |
| 1. Physics internally consistent? | Yes within prescribed-motion V1: coupled guide/bearing loads, opposition to relative motion, equal/opposite actions, unit conversion and convergence refusal are covered. This does not certify unsupported forward dynamics. |
| 2. Zero friction backward compatible? | Yes. Zero coefficients retain the frictionless force path; old joint records decode to zero coefficients. Existing reference and compatibility tests pass. |
| 3. Settings persisted correctly? | Yes. Guide and bearing coefficients/radius round-trip; old records, invalid fields, undo/redo and reload are covered. |
| 4. Contact and actuator consequences distinct? | Yes. Three local rows sit under the contact; a separate input section gives the added effort from all contacts. |
| 5. Stationary contacts honest? | Yes. Indeterminate at Rest withholds a unique force and unsolved capacity; no startup or holding solve is claimed. |
| 6. Unsupported cases refused? | Yes. Unsupported bearings, guides requiring contact spacing, ambiguous support loads, missing motion and nonconvergence retain refusals. |
| 7. Inherited inertia issue blocked? | Yes. Scaled application In-motion solves with nonzero mass/inertia remain guarded, with a visible Static-analysis alternative. |
| 8. Rewind and physical reverse distinct? | Yes. Rotating-drive reverse recalculates; reciprocating rewind is labeled navigation and suppresses directional friction readouts/glyphs, even while paused or scrubbed. |
| 9. Panel compact enough? | Yes for V1. Slider and bearing fit the checked 250px width without overflow; no new spacing or visual system is introduced. |
| 10. Explanations available? | Yes. Calculation and Input Effort Details retain their content, closed by default; critical diagnostics remain visible. |
| 11. Tests sufficient for a V1 PR? | Yes for review within the stated scope: analytic and independent references, persistence, units, contact boundaries, adapters, component states, browser motion and accessibility are covered. MATLAB execution is still pending. |
| 12. Any review blocker? | No newly identified friction blocker. Ready for PR with documented limitation. The three reproduced staging test failures are separate CI issues to resolve before merge; this is not a green-merge claim. |

#### Validation of the micro-polish

- Focused friction, component and result-adapter tests: **128/128**, 12 files.
- Full suite: **2,596 passed, three failed**, 2,599 tests in 247 files. The same two MotionGen
  gripper assertions and Windows stylesheet fence were reproduced on the unchanged staging
  snapshot: **four passed, three failed**. Both baseline spec files match their `origin/staging`
  Git blob hashes. No newly failing test remains.
- Browser suites: `friction-stories.mjs` **17/17**, `friction-visualization.mjs` **41/41**,
  `friction.mjs` **15/15**, and `ui-copy.mjs` **17/17**; zero uncaught browser errors.
- **Zero axe violations across all 17 Storybook states.** Keyboard checks retain Enter/Space,
  `aria-expanded`, visible focus, closed-content focus exclusion and collapsed warning status.
  Added assertions check the single-contact cleanup and retained accessible state; the component
  test covers independently Enabled/Off contacts under one aggregate Enabled header.
- `npm run check` passes with zero errors and the existing 15 warnings. Production and Storybook
  builds pass. `git diff --check` passes.
- Inspected the 250px before/after comparison, bearing, expanded disclosures, collapsed header,
  stationary/inertia/rewind/unsupported states, and motion/disclosure filmstrips. The visualization
  suite retains its **84-frame** capture. Artifacts are ignored under `artifacts/friction-micro/`.
  A separate Chrome demonstration opens actual slider and bearing results plus local Storybook.
- **No physics changed.** The independent PMKS_Verification checkout remains clean at `0f2d774`;
  its 1,120 application reference-pose comparisons remain covered. No new MATLAB run is claimed.

No push or merge. The next independent task should correct the inherited In-motion force/inertia
scaling, using its existing reproduction and independent force references before removing the
friction guard. That task is not started here.
