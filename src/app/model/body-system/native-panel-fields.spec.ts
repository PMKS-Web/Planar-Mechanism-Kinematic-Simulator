import { bodyDiscRefusal, bodyDrawnAsDisc } from './body-disc-shape';
import {
  NATIVE_SPEED_UNITS,
  NOT_BUILT_YET,
  NativeCylinderSpan,
  nativeAngularSpeedFrom,
  nativeAngularSpeedIn,
  nativeForcePolar,
  nativeForceVector,
  nativeRounded,
  nativeScalar,
  nativeStartTravel,
  nativeStartValue,
  nativeStrokeFor,
  nativeTravelValue,
  nativeUnitLabel,
  nativeUnitText,
} from './native-panel-fields';
import { nativeMultiwayPin } from '../../../test-utils/verification/native-editor-fixtures';
import { bodyConnectionCommand, bodyConnectionPairs } from './body-connection-controls';
import { jointKindLabel } from './body-joint-marks';

describe('the Edit panel fields on the native route', () => {
  it('offers the public panel’s three speed units and converts both ways', () => {
    expect(NATIVE_SPEED_UNITS.map((option) => option.label)).toEqual(['RPM', 'deg/s', 'rad/s']);
    // One revolution a second.
    expect(nativeAngularSpeedIn(2 * Math.PI, 0)).toBeCloseTo(60, 10);
    expect(nativeAngularSpeedIn(2 * Math.PI, 1)).toBeCloseTo(360, 10);
    expect(nativeAngularSpeedIn(2 * Math.PI, 2)).toBeCloseTo(2 * Math.PI, 10);
    for (const index of [0, 1, 2])
      expect(nativeAngularSpeedFrom(nativeAngularSpeedIn(1.25, index), index)).toBeCloseTo(
        1.25,
        10
      );
    // An unrecognized index falls back to the first, which is what the picker shows.
    expect(nativeAngularSpeedIn(1, 9)).toBeCloseTo(nativeAngularSpeedIn(1, 0), 10);
  });

  it('writes a value the way every field in the public panel writes one', () => {
    expect(nativeUnitText(3.14159, 'cm')).toBe('3.14 cm');
    expect(nativeUnitText(70.669, 'deg')).toBe('71 deg');
    // Never a negative zero: the public panel's formatter guards this too.
    expect(nativeUnitText(-0.001, 'cm')).toBe('0.00 cm');
    expect(nativeRounded(67.7123)).toBe('67.71');
    expect(nativeRounded(20)).toBe('20');
  });

  it('prints a unit the document keeps as a key in the words the panel uses', () => {
    expect(nativeUnitLabel('kg*cm2')).toBe('kg·cm²');
    expect(nativeUnitLabel('kg*m2')).toBe('kg·m²');
    expect(nativeUnitLabel('lb*in2')).toBe('lbm·in²');
    expect(nativeUnitLabel('cm')).toBe('cm');
  });

  it('reads a number back through the unit the field printed beside it', () => {
    expect(nativeScalar('2')).toBe(2);
    expect(nativeScalar(' -0.5 kg ')).toBe(-0.5);
    expect(nativeScalar('3 kg*m2')).toBe(3);
    expect(nativeScalar('12.5 %')).toBe(12.5);
    expect(nativeScalar('1e3 N')).toBe(1000);
    expect(nativeScalar('')).toBeUndefined();
    expect(nativeScalar('two')).toBeUndefined();
    expect(nativeScalar('1 2')).toBeUndefined();
  });

  it('turns a force between its vector and the pair the panel asks for', () => {
    const polar = nativeForcePolar({ x: 3, y: 4 });
    expect(polar.magnitude).toBeCloseTo(5, 10);
    expect(polar.angle).toBeCloseTo(Math.atan2(4, 3), 10);
    const back = nativeForceVector(polar.magnitude, polar.angle);
    expect(back.x).toBeCloseTo(3, 10);
    expect(back.y).toBeCloseTo(4, 10);
  });

  describe('a cylinder’s one size number', () => {
    // Joint to joint is 7 with the rod a quarter of the way along a stroke of 4.
    const at: NativeCylinderSpan = { span: 7, travel: 1, lower: 0, upper: 4 };

    it('reads the stroke and the two ends of the travel', () => {
      expect(nativeTravelValue(at, 'stroke')).toBeCloseTo(4, 10);
      expect(nativeTravelValue(at, 'ret')).toBeCloseTo(6, 10);
      expect(nativeTravelValue(at, 'ext')).toBeCloseTo(10, 10);
    });

    it('writes a typed stroke or open length, and refuses a closed one', () => {
      expect(nativeStrokeFor(at, 'stroke', 5)).toBeCloseTo(5, 10);
      expect(nativeStrokeFor(at, 'ext', 9)).toBeCloseTo(3, 10);
      expect(nativeStrokeFor(at, 'ret', 5)).toBeUndefined();
      expect(NOT_BUILT_YET).toEqual({ short: 'not built yet', long: 'Not built yet.' });
    });

    it('reads Starts at as a share of the travel or as a length, and back', () => {
      expect(nativeStartValue(at, true)).toBeCloseTo(25, 10);
      expect(nativeStartValue(at, false)).toBeCloseTo(1, 10);
      expect(nativeStartTravel(at, true, 50)).toBeCloseTo(2, 10);
      expect(nativeStartTravel(at, false, 3)).toBeCloseTo(3, 10);
      // A cylinder with no travel has no share to read, and says zero rather than NaN.
      expect(nativeStartValue({ span: 7, travel: 0, lower: 0, upper: 0 }, true)).toBe(0);
    });
  });
});

