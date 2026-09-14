import { TestBed } from '@angular/core/testing';
import { NativeEditorService } from './native-editor.service';
import { NativeContextMenuService } from './native-context-menu.service';
import { MechanismService } from './mechanism.service';
import { ActiveObjService } from './active-obj.service';
import { ContextMenuModel } from '../component/BLOCKS/context-menu/menu-model';
import { BodySelectionRef } from '../model/body-system/body-edit-types';
import { nativeEditableFourBar } from '../../test-utils/verification/native-geometry-fixture';
import { nativeAxialCarriage } from '../../test-utils/verification/native-cylinder-fixtures';
import { nativeCommand } from '../model/body-system/body-joint-interaction';
import { newRecordId } from '../model/body-system/body-id';

/**
 * The native right-click menu, row by row.
 *
 * Written against `ContextMenuBuilderService`'s own ladder — Attach, State,
 * Traces, destructive footer — because the two menus are meant to be one menu.
 * A row that moves group, loses its glyph or stops being a switch fails on the
 * line it moved from, which is the whole point of pinning the literal list
 * rather than counting rows.
 */
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

/** One line per row: label, glyph, switch state, and the reason it is gray. */
function shape(model: ContextMenuModel): string[] {
  return model.groups
    .filter((group) => group.rows.length > 0)
    .flatMap((group) => [
      `[${group.label ?? ''}]`,
      ...group.rows.map((row) => {
        const state = row.kind === 'toggle' ? (row.checked ? ' on' : ' off') : '';
        const glyph = row.material ? `material:${row.icon}` : row.icon;
        return `${row.label} · ${glyph}${state}${row.refusal ? ` — ${row.refusal.short}` : ''}`;
      }),
    ]);
}

it('the grid menu offers Add and Mechanism, in the public order', () => {
  const { editor, menu } = controls();
  editor.loadDocument(nativeEditableFourBar().document);
  expect(shape(menu.build(undefined, { x: 0, y: 0 }, () => undefined))).toEqual([
    '[Add]',
    'Link · new_link',
    'Cylinder · add_cylinder',
    'Background Image · background_image — not built yet',
    '[Mechanism]',
    'Lock All · lock',
    'Unlock All · unlock — nothing locked',
  ]);
});

it('a joint menu carries Attach, State, Traces and the destructive footer', () => {
  const { editor, menu } = controls(),
    fixture = nativeEditableFourBar();
  editor.loadDocument(fixture.document);
  // The driven ground pin, named rather than taken by index: which joint the
  // codec stores first is not a fact this expectation should depend on.
  const document = editor.document();
  const driven = document.drivers[0].coordinate.jointId;
  const target: BodySelectionRef = { kind: 'joint', id: driven };
  editor.select(target);
  expect(shape(menu.build(target, { x: 0, y: 0 }, () => undefined))).toEqual([
    '[Attach]',
    'Link · new_link',
    'Cylinder · add_cylinder',
    'Force · add_force',
    '[State]',
    'Grounded · add_ground on',
    'Driven Input · add_input on',
    // The drive already names this coordinate, so the model refuses to change
    // the pair's kind — the menu says so in the model's own words.
    'Slider · add_slider off — remove input or limit',
    'Welded · weld_joint off — remove input or limit',
    'Locked · lock off',
    '[Traces]',
    'Trace path · show_path off',
    // Present and gray until the analysis consumers land (S6).
    'Velocity Vectors · vector_velocity off — not built yet',
    'Acceleration Vectors · vector_acceleration off — not built yet',
    'Force Vectors · vector_force off — not built yet',
    '[]',
    'Delete Joint · remove',
    'Delete entire mechanism · delete_mechanism',
  ]);
});

it('a link menu carries Attach, State, Traces and both deletes', () => {
  const { editor, menu } = controls(),
    fixture = nativeEditableFourBar();
  editor.loadDocument(fixture.document);
  const target: BodySelectionRef = { kind: 'body', id: fixture.coupler };
  editor.select(target);
  expect(shape(menu.build(target, { x: 0, y: 0 }, () => undefined, fixture.coupler))).toEqual([
    '[Attach]',
    'Link · new_link',
    'Cylinder · add_cylinder',
    'Tracer Point · add_tracer',
    'Force · add_force',
    'Duplicate Link · material:content_copy',
    '[State]',
    'Drawn as a Disc · make_circular off',
    'Fixed Length · material:straighten off',
    'Fixed Angle · material:architecture off',
    'Locked · lock off',
    '[Traces]',
    'Velocity Vectors · vector_velocity off — not built yet',
    'Acceleration Vectors · vector_acceleration off — not built yet',
    '[]',
    'Delete Link · remove',
    'Delete entire mechanism · delete_mechanism',
  ]);
});

it('a cylinder menu drops Attach and keeps one hold, as the public one does', () => {
  const { editor, menu } = controls(),
    fixture = nativeAxialCarriage();
  editor.loadDocument(fixture.document);
  const target: BodySelectionRef = { kind: 'assembly', id: fixture.assembly.id };
  editor.select(target);
  expect(shape(menu.build(target, { x: 0, y: 0 }, () => undefined))).toEqual([
    '[State]',
    'Driven Input · add_input on',
    // A cylinder is not a bar between two joints, so the native model has no
    // dimension to hold and the row says which parts do.
    'Fixed Angle · material:architecture off — bars only',
    'Locked · lock off',
    '[Traces]',
    'Velocity Vectors · vector_velocity off — not built yet',
    'Acceleration Vectors · vector_acceleration off — not built yet',
    '[]',
    // The two mounts are part of the word "cylinder", so the row names neither.
    'Delete Cylinder · remove',
    'Delete entire mechanism · delete_mechanism',
  ]);
});

it('a force menu carries Set, State and Delete Force, and no mechanism row', () => {
  const { editor, menu } = controls(),
    fixture = nativeEditableFourBar();
  editor.loadDocument(fixture.document);
  const id = newRecordId<'force'>();
  editor.commit(
    nativeCommand({
      kind: 'insert',
      records: {
        forces: [
          {
            id,
            bodyId: fixture.coupler,
            point: { x: 0.5, y: 0 },
            label: 'Force',
            frame: 'world',
            vector: { x: 10, y: 0 },
            couple: 0,
          },
        ],
      },
    })
  );
  const target: BodySelectionRef = { kind: 'force', id };
  editor.select(target);
  expect(shape(menu.build(target, { x: 0, y: 0 }, () => undefined))).toEqual([
    '[Set]',
    'Reverse Direction · switch_force_dir',
    '[State]',
    'Global Frame · material:public on',
    'Locked · lock off',
    '[]',
    'Delete Force · remove',
  ]);
});
