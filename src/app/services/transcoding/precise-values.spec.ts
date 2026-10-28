import '../../model/joint';
import { AUDIT_FIXTURES } from '../../../test-utils/verification/audit-fixtures';
import { StringTranscoder } from './string-transcoder';
import { IntSetting, DecimalSetting } from './stored-settings';
import { Checksum } from './checksum';

describe('the compatible numeric precision tail', () => {
  it('continues to decode every retained legacy audit link', () => {
    for (const fixture of AUDIT_FIXTURES) {
      const decoder = new StringTranscoder();
      decoder.decodeURL(fixture.payload);
      expect(decoder.getJoints().length, fixture.name).toBeGreaterThan(0);
      const reopened = new StringTranscoder();
      reopened.decodeURL(decoder.encodeURL());
      expect(reopened.getJoints(), fixture.name).toEqual(decoder.getJoints());
      expect(reopened.getLinks(), fixture.name).toEqual(decoder.getLinks());
      expect(reopened.getForces(), fixture.name).toEqual(decoder.getForces());
    }
  });

  it('round-trips geometry, cardinal angles, tiny properties and speeds exactly', () => {
    const encoder = new StringTranscoder();
    encoder.decodeURL(AUDIT_FIXTURES.find((fixture) => fixture.id === 38)!.payload);
    const joint = encoder.getJoints()[0];
    joint.x = 0.000123456789012345;
    joint.y = -0.00123456789012345;
    joint.angleRadians = Math.PI / 2;
    joint.driveSpeed = 0.0001;
    joint.mass = 0.00000015;
    const link = encoder.getLinks()[0];
    link.mass = 0.0015;
    link.massMoI = 0.00000001;
    link.xCoM = Math.PI / 1000;
    encoder.addIntSetting(IntSetting.INPUT_SPEED, 0.0001);
    encoder.addDecimalSetting(DecimalSetting.LINEAR_INPUT_SPEED, 0.0001);
    const decoder = new StringTranscoder();
    decoder.decodeURL(encoder.encodeURL());
    expect(decoder.getJoints()).toEqual(encoder.getJoints());
    expect(decoder.getLinks()).toEqual(encoder.getLinks());
    expect(decoder.getIntSetting(IntSetting.INPUT_SPEED)).toBe(0.0001);
    expect(decoder.getDecimalSetting(DecimalSetting.LINEAR_INPUT_SPEED)).toBe(0.0001);
  });

  it('refuses malformed, nonfinite and unknown precision corrections', () => {
    const source = AUDIT_FIXTURES.find((fixture) => fixture.id === 38)!.payload;
    const checksum = new Checksum();
    const body = checksum.digestSplit(source)!.body.slice(0, -1);
    for (const entry of ['PJmissing~0~1', 'PJA~0~NaN', 'PJA~99~1', 'PI~0~Infinity', 'PJA~0~1~2']) {
      const decoder = new StringTranscoder();
      expect(() => decoder.decodeURL(checksum.stamp(body + '.' + entry))).toThrow();
    }
  });
});
