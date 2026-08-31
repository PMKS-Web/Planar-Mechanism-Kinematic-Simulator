// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { LengthUnit } from '../../app/model/utils';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { LinkData, LINK_TYPE } from '../../app/services/transcoding/transcoder-data';
import { createMechanismHarness, MechanismHarness } from '../../test-utils/mechanism-harness';
import { uniformBodyOf } from '../../app/model/uniform-body';

// Auto-derived mass properties, end to end: a link left in auto follows its
// own geometry through every edit, a link somebody typed at holds still, and
// the distinction survives the URL — which is what makes it survive undo.

/** A bar from A(0,0) to B(3,4) — length 5 in user units — with the usual crank. */
function twoBarChain(harness: MechanismHarness): RealLink[] {
  const at: [number, number][] = [
    [0, 0],
    [3 * MODEL_SCALE, 4 * MODEL_SCALE],
    [8 * MODEL_SCALE, 0],
  ];
  const joints = at.map(([x, y], i) => new RevJoint('ABC'[i], x, y));
  joints[0].ground = true;
  joints[2].ground = true;
  joints[0].input = true;
  const links = [0, 1].map((i) => {
    const link = new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]]);
    joints[i].links.push(link);
    joints[i + 1].links.push(link);
    joints[i].connectedJoints.push(joints[i + 1]);
    joints[i + 1].connectedJoints.push(joints[i]);
    return link;
  });
  harness.service.joints.push(...joints);
  harness.service.links.push(...links);
  harness.service.updateMechanism();
  return links;
}

describe('auto mass properties on the editable mechanism', () => {
  it('derives MoI = mL²/12 in the stored unit, and the centroid, for an auto bar', () => {
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12; // grams, in the default cm system
    harness.service.updateMechanism();

    // A 5 cm rod of 12 g: I = 12·25/12 = 25 g·cm² = 0.025 kg·cm² as stored.
    expect(ab.massMoI).toBeCloseTo(0.025, 9);
    expect(ab.CoM.x).toBeCloseTo(1.5 * MODEL_SCALE, 9);
    expect(ab.CoM.y).toBeCloseTo(2 * MODEL_SCALE, 9);
  });

  it('keeps following the geometry after a joint moves', () => {
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    const b = harness.service.joints.find((joint) => joint.id === 'B')!;
    b.x = 6 * MODEL_SCALE;
    b.y = 8 * MODEL_SCALE;
    harness.service.updateMechanism();

    // Now a 10 cm rod: I = 12·100/12 = 100 g·cm² = 0.1 kg·cm².
    expect(ab.massMoI).toBeCloseTo(0.1, 9);
    expect(ab.CoM.x).toBeCloseTo(3 * MODEL_SCALE, 9);
  });

  it('holds a typed MoI and a placed CoM still through the same edit', () => {
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    ab.massMoI = 7;
    ab.moiIsCustom = true;
    ab.CoM.x = 0.25 * MODEL_SCALE;
    ab.CoM.y = 0.25 * MODEL_SCALE;
    ab.comIsCustom = true;
    const b = harness.service.joints.find((joint) => joint.id === 'B')!;
    b.x = 6 * MODEL_SCALE;
    harness.service.updateMechanism();

    expect(ab.massMoI).toBe(7);
    expect(ab.CoM.x).toBeCloseTo(0.25 * MODEL_SCALE, 9);
  });

  it('scales the derivation with the unit system, exactly', () => {
    // The identity MoI = m·k² must survive the unit factors, not be tuned to
    // one system: in meters the same bar stores kg·m².
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12; // kilograms now
    harness.settings.lengthUnit.next(LengthUnit.METER);
    harness.service.updateMechanism();

    // A 5 m rod of 12 kg: I = 12·25/12 = 25 kg·m².
    expect(ab.massMoI).toBeCloseTo(25, 9);
  });
});

