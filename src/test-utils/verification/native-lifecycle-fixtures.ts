import { BodyDocument, emptyBodyDocument } from '../../app/model/body-system/body-document';
import { BodyFactory } from '../../app/model/body-system/body-factory';
import { BodyEditContext, BodyEditOperation } from '../../app/model/body-system/body-edit-types';
import { planBodyEdit } from '../../app/model/body-system/body-edit-plan';
import { createBodyCylinder } from '../../app/model/body-system/cylinder-factory';
import { CylinderAssembly } from '../../app/model/body-system/assembly-record';
import { BodyId, WORLD } from '../../app/model/body-system/body-id';

export const NATIVE_EDIT_CONTEXT: BodyEditContext = {
  selection: [],
  state: {
    mode: 'edit',
    playing: false,
    atStart: true,
    sharedStepZero: true,
    solveDeferred: false,
    empty: false,
    runnable: false,
  },
};
export function executeNativeEdit(
  document: BodyDocument,
  operations: readonly BodyEditOperation[],
  id = 'fixture-edit'
): BodyDocument {
  const plan = planBodyEdit(document, 0, { id, operations }, NATIVE_EDIT_CONTEXT);
  if (!plan.ok) throw new Error(JSON.stringify(plan));
  return plan.document;
}
export function insertNativeFixture(document: BodyDocument): BodyDocument {
  const { version, units, ...records } = document;
  return executeNativeEdit(
    emptyBodyDocument(units),
    [
      {
        kind: 'insert',
        records: { ...records, bodies: records.bodies.filter((body) => body.id !== WORLD) },
      },
    ],
    'fixture-insert'
  );
}
export function nativeThreeCylinders(order: readonly number[] = [0, 1, 2]) {
  let document = emptyBodyDocument();
  const cylinders: CylinderAssembly[] = [];
  for (const index of order) {
    const cylinder = createBodyCylinder(
      document,
      { x: 0, y: 0, angle: 0.3 + index * 0.7 },
      { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
      0.4,
      `Ram ${index}`
    );
    document = cylinder.document;
    cylinders[index] = cylinder.assembly;
  }
  const f = new BodyFactory(document);
  const pin = f.junction(
    order.map((index) => cylinders[index].barrel),
    { x: 0, y: 0 }
  );
  return { document: insertNativeFixture(f.document), cylinders, pin };
}
export function nativeThreeLeaves(order: readonly number[] = [0, 1, 2]) {
  const f = new BodyFactory(),
    members: BodyId[] = [];
  for (const index of order)
    members[index] = f.body(`Member ${index}`, { x: index, y: 0, angle: 0.2 * index }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  const links = [
    f.joint(
      'weld',
      f.attachment(members[0], { x: 0, y: 0 }),
      f.attachment(members[1], { x: 0, y: 0 })
    ),
    f.joint(
      'weld',
      f.attachment(members[1], { x: 0, y: 0 }),
      f.attachment(members[2], { x: 0, y: 0 })
    ),
  ];
  return {
    document: insertNativeFixture({
      ...f.document,
      groups: [
        {
          members,
          frameBody: members[0],
          label: 'Custom group',
          presentation: { fill: '#26a69a', hidden: false, showCenter: true },
        },
      ],
    }),
    members,
    links,
  };
}

export function nativeCrossedCylinders() {
  const first = createBodyCylinder(
    emptyBodyDocument(),
    { x: 0, y: 0, angle: 0.2 },
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    0.4
  );
  const second = createBodyCylinder(
    first.document,
    { x: 5, y: 2, angle: 0.7 },
    { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
    0.6
  );
  const f = new BodyFactory(second.document);
  const brackets = [0, 1, 2].map((index) =>
    f.body(`Bracket ${index}`, { x: index * 3, y: 2, angle: index * 0.3 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ])
  );
  f.joint('weld', f.attachment(brackets[0], { x: 0, y: 0 }), first.assembly.barrelMount);
  f.joint('weld', f.attachment(brackets[1], { x: 0, y: 0 }), first.assembly.rodMount);
  f.joint('weld', f.attachment(brackets[1], { x: 0, y: 0 }), second.assembly.barrelMount);
  f.joint('weld', f.attachment(brackets[2], { x: 0, y: 0 }), second.assembly.rodMount);
  return {
    document: insertNativeFixture(f.document),
    first: first.assembly,
    second: second.assembly,
    brackets,
  };
}