describe('the joint-type choice', () => {
  const kinds = ['revolute', 'prismatic', 'pin-in-slot', 'weld'] as const;

  it('is labeled the way the plan names the four kinds', () => {
    expect(kinds.map(jointKindLabel)).toEqual(['Revolute', 'Prismatic', 'Pin-in-slot', 'Weld']);
  });

  it('turns a chosen kind into one command for the chosen pair', () => {
    const drawing = nativeMultiwayPin();
    const pairs = bodyConnectionPairs(drawing.document, {
      kind: 'junction',
      id: drawing.junction.id,
    });
    expect(pairs.length).toBeGreaterThan(1);
    for (const kind of kinds) {
      const command = bodyConnectionCommand(
        drawing.document,
        { kind: 'junction', id: drawing.junction.id },
        pairs[0],
        kind
      );
      expect(command?.operations).toHaveLength(1);
      const operation = command!.operations[0];
      expect(operation.kind).toBe('pin-pair-kind');
      expect(operation).toMatchObject({ a: pairs[0].a, b: pairs[0].b, jointKind: kind });
    }
  });

  it('has no command to offer without a pair to apply it to', () => {
    const drawing = nativeMultiwayPin();
    expect(
      bodyConnectionCommand(
        drawing.document,
        { kind: 'junction', id: drawing.junction.id },
        undefined,
        'weld'
      )
    ).toBeUndefined();
  });
});

describe('Draw as a Disc', () => {
  it('refuses a link with no fixed pin, and says so in the public panel\u2019s words', () => {
    const drawing = nativeMultiwayPin();
    const why = bodyDiscRefusal(drawing.document, drawing.members[0]);
    expect(why?.long).toContain('has no fixed pin');
    expect(bodyDrawnAsDisc(drawing.document, drawing.members[0])).toBe(false);
  });

  it('refuses a welded compound before it looks for a pin', () => {
    const drawing = nativeMultiwayPin();
    const welded = {
      ...drawing.document,
      joints: drawing.document.joints.map((joint, i) =>
        i === 0 ? { ...joint, kind: 'weld' as const, rest: { x: 0, y: 0, angle: 0 } } : joint
      ),
    };
    const why = bodyDiscRefusal(welded, drawing.members[0]);
    expect(why?.long).toContain('welded compound');
  });
});
