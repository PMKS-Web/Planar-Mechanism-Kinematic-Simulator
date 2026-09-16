// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { JointOperationContext } from '../../app/model/joint-operation-permission';
import { jointTypeAt, JointType, refuseJointType } from '../../app/model/joint-type';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';

// Gate 4: every cell of the 2x2 reachable from every other in at most two
// clicks, and each control change altering exactly one thing.
//
// The 2x2 is {does not slide, slides} x {free to turn, held rigid} = Revolute,
// Welded, Pin-in-slot, Prismatic (the Slide). It is a hypercube rather than a
// type list, which is the whole argument for two independent toggles over a
// three-way picker: neighbors are one click, diagonals are two, and no
// combination is unreachable.
//
// Where the two bits live moved in Stage 1 of
// `docs/joint-type-and-cylinder-plan.md`. Sliding used to mean "a block link
// rides this pin", and the Slide's weld sat on the pin standing beside the
// slot; a slider is one joint now, so sliding is what the joint *is* and the
// weld is `rotates` on it. Same four cells, read two new ways -- which is
// exactly the kind of change that can lose a cell without anyone noticing.

/**
 * What the refusal model cannot work out for itself. There are no cylinders in
 * a bent bar, and sliding is now a question about the joint's own class.
 */
const CONTEXT: JointOperationContext = {
  cylinders: [],
  isDriven: (joint) => joint.input,
  hasSlider: (joint) => joint instanceof PrisJoint,
};

interface Scene {
  service: ReturnType<typeof createMechanismHarness>['service'];
  active: ReturnType<typeof createMechanismHarness>['active'];
  /**
   * B, looked up by letter each time rather than held.
   *
   * A change of type replaces the joint object -- a pin becomes a `PrisJoint`
   * and back, keeping its letter -- so a reference captured before the change
   * names a joint the mechanism no longer holds, and reads the state it had
   * before. That is what made this file's first version pass on a stale copy.
   */
  b: () => RealJoint;
}

/** A---B---C, so B has two links and can therefore be welded. */
function bentBar(): Scene {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 3, 2);
  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints
        .filter((other) => other !== joint)
        .forEach((other) => joint.connectedJoints.push(other));
    });
    return link;
  };
  harness.service.joints = [a, b, c];
  harness.service.links = [wire('AB', [a, b]), wire('BC', [b, c])];
  harness.active.updateSelectedObj(b);
  return {
    service: harness.service,
    active: harness.active,
    b: () => harness.service.joints.find((joint) => joint.id === 'B') as RealJoint,
  };
}

/** Which cell of the 2x2 joint B is in, read off the model rather than the UI. */
function cellOf(scene: Scene): { slider: boolean; welded: boolean } {
  const joint = scene.b();
  return {
    slider: joint instanceof PrisJoint,
    welded: joint instanceof PrisJoint ? !joint.rotates : joint.isWelded,
  };
}

function setSlider(scene: Scene, on: boolean): void {
  if (cellOf(scene).slider === on) return;
  scene.active.updateSelectedObj(scene.b());
  scene.service.toggleSlider();
}

function setWeld(scene: Scene, on: boolean): void {
  if (cellOf(scene).welded === on) return;
  scene.active.updateSelectedObj(scene.b());
  if (on) scene.service.weldJoint();
  else scene.service.unweldSelectedJoint();
}

const CELLS: { slider: boolean; welded: boolean; type: JointType }[] = [
  { slider: false, welded: false, type: 'revolute' },
  { slider: false, welded: true, type: 'welded' },
  { slider: true, welded: false, type: 'pin-in-slot' },
  { slider: true, welded: true, type: 'prismatic' },
];

