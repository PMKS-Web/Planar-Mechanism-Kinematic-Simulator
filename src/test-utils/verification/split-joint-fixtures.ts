import { MechanismFixture } from './fixture';

/** A block at B with one or two riders, on a slot cut in AC or on the ground. */
export function splitSliderFixture(
  riders: 1 | 2,
  options: { grounded?: boolean; prismatic?: boolean; shortRider?: boolean } = {}
): MechanismFixture {
  const ends = ['D', 'E'].slice(0, riders);
  const reach = options.shortRider ? 0.1 : 3;
  return {
    joints: [
      ...(options.grounded
        ? []
        : [
            { id: 'A', x: -4, y: 0 },
            { id: 'C', x: 4, y: 0 },
          ]),
      { id: 'B', x: 0, y: 0 },
      { id: 'D', x: reach, y: reach },
      { id: 'E', x: -3, y: 3 },
    ].filter((joint) => !['D', 'E'].includes(joint.id) || ends.includes(joint.id)),
    links: [...(options.grounded ? [] : ['AC']), ...ends.map((end) => 'B' + end)].map((joints) => ({
      joints,
    })),
    slider: {
      at: 'B',
      angleRad: 0,
      ...(options.grounded ? {} : { on: { carrier: 'AC', a: 'A', b: 'C' } }),
    },
    welds: options.prismatic ? ['B'] : [],
    inputAngVel: 0,
  };
}

/** Two slots, cut in AB and AC, both ending at the shared pin A. */
export function twoSlotsAtOnePinFixture(): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 4, y: 0 },
      { id: 'C', x: 0, y: 4 },
      { id: 'P', x: 2, y: 0 },
      { id: 'Q', x: 0, y: 2 },
      { id: 'D', x: 2, y: -2 },
      { id: 'E', x: -2, y: 2 },
    ],
    links: ['AB', 'AC', 'DP', 'EQ'].map((joints) => ({ joints })),
    sliders: [
      { at: 'P', on: { carrier: 'AB', a: 'A', b: 'B' } },
      { at: 'Q', on: { carrier: 'AC', a: 'A', b: 'C' } },
    ],
    inputAngVel: 0,
  };
}

/** Plain links meeting at A, with nothing that depends on where A is. */
export function plainPinFixture(links: 2 | 3 | 4 = 2, welded = false): MechanismFixture {
  const ends = [
    { id: 'B', x: 3, y: 0 },
    { id: 'C', x: 0, y: 3 },
    { id: 'D', x: -3, y: 0 },
    { id: 'E', x: 0, y: -3 },
  ].slice(0, links);
  return {
    joints: [{ id: 'A', x: 0, y: 0 }, ...ends],
    links: ends.map((end) => ({ joints: 'A' + end.id })),
    welds: welded ? ['A'] : [],
    inputAngVel: 0,
  };
}

/** Two links at A that lie almost on top of each other: along themselves they barely part. */
export function nearlyParallelPinFixture(): MechanismFixture {
  const apart = (8 * Math.PI) / 180;
  return {
    joints: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 3, y: 0 },
      { id: 'C', x: 3 * Math.cos(apart), y: 3 * Math.sin(apart) },
    ],
    links: ['AB', 'AC'].map((joints) => ({ joints })),
    inputAngVel: 0,
  };
}
