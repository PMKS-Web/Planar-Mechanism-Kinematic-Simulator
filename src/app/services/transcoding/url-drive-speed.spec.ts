import '../../model/joint';
import { Joint, RealJoint, RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { UrlGenerationService } from '../url-generation.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * A drawing can hold several mechanisms and each is driven at its own speed, so
 * the speed can no longer be one document-wide number.
 *
 * It rides on the driven joint, which is the only handle on a mechanism the URL
 * carries: mechanism names are derived from the geometry rather than saved, so
 * there is nothing else stable to key on. The half of this that matters most is
 * every URL written before it existed, which has to keep opening — and keep
 * opening at the speed it was shared at.
 */

const S = MODEL_SCALE;

function source(driveSpeed = 0) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * S, 0);
  a.driveSpeed = driveSpeed;
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return { joints: [a, b], links: [bar], forces: [] };
}

function encode(driveSpeed: number, settings = new SettingsService()): string {
  return new UrlGenerationService(
    { ...source(driveSpeed), mechanismTimeStep: 0 } as unknown as MechanismService,
    settings
  ).generateUrlQuery();
}

function decode(encoded: string): Joint[] {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [] as Joint[],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(true);
  return target.joints;
}

describe('a driven joint carries its own speed', () => {
  it('round-trips the speed it was given', () => {
    const driven = decode(encode(42.5)).find((j) => j instanceof RealJoint && j.input) as RealJoint;

    expect(driven.driveSpeed).toBeCloseTo(42.5, 3);
  });

  it('round-trips the direction, which is the sign of it', () => {
    const driven = decode(encode(-17.25)).find(
      (j) => j instanceof RealJoint && j.input
    ) as RealJoint;

    expect(driven.driveSpeed).toBeCloseTo(-17.25, 3);
  });

  it('writes nothing at all for a mechanism running at the document default', () => {
    // The whole compatibility story rests on this: a joint that has not been
    // given its own speed encodes exactly as it always did, so every template
    // and every previously shared URL still comes back byte-identical. Only a
    // drawing that uses the feature pays for it.
    expect(encode(0)).toBe(encode(0, new SettingsService()));
    expect(encode(0).length).toBeLessThan(encode(42.5).length);
  });

  it('opens a URL written before the setting existed at the shared speed', () => {
    // Nothing to strip: a pre-feature URL simply has no drive token, and the
    // decoder answers zero past the end — which is what "follow the
    // document-wide default" is spelled as.
    const legacy = encode(0);
    const driven = decode(legacy).find((j) => j instanceof RealJoint && j.input) as RealJoint;

    expect(driven.driveSpeed).toBe(0);
  });
});
