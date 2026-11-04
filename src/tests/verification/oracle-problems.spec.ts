// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeProblem } from '../../test-utils/oracle/export-problem';
import {
  MATLAB_DIR,
  PROBLEMS_DIR,
  publishedProblems,
} from '../../test-utils/oracle/published-problems';
import { matlabCases } from '../../test-utils/oracle/matlab-cases';
import { OracleProblem } from '../../test-utils/oracle/export-problem';

// The oracle's problem files are generated, not written. This spec keeps them
// honest the way fixture-gallery.spec.ts keeps docs/fixture-urls.md honest: a
// fixture or template that changes without `npm run oracle` fails here, naming
// the machine whose physics moved.

const ROOT = resolve(__dirname, '../../..');
const sets: [string, string, OracleProblem[]][] = [
  ['published machines', `${ROOT}/${PROBLEMS_DIR}`, publishedProblems()],
  ['MATLAB cases', `${ROOT}/${MATLAB_DIR}`, matlabCases().map((c) => c.problem)],
];

describe('oracle problem files', () => {
  for (const [name, dir, problems] of sets) {
    describe(name, () => {
      it('give every machine its own file', () => {
        const ids = problems.map((problem) => problem.id);
        expect(new Set(ids).size, 'two machines export to one file').toBe(ids.length);
      });

      it('match the exported problems that are checked in', () => {
        if (process.env['PMKS_WRITE_ORACLE_PROBLEMS']) {
          // Problems only: a reference kept beside its problem is the
          // oracle's to write, and `npm run oracle` writes it next.
          mkdirSync(dir, { recursive: true });
          for (const file of readdirSync(dir).filter((f) => f.endsWith('.problem.json'))) {
            rmSync(`${dir}/${file}`);
          }
          for (const problem of problems) {
            writeFileSync(`${dir}/${problem.id}.problem.json`, serializeProblem(problem));
          }
          return;
        }
        const saved = readdirSync(dir).filter((file) => file.endsWith('.problem.json'));
        const expected = problems.map((problem) => `${problem.id}.problem.json`);
        expect(saved.sort(), 'run `npm run oracle`').toEqual([...expected].sort());
        for (const problem of problems) {
          const text = readFileSync(`${dir}/${problem.id}.problem.json`, 'utf8');
          expect(text, `${problem.id}: run \`npm run oracle\``).toBe(serializeProblem(problem));
        }
      });
    });
  }
});
