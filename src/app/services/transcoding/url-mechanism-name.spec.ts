import '../../model/joint';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { partitionMechanisms } from '../../model/mechanism/mechanism-partition';
import {
  mechanismLabel,
  mechanismName,
  writeMechanismName,
} from '../../model/mechanism/mechanism-name';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';

/**
 * A mechanism's name is kept on one of its joints and rides the URL at the end
 * of that joint's record, so a drawing nobody named encodes exactly as before
 * and a named one comes back named.
 */

const S = MODEL_SCALE;

function crank(driven = true) {
  const a = new RevJoint('A', 0, 0, driven, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return { joints: [a, b] as Joint[], links: [bar], forces: [] };
}

function encode(drawing: ReturnType<typeof crank>): string {
  return urlGeneratorFor(
    { ...drawing, mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function decode(encoded: string): { joints: Joint[]; links: RealLink[] } {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [] as Joint[],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(true);
  return target as unknown as { joints: Joint[]; links: RealLink[] };
}

const partitionOf = (drawing: { joints: Joint[]; links: RealLink[] }) =>
  partitionMechanisms(drawing.joints, drawing.links, []).mechanisms[0];

describe('a mechanism’s name', () => {
  it('is kept on the driven joint and comes back from the URL', () => {
    const drawing = crank();
    writeMechanismName(partitionOf(drawing), '  Pump   jack ');
    expect(drawing.joints[0].machineName).toBe('Pump jack');
    const back = decode(encode(drawing));
    expect(mechanismName(partitionOf(back))).toBe('Pump jack');
    expect(mechanismLabel(partitionOf(back), 0, true)).toBe('Pump jack (M1)');
  });

  it('writes nothing for a mechanism nobody named', () => {
    const plain = encode(crank());
    const named = crank();
    writeMechanismName(partitionOf(named), 'Wiper');
    expect(encode(named)).toContain(',Wiper');
    expect(plain).not.toContain(',Wiper');
    writeMechanismName(partitionOf(named), '');
    expect(encode(named)).toBe(plain);
  });

  it('is found again when the input moves to another joint', () => {
    const drawing = crank(false);
    writeMechanismName(partitionOf(drawing), 'Arm');
    (drawing.joints[0] as RealJoint).input = false;
    (drawing.joints[1] as RealJoint).input = true;
    expect(mechanismName(partitionOf(drawing))).toBe('Arm');
    expect(mechanismLabel(partitionOf(drawing), 0)).toBe('Arm');
  });

  it('says Mechanism M1 when there is none', () => {
    expect(mechanismLabel(partitionOf(crank()), 0)).toBe('Mechanism M1');
  });

  it('keeps every library template’s URL exactly as it was', () => {
    for (const payload of Object.values(TEMPLATE_LINKAGES)) {
      const decoded = decode(payload);
      expect(decoded.joints.some((joint) => joint.machineName)).toBe(false);
    }
  });

  it('rides a slider’s record after its mass', () => {
    const slider = new PrisJoint('C', S, 0);
    slider.mass = 2;
    slider.machineName = 'Ram';
    const drawing = crank();
    drawing.joints.push(slider);
    const back = decode(encode(drawing)).joints.find((joint) => joint.id === 'C') as PrisJoint;
    expect(back.machineName).toBe('Ram');
    expect(back.mass).toBeCloseTo(2, 3);
  });
});
