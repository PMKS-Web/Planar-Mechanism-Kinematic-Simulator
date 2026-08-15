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
  bar.locked = locks.link ?? false;
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
  it('round-trips a locked joint, link, and force', () => {
    const opened = decode(encode({ joint: true, link: true, force: true }));

    expect((opened.joints.find((j) => j.id === 'A') as RealJoint).locked).toBe(true);
    expect((opened.joints.find((j) => j.id === 'B') as RealJoint).locked).toBe(false);
    expect(opened.links.find((l) => l.id === 'AB')!.locked).toBe(true);
    expect(opened.forces.find((f) => f.id === 'F1')!.locked).toBe(true);
  });

  it('writes nothing at all when nothing is locked', () => {
    // The compatibility claim, stated as bytes: a locked URL is the unlocked
    // URL plus one trailing section. Every URL shared before locks existed IS
    // the unlocked spelling, so it decodes exactly as it always did.
    expect(body(encode({ joint: true }))).toBe(body(encode()) + '.JA');
    expect(body(encode({ joint: true, link: true, force: true }))).toBe(
      body(encode()) + '.JA,LAB,FF1'
    );
  });

  it('opens a URL written before locks existed with nothing locked', () => {
    const opened = decode(encode());

    expect(opened.joints.every((j) => !(j as RealJoint).locked)).toBe(true);
    expect(opened.links.every((l) => !l.locked)).toBe(true);
    expect(opened.forces.every((f) => !f.locked)).toBe(true);
  });

  it('refuses a lock reference to an object the URL does not contain', () => {
    // Same length, so the length-only checksum still passes and the reference
    // check is what has to catch it.
    const tampered = encode({ joint: true }).replace('.JA', '.JZ');

    expect(() => decode(tampered)).toThrowError(/locks an object/);
  });
});
