import { nativeShellBoom } from '../../../../test-utils/verification/native-shell-fixtures';
import { TestBed } from '@angular/core/testing';
import { NativeEditorService } from '../../native-editor.service';
import { NativePlaybackService } from '../../native-playback.service';
import { NativeChromeMechanismService } from './native-chrome-mechanism.service';
import { NativeSettingsService } from './native-settings.service';
import { NativeSettingsCommandsService } from './native-settings-commands.service';
import { NativeChromeProjectService } from './native-chrome-project.service';
import { NativeChromeSelectionService } from './native-chrome-selection.service';
import { NativeEditorSessionService } from '../../native-editor-session.service';
import { CHROME_PROJECT } from '../chrome-project';
import { SvgGridService } from '../../svg-grid.service';
import { MechanismService } from '../../mechanism.service';
import { nativeLoadedRod } from '../../../../test-utils/verification/native-force-fixtures';
import { NATIVE_TAB_DRAWING, NATIVE_LAST_DRAWING } from '../../native-body-recovery';
import { WORLD } from '../../../model/body-system/body-id';
import { LengthUnit, ForceUnit } from '../../../model/unit-enums';
import { decodeBodyDocument, encodeBodyDocument } from '../../transcoding/body-document-codec';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MechanismService,
        useFactory: () => {
          throw new Error('Legacy authority constructed');
        },
      },
      { provide: SvgGridService, useValue: { scaleToFitLinkage: vi.fn() } },
      { provide: CHROME_PROJECT, useExisting: NativeChromeProjectService },
    ],
  });
  const editor = TestBed.inject(NativeEditorService);
  const playback = TestBed.inject(NativePlaybackService);
  return { editor, playback, chrome: TestBed.inject(NativeChromeMechanismService) };
}

afterEach(() => {
  TestBed.resetTestingModule();
  history.replaceState(null, '', '/');
});

it('scrubs every clock to the leader time, wraps shorter periods and steps the longest clock', () => {
  const { editor, playback, chrome } = setup();
  const fast = nativeLoadedRod(),
    slow = nativeLoadedRod();
  const document = {
    ...fast.document,
    bodies: [...fast.document.bodies, ...slow.document.bodies.filter((b) => b.id !== WORLD)],
    attachments: [...fast.document.attachments, ...slow.document.attachments],
    joints: [...fast.document.joints, ...slow.document.joints],
    forces: [...fast.document.forces, ...slow.document.forces],
    drivers: [fast.driver, { ...slow.driver, profile: { ...slow.driver.profile, speed: 1 } }],
  };
  editor.loadDocument(document);
  const machines = playback.machines();
  expect(machines.length).toBe(2);
  const leader = machines.findIndex((m) => m.path.duration > 6);
  const follower = 1 - leader;
  chrome.seekAllAlong(leader, 0.75);
  const time = machines[leader].path.duration * 0.75;
  expect(chrome.secondsOf(leader)).toBeCloseTo(time, 1);
  expect(chrome.secondsOf(follower)).toBeCloseTo(time % machines[follower].path.duration, 1);
  expect(chrome.mechanismTimeStep).toBe(playback.indices().get(machines[leader].key));
  expect(chrome.cyclePeriod()).toBe(machines[leader].path.duration);
  chrome.setSyncMechanisms(false);
  chrome.seekMechanism(follower, 0.1);
  chrome.setSyncMechanisms(true);
  expect(chrome.secondsOf(follower)).toBeCloseTo(
    chrome.secondsOf(leader) % machines[follower].path.duration,
    1
  );
});

it('drops removed partition clock keys and keeps the surviving drive moving after an edit', () => {
  const { editor, playback } = setup();
  const original = nativeLoadedRod();
  editor.loadDocument(original.document);
  const obsolete = playback.machines()[0].key;
  playback.setDirection(obsolete, -1);
  const next = nativeLoadedRod();
  editor.loadDocument(next.document);
  expect(playback.directions().has(obsolete)).toBe(false);
  expect(playback.independent().has(obsolete)).toBe(false);
  const machine = playback.machines()[0];
  playback.seek(machine.key, 20);
  expect(editor.store.local.clocks[0].time).toBeGreaterThan(0);
  expect(editor.store.local.clocks[0].driverId).toBe(next.driver.id);
});

