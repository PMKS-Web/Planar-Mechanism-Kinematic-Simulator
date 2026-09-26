# Understanding and generating mechanisms with an LLM

> **Status:** Reference — planning only, September 22, 2026. No application feature is implemented.

**Recommendation: let the model interpret the request, choose a construction, and explain it;
let PMKS construct, measure, and accept the mechanism.** The slider refactor is a useful foundation,
but changing the JSON alone will not deliver either requested feature. Both need explicit output
identity, measured motion, and a distinction between mechanical structure and visual context.

This review uses `claude/explain-why-brief` at `72fe0fcdf70b171942433d5bfb7c2ddd26f70d80`
and the local `feature/editor-bug-fixes-2` at `ac24921a934c1f6fced5b2a3dc95f682638beead`.
The latter is this checkout's starting revision. Its remote-tracking ref is older and was not
used as the new baseline. I also read the prior design review and temporary verifiers preserved
in stash commit `dd8ba8ad`; I did not restore or alter the stash.

The [evidence record](llm-features-evidence/README.md) gives reproduction commands, source paths,
counts, and the limits of the new offline replay. There were no new provider calls.

## What the experiments establish

The archive contains 78 diagnosis calls, six fact-ledger explanation calls, 90 v1/v2 description
responses, 36 v3 description responses, 54 Gemini description records, 96 generation records
across G1–G5, and 33 correction records. The v4 extractor and OpenRouter harness are additional
work, not evidence of a completed v4 accuracy benchmark or a cross-provider generation victory.

| Evidence | Result | What it supports |
| --- | --- | --- |
| Description v1 → v2, the six B/C responses per example | Whitworth-family recognition 0/6 → 5/6; mentioning the Chebyshev straight-line property 0/6 → 6/6 | Supply carrier/guide relationships, frame geometry, and measured output paths. These are recognition counts, not fully correct-answer counts. |
| G1 → G2, saved Flash-Lite results | Mechanically accepted candidates 6/24 → 15/24; requests with any accepted candidate 4/8 → 7/8 | A complete contract and relevant examples help. Schema completeness, mechanical instructions, and examples changed together; this is not a pure prompt-length or model-size experiment. |
| G3–G5 raw candidates | All 129 parsed candidates have a trace. All 39 G5 candidates have a named link. | Output cues and names are easy to elicit explicitly. Their presence does not prove the right output was chosen. |
| Corrections | Haiku's “larger swing” changed 59.8° to 58.4° while claiming an increase | Re-solve and measure the requested quantity after every proposed change. |
| Accepted repair prose | 3/34 explanations contradicted the evidence; another 6/34 made unsupported causal/necessity claims | A valid mechanism does not certify its explanation. |
| Gemini description calls, historical | Flash-Lite answered 18/18, median 4.1 s, worst 133 s; both larger Flash variants answered 15/18 | Measure delivery and tail latency separately from answer quality. These old model/quota observations are not current deployment recommendations. |

The picture experiments matter for “What is this.” The initial run leaked application names
through filenames without successfully reading the images. After neutral filenames and actual
image access, pictures substantially improved application recognition; all three Gemini variants
named the four real-life applications with their backdrops. But application naming still coexisted
with invented behavior. For example, the Flash-Lite steering response identifies vehicle steering
and then says the wheels angle in opposite directions. A backdrop is evidence of context, not
evidence for an unmeasured steering relationship.

The v2 descriptions similarly contain confident motion errors even when they recognize a
mechanism family: one Whitworth answer describes a rocking output where the supplied example
rotates, and one calls it two-input. Evaluate family recognition and behavioral truth separately.

### What went wrong

1. **The format exposed implementation details and omitted intent.** A slider required a pin,
   another prismatic ID, and a block connecting them. A moving slot needed a carrier and endpoint
   references. Cylinders needed consistent hidden geometry and scale. Meanwhile, no required field
   said which point/body was the requested output or what would make it successful.
2. **The model was asked to do topology, assembly geometry, kinematic design, presentation, and
   explanation in one text response.** Three ostensibly different candidates multiplied the work.
   There was no construction library or measured feedback loop between proposal and delivery.
