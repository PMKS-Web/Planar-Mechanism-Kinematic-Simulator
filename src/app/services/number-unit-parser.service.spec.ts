import { AngularVelocityUnit, ForceUnit, InertiaUnit, LengthUnit, MassUnit } from '../model/utils';
import { NumberUnitParserService } from './number-unit-parser.service';

describe('NumberUnitParserService mass and inertia', () => {
  const nup = new NumberUnitParserService();

  it('reads a bare number as already being in the displayed unit', () => {
    expect(nup.parseMassString('2', MassUnit.GRAM)).toEqual([true, 2]);
    expect(nup.parseInertiaString('3', InertiaUnit.KG_CM2)).toEqual([true, 3]);
  });

  it('converts mass into the displayed unit', () => {
    const [okKg, grams] = nup.parseMassString('0.5 kg', MassUnit.GRAM);
    expect(okKg).toBe(true);
    expect(grams).toBeCloseTo(500, 9);

    const [okLbm, fromPounds] = nup.parseMassString('1 lbm', MassUnit.GRAM);
    expect(okLbm).toBe(true);
    expect(fromPounds).toBeCloseTo(453.59237, 6);

    expect(nup.convertMass(1000, MassUnit.GRAM, MassUnit.KG)).toBeCloseTo(1, 12);
  });

  it('converts moment of inertia into the displayed unit', () => {
    const [okM2, kgCm2] = nup.parseInertiaString('1 kg·m²', InertiaUnit.KG_CM2);
    expect(okM2).toBe(true);
    expect(kgCm2).toBeCloseTo(10000, 6);

    // Matches ForceSolver.unitFactors: 0.45359237 kg * (0.0254 m)^2.
    const [okLbm, fromLbmIn2] = nup.parseInertiaString('1 lbm·in²', InertiaUnit.KG_CM2);
    expect(okLbm).toBe(true);
    expect(fromLbmIn2).toBeCloseTo(0.45359237 * 0.0254 * 0.0254 * 10000, 9);
  });

  it('accepts the compound suffix however it is typed', () => {
    for (const text of ['1 kg·m²', '1kg*m^2', '1 kg.m2', '1KGM2']) {
      expect(nup.parseInertiaString(text, InertiaUnit.KG_M2)).toEqual([true, 1]);
    }
  });

  it('rejects a value it cannot parse instead of guessing', () => {
    expect(nup.parseMassString('banana', MassUnit.GRAM)[0]).toBe(false);
    expect(nup.parseMassString('5 furlongs', MassUnit.GRAM)[0]).toBe(false);
    expect(nup.parseInertiaString('5 kg', InertiaUnit.KG_CM2)[0]).toBe(false);
  });

  it('converts angular velocity into RPM, the unit the setting stores', () => {
    const rpm = AngularVelocityUnit.RPM;
    expect(nup.parseAngularVelocityString('60', rpm)).toEqual([true, 60]);
    expect(nup.parseAngularVelocityString('60 RPM', rpm)).toEqual([true, 60]);

    const [okDeg, fromDeg] = nup.parseAngularVelocityString('360 deg/s', rpm);
    expect(okDeg).toBe(true);
    expect(fromDeg).toBeCloseTo(60, 9);

    const [okRad, fromRad] = nup.parseAngularVelocityString('2 rad/s', rpm);
    expect(okRad).toBe(true);
    expect(fromRad).toBeCloseTo(60 / Math.PI, 9);

    expect(nup.parseAngularVelocityString('20 bananas', rpm)[0]).toBe(false);
    expect(nup.formatValueAndUnit(20, rpm)).toBe('20.00 RPM');
  });

  it('round-trips the formatted value back through the parser', () => {
    const formatted = nup.formatValueAndUnit(453.59237, MassUnit.GRAM);
    expect(formatted).toBe('453.59 g');
    expect(nup.parseMassString(formatted, MassUnit.GRAM)).toEqual([true, 453.59]);
    expect(nup.formatValueAndUnit(1, InertiaUnit.LBM_IN2)).toBe('1.00 lbm·in²');
  });
});

describe('NumberUnitParserService force', () => {
  const nup = new NumberUnitParserService();

  it('names the unit a force is stored in, which is not the one it is shown in', () => {
    // Kilograms-force is a way of reading a magnitude, not a way of keeping
    // one: the solver's unit factors and every circulating URL are written in
    // newtons, so storage stays there and the panel converts at its own edge.
    expect(nup.storedForceUnit(LengthUnit.CM)).toBe(ForceUnit.NEWTON);
    expect(nup.storedForceUnit(LengthUnit.METER)).toBe(ForceUnit.NEWTON);
    expect(nup.storedForceUnit(LengthUnit.INCH)).toBe(ForceUnit.LBF);
  });

  it('shows a stored force in whichever unit the reader picked', () => {
    expect(nup.formatStoredForce(9.80665, LengthUnit.CM, ForceUnit.KGF)).toBe('1.00 kgf');
    expect(nup.formatStoredForce(9.80665, LengthUnit.CM, ForceUnit.NEWTON)).toBe('9.81 N');
    // English never offers kgf, and its storage unit is the one it shows.
    expect(nup.formatStoredForce(2, LengthUnit.INCH, ForceUnit.LBF)).toBe('2.00 lbf');
  });

  it('takes a typed force back to the unit storage uses', () => {
    const [ok, stored] = nup.parseStoredForce('2', LengthUnit.CM, ForceUnit.KGF);
    expect(ok).toBe(true);
    expect(stored).toBeCloseTo(2 * 9.80665, 9);

    // A suffix overrides the field's own unit, as it does everywhere else.
    const [okN, asTyped] = nup.parseStoredForce('5 N', LengthUnit.CM, ForceUnit.KGF);
    expect(okN).toBe(true);
    expect(asTyped).toBeCloseTo(5, 9);

    // And a bad number leaves the field's value alone rather than storing NaN.
    expect(nup.parseStoredForce('kgf', LengthUnit.CM, ForceUnit.KGF)[0]).toBe(false);
  });

  it('writes a torque as its force unit times the drawing\u2019s own length unit', () => {
    // Centimeters used to be the one system whose torque did not follow it:
    // a reader measuring in cm was shown a moment in meters, with a silent
    // hundredth in the middle of it. A reader who wants N·m picks SI.
    expect(nup.torqueLabel(ForceUnit.LBF, LengthUnit.INCH)).toBe('lbf·in');
    expect(nup.torqueLabel(ForceUnit.NEWTON, LengthUnit.CM)).toBe('N·cm');
    expect(nup.torqueLabel(ForceUnit.NEWTON, LengthUnit.METER)).toBe('N·m');
    expect(nup.torqueLabel(ForceUnit.KGF, LengthUnit.CM)).toBe('kgf·cm');
    expect(nup.torqueLabel(ForceUnit.KGF, LengthUnit.METER)).toBe('kgf·m');
  });

  it('converts between all three, exactly rather than through a rounded reciprocal', () => {
    expect(nup.convertForce(1, ForceUnit.LBF, ForceUnit.NEWTON)).toBeCloseTo(4.4482216152605, 12);
    expect(nup.convertForce(1, ForceUnit.KGF, ForceUnit.NEWTON)).toBeCloseTo(9.80665, 12);
    expect(nup.convertForce(9.80665, ForceUnit.NEWTON, ForceUnit.KGF)).toBeCloseTo(1, 12);
  });
});