it('uses the shared clockwise convention and invalidates mechanism selection when an object is picked', () => {
  const { editor, chrome } = setup(),
    f = nativeLoadedRod();
  editor.loadDocument(f.document);
  expect(chrome.travelingForward(0)).toBe(false);
  chrome.reverseDrive(0);
  expect(chrome.travelingForward(0)).toBe(true);
  const selection = TestBed.inject(NativeChromeSelectionService);
  selection.selectMechanism(0);
  expect(selection.objType).toBe('Mechanism');
  editor.select({ kind: 'body', id: f.body });
  expect(selection.objType).toBe('Link');
  expect(selection.selectedMechanismIndex).toBe(-1);
});

it('keeps ID visibility outside edit history and saves the visible preference explicitly', () => {
  const { editor } = setup(),
    f = nativeLoadedRod();
  editor.loadDocument(f.document);
  const settings = TestBed.inject(NativeSettingsService);
  const changes: LengthUnit[] = [];
  settings.lengthUnit.subscribe((unit) => changes.push(unit));
  editor.select({ kind: 'body', id: f.body });
  editor.rename('Renamed');
  editor.history('undo');
  const revision = editor.store.revision;
  settings.isShowID.next(!settings.isShowID.value);
  expect(editor.store.revision).toBe(revision);
  expect(editor.store.redoDepth).toBe(1);
  expect(changes).toHaveLength(1);
  editor.history('redo');
  expect(editor.document().bodies.find((b) => b.id === f.body)).toMatchObject({ label: 'Renamed' });
  const saved = decodeBodyDocument(TestBed.inject(NativeChromeProjectService).serialize());
  expect(saved.ok).toBe(true);
  if (saved.ok) expect(saved.document.settings.showIds).toBe(settings.isShowID.value);
});

it('converts geometry and force display units in one undoable edit', () => {
  const { editor } = setup(),
    f = nativeLoadedRod();
  editor.loadDocument(f.document);
  const settings = TestBed.inject(NativeSettingsService);
  const commands = TestBed.inject(NativeSettingsCommandsService);
  commands.setLengthUnit(LengthUnit.INCH);
  expect(settings.forceUnit.value).toBe(ForceUnit.LBF);
  expect(editor.document().settings.objectScale).toBeCloseTo(
    f.document.settings.objectScale / 0.0254,
    10
  );
  expect(editor.store.undoDepth).toBe(1);
  editor.history('undo');
  expect(encodeBodyDocument(editor.document())).toEqual(encodeBodyDocument(f.document));
  commands.setForceUnit(ForceUnit.KGF);
  commands.setLengthUnit(LengthUnit.CM);
  expect(settings.forceUnit.value).toBe(ForceUnit.KGF);
});

it('consumes a share query without replacing either recovery copy', () => {
  const { editor } = setup(),
    previous = nativeLoadedRod(),
    shared = nativeLoadedRod();
  editor.loadDocument(previous.document);
  const tab = sessionStorage.getItem(NATIVE_TAB_DRAWING),
    persistent = localStorage.getItem(NATIVE_LAST_DRAWING);
  const encoded = encodeBodyDocument(shared.document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  history.replaceState(null, '', '/?editor=native&document=' + encodeURIComponent(encoded.payload));
  TestBed.inject(NativeEditorSessionService).start();
  expect(editor.document().bodies.some((b) => b.id === shared.body)).toBe(true);
  expect(location.search).toBe('?editor=native');
  expect(sessionStorage.getItem(NATIVE_TAB_DRAWING)).toBe(tab);
  expect(localStorage.getItem(NATIVE_LAST_DRAWING)).toBe(persistent);
  editor.recover();
  expect(encodeBodyDocument(editor.document())).toEqual(encodeBodyDocument(previous.document));
});

it('scrubs away from either ram stop on the outgoing leg instead of silently reversing its clock', () => {
  const { editor, chrome } = setup();
  editor.loadDocument(nativeShellBoom());
  const profile = chrome.driveProfileOf(0)!;
  expect(
    Math.max(...profile.along.slice(1).map((value, i) => Math.abs(value - profile.along[i])))
  ).toBeLessThan(1 / 359);
  chrome.seekMechanismTo(0, 0);
  expect(chrome.travelingForward(0)).toBe(true);
  chrome.seekMechanismTo(0, 0.1);
  expect(chrome.travelingForward(0)).toBe(true);
  chrome.seekMechanismTo(0, 1);
  expect(chrome.travelingForward(0)).toBe(false);
  chrome.seekMechanismTo(0, 0.9);
  expect(chrome.travelingForward(0)).toBe(false);
});