3. **The later prompts contained misleading rules.** G3–G5 say adding one body and one joint
   preserves mobility, although their own formula gives a change of +1. G2 requires two ground
   pins while also allowing a slider-crank with one pin and a fixed guide. “Only grounded joints
   can be driven” omits supported relative and linear drives. Requiring extra complexity or a
   slider/weld for variety can make a correct simple answer worse. Do not carry these rules forward.
4. **The acceptance criterion was too weak.** DOF 1, a valid solve, and ≥50 samples do not establish
   the requested motion. All three G2 Haiku figure-eight candidates passed; each contains only
   four-bar pivots, with no supplied output point that could trace a figure eight. A selected G5
   lift explicitly describes an arc despite the request for straight vertical motion.
5. **The measurement layer could mislead the model.** Reversal differences inflated speed and
   dwell; tiny paths produced spurious straightness and quick-return claims. v4 suppresses five
   of 24 straightness claims and one of ten stroke ratios, but has no saved follow-up accuracy
   grid. Use actual time, meaningful travel, and task-specific outputs rather than the straightest
   half-path of any joint in the drawing.
6. **The reports mix experimental conditions.** Three G3 Opus selection rows say no candidates
   were tried although their current raw records contain three each. CLI deadlines changed from
   420 to 1,500 seconds; generation CLI calls lacked the isolation of the diagnosis experiment.
   The first verifier dropped welds and loads; later scripts stopped at the first solving candidate.
   Parse failures, rate/session failures, timeouts, and wrong mechanics need separate labels.

## What the refactor fixes, and what it does not

The current model represents a slider with one `PrisJoint`. `rotates: true` means Pin-in-slot;
`rotates: false` means Prismatic, holding its riders' orientation to the guide. A cylinder is
resolved from its seal and ordered slot; the interior is derived from mounts and member lengths.
Barrel and rod may have different lengths. These changes remove model-authored redundant objects
and geometric role guessing. They do not supply a public authoring contract or validate design intent.

The current fixture API still accepts `welds` to set slider rotation, identifies links by concatenated
joint letters, and mixes test-coordinate conventions with an internal `MODEL_SCALE` of 200.
It is a valuable test format, but should not become the production LLM API by default.

I replayed **all 267 saved generation candidates** on the current revision, preserving welds and
loads and allowing the new fixture adapter to ignore the obsolete `prisId`. There were seven
additional saved request records without candidates. This is migration/replay, not fresh inference.

| New local observation | Meaning |
| --- | --- |
| 165/267 pass the historical-style direct-fixture gate; 148/267 pass the stricter decoded gate | 17 of the 165 apparent successes, or 10.3%, are rejected once delivered geometry and usable inputs are considered. The gates differ as well as the reconstruction path, so this is not a pure serialization-loss rate. |
| All 45 library entries solve after decoding; 43/45 also pass the stricter input/loose-geometry gate | The library is a strong starting pool, with qualifications. The two inversion collections expose three-incident-body actuator refusals despite valid numerical solves. Curate accepted recipes rather than assume every library entry is ready for generation. |
| Cylinder boom in fixture coordinates: `cylinder-has-no-travel`; at model scale: 361 samples; encoded/decoded: valid, 359 samples | A driven cylinder is expressible through the current helper/codec route. The scale-boundary trap still exists if the generator's verifier calls the fixture builder in the wrong units. |

The stricter replay checks every partition, finite positions, one usable input, and absence of loose
joints/floating chains. It does **not** certify full constraint residuals, task fit, appearance, or
the live UI. Those remain requirements of the product verifier below. No new generation-success
percentage is claimed for the proposed format.

## A common semantic model, with different read and write contracts

Do not force the analysis facts and the construction request into the same JSON shape. Share stable
identities and concepts; expose two versioned contracts:

- **Observation:** actual bodies/joints/guides/cylinders, actuator pairs, selected outputs, measured
  motion, readiness, units, and optional scene context, tied to a drawing revision and solver version.
- **Construction:** intended behavior, a recipe or explicit assembly, parameters/constraints, named
  outputs, and presentation attachments. It contains no model-certified success flag or measured facts.

