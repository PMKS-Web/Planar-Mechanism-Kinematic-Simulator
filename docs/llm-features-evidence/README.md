# Evidence for the LLM feature plan

> **Status:** Reference — offline planning audit, September 22, 2026. No fresh inference calls.

The recommendation and experimental design are in [the feature plan](../llm-features-plan.md).
These files preserve the measurements rather than requiring trust in its prose.

## Source revisions and inventory

- Experiment source: `claude/explain-why-brief`, commit
  `72fe0fcdf70b171942433d5bfb7c2ddd26f70d80`, in the local `explain-why` worktree.
- Current implementation: `feature/editor-bug-fixes-2`, commit
  `ac24921a934c1f6fced5b2a3dc95f682638beead`.
- Supplemental prior review and temporary link verifiers: stash commit `dd8ba8ad`, read with
  `git show` without restoring the stash.

On the experiment revision, the primary records are:

| Paths under `docs/` | Reviewed material |
| --- | --- |
| `explain-why-brief.md`, `explain-why-plan.md`, `explain-why-evidence/` | Diagnosis experiment; 78 repair calls, six fact-ledger calls; local search/replay, prose audit, limitations |
| `describe-experiment/` | 45 v1 and 45 v2 responses; 36 v3 responses; four extraction/format versions; image protocol correction; 54 Gemini records |
| `generate-experiment/` | G1–G5 prompts/runners, 96 saved requests with 267 candidates; 33 corrections; `verified.json`, correction measurements, G3–G5 selection reports |
| `llm/openrouter.py` | Provider harness and output-token cap; no associated completed result grid found in the reviewed experiment artifacts |
| `generate-experiment/second-perspective.md` in `dd8ba8ad` | Prior audit of incorrect rules, stale reports, library/context, and proposed evaluations; source, not a newly performed UI inspection |

For example, `git show 72fe0fcd:docs/generate-experiment/README.md` retrieves an original summary.
The audit script accepts any checkout/archive directory of that revision and hashes the 96 saved
generation records. The description recognition and application counts in the plan come from the
original manual review and inspection of representative responses, not a new automated factuality
classifier. Naming a family or application is not equivalent to an entirely correct explanation.

## Static recount

[audit.py](audit.py) produces [audit.json](audit.json). Run from the project root, substituting
the path to the experiment checkout:

```sh
python3 docs/llm-features-evidence/audit.py /path/to/explain-why > docs/llm-features-evidence/audit.json
```

This reconciles raw candidate counts, historical G1/G2 acceptance, trace/name presence, delivery
counts, and stale G3 selection rows. Historical G2 Haiku and Opus each have 21/21 passing
candidates but only 7/8 answered requests. Those missing requests remain in the request denominator.
The historical verifier omitted the no-candidate Opus row entirely; its saved raw request record
is why the denominator is still eight.

All 129 parsed G3–G5 candidates have a trace; all 39 G5 candidates have at least one named link.
Those metrics describe output compliance, not correctness of the point selected or completeness
of naming every body. The three stale G3 Opus rows are straightline, lift, and leg.

## New replay on the refactored implementation

[replay.spec.ts.txt](replay.spec.ts.txt) is the complete experiment, archived outside the ordinary
test suite. Its output is [replay.json](replay.json): 274 outcome rows, comprising 267 candidates
and seven request records without candidates; 45 library entries; and three cylinder checks.

Reproduction, in a checkout at the current implementation revision with dependencies installed:

```sh
cp docs/llm-features-evidence/replay.spec.ts.txt src/tests/verification/llm-planning-replay.spec.ts
PMKS_LLM_ARCHIVE=/path/to/explain-why/docs/generate-experiment/generated \
PMKS_LLM_REPLAY_OUT="$PWD/docs/llm-features-evidence/replay.json" \
PMKS_LLM_REVISION=ac24921a934c1f6fced5b2a3dc95f682638beead \
npm test -- --watch=false --include=src/tests/verification/llm-planning-replay.spec.ts
rm src/tests/verification/llm-planning-replay.spec.ts
```

The recorded run used Node 24.18.0, Angular 22.1.6, Vitest 4.1.10, and the Angular test builder.
The final run passed its single reporting test, with 4.71 seconds in the test body. A passing
reporting test means the replay completed; it does not mean every candidate passed. No app UI,
browser filmstrip, full regression suite, production deployment, or new model call is claimed.

For each saved candidate, the adapter keeps joints, links, sliders, welds, loads, and input speed.
The current fixture builder ignores the obsolete slider `prisId`. There is no geometry repair,
prompt rewriting, or schema-success claim. Invalid candidates can throw and are recorded as failed.
Raw snippets cannot be made equivalent to a strict new schema by this permissive migration.

Two separate gates are recorded:

- `direct`: the current fixture builder, using the historical criterion of valid solve, DOF 1,
  and at least 50 samples, in the fixture's coordinates. This is deliberately the old-style check.
- `decoded`: encode with `fixturePayload`, decode through `StringTranscoder` and
  `MechanismBuilder` **with settings restored**, partition, and solve each partition at the decoded
  drive speed and object/cylinder scales. Require valid one-DOF mechanisms with multiple finite
  samples, exactly one usable actuator per partition, and no loose joints or floating chains.
  It does not require 50 samples, which is not a valid universal motion specification.

| Prompt/model label in archive | Candidates | Direct passes | Decoded passes | Requests with a decoded pass / attempted |
| --- | ---: | ---: | ---: | ---: |
| G1 / flash-lite | 24 | 6 | 5 | 3/8 |
| G1 / haiku | 24 | 11 | 0 | 0/8 |
| G1 / opus | 24 | 13 | 13 | 6/8 |
| G2 / flash-lite | 24 | 15 | 14 | 7/8 |
| G2 / haiku | 21 | 20 | 20 | 7/8 |
| G2 / opus | 21 | 21 | 21 | 7/8 |
| G3 / flash-lite | 24 | 11 | 9 | 5/8 |
| G3 / opus | 21 | 21 | 21 | 7/8 |
| G4 / flash-lite | 24 | 11 | 9 | 5/8 |
| G4 / opus | 21 | 17 | 17 | 7/8 |
| G5 / flash-lite | 21 | 8 | 8 | 5/8 |
| G5 / opus | 18 | 11 | 11 | 4/8 |
| Total | 267 | 165 | 148 | 63/96 |

The 17 direct-pass/decoded-fail outcomes comprise 14 actuator refusals, two cases with loose
joints, and one solver refusal. Eleven are G1 Haiku mechanisms whose explicit frame link leaves
the driven pin incident on three bodies under the current actuator model. This is evidence of a
constructor/readiness gap, not a claim that the codec corrupted eleven drawings. The same issue
appears in the library's inversion examples. The one solver refusal is candidate 0 of
`quickreturn__G4-parts__flash-lite.json` (`dead-position`).

These results cannot isolate the causal effect of the slider refactor: solver version, restored
state, supported semantics, and acceptance checks differ from the historical run. They also
cannot establish task fit: the old figure-eight false positives still need a behavioral gate.

### Library and cylinder controls

All 45 library entries have numerically valid decoded solves across all their partitions.
43 also pass the stricter actuator/loose-geometry gate. `Four_Bar_Inversions` and
`Slider_Crank_Inversions` contain actuator refusals because a driven pin meets three bodies.
This is a headless finding worth checking in the UI before admitting those entries to a recipe
catalog; the planning task does not fix or claim a visual reproduction of it.

`cylinderBoomFixture()` fails with `cylinder-has-no-travel` in the direct small-coordinate build.
`cylinderBoomFixture(MODEL_SCALE)` passes with 361 samples. `fixturePayload` of the small-coordinate
fixture, followed by proper decoding and a 1 unit/s linear drive, passes with 359 samples. Direct
and decoded checks use different sampling settings; sample counts are not a speed or accuracy
comparison. The control demonstrates why the authoring API needs a single units/construction
boundary and why the old “cylinders are impossible in this format” conclusion needs qualification.

Neither replay gate checks whole-cycle numerical residuals, force validity, desired output behavior,
outline clarity, or live editor service/undo parity. The feature plan explicitly requires these
additional checks where relevant. The 148 passes and 43 library entries are not certified finished
answers to arbitrary user prompts.

## "What is this?" prototype results

[what-is-this-results.html](what-is-this-results.html) is a self-contained page (open it in a
browser) of the prototype in `src/app/prototype/what-is-this/`: ten library templates, three
fact-sheet variants (base, plus relations, plus relations and a rendered drawing), answered by
Gemini 3.5 Flash-Lite and Muse Spark 1.3 on 22–23 September 2026. Each answer is shown as the
Analysis panel could show it, with tokens, latency and one reviewer's grade. Template names were
never sent. The grades are a single reviewer's judgment on ten famous mechanisms, not a benchmark.

## Taste test: one model, fact-sheet versions compared blind

From 23 September 2026 the prototype is committed to GPT-6 Luna (through the Codex CLI, medium
effort), and what changes is the fact sheet, a little at a time. Each version is a directory under
the gitignored `artifacts/what-is-this/<version>/`, built by the case builder with `PMKS_SHEET`;
[`run/sheets.json`](../../src/app/prototype/what-is-this/run/sheets.json) says what each version
changed, and [`run/rounds.json`](../../src/app/prototype/what-is-this/run/rounds.json) which two
versions each round puts side by side. `run/taste.mjs` builds a page that shows one mechanism
moving beside the two answers as Analysis-panel mocks, on sides fixed at random per mechanism,
and asks a person which they would rather a student read. Which version wrote which is shown only
after the vote. The published page keeps the votes in its own database.