describe('a placed center of mass rides the link', () => {
  it('keeps its offset through a translation of the whole link', () => {
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    // Place it 0.5 user units past the midpoint, along the bar.
    ab.placeCustomCoM({ x: 1.8 * MODEL_SCALE, y: 2.4 * MODEL_SCALE });
    harness.service.updateMechanism();

    const a = harness.service.joints.find((joint) => joint.id === 'A')!;
    const b = harness.service.joints.find((joint) => joint.id === 'B')!;
    a.x += 2 * MODEL_SCALE;
    b.x += 2 * MODEL_SCALE;
    harness.service.updateMechanism();

    // Stored against the link, so it moved with it — not left in the world.
    expect(ab.CoM.x).toBeCloseTo(3.8 * MODEL_SCALE, 6);
    expect(ab.CoM.y).toBeCloseTo(2.4 * MODEL_SCALE, 6);
  });

  it('turns with the link when its direction changes', () => {
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    // Half a unit off-axis from the centroid of the bar A(0,0)->B(3,4).
    const centroid = { x: 1.5 * MODEL_SCALE, y: 2 * MODEL_SCALE };
    ab.placeCustomCoM({ x: centroid.x + 0.4 * MODEL_SCALE, y: centroid.y - 0.3 * MODEL_SCALE });
    harness.service.updateMechanism();
    const before = { along: ab.comOffset!.along, across: ab.comOffset!.across };

    // Swing B so the bar points somewhere new; the offset decomposition
    // against the bar's own frame must be what holds still.
    const b = harness.service.joints.find((joint) => joint.id === 'B')!;
    b.x = -4 * MODEL_SCALE;
    b.y = 3 * MODEL_SCALE;
    harness.service.updateMechanism();

    expect(ab.comOffset!.along).toBeCloseTo(before.along, 6);
    expect(ab.comOffset!.across).toBeCloseTo(before.across, 6);
    const frameNow = uniformBodyOf(ab.joints).centroid;
    const distance = Math.hypot(ab.CoM.x - frameNow.x, ab.CoM.y - frameNow.y);
    expect(distance).toBeCloseTo(0.5 * MODEL_SCALE, 6);
  });
});

describe('a placed center of mass survives a unit change', () => {
  it('scales with the geometry instead of reading a stale offset', () => {
    // The offset is stored in model lengths; a cm→m conversion rescales the
    // joints and the point, and the offset has to be re-read from the scaled
    // point — or the next rebuild derives the CoM from stale numbers and
    // throws it a hundred times as far as the author put it.
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    ab.placeCustomCoM({ x: 1.8 * MODEL_SCALE, y: 2.4 * MODEL_SCALE });
    harness.service.updateMechanism();

    harness.service.updateLinkageUnits(LengthUnit.CM, LengthUnit.METER);
    harness.settings.lengthUnit.next(LengthUnit.METER);
    harness.service.updateMechanism();

    // cm→m divides every coordinate by 100; the placed point rides along.
    expect(ab.CoM.x).toBeCloseTo((1.8 * MODEL_SCALE) / 100, 6);
    expect(ab.CoM.y).toBeCloseTo((2.4 * MODEL_SCALE) / 100, 6);
  });
});

describe('a weightless body cannot keep a moment of inertia', () => {
  it('zeroes and re-derives the inertia when the mass goes to zero', () => {
    // The solver applies I·α whether or not there is mass, so the state
    // "weightless but resists turning" must be unrepresentable — zeroing the
    // mass zeroes the inertia and hands the field back to the shape.
    const harness = createMechanismHarness();
    const [ab] = twoBarChain(harness);
    ab.mass = 12;
    ab.massMoI = 7;
    ab.moiIsCustom = true;
    harness.service.updateMechanism();
    expect(ab.massMoI).toBe(7);

    ab.mass = 0;
    harness.service.updateMechanism();
    expect(ab.massMoI).toBe(0);
    expect(ab.moiIsCustom).toBe(false);

    // Mass returned: the inertia comes back derived, not as a stale 7.
    ab.mass = 12;
    harness.service.updateMechanism();
    expect(ab.massMoI).toBeCloseTo(0.025, 9);
  });
});

describe('the auto/custom flags in the URL', () => {
  const roundTrip = (moiIsCustom: boolean, comIsCustom: boolean) => {
    const transcoder = new StringTranscoder() as any;
    const record = new LinkData(
      true,
      LINK_TYPE.REAL,
      'AB',
      'AB',
      2,
      3,
      0.5,
      0.25,
      '#123456',
      ['A', 'B'],
      [],
      moiIsCustom,
      comIsCustom
    );
    const decoded = transcoder.decodeLink(transcoder.encodeLink(record)) as LinkData;
    expect(decoded.isRoot).toBe(true);
    expect(decoded.moiIsCustom).toBe(moiIsCustom);
    expect(decoded.comIsCustom).toBe(comIsCustom);
    expect(decoded.mass).toBe(2);
    expect(decoded.jointIDs).toEqual(['A', 'B']);
  };

  it('round-trips all four flag states through the leading character', () => {
    roundTrip(true, true);
    roundTrip(false, false);
    roundTrip(false, true);
    roundTrip(true, false);
  });

  it("reads a legacy record's Y and N as values the author chose", () => {
    // Every URL in circulation was written before auto existed; its numbers
    // are somebody's numbers, and decoding must keep them frozen.
    const transcoder = new StringTranscoder() as any;
    const legacy = 'YRAB,AB,2,3,0.5,0.25,123456,A,B,,';
    const decoded = transcoder.decodeLink(legacy) as LinkData;
    expect(decoded.isRoot).toBe(true);
    expect(decoded.moiIsCustom).toBe(true);
    expect(decoded.comIsCustom).toBe(true);
  });
});
