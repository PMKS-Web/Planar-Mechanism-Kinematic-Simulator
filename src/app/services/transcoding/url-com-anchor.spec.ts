import '../../model/joint';
import { Joint, RevJoint } from '../../model/joint';
import { Force } from '../../model/force';
import { ComAnchor, Link, RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * What a hand-placed centre of mass is held against travels in the same
 * trailing section the lock marks use -- tagged references to objects the URL
 * already carries, which is exactly what these are. The 'C' tag is one no lock
 * uses, so the two share a list without either being able to read the other's
 * entries.
 *
 * As with locks, the section is written only when there is something to say,
 * so a drawing whose centres all ride their own links encodes to the bytes it
 * did before any of this existed.
 */

const S = MODEL_SCALE;

function source(anchor: ComAnchor | undefined) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  if (anchor !== undefined) {
    bar.placeCustomCoM({ x: 0.5 * S, y: 0.25 * S });
    bar.comAnchor = anchor;
    bar.captureComOffset();
  }
  return { joints: [a, b], links: [bar], forces: [] as Force[] };
}

function encode(anchor: ComAnchor | undefined): string {
  return urlGeneratorFor(
    { ...source(anchor), mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function decode(encoded: string): { joints: Joint[]; links: Link[] } {
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

describe('a center-of-mass anchor in the URL', () => {
  it('round-trips holding the point on the drawing', () => {
    const opened = decode(encode('grid'));
    expect((opened.links[0] as RealLink).comAnchor).toBe('grid');
  });

  it('round-trips holding the point on one pin', () => {
    const opened = decode(encode({ joint: 'B' }));
    expect((opened.links[0] as RealLink).comAnchor).toEqual({ joint: 'B' });
  });

  it('writes nothing when every center rides its own link', () => {
    // A hand-placed centre held the way one always was records nothing: that
    // is the spelling every URL in circulation already has.
    expect(body(encode('centroid'))).not.toContain('.C');

    // The two that do record something record exactly one entry, and are
    // otherwise the same bytes -- so nothing about the format moved.
    expect(body(encode('grid'))).toBe(body(encode('centroid')) + '.CGAB');
    expect(body(encode({ joint: 'B' }))).toBe(body(encode('centroid')) + '.CJAB~B');
  });

  it('sits alongside lock marks without either reading the other', () => {
    const withBoth = source('grid');
    withBoth.joints[0].locked = true;
    const encoded = urlGeneratorFor(
      { ...withBoth, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();

    expect(body(encoded)).toContain('.JA,CGAB');
    const opened = decode(encoded);
    expect((opened.joints.find((joint) => joint.id === 'A') as RevJoint).locked).toBe(true);
    expect((opened.links[0] as RealLink).comAnchor).toBe('grid');
  });

  it('refuses an anchor on a pin the link does not hold', () => {
    // Fail closed, as the lock section does: a reference that does not resolve
    // would otherwise decode as a centre quietly held against nothing.
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode({ joint: 'B' }).replace('CJAB~B', 'CJAB~Z'))).toThrow();
    expect(() => decoder.decodeURL(encode('grid').replace('CGAB', 'CGZZ'))).toThrow();
  });

  it('opens a URL written before anchors existed with every center on its link', () => {
    const opened = decode(encode(undefined));
    expect((opened.links[0] as RealLink).comAnchor).toBe('centroid');
  });
});
