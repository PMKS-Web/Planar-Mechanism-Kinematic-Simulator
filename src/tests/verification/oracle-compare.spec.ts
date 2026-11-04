// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { PmksSample } from '../../test-utils/oracle/pmks-samples';
import { compareMachine } from '../../test-utils/oracle/compare-oracle';
import { publishedMachine } from '../../test-utils/oracle/published-machine';

// The comparison reports what it could not compare, so that a machine cannot
// pass oracle.spec.ts by PMKS+ reporting less. Each case removes something
// from PMKS+'s samples of a machine that is verified in full.

describe('the oracle comparison', () => {
  const { problem, reference, samples } = publishedMachine('template.slider-crank.m1');

  it('finds nothing missing in a machine PMKS+ reports in full', () => {
    const comparison = compareMachine(problem, reference, samples);
    expect(comparison.compared).toBeGreaterThan(0);
    expect(comparison.missing).toEqual([]);
    expect(comparison.unreported).toEqual([]);
    expect(comparison.unvisited).toEqual([]);
  });

  it('reports every rate PMKS+ leaves blank', () => {
    const blank: PmksSample[] = samples.map((sample) => ({
      ...sample,
      points: new Map([...sample.points].map(([id, p]) => [id, { pos: p.pos }])),
      bodies: new Map([...sample.bodies].map(([id, b]) => [id, { com: b.com }])),
    }));
    const comparison = compareMachine(problem, reference, blank);
    const quantities = new Set(comparison.missing.map((m) => m.quantity));
    expect([...quantities].sort()).toEqual(
      ['acceleration', 'alpha', 'comAcceleration', 'comVelocity', 'omega', 'velocity'].sort()
    );
  });

  it('reports every part PMKS+ never reports', () => {
    const empty = samples.map((sample) => ({ ...sample, points: new Map(), bodies: new Map() }));
    const comparison = compareMachine(problem, reference, empty);
    expect(comparison.compared).toBe(0);
    expect(comparison.unreported.sort()).toEqual(
      [
        ...Object.keys(reference.sweep!.samples.points),
        ...Object.keys(reference.sweep!.samples.bodies),
      ].sort()
    );
  });

  it('reports every stored sample no frame reached', () => {
    const comparison = compareMachine(problem, reference, []);
    expect(comparison.unvisited).toEqual(reference.sweep!.samples.k);
  });
});
