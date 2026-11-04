---
name: oracle
description: Regenerate and triage the numerical oracle's references (oracle/, Exudyn). Use when adding or changing a gallery fixture or library template, changing a PMKS+ solver, touching src/test-data/oracle or oracle/, or when oracle.spec.ts, oracle-problems.spec.ts or oracle-matlab.spec.ts fails.
---

# The numerical oracle

PMKS+ is checked against an independent solver: every gallery fixture and library template is
exported to a physics problem (`src/test-utils/oracle/export-problem.ts`), solved by the Python
package in `oracle/` on Exudyn, and compared sample by sample in `src/tests/verification/oracle.spec.ts`.
[`docs/numerical-oracle-plan.md`](../../../docs/numerical-oracle-plan.md) is the contract.

## Commands

```bash
nvm use
npm run oracle          # export every problem, then solve them all (about 40 s)
npm run oracle:solve    # solve only, when only oracle/ changed
cd oracle && uv run pytest   # the oracle's own raw benchmarks
```

`npm run oracle` needs [uv](https://docs.astral.sh/uv/). Do not run the oracle's Python with `-I`.
Commit what it writes under `src/test-data/oracle/`. A regeneration leaves alone every reference
it reproduces to within rounding (`pmks_oracle/agree.py`), so a reference written on macOS passes
CI's Linux regeneration; a `changed` line in its output says what moved and why.
`.github/workflows/oracle-nightly.yml` repeats that regeneration each night on `staging`, and once
more with the newest Exudyn patch release (`PMKS_ORACLE_NUMBERS_ONLY=1`), and keeps one
`nightly-oracle` issue open while either fails.

## When a spec fails

- **"run `npm run oracle`"**: a fixture, template, exporter or the oracle changed. Regenerate and
  commit. Only do this when the change was meant to change the physics.
- **"outside budget"**, or **"PMKS+ runs it"**: PMKS+ and the oracle disagree. Triage in this
  order, and stop at the first that explains it:
  1. the exporter's equivalence rule (`export-problem.ts`);
  2. the oracle's model (`oracle/pmks_oracle/exudyn_model.py`);
  3. PMKS+'s solver.

  If PMKS+ is wrong, **do not change its solver to make the spec pass, and never widen a budget
  for one machine.** Open a GitHub issue with the numbers, add an entry to
  `src/test-data/oracle/manifest.ts` naming the issue, and leave the solver for its own pull
  request.
- **"never reached"**, **"never reports"**, **"left blank"** or **"reports no …"**: PMKS+
  reported less than the oracle has. Nothing passes by not being compared, so this is a failure
  like any other, triaged the same way.
- A spec message truncates a long list; `artifacts/oracle/coverage.json` holds every machine's
  whole list under `failed`, beside the counts and the worst passing error per budget.
- **Changing a PMKS+ solver** never regenerates oracle data. If the spec goes red, the change is
  wrong, or it fixed a manifest entry: delete that entry.
