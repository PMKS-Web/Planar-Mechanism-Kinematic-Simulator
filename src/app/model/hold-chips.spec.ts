import { RealLink } from './link';
import { RevJoint } from './joint';
import { ram, weldBracketOnto } from '../../test-utils/cylinder-graph';
import { cylindersIn } from './cylinder';
import { holdChips } from './hold-chips';

/**
 * Which held values the drawing shows, and on which span.
 *
 * The list used to be the *solver's* bars, and a member's `'length'` hold is
 * deliberately never handed to the solver (decision S5) — so a reader who
 * pressed the padlock on a barrel or a rod got Fixed in the panel, Fixed in the
 * menu, and nothing at all on the canvas. These hold the chip list to what
 * reads as held instead, and to the span each value is actually about.
 */
describe('the chips a drawing wears', () => {
  it('gives an ordinary bar one chip on its own two joints', () => {
    const bar = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0)]);
    bar.hold = 'length';
    const [chip, ...rest] = holdChips([bar], []);
    expect(rest).toHaveLength(0);
    expect(chip.id).toBe('AB');
    expect([chip.a.id, chip.b.id]).toEqual(['A', 'B']);
  });

  it('gives a member holding its length a chip on the member’s own span', () => {
    const parts = ram();
    parts.rod.hold = 'length';
    const chips = holdChips(parts.links, cylindersIn(parts.joints));

    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe(parts.rod.id);
    expect(chips[0].hold).toBe('length');
    // S to B, which is what the Rod panel's Length field states -- not A to B,
    // which is the whole part and is what the Angle is about.
    expect([chips[0].a.id, chips[0].b.id].sort()).toEqual([parts.seal.id, parts.mountB.id].sort());
  });

  it('and the barrel the same, from its mount to the mouth', () => {
    const parts = ram();
    parts.barrel.hold = 'length';
    const [chip] = holdChips(parts.links, cylindersIn(parts.joints));
    expect(chip.id).toBe(parts.barrel.id);
    expect([chip.a.id, chip.b.id].sort()).toEqual([parts.mountA.id, parts.inner.id].sort());
  });

  it('states the cylinder’s angle once, across the joints at its ends', () => {
    // One angle for the whole part (decision D10), carried by whichever member
    // the flag happens to be written on -- so it is one chip however many
    // members read as holding it, and it spans the pair a reader can see.
    const parts = ram();
    parts.barrel.hold = 'angle';
    parts.rod.hold = 'length';
    const chips = holdChips(parts.links, cylindersIn(parts.joints));

    const angles = chips.filter((chip) => chip.hold === 'angle');
    expect(angles).toHaveLength(1);
    expect([angles[0].a.id, angles[0].b.id]).toEqual([parts.mountA.id, parts.mountB.id]);
    expect(chips.filter((chip) => chip.hold === 'length')).toHaveLength(1);
  });

  it('keeps a member’s chip once its mount has been welded into a bracket', () => {
    // A welded member is a subset leaf and is not in the top-level list at all,
    // and a fixed length is just as fixed for that. Asking the cylinders rather
    // than the links is what keeps it drawn.
    const parts = ram();
    weldBracketOnto(parts, parts.mountA, parts.barrel, 'AX', { x: -3, y: 4 });
    parts.barrel.hold = 'length';
    const chips = holdChips(parts.links, cylindersIn(parts.joints));

    expect(chips.map((chip) => chip.id)).toEqual([parts.barrel.id]);
  });

  it('never reports a member twice, once as a bar and once as a member', () => {
    const parts = ram();
    parts.barrel.hold = 'length';
    parts.rod.hold = 'angle';
    const chips = holdChips(parts.links, cylindersIn(parts.joints));
    expect(chips).toHaveLength(2);
    expect(new Set(chips.map((chip) => `${chip.id}:${chip.hold}`)).size).toBe(2);
  });
});
