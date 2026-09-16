import '../joint';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  redundantParallelCrankFixture,
  sliderCrankTracerFixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../../test-utils/verification/fixtures';
import { anchoredBarFixture } from '../../../test-utils/verification/slot-fixtures';

describe('the worked mobility count', () => {
  it('retains the four-bar terms that actually determined the reported DOF', () => {
    const { mechanism } = buildMechanism(teachingLabFourBarFixture());
    expect(mechanism.mobilityCount).toMatchObject({ N: 4, J1: 4, J2: 0, counted: 1 });
    expect(mechanism.dof).toBe(1);
    expect(mechanism.mobilityCount!.joints.map((joint) => joint.pairs)).toEqual([
      1, 1, 1, 1, 0, 0, 0, 0, 0,
    ]);
  });

  it('counts the slider block as a body and the guide connection as a lower pair', () => {
    const { mechanism } = buildMechanism(teachingLabSliderCrankFixture());
    expect(mechanism.mobilityCount).toMatchObject({ N: 4, J1: 4, J2: 0, counted: 1 });
    expect(mechanism.mobilityCount!.joints.find((joint) => joint.kind === 'Slider')?.pairs).toBe(1);
  });

  it('shows tracer points without charging them a constraint', () => {
    const { mechanism } = buildMechanism(sliderCrankTracerFixture());
    expect(mechanism.mobilityCount).toMatchObject({ N: 4, J1: 4, counted: 1 });
    expect(mechanism.mobilityCount!.joints.some((joint) => joint.pairs === 0)).toBe(true);
  });

  it('includes anchored rails in the single ground body', () => {
    const { mechanism } = buildMechanism(anchoredBarFixture(true));
    expect(mechanism.mobilityCount).toMatchObject({ N: 4, J1: 4, counted: 1 });
    expect(
      mechanism.mobilityCount!.bodies.find((body) => body.id === 'ground-body')!.links.length
    ).toBeGreaterThan(0);
  });

  it('keeps the structural count distinct from a geometry rescue', () => {
    const { mechanism } = buildMechanism(redundantParallelCrankFixture());
    expect(mechanism.mobilityCount).toMatchObject({ N: 5, J1: 6, counted: 0 });
    expect(mechanism.dof).toBe(1);
  });
});
