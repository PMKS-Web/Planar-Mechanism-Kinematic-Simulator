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

describe('friction URL persistence', () => {
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
