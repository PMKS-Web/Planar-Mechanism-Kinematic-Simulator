// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../model/joint';
import { Coord } from '../../model/coord';
import { RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { cylindersIn } from '../../model/cylinder';
import { barrelFillOf, rodFillOf } from '../../model/cylinder-skin';
import { MODEL_SCALE } from '../../model/render-scale';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../../test-utils/url-encoding';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { Checksum } from './checksum';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';

/**
 * `KR<link>`: this rod is drawn in its own color (decision S15).
 *
 * It joins `KJ` and `KF` in the 'K' family — a tagged reference to something
 * the URL already carries that has been asked to be drawn in a color of its
 * own. Unlike those two it carries no value, because there is nothing to
 * carry: a link's color has ridden the URL since the format was written, and
 * what this adds is that somebody chose it rather than the palette handing it
 * out. Every cylinder in circulation stores a rod color the skin has never
 * drawn, so without the entry a build that read those colors would repaint
 * every drawing ever shared.
 *
 * Which is also why the bytes matter here more than usual: a drawing where
 * nobody chose a rod color has to write exactly the URL it wrote before this
 * existed.
 */

const S = MODEL_SCALE;
const PALE = '#b2dfdb';

function decoded(url: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(url);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

function reencode(target: MechanismService): string {
  return encodeUrlOf(target, new SettingsService());
}

/** The mechanism itself, without the characters that check it. */
function body(url: string): string {
  return new Checksum().strip(url);
}

/** That body, checked again: how a spec hand-edits a payload and stays readable. */
function restamped(text: string): string {
  return new Checksum().stamp(text);
}

/** One cylinder on an empty grid, optionally welded into a bracket at its rod end. */
function cylinderDrawing(options: { welded?: boolean } = {}) {
  const harness = createMechanismHarness();
  const { service, active } = harness;
  service.createCylinderFrom(new Coord(0, 0), new Coord(4 * S, 0));
  const found = service.sealedStructures()[0];
  if (options.welded) {
    const end = found.mountB as RealJoint;
    service.addBarFrom(end, new Coord(end.x + S, end.y + S));
    active.updateSelectedObj(end);
    service.weldJoint();
  }
  wireGraph(service);
  return { ...harness, cylinder: service.sealedStructures()[0] };
}

describe('a rod asked for a color of its own', () => {
  it('rides the URL as one valueless entry, and comes back asking', () => {
    const drawn = cylinderDrawing();
    drawn.cylinder.rod.fill = PALE;
    drawn.cylinder.rod.ownColor = true;

    const url = reencode(drawn.service);
    expect(body(url)).toContain(`KR${drawn.cylinder.rod.id}`);
    // No '~': the color is the link's own field, which this URL already has.
    expect(body(url)).not.toContain(`KR${drawn.cylinder.rod.id}~`);

    const opened = cylindersIn(decoded(url).joints)[0];
    expect(opened.rod.ownColor).toBe(true);
    expect(rodFillOf(opened)).toBe(PALE);
    expect(barrelFillOf(opened)).toBe(barrelFillOf(drawn.cylinder));
  });

  it('writes nothing at all where nobody asked, whatever the rod stores', () => {
    // The bytes every URL in circulation already has. A fresh cylinder stores a rod
    // color, and a decoded one stores a different color from its barrel; both
    // have to say nothing, or every shared link changes color at once.
    const plain = reencode(cylinderDrawing().service);
    expect(body(plain)).not.toContain('KR');

    const strayed = cylinderDrawing();
    strayed.cylinder.rod.fill = PALE;
    expect(reencode(strayed.service)).toBe(
      // Only the rod's own `color` field moved, which the format has always
      // carried; the trailing section is untouched.
      reencode(decoded(reencode(strayed.service)))
    );
    expect(body(reencode(strayed.service))).not.toContain('KR');
  });

  it('survives being welded into a compound, as a leaf', () => {
    const drawn = cylinderDrawing({ welded: true });
    expect(drawn.cylinder.rodRoot.id, 'the rod really was swallowed').not.toBe(
      drawn.cylinder.rod.id
    );
    drawn.cylinder.rod.ownColor = true;
    drawn.cylinder.rod.fill = PALE;

    const url = reencode(drawn.service);
    expect(body(url)).toContain(`KR${drawn.cylinder.rod.id}`);
    const opened = cylindersIn(decoded(url).joints)[0];
    expect(opened.rodRoot.id).not.toBe(opened.rod.id);
    // The choice is on file and comes back on file. What is *drawn* while the
    // rod is part of a body is the body's color (decision S16) -- a welded
    // member is not a color of its own any more than an ordinary welded bar is
    // -- so the stored choice is what the URL has to carry, and it is what
    // unwelding gives back.
    expect(opened.rod.ownColor).toBe(true);
    expect(opened.rod.fill).toBe(PALE);
    expect(rodFillOf(opened)).toBe((opened.rodRoot as RealLink).fill);
  });

  it('round-trips unchanged, twice', () => {
    const drawn = cylinderDrawing();
    drawn.cylinder.rod.ownColor = true;
    drawn.cylinder.rod.fill = PALE;
    const url = reencode(drawn.service);
    expect(reencode(decoded(url))).toBe(url);
    expect(reencode(decoded(reencode(decoded(url))))).toBe(url);
  });
});

describe('what the reader refuses', () => {
  function coloredRod(): { url: string; rodId: string } {
    const drawn = cylinderDrawing();
    drawn.cylinder.rod.ownColor = true;
    return { url: reencode(drawn.service), rodId: drawn.cylinder.rod.id };
  }

  it('a rod color on a link the URL does not carry', () => {
    // Fail closed, as the lock, anchor and sibling color sections do: a
    // reference that does not resolve is a URL this build cannot honor.
    const { url, rodId } = coloredRod();
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(restamped(body(url).replace(`KR${rodId}`, 'KRZZ')))).toThrow();
  });

  it('a rod color carrying a value, which nothing writes', () => {
    const { url, rodId } = coloredRod();
    const decoder = new StringTranscoder();
    expect(() =>
      decoder.decodeURL(restamped(body(url).replace(`KR${rodId}`, `KR${rodId}~b2dfdb`)))
    ).toThrow();
  });

  it('but accepts one naming a link that is not a rod, and draws it the same', () => {
    // Deliberately not refused. Whether a link is a rod is a *structure* — a
    // sealed slot, its rider, the bar at its far end — and this validator reads
    // records. More to the point the app writes such an entry itself: unseal a
    // cylinder and the bar that was its rod keeps the color it was given, so
    // the URL goes on naming a link that is no longer a rod. Refusing would
    // leave the codec unable to read what it had just written, and the flag on
    // a plain bar draws nothing different.
    const { url, rodId } = coloredRod();
    const opened = decoded(url);
    const barrelId = cylindersIn(opened.joints)[0].barrel.id;

    const moved = restamped(body(url).replace(`KR${rodId}`, `KR${barrelId}`));
    const reopened = decoded(moved);
    const after = cylindersIn(reopened.joints)[0];
    expect(after.rod.ownColor, 'the rod was not asked').toBe(false);
    expect(rodFillOf(after)).toBe(barrelFillOf(after));
  });
});

describe('the entry is read before the seal is re-lettered', () => {
  it('keeps a recolored rod through the rename the build ends with', () => {
    // A payload whose seal arrives with an interior name has its links renamed
    // as the last step of the build (decision S9). A 'KR' entry names the rod
    // by the id the *URL* wrote, so it has to be read before that pass — after
    // it, the entry would be looking for a link that no longer answers.
    const drawn = cylinderDrawing();
    drawn.cylinder.rod.ownColor = true;
    drawn.cylinder.rod.fill = PALE;
    const demoted = demoteSeal(drawn.service);
    expect(demoted.seal, 'the fixture really is an old payload').toBe('A2');

    const url = reencode(drawn.service);
    expect(body(url)).toContain(`KR${demoted.rod}`);

    const opened = cylindersIn(decoded(url).joints)[0];
    expect(opened.seal.id, 'and the seal really was re-lettered').not.toBe('A2');
    expect(opened.rod.id).not.toBe(demoted.rod);
    expect(opened.rod.ownColor).toBe(true);
    expect(rodFillOf(opened)).toBe(PALE);
  });
});

/**
 * Put the seal's name back the way a release before this one wrote it: an
 * interior name hung off the barrel's own mount, with every link id rebuilt
 * around it. Returns the two names the URL will then carry.
 */
function demoteSeal(service: MechanismService): { seal: string; rod: string } {
  const found = service.sealedStructures()[0];
  const demoted = `${found.mountA.id}2`;
  found.seal.id = demoted;
  for (const link of service.links) {
    if (!link.joints.some((joint) => joint.id === demoted)) continue;
    link.id = link.joints
      .map((joint) => joint.id)
      .sort()
      .join('');
  }
  const rod = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.ownColor
  )!;
  return { seal: demoted, rod: rod.id };
}
