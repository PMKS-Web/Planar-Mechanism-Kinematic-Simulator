import {
  nativeTriangleFoundation,
  nativeTripodFoundation,
} from '../../../test-utils/verification/native-triangle-foundation-fixture';
import {
  nativeFourBar,
  nativeFourBarPoint,
} from '../../../test-utils/verification/native-body-fixtures';
import { BodyDocument } from './body-document';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition, fixedBodyAdmission } from './body-admission';
import { rebaseBody } from './rebase-body';
import { BodyUnits, SI_UNITS } from './body-units';
import { fixedForceComponents } from './fixed-force-components';
import { newRecordId, WORLD } from './body-id';

function compile(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.system;
}

const ENGLISH: BodyUnits = { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' };

describe('collectively fixed native foundations', () => {
  it('separates two crank clocks without merging the two foundation materials', () => {
    for (const units of [SI_UNITS, ENGLISH])
      for (const size of [1e-8, 1, 1e8]) {
        const fixture = nativeTriangleFoundation(size, size * 1e6, units);
        const rebased = rebaseBody(fixture.document, fixture.foundations[0].body, {
          x: size * 0.8,
          y: size * -1.3,
          angle: 0.9,
        });
        for (const document of [
          fixture.document,
          rebased,
          {
            ...rebased,
            bodies: [...rebased.bodies].reverse(),
            joints: [...rebased.joints].reverse(),
          },
        ]) {
          const before = JSON.stringify(document),
            system = compile(document);
          for (const item of fixture.foundations) {
            expect(system.groups.get(item.body)!.fixed).toBe(true);
            expect(system.groupOf.get(item.body)).toBe(item.body);
            expect(system.groups.get(item.body)!.members.size).toBe(1);
            const partition = system.partitions.find((part) =>
              part.materialIds.includes(item.crank)
            )!;
            expect(partition.unknowns).toEqual([item.crank]);
            expect(partition.boundary).toEqual([item.body]);
            expect(partition.drivers.map((driver) => driver.id)).toEqual([item.driver.id]);
            expect(admitBodyPartition(system, partition).ok).toBe(true);
          }
          expect(system.partitions.length).toBe(2);
          expect(system.fixedRows.length).toBe(6);
          expect(fixedBodyAdmission(system)).toBeUndefined();
          const components = fixedForceComponents(document, system);
          expect(components.length).toBe(1);
          expect(new Set(components[0].bodies)).toEqual(
            new Set(fixture.foundations.map((item) => item.body))
          );
          expect(JSON.stringify(document)).toBe(before);
        }
      }
  });

  it('recognizes a four-body platform core, not only rigid pairs', () => {
    const fixture = nativeTripodFoundation();
    // The strut directions impose vx=0, vy+2w=0, vx+vy-2w=0 on
    // the platform. Their only common motion is zero; each strut then is still.
    for (const document of [
      fixture.document,
      {
        ...fixture.document,
        bodies: [...fixture.document.bodies].reverse(),
        joints: [...fixture.document.joints].reverse(),
      },
    ]) {
      const system = compile(document);
      for (const body of [fixture.platform, ...fixture.supports]) {
        expect(system.groups.get(body)!.fixed).toBe(true);
        expect(system.groups.get(body)!.members.size).toBe(1);
      }
      expect(system.fixedRows.length).toBe(12);
      expect(system.partitions.length).toBe(2);
      for (const part of system.partitions) {
        expect(part.unknowns.length).toBe(1);
        expect(part.boundary).toEqual([fixture.platform]);
        expect(admitBodyPartition(system, part).ok).toBe(true);
      }
    }
  });

  it('does not mistake a rocker turning point for a fixed foundation', () => {
    // At this angle the crank and coupler are collinear, so the rocker has zero
    // instantaneous velocity despite changing position on either side of the pose.
    const lengths = { ground: 4, crank: 1, coupler: 3, rocker: 2 };
    const angle = Math.acos(7 / 8);
    const fixture = nativeFourBar(lengths, angle);
    const current = nativeFourBarPoint(angle, lengths),
      before = nativeFourBarPoint(angle - 0.001, lengths),
      after = nativeFourBarPoint(angle + 0.001, lengths);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-8);
    expect(Math.hypot(after.x - current.x, after.y - current.y)).toBeGreaterThan(1e-7);
    const system = compile(fixture.document);
    expect(
      [...system.groups.values()].filter((group) => group.fixed).map((group) => group.id)
    ).toEqual([WORLD]);
    expect(system.partitions.length).toBe(1);
    expect(admitBodyPartition(system, system.partitions[0]).ok).toBe(true);
  });

  it('keeps a turning rocker movable when its ground pins belong to a collective foundation', () => {
    const foundation = nativeTriangleFoundation();
    const fourBar = nativeFourBar(undefined, Math.acos(7 / 8));
    const groundAnchors = new Map(
      fourBar.document.attachments
        .filter((item) => item.bodyId === WORLD)
        .map((item) => [item.id, foundation.foundations[item.point.x === 0 ? 0 : 1].body])
    );
    const document: BodyDocument = {
      ...foundation.document,
      bodies: [
        ...foundation.document.bodies,
        ...fourBar.document.bodies.filter((body) => body.id !== WORLD),
      ],
      attachments: [
        ...foundation.document.attachments,
        ...fourBar.document.attachments.map((item) => {
          const owner = groundAnchors.get(item.id);
          return owner ? { ...item, bodyId: owner, point: { x: 0, y: 0 } } : item;
        }),
      ],
      joints: [
        ...foundation.document.joints,
        ...fourBar.document.joints.map((joint) => ({
          ...joint,
          bodyA: groundAnchors.get(joint.frameA.attachmentId) ?? joint.bodyA,
          bodyB: groundAnchors.get(joint.frameB.attachmentId) ?? joint.bodyB,
        })),
      ],
      drivers: [...foundation.document.drivers, ...fourBar.document.drivers],
    };
    for (const candidate of [
      document,
      {
        ...document,
        joints: [...document.joints].reverse(),
        bodies: [...document.bodies].reverse(),
      },
    ]) {
      const system = compile(candidate);
      expect(system.partitions.length).toBe(3);
      expect(system.fixedRows.length).toBe(6);
      for (const body of fourBar.document.bodies.filter((item) => item.id !== WORLD))
        expect(system.groups.get(body.id)!.fixed).toBe(false);
      for (const part of system.partitions) expect(admitBodyPartition(system, part).ok).toBe(true);
    }
  });

  it('does not claim a singular straight foundation is a regular rigid core', () => {
    const fixture = nativeTriangleFoundation();
    const frames = new Set(fixture.foundations.map((item) => item.body));
    const document = {
      ...fixture.document,
      bodies: fixture.document.bodies.map((body) => ({ ...body, pose: { ...body.pose, y: 0 } })),
      attachments: fixture.document.attachments.map((item) =>
        frames.has(item.bodyId) ? { ...item, point: { ...item.point, y: 0 } } : item
      ),
    };
    const system = compile(document);
    expect(fixture.foundations.every((item) => !system.groups.get(item.body)!.fixed)).toBe(true);
    expect(system.partitions.length).toBe(1);
    expect(admitBodyPartition(system, system.partitions[0]).ok).toBe(false);
  });

  it('keeps an inconsistent apex and a fixed drive visible to admission', () => {
    const fixture = nativeTriangleFoundation();
    const bad = {
      ...fixture.document,
      attachments: fixture.document.attachments.map((item) =>
        item.id === fixture.apex.frameA.attachmentId
          ? { ...item, point: { ...item.point, x: item.point.x + 0.01 } }
          : item
      ),
      drivers: [fixture.document.drivers[0]],
    };
    const system = compile(bad);
    expect(fixture.foundations.every((item) => !system.groups.get(item.body)!.fixed)).toBe(true);
    expect(admitBodyPartition(system, system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'inconsistent',
    });
    const driven = compile({
      ...fixture.document,
      drivers: [
        ...fixture.document.drivers,
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: fixture.apex.id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: 1 },
        },
      ],
    });
    expect(fixedBodyAdmission(driven)).toBe('fixed-drive');
  });
});
