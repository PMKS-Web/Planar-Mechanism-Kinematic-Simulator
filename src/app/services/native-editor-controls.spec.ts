import { nativeEditableBar } from '../../test-utils/verification/native-geometry-fixture';
import { NATIVE_LAST_DRAWING, NATIVE_TAB_DRAWING } from './native-body-recovery';
import { emptyBodyDocument } from '../model/body-system/body-document';
import { TestBed } from '@angular/core/testing';
import { NativeEditorService } from './native-editor.service';
import { NativeContextMenuService } from './native-context-menu.service';
import { MechanismService } from './mechanism.service';
import { ActiveObjService } from './active-obj.service';
import { nativeMultiwayPin } from '../../test-utils/verification/native-editor-fixtures';
import { nativeCommand, weldedSelection } from '../model/body-system/body-joint-interaction';
import {
  bodyConnectionPairs,
  bodyConnectionCommand,
} from '../model/body-system/body-connection-controls';
import { localToWorld } from '../model/body-system/body-frame';

function controls() {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MechanismService,
        useFactory: () => {
          throw new Error('Legacy authority constructed');
        },
      },
      {
        provide: ActiveObjService,
        useFactory: () => {
          throw new Error('Legacy selection constructed');
        },
      },
    ],
  });
  return {
    editor: TestBed.inject(NativeEditorService),
    menu: TestBed.inject(NativeContextMenuService),
  };
}
afterEach(() => TestBed.resetTestingModule());
it('locks the positions at a selected pin without freezing all of its material members', () => {
  const { editor } = controls(),
    f = nativeMultiwayPin();
  editor.loadDocument(f.document);
  editor.select({ kind: 'junction', id: f.junction.id });
  expect(editor.commit(editor.lockCommand())).toBe(true);
  expect(new Set(editor.document().locks)).toEqual(new Set(f.junction.attachments));
  expect(editor.document().bodies.some((b) => b.kind === 'material' && b.locked)).toBe(false);
  expect(editor.commit(editor.lockCommand())).toBe(true);
  expect(editor.document().locks).toHaveLength(0);
});
it('a force added through a group menu belongs to the material member actually hit', () => {
  const { editor, menu } = controls(),
    f = nativeMultiwayPin();
  editor.loadDocument(f.document);
  editor.commit(
    nativeCommand({ kind: 'joint-kind', jointId: f.junction.joints[0], jointKind: 'weld' })
  );
  const target = weldedSelection(editor.document(), f.members[1]);
  editor.select(target);
  const body = editor.document().bodies.find((b) => b.id === f.members[1])!;
  const point = localToWorld(body.pose, { x: 1.3, y: 0 });
  const row = menu
    .build(target, point, () => {}, f.members[1])
    .groups.flatMap((g) => g.rows)
    .find((r) => r.label === 'Force')!;
  expect(row.disabled).toBe(false);
  row.action();
  expect(editor.document().forces).toHaveLength(1);
  expect(editor.document().forces[0].bodyId).toBe(f.members[1]);
  expect(editor.document().forces[0].point.x).toBeCloseTo(1.3, 12);
  expect(editor.document().forces[0].point.y).toBeCloseTo(0, 12);
});
it('menu and panel kind commands quote the same driven-coordinate refusal', () => {
  const { editor, menu } = controls(),
    f = nativeMultiwayPin();
  editor.loadDocument(f.document);
  const target = { kind: 'joint' as const, id: f.junction.joints[0] };
  editor.select(target);
  editor.apply({
    kind: 'add-driver',
    coordinate: { jointId: target.id, coordinate: 'angle' },
    speed: 1,
  });
  const command = bodyConnectionCommand(
    editor.drawing(),
    target,
    bodyConnectionPairs(editor.document(), target)[0],
    'weld'
  )!;
  const result = editor.preview(command);
  expect(result.ok).toBe(false);
  const row = menu
    .build(target, { x: 0, y: 0 }, () => {})
    .groups.flatMap((g) => g.rows)
    .find((r) => r.label === 'Weld')!;
  expect(row.disabled).toBe(true);
  if (!result.ok) expect(row.refusal?.long).toBe(result.message);
});

it('an empty native startup leaves the existing recovery copies available', () => {
  const { editor } = controls(),
    f = nativeMultiwayPin();
  editor.loadDocument(f.document);
  const saved = editor.document();
  const tab = sessionStorage.getItem(NATIVE_TAB_DRAWING),
    persistent = localStorage.getItem(NATIVE_LAST_DRAWING);
  editor.loadDocument(emptyBodyDocument(), false);
  expect(sessionStorage.getItem(NATIVE_TAB_DRAWING)).toBe(tab);
  expect(localStorage.getItem(NATIVE_LAST_DRAWING)).toBe(persistent);
  editor.recover();
  expect(editor.document()).toEqual(saved);
});

it('nudging an attachment reshapes its bound endpoint without translating the other end', () => {
  const { editor } = controls(),
    f = nativeEditableBar();
  editor.loadDocument(f.document);
  editor.select({ kind: 'attachment', id: f.b });
  const before = editor.document();
  editor.nudge(1, 0);
  expect(editor.document().attachments.find((a) => a.id === f.a)).toEqual(
    before.attachments.find((a) => a.id === f.a)
  );
  expect(editor.document().attachments.find((a) => a.id === f.b)!.point.x).toBeGreaterThan(
    before.attachments.find((a) => a.id === f.b)!.point.x
  );
  expect(editor.store.undoDepth).toBe(1);
});
