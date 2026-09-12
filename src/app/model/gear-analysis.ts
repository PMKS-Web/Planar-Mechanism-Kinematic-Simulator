import type { Mechanism } from './mechanism/mechanism';
import { gearBodyFor } from './mechanism/gear-drive';

export const GEAR_QUANTITIES = [
  { label: 'Angular Position', property: 'Angular Gear Pos', suffix: '' },
  { label: 'Angular Travel', property: 'Angular Gear Travel', suffix: '' },
  { label: 'Angular Velocity', property: 'Angular Gear Vel', suffix: '/s' },
  { label: 'Angular Acceleration', property: 'Angular Gear Acc', suffix: '/s²' },
] as const;

/** Radians and seconds at the same authoritative frame used by graphs and exports. */
export function gearSample(
  mechanism: Mechanism,
  index: number,
  id: string,
  property: string
): number[] {
  const body = gearBodyFor(mechanism.gearDrive, id);
  const motion = mechanism.gearMotionAtSample(index)?.angles.get(id);
  if (!body || !motion) return [NaN];
  switch (property) {
    case 'Angular Gear Pos':
      return [motion.angle];
    case 'Angular Gear Travel':
      return [body.multiplier * mechanism.gearTravel[index]];
    case 'Angular Gear Vel':
      return [motion.velocity];
    case 'Angular Gear Acc':
      return [motion.acceleration];
    default:
      return [];
  }
}
