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
