import '../../model/joint';
import { Coord } from '../../model/coord';
import { Joint, RealJoint, RevJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import { Force } from '../../model/force';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { Checksum } from './checksum';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * Lock marks ride the URL in a trailing optional section — type-tagged ids,
 * written only when something is locked. That placement is the whole
 * compatibility story: the joint flag character is full (six flags exactly
 * fill one base-64 character), so the marks could not become a seventh flag
 * without re-cutting every shared URL, and a section no legacy URL has is the
 * extension pattern this format already used for slots and drive speeds.
 */

const S = MODEL_SCALE;

function source(locks: { joint?: boolean; link?: boolean; force?: boolean } = {}) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  const force = new Force('F1', bar, new Coord(1 * S, 0), new Coord(1 * S, 1 * S));
  bar.forces.push(force);

  a.locked = locks.joint ?? false;
  // "Locking a link" is a shortcut that marks each of its joints — the URL
  // carries the joint marks it leaves behind.
  if (locks.link) {
    a.locked = true;
    b.locked = true;
  }
  force.locked = locks.force ?? false;
  return { joints: [a, b], links: [bar], forces: [force] };
}

function encode(locks: Parameters<typeof source>[0] = {}): string {
  return urlGeneratorFor(
    { ...source(locks), mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function decode(encoded: string): { joints: Joint[]; links: Link[]; forces: Force[] } {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [] as Joint[],
    links: [] as Link[],
    forces: [] as Force[],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(true);
  return target;
}

/** The URL minus its checksum character, which is a function of length alone. */
function body(encoded: string): string {
  return encoded.substring(0, encoded.length - 1);
}

describe('lock marks in the URL', () => {
  it('round-trips locked joints and a locked force', () => {
    const opened = decode(encode({ link: true, force: true }));

    expect((opened.joints.find((j) => j.id === 'A') as RealJoint).locked).toBe(true);
    expect((opened.joints.find((j) => j.id === 'B') as RealJoint).locked).toBe(true);
    expect(opened.forces.find((f) => f.id === 'F1')!.locked).toBe(true);

    const partial = decode(encode({ joint: true }));
    expect((partial.joints.find((j) => j.id === 'A') as RealJoint).locked).toBe(true);
    expect((partial.joints.find((j) => j.id === 'B') as RealJoint).locked).toBe(false);
  });

  it('writes nothing at all when nothing is locked', () => {
    // The compatibility claim, stated as bytes: a locked URL is the unlocked
    // URL plus one trailing section. Every URL shared before locks existed IS
    // the unlocked spelling, so it decodes exactly as it always did.
    expect(body(encode({ joint: true }))).toBe(body(encode()) + '.JA');
    expect(body(encode({ link: true, force: true }))).toBe(body(encode()) + '.JA,JB,FF1');
  });

  it('opens a URL written before locks existed with nothing locked', () => {
    const opened = decode(encode());

    expect(opened.joints.every((j) => !(j as RealJoint).locked)).toBe(true);
    expect(opened.forces.every((f) => !f.locked)).toBe(true);
  });

  it("honours an 'L' reference from the earlier spelling by marking the link's joints", () => {
    // Locks briefly encoded as link references. The decoder keeps reading
    // them — as the shortcut they always were — so any URL shared during
    // that window still opens held.
    const legacyBody = body(encode()) + '.LAB';
    const legacy = legacyBody + new Checksum().generateChecksum(legacyBody.length);
    const opened = decode(legacy);

    expect((opened.joints.find((j) => j.id === 'A') as RealJoint).locked).toBe(true);
    expect((opened.joints.find((j) => j.id === 'B') as RealJoint).locked).toBe(true);
  });

  it('refuses a lock reference to an object the URL does not contain', () => {
    // Same length, so the length-only checksum still passes and the reference
    // check is what has to catch it.
    const tampered = encode({ joint: true }).replace('.JA', '.JZ');

    expect(() => decode(tampered)).toThrowError(/locks an object/);
  });
});
