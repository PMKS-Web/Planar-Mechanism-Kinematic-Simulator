import { RealJoint } from '../../model/joint';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  frictionBearingFixture,
  frictionSliderCrankFixture,
} from '../../../test-utils/verification/friction-fixtures';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ActiveObjService } from '../active-obj.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { Checksum } from './checksum';

function changedBearingTail(tail: string[]): string {
  const built = buildMechanism(frictionBearingFixture());
  const source = { ...built, mechanismTimeStep: 0 } as unknown as MechanismService;
  const checksum = new Checksum();
  const parts = checksum
    .strip(urlGeneratorFor(source, new SettingsService()).generateUrlQuery())
    .split('.');
  const index = parts.findIndex((part) => /^[\w-]A,A,/.test(part));
  if (index < 0) throw new Error('Bearing fixture has no joint A');
  const tokens = parts[index].split(',');
  parts[index] = [...tokens.slice(0, -3), ...tail].join(',');
  return checksum.stamp(parts.join('.'));
}

describe('friction URL persistence', () => {
  for (const tail of [
    ['-1', '0~2', '1'],
    ['0~3', 'NaN', '1'],
    ['0~3', '0~2', ''],
    ['0~3', '0~2', '0'],
    ['0~1', '0~2', '1'],
  ]) {
    it(`rejects invalid friction fields ${tail.join(',')} even with a valid checksum`, () => {
      expect(() => new StringTranscoder().decodeURL(changedBearingTail(tail))).toThrow(
        'Invalid joint friction'
      );
    });
  }
  it('reads a pre-friction joint record as frictionless', () => {
    const decoder = new StringTranscoder();
    decoder.decodeURL(changedBearingTail([]));
    expect(
      decoder
        .getJoints()
        .every(
          (joint) =>
            joint.friction.staticCoefficient === 0 &&
            joint.friction.kineticCoefficient === 0 &&
            joint.friction.radius === 0
        )
    ).toBe(true);
  });
  for (const fixture of [frictionBearingFixture, frictionSliderCrankFixture]) {
    it(`round-trips ${fixture.name} without losing tiny coefficients or bearing radii`, () => {
      const built = buildMechanism(fixture());
      const contactId = fixture().friction![0].jointId;
      const joint = built.joints.find((one) => one.id === contactId) as RealJoint;
      joint.friction.staticCoefficient = 0.0000123456;
      joint.friction.kineticCoefficient = 0.0000012345;
      joint.friction.radius = 0.0000025;
      const source = { ...built, mechanismTimeStep: 0 } as unknown as MechanismService;
      const encoded = urlGeneratorFor(source, new SettingsService()).generateUrlQuery();
      const decoder = new StringTranscoder();
      decoder.decodeURL(encoded);
      const target = {
        joints: [],
        links: [],
        forces: [],
        mechanismTimeStep: 0,
      } as unknown as MechanismService;
      new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
        true
      );
      const restored = target.joints.find((one) => one.id === contactId) as RealJoint;
      expect(restored.friction.staticCoefficient).toBe(joint.friction.staticCoefficient);
      expect(restored.friction.kineticCoefficient).toBe(joint.friction.kineticCoefficient);
      expect(restored.friction.radius).toBeCloseTo(joint.friction.radius, 14);
    });
  }
});
