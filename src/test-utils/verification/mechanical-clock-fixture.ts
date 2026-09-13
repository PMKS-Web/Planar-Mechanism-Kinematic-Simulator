import { GearFixture } from './gear-fixtures';
import { speedTurning } from '../../app/model/drive-direction';

/** Centimeter-scale authored geometry; hand lengths are independent of pitch radii. */
export const CLOCK_MODULE = 0.1;
const centerDistance = (CLOCK_MODULE * (12 + 48)) / 2;
export const CLOCK_RPM = speedTurning(true, 60);

/** Two distinct central bearings (A/E), three ordinary rigid bodies, four attachments. */
export const MECHANICAL_CLOCK: GearFixture = {
  inputAngVel: (CLOCK_RPM * Math.PI) / 30,
  joints: [
    { id: 'A', x: 0, y: 0, ground: true, input: true, driveSpeed: CLOCK_RPM },
    { id: 'B', x: 0, y: 5 },
    { id: 'C', x: centerDistance, y: 0, ground: true },
    { id: 'D', x: centerDistance, y: -1.2 },
    { id: 'E', x: 0, y: 0, ground: true },
    { id: 'F', x: 0, y: 3.4 },
  ],
  links: [
    { joints: 'AB', name: 'Minute hand' },
    { joints: 'CD', name: 'Intermediate shaft' },
    { joints: 'EF', name: 'Hour hand' },
  ],
  transmission: {
    gears: [
      {
        id: 'GA',
        name: 'Minute A',
        hostLinkId: 'AB',
        centerJointId: 'A',
        referenceJointId: 'B',
        teeth: 12,
        module: CLOCK_MODULE,
      },
      {
        id: 'GB',
        name: 'Intermediate B',
        hostLinkId: 'CD',
        centerJointId: 'C',
        referenceJointId: 'D',
        teeth: 48,
        module: CLOCK_MODULE,
      },
      {
        id: 'GC',
        name: 'Intermediate C',
        hostLinkId: 'CD',
        centerJointId: 'C',
        referenceJointId: 'D',
        teeth: 15,
        module: CLOCK_MODULE,
        plane: 1,
      },
      {
        id: 'GD',
        name: 'Hour D',
        hostLinkId: 'EF',
        centerJointId: 'E',
        referenceJointId: 'F',
        teeth: 45,
        module: CLOCK_MODULE,
        plane: 1,
      },
    ],
    meshes: [
      { id: 'GMAB', gearAId: 'GA', gearBId: 'GB', kind: 'external' },
      { id: 'GMCD', gearAId: 'GC', gearBId: 'GD', kind: 'external' },
    ],
  },
};
