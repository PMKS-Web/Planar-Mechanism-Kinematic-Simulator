import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { JOINT_TYPE, LINK_TYPE } from '../../app/services/transcoding/transcoder-data';
import {
  PRODUCTION_203_PAYLOADS,
  PRODUCTION_203_TEMPLATE_IDS,
  PRODUCTION_203_WELDED_LOAD,
} from '../../test-utils/verification/production-203-payloads';

describe('frozen production 2.0.3 payloads', () => {
  const expected = {
    '4-Bar': { joints: 4, links: 3, ground: ['A', 'D'] },
    Watt_I: { joints: 7, links: 5, ground: ['A', 'G'] },
    Watt_II: { joints: 7, links: 5, ground: ['A', 'E', 'G'] },
    Stephenson_III: { joints: 7, links: 5, ground: ['A', 'D', 'G'] },
    Slider_Crank: { joints: 4, links: 3, ground: ['A', 'D'] },
  };

  for (const id of PRODUCTION_203_TEMPLATE_IDS) {
    it(`retains ${id}'s physical connectivity without modern slot fields`, () => {
      const decoder = new StringTranscoder();
      decoder.decodeURL(PRODUCTION_203_PAYLOADS[id]);
      const joints = decoder.getJoints();
      const links = decoder.getLinks();
      expect(joints).toHaveLength(expected[id].joints);
      expect(links).toHaveLength(expected[id].links);
      expect(joints.filter((joint) => joint.isGrounded).map((joint) => joint.id)).toEqual(
        expected[id].ground
      );
      expect(joints.filter((joint) => joint.isInput).map((joint) => joint.id)).toEqual(['A']);
      expect(joints.every((joint) => !joint.isSealed && !joint.carrierID)).toBe(true);
      expect(
        links.every((link) => link.jointIDs.every((id) => joints.some((j) => j.id === id)))
      ).toBe(true);
      expect(decoder.getForces()).toHaveLength(0);
    });
  }

  it('keeps the grounded slider separate from its coincident connecting-rod pin', () => {
    const decoder = new StringTranscoder();
    decoder.decodeURL(PRODUCTION_203_PAYLOADS.Slider_Crank);
    const joints = decoder.getJoints();
    const pin = joints.find((joint) => joint.id === 'C')!;
    const slider = joints.find((joint) => joint.id === 'D')!;
    expect(pin.type).toBe(JOINT_TYPE.REVOLUTE);
    expect(pin.isGrounded).toBe(false);
    expect(slider.type).toBe(JOINT_TYPE.PRISMATIC);
    expect(slider.isGrounded).toBe(true);
    expect([slider.x, slider.y]).toEqual([pin.x, pin.y]);
    expect(slider.angleRadians).toBe(0);
    expect([slider.carrierID, slider.slotJointAID, slider.slotJointBID]).toEqual(['', '', '']);
    const block = decoder.getLinks().find((link) => link.type === LINK_TYPE.PISTON)!;
    expect(block.jointIDs).toEqual(['C', 'D']);
    expect(block.mass).toBe(1);
    // This mass belongs to legacy material, not to the new massless P relationship.
    expect(block.massMoI).toBe(0);
  });

  it('retains a legacy compound override and its material load reference', () => {
    const decoder = new StringTranscoder();
    decoder.decodeURL(PRODUCTION_203_WELDED_LOAD);
    expect(
      decoder
        .getJoints()
        .filter((joint) => joint.isWelded)
        .map((joint) => joint.id)
    ).toEqual(['C']);
    const group = decoder.getLinks().find((link) => link.id === 'BCD')!;
    expect(group.subsetLinkIDs).toEqual(['BC', 'CD']);
    expect([group.mass, group.massMoI, group.xCoM, group.yCoM]).toEqual([7.25, 0.375, 2, 0.75]);
    expect(group.color).toBe('#26a69a');
    expect(group.moiIsCustom && group.comIsCustom).toBe(true);
    expect(
      decoder
        .getLinks()
        .filter((link) => !link.isRoot)
        .map((link) => link.id)
    ).toEqual(['BC', 'CD']);
    const force = decoder.getForces()[0];
    expect(decoder.getForces()).toHaveLength(1);
    expect([force.linkID, force.startX, force.startY, force.magnitude, force.isLocal]).toEqual([
      'BCD',
      2,
      0.75,
      10,
      false,
    ]);
  });
});
