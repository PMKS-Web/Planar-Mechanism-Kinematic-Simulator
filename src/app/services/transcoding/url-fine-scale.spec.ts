import '../../model/joint';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

// Every decimal rides the URL in thousandths, so an object scale of 0.0001 --
// which Custom Object Size accepts -- used to come back from undo, redo or a
// shared link as zero, and the joints vanished with it (fine-scale.ts).

const S = MODEL_SCALE;

function source() {
  const a = new RevJoint('A', 0, 0, false, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return { joints: [a, b], links: [bar], forces: [] };
}

function encode(): string {
  return urlGeneratorFor(
    { ...source(), mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function decode(encoded: string): void {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(true);
}

/** Write the drawing at these user-unit scales, scramble them, and read it back. */
function roundTrip(scale: number, cylinderScale = 0) {
  SettingsService._objectScale.next(scale * S);
  SettingsService.preservedCylinderScale = cylinderScale * S;
  const url = encode();
  SettingsService._objectScale.next(1 * S);
  SettingsService.preservedCylinderScale = 0;
  decode(url);
  return {
    url,
    scale: SettingsService.objectScale / S,
    cylinderScale: SettingsService.preservedCylinderScale / S,
  };
}

describe('a small object scale in the URL', () => {
  const originalScale = SettingsService.objectScale;
  const originalCylinderScale = SettingsService.preservedCylinderScale;
  afterEach(() => {
    SettingsService._objectScale.next(originalScale);
    SettingsService.preservedCylinderScale = originalCylinderScale;
  });

  it('survives the trip instead of coming back as zero', () => {
    expect(roundTrip(0.0001).scale).toBeCloseTo(0.0001, 9);
  });

  it('keeps the smallest size the panel accepts, to the figures it shows', () => {
    expect(roundTrip(0.00000123).scale).toBeCloseTo(0.00000123, 11);
  });

  it('keeps a small cylinder clearance too, which a unit conversion can reach alone', () => {
    const read = roundTrip(0.5, 0.0004);
    expect(read.scale).toBe(0.5);
    expect(read.cylinderScale).toBeCloseTo(0.0004, 9);
  });

  it('writes an ordinary scale exactly as before, character for character', () => {
    // The fine tokens are zeros the encoder trims, so the URL is the one the
    // app wrote before they existed: two decimal settings, scale and speed.
    const { url, scale } = roundTrip(0.75);
    expect(scale).toBe(0.75);
    expect(url.split('.')[1].split(',').length).toBe(2);
  });
});
