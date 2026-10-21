import { MechanismFixture } from './fixture';

/** Open drawings for editing: no drive is needed to study how a shared joint separates. */
export function splitPinFixture(count: 3 | 4 = 3): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -3, y: 2 },
      { id: 'B', x: 0, y: 0 },
      { id: 'C', x: 3, y: 2 },
      { id: 'D', x: 3, y: -2 },
      ...(count === 4 ? [{ id: 'E', x: -3, y: -2 }] : []),
    ],
    links: ['AB', 'BC', 'BD', ...(count === 4 ? ['BE'] : [])].map((joints) => ({ joints })),
    inputAngVel: 0,
  };
}

export function splitSliderFixture(
  type: 'pin-in-slot' | 'prismatic',
  grounded = false
): MechanismFixture {
  return {
    joints: [
      ...(!grounded
        ? [
            { id: 'A', x: -4, y: 0 },
            { id: 'C', x: 4, y: 0 },
          ]
        : []),
      { id: 'B', x: 0, y: 0 },
      { id: 'D', x: 3, y: 3 },
      { id: 'E', x: 3, y: -3 },
    ],
    links: [...(!grounded ? ['AC'] : []), 'BD', 'BE'].map((joints) => ({ joints })),
    slider: {
      at: 'B',
      angleRad: 0,
      ...(!grounded ? { on: { carrier: 'AC', a: 'A', b: 'C' } } : {}),
    },
    welds: type === 'prismatic' ? ['B'] : [],
    inputAngVel: 0,
  };
}

/** The red block in a user's unfinished drawing still joins two real links. */
export function splitDanglingSliderFixture(type: 'pin-in-slot' | 'prismatic'): MechanismFixture {
  return {
    ...splitSliderFixture(type, true),
    joints: [
      { id: 'B', x: 0, y: 0 },
      { id: 'D', x: -3, y: -2 },
      { id: 'E', x: 3, y: -2 },
    ],
    detach: ['B'],
  };
}
