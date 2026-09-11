import { BodyFactory } from './body-factory';
import { BodyDocument, emptyBodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { rotate, cross } from './body-frame';
import { BodyUnits, SI_UNITS, unitFactors } from './body-units';
import { compileBodyDocument } from './constraint-compiler';
import { fixedJointBodyWrench, solveFixedForceComponents } from './fixed-force-snapshot';

describe('fixed material moment precision', () => {
  it('uses local material geometry for a distant WORLD weld, including a body-local CoM override', () => {
    for (const units of [
      SI_UNITS,
      { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
    ] as BodyUnits[])
      for (const offset of [0, 1e9])
        for (const overridden of [false, true]) {
          const factors = unitFactors(units),
            f = new BodyFactory(emptyBodyDocument(units));
          const pose = { x: offset / factors.length, y: -offset / factors.length, angle: 0.4 };
          const body = f.body('distant bracket', pose, [
            { x: 0, y: 0 },
            { x: 1 / factors.length, y: 0 },
          ]);
          const weld = f.joint(
            'weld',
            f.attachment(WORLD, pose),
            f.attachment(body, { x: 0, y: 0 })
          );
          const mass = overridden ? 4 : 2,
            center = overridden ? { x: 0.2, y: 0.1 } : { x: 0.5, y: 0 };
          const document: BodyDocument = {
            ...f.document,
            bodies: f.document.bodies.map((record) =>
              record.kind === 'material'
                ? {
                    ...record,
                    mass: { ...record.mass, mass: { mode: 'explicit', value: 2 / factors.mass } },
                  }
                : record
            ),
            groups: overridden
              ? [
                  {
                    members: [WORLD, body],
                    frameBody: body,
                    mass: {
                      mass: 4 / factors.mass,
                      center: {
                        point: { x: 0.2 / factors.length, y: 0.1 / factors.length },
                        editAnchor: 'body',
                      },
                    },
                  },
                ]
              : [],
            forces: [
              {
                id: newRecordId<'force'>(),
                bodyId: body,
                point: { x: 0.3 / factors.length, y: -0.2 / factors.length },
                vector: { x: 3 / factors.force, y: -7 / factors.force },
                couple: 1 / (factors.force * factors.length),
                frame: 'world',
                label: 'offset force and couple',
              },
            ],
          };
          const compilation = compileBodyDocument(document);
          if (!compilation.ok) throw new Error(JSON.stringify(compilation.issues));
          const result = solveFixedForceComponents(document, compilation.system, 0, [], {
            mode: 'static',
            gravity: { x: 0, y: -9.81 },
          });
          const reaction = fixedJointBodyWrench(result, weld.id, body);
          if (!reaction.ok) throw new Error(reaction.reason);
          const appliedMoment =
            cross(rotate({ x: 0.3, y: -0.2 }, 0.4), { x: 3, y: -7 }) +
            1 +
            cross(rotate(center, 0.4), { x: 0, y: -mass * 9.81 });
          expect(reaction.value.force.x).toBeCloseTo(-3, 9);
          expect(reaction.value.force.y).toBeCloseTo(7 + mass * 9.81, 9);
          expect(
            reaction.value.moment,
            `offset ${offset}, override ${overridden}, unit ${units.length}`
          ).toBeCloseTo(-appliedMoment, 9);
        }
  });
});
