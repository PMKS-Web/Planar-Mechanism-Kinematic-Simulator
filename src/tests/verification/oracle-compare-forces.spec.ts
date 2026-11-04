// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { ForceAnalysisFrame, ForceAnalysisMode } from '../../app/model/mechanism/force-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import {
  compareForces,
  FORCE_BUDGETS,
  UNLOADED_SCALE,
} from '../../test-utils/oracle/compare-oracle-forces';
import { publishedMachine } from '../../test-utils/oracle/published-machine';

// The force comparison reports what PMKS+ did not, and compares a machine that
// carries no force at all, so that neither can pass oracle.spec.ts unexamined.
// Each case edits PMKS+'s own force analysis of a verified machine.

/** `mechanism`, with every frame of its force analysis passed through `edit`. */
function editedForces(
  mechanism: Mechanism,
  edit: (frame: ForceAnalysisFrame) => ForceAnalysisFrame
): Mechanism {
  const real = mechanism.getForceAnalysis.bind(mechanism);
  mechanism.getForceAnalysis = (mode: ForceAnalysisMode) => {
    const series = real(mode);
    return { ...series, frames: series.frames.map(edit) };
  };
  return mechanism;
}

describe('the oracle force comparison', () => {
  it('reports a Slide couple and an input effort PMKS+ leaves out', () => {
    const { problem, reference, mechanism, samples } = publishedMachine(
      'gallery.guided-rod-pushed-by-a-link.m1'
    );
    const full = compareForces(problem, reference, mechanism, samples, 'dynamic');
    expect(full.missing).toEqual([]);
    expect(full.deviations.some((d) => d.quantity === 'couple')).toBe(true);
    const bare = editedForces(mechanism, (frame) => ({
      ...frame,
      guideCouples: new Map(),
      inputEffort: undefined,
    }));
    const comparison = compareForces(problem, reference, bare, samples, 'dynamic');
    expect(comparison.missing.map((m) => m.quantity).sort()).toEqual(['couple', 'effort']);
  });

  it('compares a machine that carries no force, and fails a force where there is none', () => {
    const { problem, reference, mechanism, samples } = publishedMachine('template.4-bar.m1');
    const quiet = compareForces(problem, reference, mechanism, samples, 'static');
    expect(quiet.forceScale).toBe(0);
    expect(quiet.scale).toBe(UNLOADED_SCALE);
    expect(quiet.deviations.length).toBeGreaterThan(0);
    expect(quiet.unsolved).toEqual([]);
    expect(Math.max(...quiet.deviations.map((d) => d.error))).toBeLessThan(FORCE_BUDGETS.static);

    const loud = editedForces(mechanism, (frame) => ({
      ...frame,
      jointReactionsByLink: new Map(
        [...frame.jointReactionsByLink].map(([joint, byBody]) => [
          joint,
          new Map([...byBody].map(([body, f]) => [body, [f[0] + 1e-3, f[1]] as typeof f])),
        ])
      ),
    }));
    const wrong = compareForces(problem, reference, loud, samples, 'static');
    const reactions = wrong.deviations.filter((d) => d.quantity === 'reaction');
    expect(reactions.length).toBeGreaterThan(0);
    expect(Math.min(...reactions.map((d) => d.error))).toBeGreaterThan(FORCE_BUDGETS.static);
  });

  it('fails a machine that carries no force when PMKS+ does not solve it', () => {
    const { problem, reference, mechanism, samples } = publishedMachine('template.4-bar.m1');
    const refused = editedForces(mechanism, (frame) => ({ ...frame, status: 'singular' }));
    const comparison = compareForces(problem, reference, refused, samples, 'static');
    expect(comparison.unsolved.length).toBeGreaterThan(0);
    expect(comparison.deviations).toEqual([]);
  });
});
