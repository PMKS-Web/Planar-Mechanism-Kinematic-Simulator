// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { publishedCases } from '../../test-utils/oracle/published-cases';
import { solvedDrawing } from '../../test-utils/machine-facts/drawing';
import {
  exportPartition,
  inputOf,
  OracleProblem,
  solverUnit,
} from '../../test-utils/oracle/export-problem';
import { siFactors } from '../../test-utils/oracle/si-units';
import { pmksSamples } from '../../test-utils/oracle/pmks-samples';
import { compareMachine, judge, ORDER, Verdict } from '../../test-utils/oracle/compare-oracle';
import {
  oracleSourceSha256,
  readReference,
  REPOSITORY_ROOT,
  sha256,
} from '../../test-utils/oracle/reference';
import { PROBLEMS_DIR, REFERENCES_DIR } from '../../test-utils/oracle/published-problems';
import { Exclusion, ORACLE_EXCLUSIONS } from '../../test-data/oracle/manifest';

// Every published machine, solved by PMKS+ and by the numerical oracle
// (oracle/, on Exudyn), compared sample by sample on the driver's grid.
// docs/numerical-oracle-plan.md is the contract; `npm run oracle` regenerates
// the references this reads.

const problemsDir = `${REPOSITORY_ROOT}/${PROBLEMS_DIR}`;
const referencesDir = `${REPOSITORY_ROOT}/${REFERENCES_DIR}`;

function currentOracleSource(): string {
  const pkg = `${REPOSITORY_ROOT}/oracle/pmks_oracle`;
  const files = readdirSync(pkg)
    .filter((name) => name.endsWith('.py'))
    .map((name) => ({ name, bytes: readFileSync(`${pkg}/${name}`) }));
  return oracleSourceSha256(files, readFileSync(`${REPOSITORY_ROOT}/oracle/uv.lock`));
}

interface Machine {
  problem: OracleProblem;
  payload: string;
  index: number;
}

function machines(): Machine[] {
  return publishedCases().flatMap((published) => {
    const { partitions, settings } = solvedDrawing(published.payload, 'degree');
    return partitions.map((partition, index) => ({
      problem: exportPartition(published.id, published.title, partition, settings),
      payload: published.payload,
      index,
    }));
  });
}

const all = machines();
const exclusionsFor = (id: string): Exclusion[] =>
  ORACLE_EXCLUSIONS.filter((exclusion) => exclusion.problem === id);

/** What became of each machine, for the coverage report. */
const outcome = new Map<string, string>();
const tally: Record<Verdict, number> = { pass: 0, fail: 0, 'ill-conditioned': 0, undefined: 0 };
let excludedSamples = 0;
/** The largest error that passed, per method and order: the measurement the budgets rest on. */
const worstPassing = new Map<string, { error: number; problem: string; part: string; k: number }>();

