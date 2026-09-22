import { forceAngleGuide, forceFrameDirection } from './force-frame';
import { Force } from './force';
import { Coord } from './coord';
import { RealLink } from './link';
import { RevJoint } from './joint';
import { SettingsService } from '../services/settings.service';

describe('force frame drawing', () => {
  const make = () =>
    new Force(
      'F1',
      new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 2, 2)]),
      new Coord(1, 1),
      new Coord(1, 3),
      true
    );
  it('measures a local angle from the body and a global angle from the grid', () => {
    const force = make();
    expect(forceFrameDirection(force)).toBeCloseTo(Math.PI / 4);
    const guide = forceAngleGuide(force, 1);
    expect(guide.axis.x - guide.at.x).toBeCloseTo(guide.axis.y - guide.at.y);
    force.setLocal(false);
    expect(forceFrameDirection(force)).toBeCloseTo(Math.PI / 2);
    expect(forceAngleGuide(force, 1).axis.y).toBe(1);
  });
  it('flips the physical guide without moving the anchor and leaves room for its mark', () => {
    const force = make();
    force.flipForce();
    expect(forceFrameDirection(force)).toBeCloseTo((-3 * Math.PI) / 4);
    expect(force.startCoord).toEqual(new Coord(1, 1));
    expect(force.endCoord).toEqual(new Coord(1, 3));
    const tip = force.forceArrow.split(' ').slice(1, 3).map(Number);
    expect(tip[1]).toBeCloseTo(1 + force.visualWidth * SettingsService.objectScale);
  });
});
