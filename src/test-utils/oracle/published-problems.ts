// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { decodeDrawing } from '../machine-facts/drawing';
import { exportPartition, OracleProblem } from './export-problem';
import { publishedCases } from './published-cases';

/** Where `npm run oracle` keeps the problems it exports and the references it solves. */
export const ORACLE_DATA = 'src/test-data/oracle';
export const PROBLEMS_DIR = `${ORACLE_DATA}/problems`;
export const REFERENCES_DIR = `${ORACLE_DATA}/references`;

/** Every published machine as an oracle problem: one per machine in each case's drawing. */
export function publishedProblems(): OracleProblem[] {
  return publishedCases().flatMap((published) => {
    const { target, settings } = decodeDrawing(published.payload);
    const { mechanisms } = partitionMechanisms(target.joints, target.links, target.forces);
    return mechanisms.map((partition) =>
      exportPartition(published.id, published.title, partition, settings)
    );
  });
}

/** The five MATLAB verification cases, each with its dataset and its fixture. */
export const MATLAB_DIR = `${ORACLE_DATA}/matlab`;
