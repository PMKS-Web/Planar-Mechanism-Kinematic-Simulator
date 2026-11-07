import { MechanismFixture } from './fixture';
import { cylinderBetween, scotchYokeFixture, slottedCouplerFixture } from './slot-fixtures';

/** Fixed barrel welded to a machine frame; a rigid crosshead rides the rod. */
export function hydraulicCrossheadFixture(): MechanismFixture {
  const a = { x: 0, y: 0 },
    b = { x: 6, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(a, b, 0.45);
  return {
    joints: [
      { id: 'A', ...a, ground: true },
      { id: 'N', ...barrelEnd },
      { id: 'S', ...pin },
      { id: 'B', ...b },
      { id: 'G', x: 0, y: -2, ground: true },
      { id: 'C', x: 6, y: 1.8 },
      { id: 'D', x: 6, y: -1.8 },
    ],
    links: [
      { joints: 'ANG', name: 'Fixed frame', subset: [{ joints: 'AN' }, { joints: 'AG' }] },
      { joints: 'SBCD', name: 'Press crosshead', subset: [{ joints: 'SB' }, { joints: 'BCD' }] },
    ],
    sliders: [{ at: 'S', on: { carrier: 'ANG', a: 'A', b: 'N' }, sealed: true, input: true }],
    welds: ['A', 'B', 'S'],
    inputAngVel: 1,
  };
}

/** Both cylinder ends carry welded offsets; the far bracket drives a hinged hatch. */
export function offsetMountHatchFixture(): MechanismFixture {
  const a = { x: 0, y: 0 },
    b = { x: 6, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(a, b, 0.5);
  return {
    joints: [
      { id: 'G', x: -2, y: 0, ground: true },
      { id: 'A', ...a },
      { id: 'N', ...barrelEnd },
      { id: 'S', ...pin },
      { id: 'B', ...b },
      { id: 'E', x: 7, y: 1 },
      { id: 'O', x: 5, y: -2, ground: true },
      { id: 'T', x: 9, y: 4, trace: true },
    ],
    links: [
      { joints: 'GAN', name: 'Offset barrel', subset: [{ joints: 'GA' }, { joints: 'AN' }] },
      { joints: 'SBE', name: 'Rod bracket', subset: [{ joints: 'SB' }, { joints: 'BE' }] },
      { joints: 'OET', name: 'Hatch' },
    ],
    sliders: [{ at: 'S', on: { carrier: 'GAN', a: 'A', b: 'N' }, sealed: true, input: true }],
    welds: ['A', 'B', 'S'],
    inputAngVel: 1,
  };
}

/** A yoke saw against a constant cutting load: input torque changes sign through the return. */
export function reciprocatingSawFixture(): MechanismFixture {
  const fixture = scotchYokeFixture();
  const bottom = fixture.joints.find((j) => j.id === 'C')!;
  fixture.joints.push({ id: 'E', x: bottom.x + 4, y: bottom.y });
  fixture.links[0].name = 'Flywheel crank';
  fixture.links[1] = {
    joints: 'CDE',
    name: 'Saw carriage',
    subset: [{ joints: 'CD' }, { joints: 'CE' }],
  };
  fixture.sliders![0].on!.carrier = 'CDE';
  fixture.loads = [
    { onLink: 'CDE', at: [bottom.x + 4, bottom.y], vector: [-80, 0] },
    { onLink: 'CDE', at: [bottom.x + 2, bottom.y], vector: [0, -20] },
  ];
  fixture.gravity = false;
  return fixture;
}

/**
 * How far along the tool carrier the cutting load acts, as a share of the way
 * from the crank pin B to the return rocker's pin C: past C, toward the end of
 * the slot. On C itself it would sit on a pin the rocker shares, and a load is
 * put on a link at a point of its own.
 */
const TOOL_LOAD_ALONG = 1.35;

/** A slotted coupler carries a tool-normal load while the output arm carries a hanging weight. */
export function slottedToolDriveFixture(): MechanismFixture {
  const fixture = slottedCouplerFixture();
  const c = fixture.joints.find((j) => j.id === 'C')!;
  const b = fixture.joints.find((j) => j.id === 'B')!;
  const f = fixture.joints.find((j) => j.id === 'F')!;
  const span = Math.hypot(c.x - b.x, c.y - b.y);
  const tool: [number, number] = [
    b.x + (c.x - b.x) * TOOL_LOAD_ALONG,
    b.y + (c.y - b.y) * TOOL_LOAD_ALONG,
  ];
  fixture.links.forEach((link, i) => {
    link.name = ['Input crank', 'Tool carrier', 'Return rocker', 'Loaded output'][i];
  });
  fixture.loads = [
    {
      onLink: 'BCX',
      at: tool,
      vector: [(-(c.y - b.y) * 60) / span, ((c.x - b.x) * 60) / span],
      local: true,
    },
    { onLink: 'EF', at: [f.x, f.y], vector: [0, -100] },
  ];
  fixture.gravity = false;
  return fixture;
}
