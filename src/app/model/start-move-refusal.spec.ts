import { RealLink } from './link';
import { RevJoint } from './joint';
import { holdChips } from './hold-chips';
import { anglesTurnedSince, refuseMovingStart } from './start-move-refusal';

/**
 * Which fixed values moving a machine's start would change.
 *
 * Only an angle can be turned by the motion, and only one whose bar points
 * somewhere else now than at the start: a parallelogram's coupler keeps its
 * bearing all the way round, so promoting any pose leaves its angle alone.
 */
describe('moving the start past a fixed value', () => {
  function bar(id: string, from: [number, number], to: [number, number]): RealLink {
    return new RealLink(id, [new RevJoint(id[0], ...from), new RevJoint(id[1], ...to)]);
  }

  it('names a fixed angle the pose on screen has turned', () => {
    const crank = bar('AB', [0, 0], [0, 1]);
    crank.hold = 'angle';
    const start = [new RevJoint('A', 0, 0), new RevJoint('B', 1, 0)];

    expect(anglesTurnedSince(holdChips([crank], []), start).map((chip) => chip.id)).toEqual(['AB']);
  });

  it('passes an angle that kept its bearing, however far the bar has moved', () => {
    const coupler = bar('BC', [1, 1], [5, 1]);
    coupler.hold = 'angle';
    const start = [new RevJoint('B', 0, 2), new RevJoint('C', 4, 2)];

    expect(anglesTurnedSince(holdChips([coupler], []), start)).toEqual([]);
  });

  it('never names a length, which no pose can change', () => {
    const rocker = bar('CD', [0, 0], [0, 4]);
    rocker.hold = 'length';
    const start = [new RevJoint('C', 0, 0), new RevJoint('D', 4, 0)];

    expect(anglesTurnedSince(holdChips([rocker], []), start)).toEqual([]);
  });

  it('says nothing when nothing is turned, and counts several when several are', () => {
    const one = bar('AB', [0, 0], [0, 1]);
    const two = bar('CD', [0, 0], [0, 1]);
    one.hold = 'angle';
    two.hold = 'angle';

    expect(refuseMovingStart([])).toBeUndefined();
    expect(refuseMovingStart([one, two])).toEqual({
      short: '2 fixed angles',
      long:
        'Starting here would turn fixed angle AB and fixed angle CD. ' +
        'Turn off their Fixed Angle first.',
    });
  });
});
