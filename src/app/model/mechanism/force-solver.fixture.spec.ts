import { Mechanism } from './mechanism';
import { ForceAnalysisMode } from './force-solver';
import {
  BUILT_IN_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../component/MODALS/templates/template-linkages';
import {
  buildMechanismFixture,
  COMPLEX_WELDED_MECHANISM,
  LEGACY_FORCE_MECHANISM,
  LOOPLESS_WELDED_MECHANISM,
} from '../../../tests/fixtures/mechanism-fixtures';

function expectForceAnalysis(mechanism: Mechanism, mode: ForceAnalysisMode) {
  const result = mechanism.getForceAnalysis(mode);
  expect(result.mode).toBe(mode);
  expect(result.frames).toHaveLength(mechanism.timeNum.length);
  expect(result.successfulFrames).toBeGreaterThanOrEqual(2);
  expect(result.diagnostic).toBeUndefined();

  result.frames.forEach((frame, index) => {
    expect(frame.mode).toBe(mode);
    expect(frame.timeSeconds).toBe(mechanism.timeNum[index]);
    expect(['ok', 'singular']).toContain(frame.status);
    if (frame.status !== 'ok') return;

    expect(frame.rank).toBeGreaterThan(0);
    expect(Number.isFinite(frame.residual)).toBe(true);
    expect(frame.residual).toBeLessThanOrEqual(1e-8);
    // Healthy solves stay an order of magnitude above the singularity
    // tolerance (corpus-wide minimum measured 3.4e-3 against the 1e-4 line),
    // so the cross-browser determinism guard cannot refuse real frames.
    expect(frame.minPivot).toBeGreaterThan(1e-3);
    expect(frame.inputEffort).toBeDefined();
    expect(Number.isFinite(frame.inputEffort!.valueSI)).toBe(true);
    frame.jointReactionsByLink.forEach((byLink) =>
      byLink.forEach((reaction) => {
        expect(reaction).toHaveLength(2);
        expect(reaction.every(Number.isFinite)).toBe(true);
      })
    );
  });
}

describe('force analysis production fixtures', () => {
  it('analyzes the loopless welded mechanism that blanked Safari Analyze', () => {
    const { mechanism } = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.requiredLoops).toEqual([]);
    expect(() => expectForceAnalysis(mechanism, 'static')).not.toThrow();
    expect(() => expectForceAnalysis(mechanism, 'dynamic')).not.toThrow();
  });

  it('analyzes every timestep of the complex welded mechanism', () => {
    const { mechanism } = buildMechanismFixture(COMPLEX_WELDED_MECHANISM);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    expect(() => expectForceAnalysis(mechanism, 'static')).not.toThrow();
    expect(() => expectForceAnalysis(mechanism, 'dynamic')).not.toThrow();
  });

  it('analyzes the supplied legacy force URL', () => {
    const { mechanism } = buildMechanismFixture(LEGACY_FORCE_MECHANISM);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(() => expectForceAnalysis(mechanism, 'static')).not.toThrow();
    expect(() => expectForceAnalysis(mechanism, 'dynamic')).not.toThrow();
  });

  for (const templateID of BUILT_IN_TEMPLATE_IDS) {
    it(`analyzes every timestep of the ${templateID} built-in template`, () => {
      const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES[templateID]);
      expect(mechanism.isMechanismValid()).toBe(true);
      expect(mechanism.dof).toBe(1);
      expect(() => expectForceAnalysis(mechanism, 'static')).not.toThrow();
      expect(() => expectForceAnalysis(mechanism, 'dynamic')).not.toThrow();
    });
  }
});
