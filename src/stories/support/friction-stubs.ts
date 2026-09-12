import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { frictionPropertyError, JointFriction } from '../../app/model/joint-friction';
import { FrictionService } from '../../app/services/friction.service';
import { EditPermissionService } from '../../app/services/edit-permission.service';
import { SettingsService } from '../../app/services/settings.service';
import { ColorService } from '../../app/services/color.service';
import { LengthUnit } from '../../app/model/unit-enums';

/** Only UI data and mutation; the gallery never constructs the mechanism service/solver. */
export function frictionStoryState(
  kind: 'guide' | 'pin',
  enabled = true,
  unit = LengthUnit.CM,
  disabled = false,
  stationary = false
) {
  new ColorService();
  const settings = new SettingsService();
  settings.lengthUnit.next(unit);
  const joint =
    kind === 'guide' ? new PrisJoint('P', 0, 0, true, true) : new RevJoint('A', 0, 0, true, true);
  const pin = kind === 'pin';
  const other = new RevJoint('B', MODEL_SCALE, 0);
  const body = pin ? new RealLink('AB', [joint, other]) : new SliderBlock('BP', [other, joint]);
  joint.links = [body];
  other.links = [body];
  joint.friction = {
    staticCoefficient: enabled ? 0.3 : 0,
    kineticCoefficient: enabled ? 0.2 : 0,
    radius: pin ? MODEL_SCALE * (unit === LengthUnit.INCH ? 0.5 / 2.54 : 0.5) : 0,
  };
  const torque = (100 * 0.2 * joint.friction.radius) / MODEL_SCALE;
  const service = {
    set: (contact: RealJoint, value: JointFriction) => {
      const error = frictionPropertyError(value, pin);
      if (!error) contact.friction = { ...value };
      return error;
    },
    reading: () =>
      stationary
        ? {
            message:
              'Joint P has zero relative motion. Static friction is a range at this pose; the prescribed-motion analysis cannot select a unique holding force.',
          }
        : {
            values: [100, pin ? -torque : -20, pin ? torque * 1.5 : 30],
            sign: pin
              ? 'Torque on Link AB is positive counterclockwise.'
              : 'Force on the block is positive along the guide angle.',
            additionalEffort: pin ? torque : 20,
            inputIsTorque: pin,
          },
  };
  return {
    joint,
    service,
    providers: [
      { provide: SettingsService, useValue: settings },
      { provide: FrictionService, useValue: service },
      {
        provide: EditPermissionService,
        useValue: {
          refusal: () => (disabled ? { long: 'Pause playback to edit friction.' } : undefined),
        },
      },
    ],
  };
}