[taste-rounds.json](taste-rounds.json) is every round's inputs and answers without the pictures:
both fact sheets, their line diff, both answers, and the automatic checks from
[`run/rubric.mjs`](../../src/app/prototype/what-is-this/run/rubric.mjs). Those checks catch what a
script can: part names and numbers the sheet does not contain, motion words the sheet gives no
ground for (straight line, parallel, a quick return, or denying one the sheet shows), length, and
whether the family and the uses name the template's real machine. They are a reason to look, not a
grade.

Round 1 compares v2 (the sheet from the four-model comparison) with v3 (the truth fixes). Four of
the ten sheets are identical between the two, so those four pairs measure how much Luna varies on
its own. v3 was also asked a second time (`~2` in the answer file names) for the same purpose.

### Round 2: v4, and the pairs Claude decides

v4 (see `run/sheets.json`) moves more of the reasoning into the app. Every link is named for its
job, with each rocker's and slider's ends keyed to the input angle. A family check matches lengths,
joints and motion against a short catalog, and the note may say "is" only for a match. The sheet
and the note say "this mechanism", and terms come with meanings. The picture is the app's own
Schematic drawing at four moments, captured by `run/schematic.mjs` from a development build of
`feature/drawing-styles`; the [hood hinge's filmstrip](v4-filmstrip-hood-hinge.png) is what the
model was sent. Link names are hidden in the capture, because an author's names ("Wiper arm",
"Hood") give the answer away.

From round 2 on, Claude decides the pairs where one answer is clearly better and leaves the close
calls to a person; each decision is in `run/rounds.json` with its reason, and the page shows it. In
round 2, v4 won the hood hinge outright ("a Stephenson six-bar that resembles a car hood hinge", in
both askings) and lost the cylinder boom, whose first v4 answer put no part name in bold. The other
eight are close calls, and they are the question: whether the v4 note is the one a person would
rather a student read.

### Round 3: v5 on fresh mechanisms

v5 splits the work: PMKS+ names the family it matched, in the panel's Overview, and the note no
longer does; the model says what real machine the mechanism looks like (`resembles`) and gives one
or two real products. The picture carries the author's background image and no axes. The cases are
new: eight library templates not used before (three with background images), ten mechanisms
students attached to feedback (five with a stated goal: a steam locomotive, a Scott Russell
straight-line generator, a Strider linkage, a door opener, cylinder and scissor-lift experiments),
and three test mechanisms from `made-cases.ts`. `run/case-sets/fresh.json` lists them; the
students' links stay in the gitignored feedback file, and their fact sheets are left out of
`taste-rounds.json`.

The first draft of the v5 prompt named example products, and the model gave the same two (a
windshield wiper and a reciprocating pump) to nearly every mechanism, a Peaucellier cell and a
toggle clamp included; it also forbade naming any family, so mechanisms the catalog does not know
went unnamed. Those answers are kept as `answers-draft`; the prompt that was run names no products
and lets `resembles` name a mechanism the app did not match.

Across the 16 round 3 cases with a known real machine or stated goal, v5 names it in 8 and v4 in
4: the landing gear, excavator, radial engine, fan, trammel and Peaucellier cell are v5's gains.
Neither version recognized any student's goal (the locomotive, the Scott Russell, the Strider, the
door opener), and v5 confidently calls the car steering "paired windshield-wiper linkages" in both
askings, background photograph notwithstanding. Claude decided 13 pairs and left 8 close calls.

### Round 4: v6's picture

v6 changes only the picture: six moments instead of four, the author's background image once (tile
0) instead of behind every moment, and links drawn as discs shown as discs, with the fact sheet
saying so. The Schematic style on `feature/drawing-styles` draws a disc as the outline of its
joints; the captures used a local fix, and the real one is a task of its own. The set repeats the
four templates with background images and the student's locomotive, and adds nine library
templates, nine student mechanisms and a test case (a locomotive's driving wheels).

v6 recognizes 11 of the 15 cases with a known machine, v5 on the same cases 7. The gains are the
car steering (the first time any version saw it), the pantograph, the gripper, and the locomotive
wheels once they were drawn as discs; the loss is the landing gear, which v6 took for a helicopter
part. The student's own locomotive, now drawn with three wheels, reads as "three linked spinning
wheels" but not yet as a locomotive.

Three answers in this round, and none earlier, came back with web citations: the Codex CLI gives
the model web search and other tools unless they are disabled. `run/ask.mjs` now disables them, and
the three were asked again (the originals are kept aside). The rubric flags any answer with a link.
