// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import './joint';
import { Coord } from './coord';
import { RealJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { cylindersIn } from './cylinder';
import { bodyLabelParts, labelForBody, visibleBodyName } from './body-label';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { SettingsService } from '../services/settings.service';
import { MODEL_SCALE } from './render-scale';

const S = MODEL_SCALE;

let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * S);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

// A link's id is the concatenated ids of its joints, which is a fine key and a
// poor name the moment one of those joints is a cylinder's buried inner end. N
// has no marker, no letter and no hitbox, and is left out of every count the
// app shows (D14, S11) -- but a bracket welded to a barrel mount was headed
// `Edit Link AA1D` and tagged `AA1D` on the canvas, offering a joint the reader
// had never been shown and could not find.

/** A cylinder with a bar welded to one of its two mounts. */
function weldedAt(end: 'barrel' | 'rod') {
  const harness = createMechanismHarness();
  const service = harness.service;

  service.createCylinderFrom(new Coord(-1 * S, 0), new Coord(5 * S, 0));
  const part = cylindersIn(service.joints)[0];
  const mount = (end === 'barrel' ? part.mountA : part.mountB) as RealJoint;

  const tip = new RevJoint('W', mount.x + (end === 'barrel' ? -2 : 2) * S, mount.y + 3 * S);
  service.joints.push(tip);
  service.links.push(new RealLink(mount.id + tip.id, [mount, tip]));
  service.finishStructuralEdit(true);
  harness.active.updateSelectedObj(mount);
  service.weldJoint();
  service.finishStructuralEdit(true);

  const compound = service.links.find(
    (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
  )!;
  return { ...harness, part: cylindersIn(service.joints)[0], compound, mount, tip };
}

describe('the name a reader sees on a body', () => {
  it('leaves a plain bar exactly as it is', () => {
    const { service } = createMechanismHarness();
    const bar = service.addBar(new Coord(0, 0), new Coord(3 * S, 0))!;
    service.finishStructuralEdit(true);
    expect(visibleBodyName(bar, service.sealedStructures())).toBe(bar.id);
    expect(labelForBody(bar, undefined, service.sealedStructures())).toBe(`Link ${bar.id}`);
  });

  it('leaves an ordinary welded body exactly as it is', () => {
    const harness = createMechanismHarness();
    const service = harness.service;
    const first = service.addBar(new Coord(0, 0), new Coord(3 * S, 2 * S))!;
    const elbow = first.joints[1] as RealJoint;
    service.addBarFrom(elbow, new Coord(6 * S, -1 * S));
    service.finishStructuralEdit(true);
    harness.active.updateSelectedObj(elbow);
    service.weldJoint();
    service.finishStructuralEdit(true);

    const compound = service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    expect(visibleBodyName(compound, service.sealedStructures())).toBe(compound.id);
  });

  it('drops the buried inner end from a body welded to a barrel mount', () => {
    const { service, compound, part, tip } = weldedAt('barrel');
    // The id still holds it -- it is a key, and the URL, the solver and every
    // lookup are built on it.
    expect(compound.id).toContain(part.inner.id);
    expect(compound.joints.map((joint) => joint.id)).toContain(part.inner.id);

    const shown = visibleBodyName(compound, service.sealedStructures());
    expect(shown).not.toContain(part.inner.id);
    expect(shown).toBe([part.mountA.id, tip.id].sort().join(''));
    expect(labelForBody(compound, undefined, service.sealedStructures())).toBe(`Link ${shown}`);
  });

  it('keeps the seal on a body welded to a rod mount, because a reader can see it', () => {
    // S is the other interior joint and the opposite case: it wears a letter,
    // a marker and a hitbox (decision S11), so a body holding it is named
    // after it like any other.
    const { service, compound, part } = weldedAt('rod');
    const shown = visibleBodyName(compound, service.sealedStructures());
    expect(shown).toBe(compound.id);
    expect(shown).toContain(part.seal.id);
  });

  it('hands back a name somebody typed, untouched', () => {
    const { service, compound } = weldedAt('barrel');
    compound.name = 'Bracket';
    expect(visibleBodyName(compound, service.sealedStructures())).toBe('Bracket');
    expect(labelForBody(compound, undefined, service.sealedStructures())).toBe('Link Bracket');
  });

  it('reaches a member nested one weld deeper', () => {
    // A bracket welded to a barrel mount, then welded again into a neighbor:
    // the buried end is a joint of a leaf of a leaf, and the outer body's name
    // has to lose it too.
    const { service, active, compound, tip } = weldedAt('barrel');
    const far = new RevJoint('Z', tip.x - 2 * S, tip.y + 2 * S);
    service.joints.push(far);
    service.links.push(new RealLink(tip.id + far.id, [tip, far]));
    service.finishStructuralEdit(true);
    active.updateSelectedObj(tip);
    service.weldJoint();
    service.finishStructuralEdit(true);

    const outer = service.links.find(
      (link): link is RealLink =>
        link instanceof RealLink && link.joints.some((joint) => joint.id === far.id)
    )!;
    const part = cylindersIn(service.joints)[0];
    expect(outer.id).toContain(part.inner.id);
    expect(visibleBodyName(outer, service.sealedStructures())).not.toContain(part.inner.id);
    expect(outer.subset.length).toBeGreaterThan(0);
    // And the bracket it was built from is still nameable on its own.
    expect(visibleBodyName(compound, service.sealedStructures())).not.toContain(part.inner.id);
  });

  it('names a member by its own two ends, whichever question is asked', () => {
    // Never by this rule, which on a barrel would leave the single letter of
    // its mount: the member's own two joints are A and N.
    const { service, part } = weldedAt('rod');
    const cylinders = service.sealedStructures();
    const barrel = part.barrel as RealLink;
    expect(visibleBodyName(barrel, cylinders)).toBe(`${part.mountA.id}${part.seal.id}`);
    expect(bodyLabelParts(barrel, part, cylinders)).toEqual({
      noun: 'Barrel',
      name: `${part.mountA.id}${part.seal.id}`,
    });
    expect(visibleBodyName(part.rod, cylinders)).toBe(`${part.seal.id}${part.mountB.id}`);
    expect(bodyLabelParts(part.rod, part, cylinders).noun).toBe('Rod');
  });

  it('is what the service hands every panel', () => {
    const { service, compound } = weldedAt('barrel');
    expect(service.visibleBodyName(compound)).toBe(
      visibleBodyName(compound, service.sealedStructures())
    );
    expect(service.bodyLabel(compound)).toBe(`Link ${service.visibleBodyName(compound)}`);
  });
});