Use descriptive references such as `platform` and `guide`; allocate PMKS joint letters and compound
IDs in the compiler. Keep an explicit mapping so a sentence about the platform highlights the same
body after construction, decoding, edits, and undo. World coordinates and angles have one declared
convention and units. The adapter alone converts to internal model units and per-drive speed units.

For custom assemblies, the schema should cover these concepts directly:

| Concept | What the model supplies | What PMKS owns |
| --- | --- | --- |
| Rigid body and revolute/welded connection | Stable body/point references and intended attachment | Joint letters, adjacency, compound construction |
| Pin-in-slot or Prismatic | One sliding point, rider identity, fixed or body-carried guide, explicit type | `PrisJoint`, `rotates`, carrier binding, valid guide geometry |
| Cylinder | Mount references; consistent span/start or member-length parameters; drive if requested | Seal/interior allocation, ordered slot, geometry via current cylinder helpers, stroke checks |
| Drive | Connection, driven/reference body, signed speed with units, requested operating range | `describeActuator`, input ordering and supported-pair checks |
| Output point/body | Role, owning body, body-local point if needed, trace/highlight preference | Tracer attachment, body pose, measurements, visible reference |

Do not expose arbitrary body-pair constraints the current editor cannot express. In particular,
Prismatic holds **all riders at that joint** to its guide. A guided platform must have a separate
coupler pin on the platform; sharing the slide point with the coupler can lock the coupler too.
Use the verified guided-platform construction, or refuse an unsupported attachment. A nicer schema
cannot manufacture missing solver capabilities.

For example, the old fixed-guide instruction was `{"at":"C","prisId":"P","angleRad":0}`,
with a separate weld instruction if the rider should not turn. Its semantic replacement can be
`{"point":"output","type":"pin-in-slot","guide":{"frame":"world","angleDeg":0}}`.
Choose `"prismatic"` when the rider must keep its orientation. For a moving guide, reference the
carrier body and its two guide points explicitly. Neither form asks the model to invent an
invisible P joint or a zero-length block. Cylinders get their own constructor instead of a longer
example explaining how to hand-build those internals. Keep a capability list alongside the schema
so a model cannot promise unsupported contacts, gears, or actuator combinations.

Here is the preferred high-level proposal for a routine request. These keys describe a proposed
API, not something implemented today:

```json
{
  "version": 1,
  "units": { "length": "cm", "angle": "deg" },
  "intent": {
    "output": "platform",
    "motion": "vertical-translation",
    "orientation": "fixed",
    "stroke": 4
  },
  "construction": {
    "recipe": "guided-platform-crank",
    "parameters": { "stroke": 4, "platformWidth": 6 }
  },
  "outputs": [{ "body": "platform", "point": "platform-center", "trace": true }],
  "presentation": [
    { "kind": "box", "attachTo": "platform", "purpose": "carried load", "simulation": "visual-only" }
  ]
}
```

The recipe must define bounds and a deterministic construction/fitting routine. A 4 cm requested
stroke is an acceptance constraint; accepting the JSON does not establish that it is achieved.
Use native schema-constrained output plus runtime reference/value validation. Google's own
[structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output)
explicitly distinguishes valid JSON from semantically correct values.

### Visual context is a separate layer

A blade, bucket, platform, or foot needs a visible identity. Sometimes it is a functional rigid
body; sometimes its silhouette is only explanatory artwork attached to a functional body.
Support both without creating extra unconstrained moving links:

- A platform's **mechanical body** must satisfy position and orientation constraints.
- A box riding it can be **visual-only**, attached in its local frame, with zero influence on DOF,
  mass, inertia, forces, and constraints.
- The surrounding machine housing or ground can be attached to the world.
- A trace is bound to the designated output, not any convenient nearly straight point.

Start with named polylines/polygons, circles, and a small library of outlines. There is no need for
arbitrary model-written executable SVG or an image-generation service. Existing multi-joint body
outlines are useful for a first prototype, but adding outline joints can affect default mass/CoM.
A true visual-only attachment must be stored separately. Do not automatically add a 20 N load
because the model drew a box; force analysis is a distinct requested capability.

