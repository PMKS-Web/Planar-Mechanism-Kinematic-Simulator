import { RevJoint } from './joint';
import { RealLink } from './link';
import { MODEL_SCALE } from './render-scale';
import { inertiaAboutPoint } from './inertia-about-point';

describe('inertia about a parallel axis', () => {
  function rod(factor = 0.001 / MODEL_SCALE ** 2) {
    const link = new RealLink(
      'AB',
      [new RevJoint('A', 0, 0), new RevJoint('B', 3 * MODEL_SCALE, 4 * MODEL_SCALE)],
      12,
      25 * MODEL_SCALE ** 2 * factor
    );
    return link;
  }

  it('gives mL²/3 about a rod endpoint and leaves the solver properties unchanged', () => {
    const link = rod();
    const before = { mass: link.mass, moi: link.massMoI, x: link.CoM.x, y: link.CoM.y };
    const result = inertiaAboutPoint(link, link.joints[0], 0.001 / MODEL_SCALE ** 2);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.shift).toBeCloseTo(0.075, 10);
    expect(result.inertia).toBeCloseTo(0.1, 10);
    expect({ mass: link.mass, moi: link.massMoI, x: link.CoM.x, y: link.CoM.y }).toEqual(before);
  });

  it('uses the supplied unit factor and returns the original inertia at G', () => {
    const factor = 1 / MODEL_SCALE ** 2;
    const link = rod(factor);
    const endpoint = inertiaAboutPoint(link, link.joints[1], factor);
    const center = inertiaAboutPoint(link, link.CoM, factor);
    expect(endpoint.available && endpoint.inertia).toBeCloseTo(100, 10);
    expect(center.available && center.inertia).toBeCloseTo(25, 10);
  });

  it('requires inertia consistent with a relocated custom center, then uses that custom inertia', () => {
    const link = rod();
    link.comIsCustom = true;
    link.CoM.x = MODEL_SCALE;
    link.CoM.y = 0;
    const factor = 0.001 / MODEL_SCALE ** 2;
    expect(inertiaAboutPoint(link, link.joints[0], factor).available).toBe(false);
    link.moiIsCustom = true;
    link.massMoI = 0.05;
    const result = inertiaAboutPoint(link, link.joints[0], factor);
    expect(result.available && result.inertia).toBeCloseTo(0.062, 10);
  });
});
