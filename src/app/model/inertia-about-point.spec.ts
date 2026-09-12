import { RevJoint } from './joint';
import { RealLink } from './link';
import { MODEL_SCALE } from './render-scale';
import { inertiaAboutPoint } from './inertia-about-point';
import { uniformMassProperties } from './mass-properties';

describe('inertia about a parallel axis', () => {
  it('refuses an unsupported member pairing in an automatic welded combination', () => {
    const first = rod(),
      second = rod();
    first.comIsCustom = true;
    first.CoM.x += MODEL_SCALE;
    const compound = new RealLink('AB', first.joints, 24, undefined, undefined, [first, second]);
    const factor = 0.001 / MODEL_SCALE ** 2;
    const derived = uniformMassProperties(compound, factor);
    compound.CoM = derived.com;
    compound.massMoI = derived.moi;
    const refused = inertiaAboutPoint(compound, compound.joints[0], factor);
    expect(refused.available).toBe(false);
    expect(!refused.available && refused.reason).toContain('member AB');
    first.moiIsCustom = true;
    expect(inertiaAboutPoint(compound, compound.joints[0], factor).available).toBe(true);
    first.moiIsCustom = false;
    compound.moiIsCustom = true;
    expect(inertiaAboutPoint(compound, compound.joints[0], factor).available).toBe(true);
  });
  it('refuses invalid numeric properties rather than reporting an inertia', () => {
    const body = rod();
    const factor = 0.001 / MODEL_SCALE ** 2;
    for (const inertia of [-1, NaN, Infinity]) {
      body.massMoI = inertia;
      expect(inertiaAboutPoint(body, body.joints[0], factor).available).toBe(false);
    }
    body.massMoI = 1;
    body.mass = 0;
    expect(inertiaAboutPoint(body, body.joints[0], factor).available).toBe(false);
  });
  it('uses the same shift identity at arbitrary parallel reference points', () => {
    const body = rod();
    const factor = 0.001 / MODEL_SCALE ** 2;
    for (const [x, y] of [
      [0, 0],
      [2, -3],
      [-8, 4],
      [1.5, 2],
    ]) {
      const point = { x: x * MODEL_SCALE, y: y * MODEL_SCALE };
      const result = inertiaAboutPoint(body, point, factor);
      if (!result.available) throw new Error('Expected a supported axis');
      const expected =
        body.mass * ((body.CoM.x - point.x) ** 2 + (body.CoM.y - point.y) ** 2) * factor;
      expect(result.inertia - body.massMoI).toBeCloseTo(expected, 12);
    }
  });
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