Persist names, output references, explanations' design intent, and attachments through save/share,
undo/redo, and export where appropriate. Add a versioned optional codec section with legacy decode
tests; measure link-size growth. Recompute behavioral claims after edits rather than saving a stale
“verified” paragraph. When a body is deleted, remove or explicitly orphan its attachments.

## “What is this”

Capture the selected mechanism or explicitly selected group, including shared frame context, and
derive a compact semantic observation. Use existing partition/actuator/cylinder helpers and solved
samples. Do not presume mechanism zero is the whole drawing.
Capture geometry and measurements against the same authored start pose and settings; an image of
the current paused pose must identify its phase rather than silently becoming the construction pose.

The observation should include input-to-output relationships, full rotation versus rocking,
stroke/sweep, designated point paths, output-body orientation, guide carriers, meaningful timing
asymmetry, and distinctive geometric ratios. Suppress measurements below a scale-aware useful-motion
threshold. Measure timing against `timeNum`, treat reversals and cycle seams explicitly, and check
phase/translation/rotation/units invariance. Numeric mobility alone cannot identify a purpose.

Retrieve possible mechanism families from curated topology and behavior signatures. Template IDs
and author labels are contextual hints; renaming a four-bar “Jansen leg” must not make it one.
Use an app-rendered view with labeled outputs and, when useful, several poses or a filmstrip.
Include a user's backdrop/reference when it is part of the requested context, while keeping
observed motion and visual interpretation distinguishable. A bare generic four-bar does not uniquely
identify a windshield wiper, pump, or hood hinge.

Aim for a short answer covering:

1. The family or resemblance: “This resembles a …,” unless identification is actually supported.
2. The job and plausible uses, tied to this input/output arrangement.
3. One distinguishing feature of this drawing, referring to a visible part and a verified fact.

Allow useful analogies rather than restricting the model to repeating a fact table. Separate
`measured behavior`, `known family properties`, and `possible application` in the response schema.
Facts carry IDs and units; reject unsupported numerical claims and unknown part references.
General application prose still needs a factuality evaluation: citations to fact IDs alone are not
a proof that the sentence follows from them. A matched, reviewed catalog paragraph plus
measurement slots is the reliable default for known families; novel analogies need calibrated
wording. A broken mechanism can receive a structural interpretation but not claims of motion it
has not solved.

For example, given corresponding verified facts: “This resembles a quick-return drive used in a
shaper. The crank runs steadily while the tool carriage takes longer on its working stroke than
on its return. The offset pivot and moving slot create that asymmetry; the highlighted carriage
is the useful output.” Do not produce this answer for the spinning Whitworth example solely
because its catalog name includes “Quick Return.”

## “Make this for me”

Use the following bounded workflow:

1. **Interpret.** Preserve the user's requested output, motion, actuator, dimensions, and hard
   constraints in an intent object. Resolve cheap missing details with stated defaults. Ask one
   focused question only when different interpretations would change the mechanism substantially.
   Do not silently replace a requested cylinder with a crank.
2. **Select and construct.** First retrieve an applicable verified recipe/template; fit its
   meaningful parameters using deterministic geometry or numerical search. Use existing three-pose
   synthesis for a fitting pose problem. Path fitting is additional work on this branch, not an
   assumed existing service. Keep a custom assembly route for requests outside the recipe catalog.
3. **Solve and check intent.** Construct on an isolated copy, verify all affected partitions,
   and measure the named outputs over the requested operating range. Preserve every hard constraint.
   Return structured failures such as `platform.horizontalDrift > tolerance` or `guide reference missing`.
4. **Repair within a budget.** Give the proposal stage those failures, allow at most two corrections
   initially, and recheck from a fresh copy. Optimize dimensions numerically when topology is already
   appropriate. Do not discard the requested output to obtain a passing mechanism.
5. **Present and recheck delivery.** Add the output trace, part names, functional silhouette, and
   optional visual-only context. Encode, decode, rebuild, re-solve, and compare the result with the
   accepted candidate. Derive the short explanation from what was actually built and measured.
