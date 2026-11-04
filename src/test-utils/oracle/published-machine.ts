// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { solvedDrawing } from '../machine-facts/drawing';
import { exportPartition, inputOf, solverUnit } from './export-problem';
import { pmksSamples } from './pmks-samples';
import { publishedCases } from './published-cases';
import { REFERENCES_DIR } from './published-problems';
import { readReference, REPOSITORY_ROOT } from './reference';
import { siFactors } from './si-units';

/**
 * One published machine by its problem id (`<case>.m<n>`), as oracle.spec.ts
 * sees it: the exported problem, its committed reference, PMKS+'s solved
 * mechanism and its samples on the oracle's grid.
 */
export function publishedMachine(id: string) {
  const machine = Number(id.slice(id.lastIndexOf('.m') + 2)) - 1;
  const caseId = id.slice(0, id.lastIndexOf('.m'));
  const published = publishedCases().find((c) => c.id === caseId);
  if (!published) throw new Error(`no published case ${caseId}`);
  const { partitions, mechanisms, settings } = solvedDrawing(published.payload, 'degree');
  const problem = exportPartition(published.id, published.title, partitions[machine], settings);
  const reference = readReference(`${REPOSITORY_ROOT}/${REFERENCES_DIR}/${id}.reference.json`);
  const mechanism = mechanisms[machine];
  const samples = pmksSamples(
    mechanism,
    inputOf(partitions[machine])!.id,
    reference.sweep!.step,
    siFactors(solverUnit(settings)).meters
  );
  return { problem, reference, mechanism, samples };
}
