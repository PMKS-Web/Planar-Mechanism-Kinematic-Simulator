import '../../model/joint';
import { Joint, RevJoint } from '../../model/joint';
import { Force } from '../../model/force';
import { Link, RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * Whether a link is drawn as a disc rides in the link record's leading
 * character, alongside root-ness and the two auto/custom mass flags. There is
 * nowhere behind it to append to -- the record's tail is a variable-length list
 * of joint ids -- so the flag had to go into the one slot that is fixed width.
 *
 * The compatibility claim, and the reason it is worth stating in bytes: the
 * eight legacy characters keep their exact meanings, and the eight new ones are
 * reached only by a link someone actually asked to draw round. A drawing with
 * no circular link in it therefore encodes to the same bytes it always did.
 */

const S = MODEL_SCALE;

function source(round: boolean) {
  const ground = new RevJoint('A', 0, 0, true, true);
  const throwPin = new RevJoint('B', 2 * S, 0);
  const crank = new RealLink('AB', [ground, throwPin], 1, 1);
  [ground, throwPin].forEach((joint) => joint.links.push(crank));
  ground.connectedJoints.push(throwPin);
  throwPin.connectedJoints.push(ground);
  crank.isCircle = round;
  return { joints: [ground, throwPin], links: [crank], forces: [] as Force[] };
}

function encode(round: boolean): string {
  return urlGeneratorFor(
    { ...source(round), mechanismTimeStep: 0 } as unknown as MechanismService,
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

describe('a circular link in the URL', () => {
  it('round-trips the choice, and opens already drawn as a disc', () => {
    const opened = decode(encode(true));
    const crank = opened.links.find((link) => link.id === 'AB') as RealLink;

    expect(crank.isCircle).toBe(true);
    // Not merely flagged: built as the disc. Joints are decoded before links
    // are, so the ground pin is known and the outline never has to be a bar
    // first and corrected afterwards.
    expect(crank.d.match(/A /g)?.length).toBe(2);
    expect(crank.externalLines).toEqual([]);
  });

  it('leaves a drawing of ordinary bars byte-for-byte as it was', () => {
    // One character differs between the two spellings, and it is the link
    // record's first -- so nothing about the format moved.
    const asBar = encode(false);
    const asDisc = encode(true);

    expect(asBar.length).toBe(asDisc.length);
    const at = [...asBar].findIndex((char, i) => char !== asDisc[i]);
    expect([...asBar].filter((char, i) => char !== asDisc[i]).length).toBe(1);
    // 'A' is root with both mass properties following the shape; '1' is that
    // same link, drawn round. The pairing is the table's, not this test's.
    expect(asBar[at]).toBe('A');
    expect(asDisc[at]).toBe('1');
    expect(decode(asBar).links.every((link) => !(link as RealLink).isCircle)).toBe(true);
  });

  it('refuses a link flag character it does not know', () => {
    // Fail closed, as the format already did: a record from some future
    // spelling must reject the URL rather than decode as a link nobody drew.
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode(true).replace('1R', '$R'))).toThrow();
  });
});