6. **Deliver one finished result.** Show its animation and short design explanation in a preview,
   with the intended output obvious. Inserting/replacing uses the editor's pose/permission boundary
   and one undoable transaction. Offer an alternative on request; do not require three topologies
   for every initial prompt. If none passes, explain the unmet constraint rather than deliver a
   broken mechanism labeled complete.

LInK provides a relevant architectural precedent: it combines retrieval with geometry optimization
for planar path synthesis. It does not establish PMKS text-generation performance or solve these
features for us. A small curated catalog is the appropriate first experiment, not training a
ten-million-mechanism retrieval system. [LInK paper](https://arxiv.org/abs/2405.20592).

### Acceptance means the requested output works

Schema/reference checks come first, then construction, actuator/readiness checks, finite full-range
samples, closure or intended finite travel, rigid/guide/weld/cylinder residuals, target preservation,
and decoded-delivery parity. Use shared model tolerances. A sample-count minimum is not a motion
specification. A hood hinge can have valid finite travel; a requested motor crank must rotate fully.

| Requested behavior | Required measurements on the declared output |
| --- | --- |
| Vertical, level platform | Vertical stroke, maximum horizontal drift, body-orientation variation |
| Straight-line point | Direction; absolute useful travel; normalized maximum/RMS perpendicular error; contiguous usable interval |
| Wiper | Input continuity if requested; output sweep and reversals; both blades and their relation if two were requested |
| Figure eight | Closed path, robust nonadjacent crossing, two substantial lobes; distinguish a crossing from a retraced arc |
| Walking leg | Stance travel/flatness, lifted return clearance, direction and stance fraction; this demonstrates a leg path, not robot balance/contact |
| Quick return | Times between output extrema for the designated work/return strokes at the requested drive law |
| Cylinder-driven output | Actual cylinder input, usable travel, mount/guide constraints, requested output range |
| Context artwork | Correct attachment transform, visible intended object, no change in mechanical or mass/force results |

Freeze task tolerances before comparing models. Use user-supplied tolerances when available and
documented defaults otherwise. Do not let the generator choose an easy threshold after seeing
its answer. Approximate and exact straight-line requests are different acceptance cases.

## How to prove the proposed approach is better

There is already evidence for better context, explicit outputs, and stricter verification. There
is **not yet** evidence that the new semantic format improves fresh LLM generation rates, or that
recipe selection answers unseen user prompts. Measure those rather than claiming them from the refactor.

### Generation experiment

Keep the old eight requests as development regressions. Build at least 24 held-out tasks balanced
across grounded and floating slots, pure Prismatic bodies, cylinders, multi-loop paths, body pose,
visual context, and ambiguous/unsupported requests. Include actual student wording when available;
do not call invented probes representative of student demand. Split related paraphrases and recipe
variants together so the test set is not an echo of the prompt examples.

Run three conditions, three attempts per task: **216 initial request runs** with the same model,
provider API, context isolation, deadline, token budget, candidate count, and evaluator:

| Condition | What it isolates |
| --- | --- |
| A: complete legacy fixture contract, with incorrect rules repaired | A fair baseline for direct coordinate generation |
| B: new semantic construction contract, same output/trace requirements | Whether the representation helps; report the slider/cylinder subgroup separately |
| C: B plus curated recipes and parameter fitting | Whether construction reuse helps beyond the schema |

All conditions face the **same full task-fit evaluator**, including decoded delivery. Compare
repair on/off separately under an explicit total budget; report first-attempt and final success,
model calls, time, and cost. Otherwise a larger repair budget masquerades as a better representation.
Score the chosen result as well as whether any candidate passes. Bootstrap paired differences by
task, not by candidate; three candidates from one answer are not three independent experiments.

Primary metric:

`delivered useful result rate = requests with a decoded, runnable, task-fitting, readable result / all attempted requests`.

Also report schema/reference failures, solve failures, task-fit failures, wrong answers accepted,
output identification, requested context completion, clarification burden, latency p50/p95, and
cost per useful result. Two reviewers should judge diagram recognition and unsupported prose
independently; hide persuasive generated titles while judging motion. A second LLM can assist
triage after calibration, but cannot be the sole truth gate.

### Description experiment

Use the original nine examples for development, plus at least 30 held-out drawings spanning known
families, custom geometry, invalid mechanisms, multiple machines, misleading labels, and absent or
ambiguous scene context. Compare table-only facts, semantic topology plus measurements, and the
latter plus a labeled view/filmstrip. Test supplied physical backdrops as a separate condition;
otherwise recognizing a photograph is conflated with recognizing the linkage.

Measure family recognition, defensible application/resemblance, unsupported behavioral claims per
answer, correct distinctive-feature coverage, numeric/part-reference accuracy, and useful uncertainty
on ambiguous examples. Perform renamed/mirrored/rotated/unit-converted checks. Have students point
to the output and explain its job: fluent prose is not evidence of comprehension.

Suggested product targets, **not measured achievements**: ≥90% delivered useful results within a
declared supported generation scope; ≥90% correct distinctive-feature coverage for description;
<2% materially unsupported behavioral claims; zero observed delivered mechanical blockers or hard
constraint violations. Require improvement over A with uncertainty reported, then expand beyond the
pilot before claiming reliability. Even zero failures in 100 independent cases only puts the usual
approximate 95% upper bound near 3%; the pilot cannot prove a very low failure rate.

Every run needs an immutable attempt ID, prompt/schema hashes, complete raw response and finish
reason, model/settings, solver/codec revision, units/scale, template version, candidate index,
stage outcomes, explanation verdict, latency, and usage. Generate summaries from this ledger so
the stale G3 report problem cannot recur. Keep live inference out of CI; replay saved cases there.

## Build order and boundaries

| Stage | Concrete deliverable | Gate before moving on |
| --- | --- | --- |
| 1. Contract and construction boundary | Versioned intent/observation/assembly schemas; compiler around current joint, slot, cylinder, actuator, and unit helpers | Round-trip fixed/moving sliders, unequal cylinder members, shared frame, compounds, multiple inputs across machines; refuse unsupported attachments |
| 2. Measurements and verifier | Named output points/bodies, robust path/pose/timing metrics, isolated solving and delivery checks | Catch the archived figure-eight, arc-lift, swing-decrease, false-dwell, tiny-path, and scale counterexamples |
| 3. “What is this” prototype | Semantic facts, reviewed family catalog, grounded explanation, optional scene view | Held-out truth/usefulness comparison beats the table-only baseline |
| 4. Generation prototype | Approximately 8–12 curated recipes, fitting, custom assembly fallback, bounded feedback | Run A/B/C benchmark before choosing a model or broadening the recipe set |
| 5. Finished presentation | Output cues, body-local visual-only attachments, persistence, short verified explanation, preview and one-step insertion | Same kinematics with/without decoration; reload/undo/share parity; desktop/phone filmstrip review |
| 6. Service and rollout | Provider adapter, endpoint budgets, cancellation, stale-result rejection, deployment configuration | Exact deployed model benchmark and classroom-burst latency/cost test |

Extract these into narrow models/services rather than adding behavior to `MechanismService` or
`NewGridComponent`. Reuse `partitionMechanisms`, `describeActuator`, `joint-type`, `cylinder`, and
the current codec. The fixture helper is a comparison oracle, not the browser API. The solvers
use shared static state: isolate proposal solves in a worker and sequence them within it; do not
run overlapping candidates against the live drawing. A worker-safe reconstruction boundary is
new implementation work, not something the archived test harness already provides.

For the UI, “What is this” belongs with the selected mechanism's context; generation needs a
free-text entry and a finished preview. Keep internal repair attempts out of the user flow. Editing
the drawing invalidates an in-flight explanation/proposal by snapshot revision. User-visible text
states what was intended and what the checked mechanism does, including any approximation.

Use a server-side provider adapter with fixed allowed endpoints, schema validation, bounded payloads,
deadlines, cancellation, and no key in the client. Disclose drawing/image context sent for a request
and keep ordinary telemetry free of drawing bodies. Select the provider/model after this benchmark;
do not inherit the old free-tier limits or add an unrequested paid fallback. Audience eligibility,
actual project quota, and hosting capacity need checking at activation, using current provider terms.

The first decision to implement is the semantic construction/measurement boundary. That work serves
both features and directly addresses the failures demonstrated by the existing experiments.
