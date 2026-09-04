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
/** The mechanism itself, without the characters that check it. */
/** An edit to the mechanism, with the URL's checks brought up to date after it. */
function restamp(encoded: string, edit: (body: string) => string): string {
  const checksum = new Checksum();
  return checksum.stamp(edit(checksum.strip(encoded)));
}

function body(encoded: string): string {
  return new Checksum().strip(encoded);
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

  it("honors an 'L' reference from the earlier spelling by marking the link's joints", () => {
    // Locks briefly encoded as link references. The decoder keeps reading
    // them — as the shortcut they always were — so any URL shared during
    // that window still opens held.
    const legacyBody = body(encode()) + '.LAB';
    const legacy = new Checksum().stamp(legacyBody);
    const opened = decode(legacy);

    expect((opened.joints.find((j) => j.id === 'A') as RealJoint).locked).toBe(true);
    expect((opened.joints.find((j) => j.id === 'B') as RealJoint).locked).toBe(true);
  });

  it('refuses a lock reference to an object the URL does not contain', () => {
    // Re-stamped after the edit, so what reaches the decoder is a URL that
    // passes both of its checks and is still wrong. Corrupting one and leaving
    // the checks stale would be testing the checksum, which has its own tests
    // and its own message.
    const tampered = restamp(encode({ joint: true }), (body) => body.replace('.JA', '.JZ'));

    expect(() => decode(tampered)).toThrowError(/locks an object/);
  });
});

/**
 * A bar's hold on its length or its angle shares the trailing section, tagged
 * 'H', for the same reason the locks live there: absent means "no hold", so a
 * drawing with no holds is the URL it always was.
 */
describe('a held length or angle in the URL', () => {
  function held(hold: 'length' | 'angle' | undefined): string {
    const drawing = source();
    drawing.links[0].hold = hold;
    return urlGeneratorFor(
      { ...drawing, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();
  }

  it('round-trips a held length and a held angle', () => {
    expect((decode(held('length')).links[0] as RealLink).hold).toBe('length');
    expect((decode(held('angle')).links[0] as RealLink).hold).toBe('angle');
    expect((decode(held(undefined)).links[0] as RealLink).hold).toBeUndefined();
  });

  it('is one trailing entry, and nothing at all without a hold', () => {
    expect(body(held(undefined))).toBe(body(encode()));
    expect(body(held('length'))).toBe(body(encode()) + '.HlAB');
    expect(body(held('angle'))).toBe(body(encode()) + '.HaAB');
  });

  it('refuses a hold on a bar the URL does not contain, or on neither value', () => {
    const edited = (from: string, to: string) =>
      restamp(held('length'), (body) => body.replace(from, to));
    expect(() => decode(edited('.HlAB', '.HlAZ'))).toThrowError(/holds a length/);
    expect(() => decode(edited('.HlAB', '.HxAB'))).toThrowError(/holds a length/);
  });
});
