import './joint';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { linkArtwork, schematicLink } from './link-artwork';
import { cylinderSkinFrame } from './cylinder-skin';
import { cylindersIn } from './cylinder';
import { ram, rewire } from '../../test-utils/cylinder-graph';
import { SettingsService } from '../services/settings.service';

describe('display artwork separated from geometry', () => {
  it('changes thickness without changing points, mass, document outlines or CAD loops', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 400, 0);
    const bar = new RealLink('AB', [a, b], 12, 23);
    const original = { d: bar.d, loops: bar.outlineLoops(), points: [a.x, a.y, b.x, b.y] };
    const small = linkArtwork(bar, 20, []);
    const large = linkArtwork(bar, 200, []);
    expect(small).not.toBe(large);
    expect(bar.d).toBe(original.d);
    expect(bar.outlineLoops()).toEqual(original.loops);
    expect([a.x, a.y, b.x, b.y]).toEqual(original.points);
    expect([bar.mass, bar.massMoI]).toEqual([12, 23]);
  });

  it('places a cached compound at its current animated pose and rebuilds a deformed shape', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 400, 0);
    const c = new RevJoint('C', 400, 400);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    const body = new RealLink('ABC', [a, b, c], 0, 0, undefined, [ab, bc]);
    const first = linkArtwork(body, 40, []);
    for (const p of [a, b, c]) {
      const x = p.x;
      p.x = -p.y + 800;
      p.y = x + 600;
    }
    const moved = linkArtwork(body, 40, []);
    expect(moved).not.toBe(first);
    expect(moved).not.toMatch(/NaN|Infinity/);
    const copy = new RealLink('ABC', [a, b, c], 0, 0, undefined, [ab, bc]);
    const numbers = (path: string) => path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
    const actual = numbers(moved);
    const expected = numbers(linkArtwork(copy, 40, []));
    // Polygon union may choose a different first vertex; compare the bounds.
    expect(Math.min(...actual)).toBeCloseTo(Math.min(...expected), 4);
    expect(Math.max(...actual)).toBeCloseTo(Math.max(...expected), 4);
    c.x += 80;
    expect(linkArtwork(body, 40, [])).not.toBe(moved);
  });

  it('keeps the piston head length physical even for legacy cylinders', () => {
    const physical = SettingsService.preservedCylinderScale;
    try {
      SettingsService.preservedCylinderScale = 0;
      const parts = ram();
      const cylinder = cylindersIn(parts.joints)[0];
      const narrow = cylinderSkinFrame(cylinder, 0.01);
      const wide = cylinderSkinFrame(cylinder, 1000);
      expect(wide).toEqual(narrow);
      const before = parts.joints.map((p) => [p.x, p.y]);
      linkArtwork(parts.barrel, 20, [cylinder]);
      linkArtwork(parts.rod, 500, [cylinder]);
      expect(parts.joints.map((p) => [p.x, p.y])).toEqual(before);
    } finally {
      SettingsService.preservedCylinderScale = physical;
    }
  });

  it('leaves cylinder members to their symbols inside a schematic welded body', () => {
    const parts = ram();
    const tip = new RevJoint('X', -4, 3);
    const bracket = new RealLink('AX', [parts.mountA, tip]);
    const body = new RealLink('ABX', [...parts.barrel.joints, tip], 0, 0, undefined, [
      parts.barrel,
      bracket,
    ]);
    parts.links = [body, parts.rod];
    parts.joints.push(tip);
    rewire(parts.joints, parts.links);
    const cylinders = cylindersIn(parts.joints);
    expect(schematicLink(body, cylinders)).toContain('M 0 0 L -4 3');
    expect(schematicLink(parts.barrel, cylinders)).toBe('');
  });
});