describe('the 2x2 of joint types', () => {
  it('reaches every cell from every other in at most two clicks', () => {
    for (const from of CELLS) {
      for (const to of CELLS) {
        const scene = bentBar();
        setSlider(scene, from.slider);
        setWeld(scene, from.welded);
        expect(cellOf(scene), `starting at ${from.type}`).toEqual({
          slider: from.slider,
          welded: from.welded,
        });

        let clicks = 0;
        if (cellOf(scene).slider !== to.slider) {
          setSlider(scene, to.slider);
          clicks++;
        }
        if (cellOf(scene).welded !== to.welded) {
          setWeld(scene, to.welded);
          clicks++;
        }

        expect(cellOf(scene), `${from.type} -> ${to.type}`).toEqual({
          slider: to.slider,
          welded: to.welded,
        });
        expect(clicks, `${from.type} -> ${to.type} click count`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('is the cell the type model names, in every one of the four', () => {
    // The two bits are read from two different places now, and `jointTypeAt` is
    // where the panel and the menu read them. A cell the model reads as some
    // other type is a control that would draw the wrong option chosen.
    for (const cell of CELLS) {
      const scene = bentBar();
      setSlider(scene, cell.slider);
      setWeld(scene, cell.welded);

      expect(jointTypeAt(scene.b(), CONTEXT), `${cell.type} cell`).toBe(cell.type);
    }
  });

  it('changes exactly one axis per control', () => {
    // The reason for two toggles rather than a type picker: unwelding a Slide
    // must give a Pin-in-slot, not a pin. A control that changed both axes at
    // once would still satisfy the reachability count above.
    const scene = bentBar();
    setSlider(scene, true);
    setWeld(scene, true);
    expect(cellOf(scene)).toEqual({ slider: true, welded: true });

    setWeld(scene, false);
    expect(cellOf(scene), 'unwelding a Slide leaves a Pin-in-slot').toEqual({
      slider: true,
      welded: false,
    });

    setWeld(scene, true);
    setSlider(scene, false);
    // And the other diagonal: the weld survives the slot coming off, because
    // both types are welded ones and B still has two bars to fuse. The bit has
    // to cross from `rotates` back to `isWelded` for that to hold -- it lives
    // in a different field on each side of the change.
    expect(cellOf(scene), 'un-slidering a Slide leaves a weld').toEqual({
      slider: false,
      welded: true,
    });
  });
});

describe('the Slider toggle', () => {
  it('leaves a new slider dangling rather than deciding where it is grounded', () => {
    // Slider and Ground are independent axes, so switching one must not decide
    // the other. A floating slot needs a carrier, which is geometry the drop
    // gesture supplies -- no toggle can invent one, and silently grounding it
    // would put the slot somewhere nobody chose.
    const scene = bentBar();

    setSlider(scene, true);

    const slider = scene.b();
    expect(slider).toBeInstanceOf(PrisJoint);
    expect((slider as PrisJoint).isDangling).toBe(true);
    expect(slider.ground).toBe(false);
  });

  it('gives back the slot it had, rather than building a different one', () => {
    // Turning Slider off destroys the slot, and with it every trace of where it
    // pointed. Without the stash, turning it back on rebuilds a different
    // mechanism wearing the same controls.
    const scene = bentBar();
    setSlider(scene, true);
    (scene.b() as PrisJoint).groundAt(1.1);
    scene.service.finishStructuralEdit(false);

    setSlider(scene, false);
    // The joint stays, keeping its letter; it is the sliding that goes.
    expect(scene.b()).toBeInstanceOf(RevJoint);
    expect(scene.service.joints.some((joint) => joint instanceof PrisJoint)).toBe(false);

    setSlider(scene, true);
    const restored = scene.b() as PrisJoint;

    expect(restored.ground, 'grounded again, as it was').toBe(true);
    expect(restored.slotAngle).toBeCloseTo(1.1, 9);
  });

  it('dangles again when the carrier it remembers is gone', () => {
    // The stash holds ids rather than object references precisely so this case
    // is answerable: a carrier deleted while the slider was off simply does not
    // resolve, and the answer is the same one reconcileSlots gives.
    const scene = bentBar();
    setSlider(scene, true);
    const slider = scene.b() as PrisJoint;
    const carrier = scene.service.links.find((link) => link.id === 'BC')!;
    slider.slideOn(carrier, scene.service.joints[1], scene.service.joints[2]);

    setSlider(scene, false);
    scene.service.links = scene.service.links.filter((link) => link.id !== 'BC');
    setSlider(scene, true);

    expect((scene.b() as PrisJoint).isDangling).toBe(true);
  });
});

describe('welding and the slider', () => {
  it('offers the Slide to a joint that slides', () => {
    // The fourth cell of the 2x2 had no door for a while: welding anything
    // prismatic was refused outright, because the weld had to land on the pin
    // coincident with the slot -- the object a slider no longer has.
    const scene = bentBar();
    setSlider(scene, true);

    expect(refuseJointType(scene.b(), 'prismatic', CONTEXT)).toBeUndefined();
  });

  it('holds one rider against the slot, which needs no compound to do', () => {
    // A weld fuses the bodies meeting at a joint, and needs two of them. A
    // Slide needs one: the slot is the other half of what is being held. B has
    // a bar on each side here, so the weld does build a compound -- what is
    // asserted is that the Slide is recorded as `rotates` either way, because
    // that is the bit every reader of a slider looks at.
    const scene = bentBar();
    setSlider(scene, true);
    setWeld(scene, true);

    const slider = scene.b() as PrisJoint;
    expect(slider.rotates).toBe(false);
    expect(jointTypeAt(slider, CONTEXT)).toBe('prismatic');
  });

  it('lets a Slide go back to turning in its slot', () => {
    const scene = bentBar();
    setSlider(scene, true);
    setWeld(scene, true);

    expect(refuseJointType(scene.b(), 'pin-in-slot', CONTEXT)).toBeUndefined();
    setWeld(scene, false);
    expect((scene.b() as PrisJoint).rotates).toBe(true);
  });
});
