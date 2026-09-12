import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { runInInjectionContext } from '@angular/core';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { SelectionBatchService } from './selection-batch.service';
import { LengthUnit } from '../model/unit-enums';
import { METERS_PER_INCH } from '../model/unit-conversions';

function drawing() {
  const h = createMechanismHarness();
  const a = new RevJoint('A', 0, 0),
    b = new RevJoint('B', 200, 0);
  a.friction = { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 100 };
  const link = new RealLink('AB', [a, b]);
  h.service.joints = [a, b];
  h.service.links = [link];
  wireGraph(h.service);
  return { ...h, a, link };
}
describe('friction through drawing operations', () => {
  for (const batch of [false, true]) {
    it(`preserves independent friction properties in ${batch ? 'batch' : 'single-link'} duplicate`, () => {
      const h = drawing();
      if (batch)
        runInInjectionContext(h.injector, () => new SelectionBatchService()).duplicateSelected(
          [{ kind: 'link', id: 'AB' }],
          { x: 0, y: 100 }
        );
      else h.service.duplicateLink(h.link);
      const copied = h.service.joints
        .slice(2)
        .find((j) => (j as RealJoint).friction.staticCoefficient > 0) as RealJoint;
      expect(copied.friction).toEqual(h.a.friction);
      expect(copied.friction).not.toBe(h.a.friction);
      copied.friction.radius = 7;
      expect(h.a.friction.radius).toBe(100);
      expect(h.saveCount()).toBe(1);
    });
  }
  it('converts the physical radius through the real unit-change path without changing coefficients', () => {
    const h = drawing();
    h.settings.lengthUnit.next(LengthUnit.INCH);
    h.service.updateLinkageUnits(LengthUnit.CM, LengthUnit.INCH);
    expect(h.a.friction.radius).toBeCloseTo((100 * 0.01) / METERS_PER_INCH, 10);
    expect(h.a.friction.staticCoefficient).toBe(0.3);
    expect(h.a.friction.kineticCoefficient).toBe(0.2);
    h.settings.lengthUnit.next(LengthUnit.CM);
    h.service.updateLinkageUnits(LengthUnit.INCH, LengthUnit.CM);
    expect(h.a.friction.radius).toBeCloseTo(100, 10);
  });
});
