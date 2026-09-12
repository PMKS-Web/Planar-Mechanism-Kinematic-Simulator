import { emptyBodyDocument } from '../../model/body-system/body-document';
import { BodyUnits } from '../../model/body-system/body-units';
import { AngleUnit, ForceUnit, LengthUnit } from '../../model/unit-enums';
import { BoolSetting, DecimalSetting, EnumSetting, IntSetting } from './stored-settings';
import { GenericTranscoder } from './transcoder-interface';

export function legacyProductionSettings(reader: GenericTranscoder) {
  const length = reader.getEnumSetting(EnumSetting.LENGTH_UNIT, LengthUnit);
  const units: BodyUnits =
    length === LengthUnit.INCH
      ? { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' }
      : length === LengthUnit.CM
        ? { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' }
        : length === LengthUnit.METER
          ? { length: 'm', mass: 'kg', inertia: 'kg*m2', force: 'N' }
          : (() => {
              throw new Error('Unsupported production length unit.');
            })();
  const document = emptyBodyDocument(units);
  const angle = reader.getEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit);
  const force = reader.getEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit);
  if (
    ![AngleUnit.DEGREE, AngleUnit.RADIAN].includes(angle!) ||
    ![ForceUnit.NEWTON, ForceUnit.LBF].includes(force!)
  )
    throw new Error('Unsupported production display unit.');
  return {
    ...document,
    settings: {
      ...document.settings,
      angleUnit: angle === AngleUnit.RADIAN ? ('rad' as const) : ('deg' as const),
      forceUnit: force === ForceUnit.LBF ? ('lbf' as const) : ('N' as const),
      objectScale: reader.getDecimalSetting(DecimalSetting.SCALE),
      showMajorGrid: reader.getBoolSetting(BoolSetting.IS_SHOW_MAJOR_GRID),
      showMinorGrid: reader.getBoolSetting(BoolSetting.IS_SHOW_MINOR_GRID),
      showIds: reader.getBoolSetting(BoolSetting.IS_SHOW_ID),
      defaultDrive: {
        angular:
          ((reader.getIntSetting(IntSetting.INPUT_SPEED) * Math.PI) / 30) *
          (reader.getBoolSetting(BoolSetting.IS_INPUT_CW) ? -1 : 1),
        linear: 5,
      },
    },
  };
}
