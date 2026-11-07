// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { solvedDrawing } from '../../test-utils/machine-facts/drawing';
import { compareMobility, MobilityComparison } from '../../test-utils/oracle/compare-mobility';
import { publishedCases } from '../../test-utils/oracle/published-cases';
import { REFERENCES_DIR } from '../../test-utils/oracle/published-problems';
import { readReference, REPOSITORY_ROOT } from '../../test-utils/oracle/reference';
import { ORACLE_EXCLUSIONS } from '../../test-data/oracle/manifest';

// Phase 4 of docs/numerical-oracle-plan.md: PMKS+'s mobility (model/mechanism/
// mobility.ts) against the oracle's rank analysis, for every published
// machine, at the drawn pose. Both the first-order count (the constraint
// Jacobian's rank) and the second-order one (what survives a step along each
// free direction) must agree, unless the manifest leaves a machine's mobility
// out with an issue.

interface Row extends MobilityComparison {
  id: string;
}

function rows(): Row[] {
  return publishedCases().flatMap((published) => {
    const { partitions } = solvedDrawing(published.payload, 'degree');
    return partitions.map((partition, index) => {
      const id = `${published.id}.m${index + 1}`;
      const reference = readReference(`${REPOSITORY_ROOT}/${REFERENCES_DIR}/${id}.reference.json`);
      return { id, ...compareMobility(partition, reference) };
    });
  });
}

const leftOut = (id: string): boolean =>
  ORACLE_EXCLUSIONS.some(
    (e) => e.problem === id && e.what !== 'runs' && e.what.quantities.includes('mobility')
  );

describe('PMKS+ mobility against the oracle', () => {
  const all = rows();

  it('reads every published machine, and settles the second order on each', () => {
    expect(all.length).toBeGreaterThan(200);
    // An unsettled count is only a lower bound; none is published today, and
    // one that appears is compared by its bounds and wants a look.
    expect(all.filter((row) => !row.oracle.settled).map((row) => row.id)).toEqual([]);
  });

  for (const row of all) {
    it(`agrees on ${row.id}`, () => {
      if (leftOut(row.id)) {
        // An exclusion that no longer disagrees must be deleted.
        expect(row.agree, `${row.id} agrees now: delete its manifest entry`).toBe(false);
        return;
      }
      expect(
        { first: row.pmks.firstOrder, second: row.pmks.secondOrder },
        `PMKS+ against the oracle (Gruebler counted ${row.pmks.counted})`
      ).toEqual({
        first: row.oracle.firstOrder,
        second: row.oracle.settled ? row.oracle.secondOrder : row.pmks.secondOrder,
      });
      expect(row.agree, "within the oracle's bounds where its count is not settled").toBe(true);
    });
  }

  // The cross-check is only worth something where the two orders differ, or
  // where Gruebler's count is wrong; these keep it from passing by both sides
  // falling back to the rank alone.
  it('sees second order remove a freedom that first order finds', () => {
    const cut = all.filter((row) => row.oracle.secondOrder < row.oracle.firstOrder);
    expect(cut.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'gallery.motiongen-gripper.m1',
        'gallery.slotted-lever-with-a-rod-that-cannot-tilt.m1',
      ])
    );
  });

  it('sees the geometry correct a Gruebler count that is wrong', () => {
    const corrected = all.filter((row) => row.pmks.counted !== row.oracle.secondOrder);
    expect(corrected.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'gallery.parallelogram-with-a-third-parallel-crank.m1',
        'gallery.locomotive-drive-wheels.m1',
      ])
    );
  });
});
