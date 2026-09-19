import '../../model/joint';
import { Coord } from '../../model/coord';
import { PrisJoint, RevJoint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';
import {
  cylinderHeadHalf,
  cylinderSpanLayoutFrom,
  HEAD_CLEARANCE_R,
  cylinderAtSeal,
  cylindersIn,
  derivedInterior,
} from '../../model/cylinder';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

// Models are built in internal model units (user units x MODEL_SCALE) so the
// encoded URLs carry the same user-unit numbers they always have.
const S = MODEL_SCALE;

function targetService(): MechanismService {
  return {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

/**
 * A sealed cylinder tilted off the axes, so the codec's 3-decimal user-unit
 * quantization actually perturbs the collinearity it has to preserve.
 * Proportions mirror the fixture gallery's hydraulic cylinder.
 *
 * Only the two mounts are chosen. Barrel and rod are the same length in every
 * cylinder that can exist, so the buried barrel end and the pin follow from the
 * mounts and from where in its travel the part sits — mid-stroke here, as a
 * freshly drawn ram is. Typing them instead would build a part the geometric
 * test refuses, and the round-trip below would then be checking nothing.
 */
function sealedSource(options: { sealed?: boolean; angle?: number; reversedSlot?: boolean } = {}) {
  const angle = options.angle ?? 0.31; // radians, deliberately irrational-ish
  const at = (along: number) => new Coord(along * Math.cos(angle) * S, along * Math.sin(angle) * S);

  // In user units: R is 0.15 objectScale and one objectScale is one user unit,
  // so each constant at that R is just itself scaled by 0.15.
  const CLEARANCE = HEAD_CLEARANCE_R * 0.15;
  const MOUNT_A = -4;
  const MOUNT_D = 4;
  // Through the model's own span rule rather than by hand: the body length a
  // span carries is not a constant, because the head shrinks on a short ram.
  const { stroke } = cylinderSpanLayoutFrom(MOUNT_D - MOUNT_A, 0.5, 0.15);
  const HEAD_HALF = cylinderHeadHalf(stroke + CLEARANCE, 0.15);
  const buried = MOUNT_A + stroke + CLEARANCE;

  const a = new RevJoint('A', at(MOUNT_A).x, at(MOUNT_A).y, false, true);
  const b = new RevJoint('B', at(buried).x, at(buried).y);
  const pinAlong = MOUNT_A + CLEARANCE + HEAD_HALF + stroke * 0.5;
  const c = new RevJoint('C', at(pinAlong).x, at(pinAlong).y);
  const d = new RevJoint('D', at(MOUNT_D).x, at(MOUNT_D).y);
  const slider = new PrisJoint('P', c.x, c.y);
  slider.isSealed = options.sealed ?? true;

  const barrel = new RealLink('AB', [a, b], 1, 1);
  const rod = new RealLink('CD', [c, d], 1, 1);
  const block = new Link('CP', [c, slider], 1);

  [a, b].forEach((joint) => joint.links.push(barrel));
  [c, d].forEach((joint) => joint.links.push(rod));
  c.links.push(block);
  slider.links.push(block);
  c.isWelded = true;
  // Mount first, buried end second -- the order creation writes and the order
  // the roles are read from. Reversed, this is a payload from before that was
  // promised, which the reader is what puts right.
  if (options.reversedSlot) slider.slideOn(barrel, b, a);
  else slider.slideOn(barrel, a, b);
  c.connectedJoints.push(d, slider);
  d.connectedJoints.push(c);
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  slider.connectedJoints.push(c);

  return {
    joints: [a, b, c, d, slider],
    links: [barrel, rod, block],
    forces: [],
    slider,
    pin: c,
  };
}

function encode(source: ReturnType<typeof sealedSource>): string {
  return urlGeneratorFor(
    { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function rebuild(encoded: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = targetService();
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

describe('sealed cylinder URL round-trip', () => {
  it('keeps the sealed bit through encode → decode → rebuild', () => {
    const target = rebuild(encode(sealedSource()));

    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;
    expect(slider.isSealed).toBe(true);
    expect(slider.isFloating).toBe(true);
  });

  it('decodes straight: the derivation has nothing to put back', () => {
    const target = rebuild(encode(sealedSource()));

    // The seal and the pin the rod hangs on are one joint now, so this is the
    // same lookup the slider gets above.
    const pin = target.joints.find((joint) => joint.id === 'C')!;
    const found = cylinderAtSeal(pin);
    expect(found).toBeDefined();
    expect(found!.barrel.id).toBe('AB');
    expect(found!.rod.id).toBe('CD');

    // The codec rounds to 1/1000 of a user unit, so a decoded joint can sit a
    // few ten-thousandths off the axis its mounts define. That used to be
    // measured against a collinearity tolerance the shape had to stay inside;
    // there is no such test any more, and what matters instead is that the
    // derivation run on every rebuild finds the part where it already is --
    // within the quantization, and never enough to move a joint at the six
    // decimals a write rounds to.
    const derived = derivedInterior(found!)!;
    const off = (was: { x: number; y: number }, to: { x: number; y: number }) =>
      Math.hypot(to.x - was.x, to.y - was.y);
    const quantizationBound = 0.002 * S; // a few rounding steps, generously
    expect(off(found!.inner, derived.inner)).toBeLessThanOrEqual(quantizationBound);
    expect(off(found!.seal, derived.seal)).toBeLessThanOrEqual(quantizationBound);
  });

  it('puts an old payload’s slot in mount-first order', () => {
    // A URL written before Stage 2 promises nothing about which way round its
    // slot was stored, and the roles are read straight off that order now. The
    // reader is the one place the old distance rule survives: the barrel joint
    // further from the rod's mount is the mount.
    const target = rebuild(encode(sealedSource({ reversedSlot: true })));

    const found = cylinderAtSeal(target.joints.find((joint) => joint.id === 'C')!)!;
    expect(found.mountA.id).toBe('A');
    expect(found.inner.id).toBe('B');

    // And it is the same answer the old inference gave, computed here the way
    // it was computed there.
    const fromRod = (joint: { x: number; y: number }) =>
      Math.hypot(joint.x - found.mountB.x, joint.y - found.mountB.y);
    expect(fromRod(found.mountA)).toBeGreaterThan(fromRod(found.inner));
  });

  it('leaves a slot that is already in order alone, however often it is replayed', () => {
    // Undo and redo replay URLs, so the ordering pass runs again on every step
    // of the history: a second look has to be a no-op.
    const once = rebuild(encode(sealedSource()));
    const first = cylinderAtSeal(once.joints.find((joint) => joint.id === 'C')!)!;
    expect(first.mountA.id).toBe('A');

    const twice = rebuild(encode(sealedSource({ reversedSlot: true })));
    const again = cylinderAtSeal(twice.joints.find((joint) => joint.id === 'C')!)!;
    expect(again.mountA.id).toBe('A');
    expect(again.inner.id).toBe('B');
  });

  it('leaves an unsealed welded slide unsealed — and unskinned', () => {
    const target = rebuild(encode(sealedSource({ sealed: false })));

    const slider = target.joints.find((joint) => joint.id === 'C') as PrisJoint;
    expect(slider.isSealed).toBe(false);
    // A plain slide never skins any more: sealed ⇔ skinned.
    expect(cylindersIn(target.joints)).toHaveLength(0);
  });

  it('rejects a URL that seals a joint that is not a floating slider', () => {
    const source = sealedSource();
    // Ground the slider: sealed no longer describes a cylinder's pin.
    source.slider.groundAt(0);

    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode(source))).toThrow(
      /seals a joint that is not a floating slider/
    );
  });
});
