// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { sealedCylinders } from '../../app/model/cylinder';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SettingsService } from '../../app/services/settings.service';
import { MODEL_SCALE } from '../../app/model/render-scale';

const S = MODEL_SCALE;

let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * S);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

// Two questions a body can be asked about a ram, and they have different
// answers for exactly one kind of body: a bracket welded to a mount.
//
//   "Is anything under here part of a ram?"  -- what a delete, a drag or a
//   copy has to know, because missing one tears the ram it was carrying.
//
//   "Is this body the ram?"                  -- what everything that *names* a
//   body has to know.
//
// Until a mount could be welded, no compound ever held a cylinder leaf, so the
// two could not be told apart and one method answered both. Now one does, and
// the naming surfaces were all answering with the ram: the bracket opened the
// cylinder's panel, wore "Cylinder AB · Barrel and rod" as its menu title, and
// offered a Delete Cylinder that took the ram and left the bracket standing --
// while Delete on that same selection took the whole body.

function boomWithABracket() {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-4 * S, 0), new Coord(2 * S, 0));
  const ram = sealedCylinders(service.joints)[0];
  const mount = ram.rodFar as RealJoint;

  const tip = new RevJoint('W', mount.x + 2 * S, mount.y + 3 * S);
  service.joints.push(tip);
  service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
  service.finishStructuralEdit(true);
  harness.active.updateSelectedObj(mount);
  service.weldJoint();
  service.finishStructuralEdit(true);

  const compound = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  )!;
  return { ...harness, ram: sealedCylinders(service.joints)[0], compound, tip };
}

describe('a bracket welded to a cylinder mount', () => {
  it('is carrying a ram and is not one', () => {
    const { service, compound, ram } = boomWithABracket();

    // Compared by the bar they name: resolving the structures builds a fresh
    // Cylinder each time, so two answers about one ram are equal and not the
    // same object.
    expect(service.cylinderAt(compound)?.barrel.id).toBe(ram.barrel.id);
    expect(service.cylinderOfBar(compound)).toBeUndefined();

    // The ram's own bars answer both the same way, which is why nothing else
    // ever had to tell the questions apart.
    [ram.barrel, ram.rod, ram.block].forEach((bar) => {
      expect(service.cylinderAt(bar)?.barrel.id).toBe(ram.barrel.id);
      expect(service.cylinderOfBar(bar)?.barrel.id).toBe(ram.barrel.id);
    });
  });

  it('is named after itself, and the ram after the ram', () => {
    const { service, compound, ram } = boomWithABracket();

    // A compound is a link with its own name. The ram's two bars are named as
    // what they are, from the ram's mounts -- never as "Link AA1", which names
    // a joint a reader cannot even click.
    expect(service.bodyLabel(compound)).toBe(`Link ${compound.id}`);
    expect(service.bodyLabel(ram.barrel)).toBe('Barrel AB');
    expect(service.bodyLabel(ram.rod)).toBe('Rod AB');
  });

  it('does not light up when the ram beside it is chosen, or the other way round', () => {
    const { service, active, compound, ram } = boomWithABracket();

    active.updateSelectedObj(ram.barrel as RealLink);
    expect(service.isSelectedBody(ram.rod)).toBe(true);
    expect(service.isSelectedBody(compound)).toBe(false);

    active.updateSelectedObj(compound);
    expect(service.isSelectedBody(compound)).toBe(true);
    expect(service.isSelectedBody(ram.barrel)).toBe(false);
  });

  it('takes the ram with it when the body is deleted', () => {
    const { service, active, compound } = boomWithABracket();
    active.updateSelectedObj(compound);
    service.deleteLink();
    service.finishStructuralEdit(true);

    // Deleting the body takes the ram: a ram with no rod is not a ram, and
    // leaving one behind is what the carrying question is there to prevent.
    expect(sealedCylinders(service.joints).length).toBe(0);
    expect(service.links.length).toBe(0);
  });

  it('leaves the ram alone when the ram is what was deleted', () => {
    const { service, ram, compound, tip } = boomWithABracket();
    service.deleteCylinder(ram);
    service.finishStructuralEdit(true);

    // The bracket survives on its own, and it is a plain bar again rather than
    // a compound with a missing leaf.
    expect(sealedCylinders(service.joints).length).toBe(0);
    expect(service.links.length).toBe(1);
    expect(service.links[0].joints.some((joint) => joint.id === tip.id)).toBe(true);
    expect((service.links[0] as RealLink).subset.length).toBe(0);
    expect(service.links[0].id).not.toBe(compound.id);
  });
});
