import { GearAssembly } from '../../app/model/gear';
import { MechanismFixture } from './fixture';

/** Deterministic solver fixtures also published through the normal G1 document codec. */
export interface GearFixture extends MechanismFixture {
  transmission: GearAssembly;
}

export function gearNetworkFixture(
  rotors: readonly { center: [number, number]; teeth: number; heading?: number; module?: number }[],
  edges: readonly [number, number][]
): GearFixture {
  const joints: MechanismFixture['joints'] = [];
  const links: MechanismFixture['links'] = [];
  const gears = rotors.map((rotor, index) => {
    const centerId = String.fromCharCode(65 + index * 2);
    const referenceId = String.fromCharCode(66 + index * 2);
    const heading = rotor.heading ?? 0;
    const arm = index === 0 ? 0.5 : 1;
    joints.push(
      { id: centerId, x: rotor.center[0], y: rotor.center[1], ground: true, input: index === 0 },
      {
        id: referenceId,
        x: rotor.center[0] + arm * Math.cos(heading),
        y: rotor.center[1] + arm * Math.sin(heading),
      }
    );
    links.push({ joints: centerId + referenceId });
    return {
      id: `G${index + 1}`,
      hostLinkId: centerId + referenceId,
      centerJointId: centerId,
      referenceJointId: referenceId,
      teeth: rotor.teeth,
      module: rotor.module ?? 0.1,
    };
  });
  return {
    joints,
    links,
    inputAngVel: 2 * Math.PI,
    transmission: {
      gears,
      meshes: edges.map(([a, b], index) => ({
        id: `GM${index + 1}`,
        gearAId: gears[a].id,
        gearBId: gears[b].id,
        kind: 'external',
      })),
    },
  };
}

export const GEAR_PAIR = gearNetworkFixture(
  [
    { center: [-3, 0], teeth: 20 },
    { center: [0, 0], teeth: 40, heading: Math.PI / 3 },
  ],
  [[0, 1]]
);

export const GEAR_FIVE_TURNS = gearNetworkFixture(
  [
    { center: [-6, 0], teeth: 20 },
    { center: [0, 0], teeth: 100, heading: Math.PI / 3 },
  ],
  [[0, 1]]
);

const d = GEAR_PAIR.joints[3];
const dx = 4 - d.x,
  dy = -d.y;
const distance = Math.hypot(dx, dy);
const height = Math.sqrt(9 - (distance * distance) / 4);
export const GEAR_FOUR_BAR: GearFixture = {
  ...GEAR_PAIR,
  joints: [
    ...GEAR_PAIR.joints,
    { id: 'E', x: (d.x + 4) / 2 - (dy / distance) * height, y: d.y / 2 + (dx / distance) * height },
    { id: 'F', x: 4, y: 0, ground: true },
  ],
  links: [...GEAR_PAIR.links, { joints: 'DE' }, { joints: 'EF' }],
};

export const DIRECT_GEAR_FOUR_BAR: MechanismFixture = {
  joints: GEAR_FOUR_BAR.joints
    .filter((joint) => !['A', 'B'].includes(joint.id))
    .map((joint) => ({ ...joint, input: joint.id === 'C' })),
  links: GEAR_FOUR_BAR.links.filter((link) => link.joints !== 'AB'),
  inputAngVel: -Math.PI,
};