describe('numerical oracle', () => {
  describe('references', () => {
    it('are one per problem, none missing and none left over', () => {
      const references = readdirSync(referencesDir).filter((n) => n.endsWith('.reference.json'));
      const problems = readdirSync(problemsDir).filter((n) => n.endsWith('.problem.json'));
      expect(references.map((n) => n.replace('.reference.json', '')).sort()).toEqual(
        problems.map((n) => n.replace('.problem.json', '')).sort()
      );
    });

    it('were solved from the problems and the oracle that are checked in', () => {
      const source = currentOracleSource();
      for (const name of readdirSync(problemsDir).filter((n) => n.endsWith('.problem.json'))) {
        const id = name.replace('.problem.json', '');
        const reference = readReference(`${referencesDir}/${id}.reference.json`);
        const text = readFileSync(`${problemsDir}/${name}`, 'utf8');
        expect(reference.problemSha256, `${id} is stale: run \`npm run oracle\``).toBe(
          sha256(text)
        );
        expect(
          reference.generator.sourceSha256,
          `${id}: the oracle changed; run \`npm run oracle\``
        ).toBe(source);
      }
    });

    it('name only machines that exist, and every disagreement names its issue', () => {
      const ids = new Set(all.map((m) => m.problem.id));
      for (const exclusion of ORACLE_EXCLUSIONS) {
        expect(ids.has(exclusion.problem), `${exclusion.problem} is not a published machine`).toBe(
          true
        );
        if (exclusion.kind === 'disagreement') {
          expect(exclusion.issue, exclusion.problem).toMatch(
            /^https:\/\/github\.com\/.+\/issues\/\d+$/
          );
        }
      }
    });
  });

  describe('every published machine', () => {
    for (const machine of all) {
      const { problem } = machine;
      it(problem.id, () => {
        const exclusions = exclusionsFor(problem.id);
        if (exclusions.some((e) => e.what === 'runs')) {
          outcome.set(problem.id, `excluded: ${exclusions.find((e) => e.what === 'runs')!.kind}`);
          return;
        }
        if (problem.unsupported.length > 0) {
          outcome.set(problem.id, 'excluded: unsupported by the exporter');
          return;
        }
        const path = `${referencesDir}/${problem.id}.reference.json`;
        expect(existsSync(path), 'run `npm run oracle`').toBe(true);
        const reference = readReference(path);
        const { mechanisms, settings } = solvedDrawing(machine.payload, 'degree');
        const mechanism = mechanisms[machine.index];
        const sweep = reference.sweep;
        const oracleRuns = !!sweep && (sweep.closesAfterTurns !== null || sweep.kMax > sweep.kMin);
        const input = inputOf(solvedDrawing(machine.payload, 'degree').partitions[machine.index]);
        expect(mechanism.isMechanismValid(), 'PMKS+ runs it').toBe(oracleRuns);
        if (!oracleRuns || !input || !sweep) {
          outcome.set(problem.id, 'verified: neither runs');
          return;
        }

        const samples = pmksSamples(
          mechanism,
          input.id,
          sweep.step,
          siFactors(solverUnit(settings)).meters
        );
        const comparison = compareMachine(problem, reference, samples);
        expect(comparison.offGrid, 'PMKS+ samples off the oracle grid').toEqual([]);
        if (sweep.closesAfterTurns) {
          const perTurn = Math.round((2 * Math.PI) / sweep.step);
          expect(mechanism.joints.length - 1, 'PMKS+ closes after the same turns').toBe(
            perTurn * sweep.closesAfterTurns
          );
        } else {
          // PMKS+ reverses at the last sample it can solve; the oracle's refined
          // toggle lies within the next step.
          expect(comparison.outOfRange, 'PMKS+ ran past the toggle').toEqual([]);
          expect(comparison.range.pmks, 'PMKS+ reverses where the oracle finds the toggle').toEqual(
            comparison.range.oracle
          );
        }
        // Nothing passes by not being compared: every stored sample is reached,
        // every part the oracle reports is reported back, and every quantity
        // the oracle has at a sample PMKS+ has too, unless the manifest leaves
        // it out.
        const leftOut = (quantity: string, part: string): boolean =>
          exclusions.some(
            (e) =>
              e.what !== 'runs' &&
              e.what.quantities.includes(quantity as never) &&
              (!e.what.parts || e.what.parts.includes(part))
          );
        expect(comparison.unvisited, 'oracle samples PMKS+ never reached').toEqual([]);
        expect(comparison.unreported, 'parts PMKS+ never reports').toEqual([]);
        const missing = comparison.missing
          .filter((m) => !leftOut(m.quantity, m.part))
          .map((m) => `${m.quantity} of ${m.part} at k=${m.k}`);
        expect(missing.slice(0, 10), 'quantities PMKS+ left blank').toEqual([]);
        const ends = sweep.closesAfterTurns ? undefined : [sweep.kMin, sweep.kMax];
        const failures: string[] = [];
        for (const d of comparison.deviations) {
          if (leftOut(d.quantity, d.part)) {
            excludedSamples++;
            continue;
          }
          const verdict = judge(d, ends);
          tally[verdict]++;
          if (verdict === 'pass') {
            const key = `${d.method}/${['pose', 'rate', 'acceleration'][ORDER[d.quantity]]}`;
            if ((worstPassing.get(key)?.error ?? -1) < d.error) {
              worstPassing.set(key, { error: d.error, problem: problem.id, part: d.part, k: d.k });
            }
          }
          if (verdict === 'fail' && failures.length < 10) {
            failures.push(
              `${d.quantity} (${d.method}) of ${d.part} at k=${d.k}: ${d.error.toExponential(2)} of scale`
            );
          }
        }
        expect(failures, 'outside budget').toEqual([]);
        outcome.set(problem.id, exclusions.length ? 'verified, in part' : 'verified');
      });
    }
  });

  afterAll(() => {
    const counts: Record<string, number> = {};
    for (const value of outcome.values()) counts[value] = (counts[value] ?? 0) + 1;
    const dir = `${REPOSITORY_ROOT}/artifacts/oracle`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/coverage.json`,
      JSON.stringify(
        {
          machines: counts,
          samples: { ...tally, excluded: excludedSamples },
          worstPassing: Object.fromEntries(worstPassing),
          outcome: Object.fromEntries(outcome),
        },
        null,
        1
      )
    );
  });
});
