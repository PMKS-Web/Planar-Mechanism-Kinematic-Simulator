import { PhysicalMechanism } from './force-oracle';

type Vec = [number, number];

/** The second crossing of two circles, to the left of the line from p to q. */
function closing(p: Vec, fromP: number, q: Vec, fromQ: number): Vec {
  const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const foot = (fromP ** 2 - fromQ ** 2 + span ** 2) / (2 * span);
  const rise = Math.sqrt(fromP ** 2 - foot ** 2);
  const [ux, uy] = [(q[0] - p[0]) / span, (q[1] - p[1]) / span];
  return [p[0] + foot * ux - rise * uy, p[1] + foot * uy + rise * ux];
}

/**
 * The force oracle's mechanism: a crank-rocker four-bar driving a ram through
 * a connecting rod off its rocker, described in SI.
 *
 * Built to leave a scale error nowhere to hide. Every body has mass, and every
 * center of mass sits off the line of its joints, so m·a and I·α both carry
 * moment arms. The input turns at 45 rpm, where inertia and weight are about
 * the same size, so neither drowns the other. The ram carries a block whose
 * weight and inertia only the guide's axial equation sees. Two loads act away
 * from their links' centers of mass, one along the coupler and one at the
 * rocker's third corner.
 *
 * Grashof's inequality holds with the crank shortest (0.3 + 1.005 against
 * 1.0 + 0.7), so the crank turns right round. The rod never stands square to
 * the guide (the rocker's corner stays within 0.6 m of the guide's height, and
 * the rod is 0.9 m), so no pose of the cycle is a dead point.
 */
export function oracleSixBar(): PhysicalMechanism {
  const A: Vec = [0, 0];
  const B: Vec = [0.3 * Math.cos(Math.PI / 3), 0.3 * Math.sin(Math.PI / 3)];
  const D: Vec = [1.0, 0.1];
  const C = closing(B, 1.0, D, 0.7);
  // The rocker's third corner, 0.6 m out from D and 50 degrees round from C.
  const towardC = Math.atan2(C[1] - D[1], C[0] - D[0]);
  const E: Vec = [D[0] + 0.6 * Math.cos(towardC - 0.87), D[1] + 0.6 * Math.sin(towardC - 0.87)];
  const GUIDE_HEIGHT = D[1];
  const F: Vec = [E[0] + Math.sqrt(0.9 ** 2 - (E[1] - GUIDE_HEIGHT) ** 2), GUIDE_HEIGHT];

  const between = (p: Vec, q: Vec, along: number, out: number): Vec => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const length = Math.hypot(dx, dy);
    return [p[0] + along * dx - (out * dy) / length, p[1] + along * dy + (out * dx) / length];
  };

  return {
    joints: [
      { id: 'A', at: A, ground: true, input: true },
      { id: 'B', at: B },
      { id: 'C', at: C },
      { id: 'D', at: D, ground: true },
      { id: 'E', at: E },
      { id: 'F', at: F },
    ],
    bodies: [
      { joints: 'AB', mass: 1.2, inertia: 0.012, com: between(A, B, 0.4, 0.03) },
      { joints: 'BC', mass: 2.5, inertia: 0.22, com: between(B, C, 0.5, 0.06) },
      {
        joints: 'CDE',
        mass: 3,
        inertia: 0.15,
        com: [(C[0] + D[0] + E[0]) / 3 + 0.02, (C[1] + D[1] + E[1]) / 3 - 0.03],
      },
      { joints: 'EF', mass: 1.5, inertia: 0.1, com: between(E, F, 0.45, -0.04) },
    ],
    slider: { at: 'F', angleRad: 0, mass: 4 },
    loads: [
      // On the line BC, because that is the only place a bar can carry a load:
      // the app moves one drawn off it back onto it (`keepForcesOnTheirLinks`),
      // and this oracle, reading the load from its own copy, would see the move.
      { onLink: 'BC', at: between(B, C, 0.7, 0), vector: [35, -50] },
      { onLink: 'CDE', at: E, vector: [-25, 15] },
    ],
    rpm: 45,
  };
}
