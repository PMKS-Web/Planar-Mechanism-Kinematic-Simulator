import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { Coord } from '../../model/coord';
import { Force } from '../../model/force';
import { EditState } from '../../model/edit-permission';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { MultiEditService } from '../../services/multi-edit.service';
import { SelectionBatchService } from '../../services/selection-batch.service';
import { EditPermissionService } from '../../services/edit-permission.service';
import { MultiEditPanelComponent } from './multi-edit-panel.component';

const S = MODEL_SCALE;

describe('MultiEditPanelComponent', () => {
  let fixture: ComponentFixture<MultiEditPanelComponent>;
  let active: ActiveObjService;
  let mechanism: MechanismService;
  const multi = {
    assignJointCoordinate: vi.fn().mockReturnValue({ ok: true }),
    assignLinkGeometry: vi.fn().mockReturnValue({ ok: true }),
    assignLinkMass: vi.fn().mockReturnValue({ ok: true }),
    setLocked: vi.fn().mockReturnValue({ ok: true }),
    setHold: vi.fn().mockReturnValue({ ok: true }),
    setTracePath: vi.fn().mockReturnValue({ ok: true }),
    setForceFrame: vi.fn().mockReturnValue({ ok: true }),
  };
  const batch = {
    deleteSelected: vi.fn().mockReturnValue({ ok: true, selection: [] }),
    duplicateSelected: vi.fn().mockReturnValue({
      ok: true,
      selection: [
        { kind: 'joint', id: 'C' },
        { kind: 'joint', id: 'D' },
      ],
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [MultiEditPanelComponent],
      providers: [provideNoopAnimations()],
    })
      .overrideProvider(MultiEditService, { useValue: multi })
      .overrideProvider(SelectionBatchService, { useValue: batch })
      .compileComponents();
    active = TestBed.inject(ActiveObjService);
    mechanism = TestBed.inject(MechanismService);
  });

  function render() {
    fixture = TestBed.createComponent(MultiEditPanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The header's padlock, which is the group's Lock. */
  function headerLock(element: HTMLElement): HTMLButtonElement | null {
    return ([...element.querySelectorAll('editable-title-block button')].find((button) =>
      /lock/i.test(button.textContent ?? '')
    ) ?? null) as HTMLButtonElement | null;
  }

  /** The header already names the selection, so its action stays short. */
  function headerDelete(element: HTMLElement): HTMLButtonElement | null {
    return element.querySelector('editable-title-block button[aria-label="Delete"]');
  }

  it('shows common joint values and a clear Mixed state, with no bulk rename', () => {
    const a = new RevJoint('A', 0, S);
    const b = new RevJoint('B', 2 * S, S);
    mechanism.joints = [a, b];
    mechanism.links = [];
    active.restorePartSelection(
      {
        refs: [
          { kind: 'joint', id: 'A' },
          { kind: 'joint', id: 'B' },
        ],
      },
      mechanism.joints,
      mechanism.links
    );

    const element = render();
    expect(element.querySelector('panel-section')).not.toBeNull();
    expect(element.querySelector('dual-input-block')).not.toBeNull();
    expect(element.querySelector('toggle-block')).not.toBeNull();
    // Duplicate is the only one left in the strip: Lock and Delete are in the
    // header now, in the same row a one-part selection puts them.
    expect(element.querySelectorAll('button-block')).toHaveLength(1);
    expect(element.querySelector('editable-title-block')).not.toBeNull();
    expect(headerLock(element)).not.toBeNull();
    expect(headerDelete(element)).not.toBeNull();
    const x = element.querySelector('[data-field="x"]') as HTMLInputElement;
    const y = element.querySelector('[data-field="y"]') as HTMLInputElement;
    expect(element.textContent).toContain('2 joints selected');
    expect(x.value).toBe('');
    expect(x.placeholder).toBe('Mixed');
    expect(y.value).not.toBe('');
    expect(y.placeholder).not.toBe('Mixed');
    expect(element.textContent?.toLowerCase()).not.toContain('rename');
    expect(element.querySelector('[data-field="name"]')).toBeNull();
  });

  it('commits absolute joint alignment and common link geometry through atomic batch APIs', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', S, 0);
    const c = new RevJoint('C', 3 * S, 0);
    const d = new RevJoint('D', 5 * S, 0);
    const ab = new RealLink('AB', [a, b]);
    const cd = new RealLink('CD', [c, d]);
    mechanism.joints = [a, b, c, d];
    mechanism.links = [ab, cd];

    active.restorePartSelection(
      {
        refs: [
          { kind: 'joint', id: 'A' },
          { kind: 'joint', id: 'C' },
        ],
      },
      mechanism.joints,
      mechanism.links
    );
    render();
    fixture.componentInstance.commitJointCoordinate('x', '4 cm');
    expect(multi.assignJointCoordinate).toHaveBeenCalledWith(active.selectedPartRefs, 'x', 4 * S);

    active.restorePartSelection(
      {
        refs: [
          { kind: 'link', id: 'AB' },
          { kind: 'link', id: 'CD' },
        ],
      },
      mechanism.joints,
      mechanism.links
    );
    fixture.detectChanges();
    fixture.componentInstance.commitLinkGeometry('length', '7 cm');
    fixture.componentInstance.commitLinkGeometry('angle', '90 deg');
    expect(multi.assignLinkGeometry).toHaveBeenCalledWith(active.selectedPartRefs, 'length', 7 * S);
    expect(multi.assignLinkGeometry).toHaveBeenCalledWith(
      active.selectedPartRefs,
      'angle',
      Math.PI / 2
    );
  });

  it('keeps mixed joint/link selections to shared safe controls', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', S, 0);
    const ab = new RealLink('AB', [a, b]);
    mechanism.joints = [a, b];
    mechanism.links = [ab];
    active.restorePartSelection(
      {
        refs: [
          { kind: 'joint', id: 'A' },
          { kind: 'link', id: 'AB' },
        ],
      },
      mechanism.joints,
      mechanism.links
    );

    const element = render();
    expect(element.textContent).toContain('1 joint · 1 link selected');
    expect(element.querySelector('[data-field="x"]')).toBeNull();
    expect(element.querySelector('[data-field="length"]')).toBeNull();
    expect(element.querySelector('[data-action="duplicate"]')).not.toBeNull();
    expect(headerLock(element)).not.toBeNull();
    expect(headerDelete(element)).not.toBeNull();
  });

  it('renders differing lock state as Mixed and applies one requested state', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', S, 0);
    a.locked = true;
    mechanism.joints = [a, b];
    mechanism.links = [];
    active.restorePartSelection(
      {
        refs: [
          { kind: 'joint', id: 'A' },
          { kind: 'joint', id: 'B' },
        ],
      },
      mechanism.joints,
      mechanism.links
    );

    const element = render();
    // Part-locked reads as unlocked on the header padlock, because pressing it
    // locks the rest -- which is the useful half of the gesture here.
    const lock = headerLock(element)!;
    expect(lock.textContent).toContain('Lock');
    lock.click();
    fixture.detectChanges();
    expect(multi.setLocked).toHaveBeenCalledWith(active.selectedPartRefs, true);
  });

  function posedState(): EditState {
    return {
      mode: 'analysis', playing: false, atStart: false, sharedStepZero: false,
      solveDeferred: false, empty: false, runnable: true,
    };
  }

  function selectBars() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', S, S);
    const c = new RevJoint('C', 2 * S, 0);
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    mechanism.joints = [a, b, c];
    mechanism.links = [ab, bc];
    active.restorePartSelection(
      { refs: [{ kind: 'link', id: 'AB' }, { kind: 'link', id: 'BC' }] },
      mechanism.joints, mechanism.links
    );
    return { ab, bc };
  }

  it('allows paused locks, holds, mass and paths while keeping geometry and deletion disabled', () => {
    selectBars();
    const state = posedState();
    vi.spyOn(TestBed.inject(EditPermissionService), 'state').mockReturnValue(state);
    const element = render();
    const panel = fixture.componentInstance;
    for (const mode of ['edit', 'analysis'] as const) {
      state.mode = mode;
      fixture.detectChanges();
      expect(element.querySelector('[inert]')).toBeNull();
      expect(headerLock(element)!.disabled).toBe(false);
      expect(headerDelete(element)!.disabled).toBe(true);
      expect(panel.form.controls.mass.enabled).toBe(true);
      expect(panel.form.controls.fixedLength.enabled).toBe(true);
      expect(panel.form.controls.fixedAngle.enabled).toBe(true);
      expect(panel.form.controls.length.disabled).toBe(true);
      expect(panel.form.controls.angle.disabled).toBe(true);
      expect((element.querySelector('[data-action="duplicate"]') as HTMLButtonElement).disabled)
        .toBe(true);
      panel.delete();
      panel.duplicate();
    }
    expect(batch.deleteSelected).not.toHaveBeenCalled();
    expect(batch.duplicateSelected).not.toHaveBeenCalled();
    headerLock(element)!.click();
    expect(multi.setLocked).toHaveBeenCalled();

    active.restorePartSelection(
      { refs: [{ kind: 'joint', id: 'A' }, { kind: 'joint', id: 'B' }] },
      mechanism.joints, mechanism.links
    );
    fixture.detectChanges();
    expect(panel.form.controls.trace.enabled).toBe(true);
    expect(panel.form.controls.x.disabled).toBe(true);
    expect(panel.form.controls.ground.disabled).toBe(true);
    expect(panel.form.controls.weld.disabled).toBe(true);
    expect(panel.form.controls.slider.disabled).toBe(true);
  });

  it('enables mapped force values and frame while respecting a force direction lock', () => {
    const { ab, bc } = selectBars();
    mechanism.forces = [ab, bc].map((link, index) =>
      new Force(`F${index + 1}`, link, new Coord(S, S), new Coord(S, 2 * S))
    );
    active.restorePartSelection(
      { refs: [{ kind: 'force', id: 'F1' }, { kind: 'force', id: 'F2' }] },
      mechanism.joints, mechanism.links, mechanism.forces
    );
    vi.spyOn(TestBed.inject(EditPermissionService), 'state').mockReturnValue(posedState());
    const element = render();
    const controls = fixture.componentInstance.form.controls;
    expect(controls.magnitude.enabled).toBe(true);
    expect(controls.forceAngle.enabled).toBe(true);
    expect(controls.isGlobal.enabled).toBe(true);
    expect([...element.querySelectorAll('radio-block button')]
      .every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    mechanism.forces[0].locked = true;
    fixture.detectChanges();
    expect(controls.forceAngle.disabled).toBe(true);
    expect(controls.magnitude.enabled).toBe(true);
    expect(controls.isGlobal.enabled).toBe(true);
  });

  it('keeps every bulk control unavailable while playing or in Synthesis', () => {
    selectBars();
    const state = posedState();
    state.playing = true;
    vi.spyOn(TestBed.inject(EditPermissionService), 'state').mockReturnValue(state);
    const element = render();
    const assertFrozen = () => {
      expect(element.querySelector('[inert]')).not.toBeNull();
      expect(Object.values(fixture.componentInstance.form.controls)
        .every((control) => control.disabled)).toBe(true);
      expect(headerDelete(element)!.disabled).toBe(true);
    };
    assertFrozen();
    state.playing = false;
    state.mode = 'synthesis';
    fixture.detectChanges();
    assertFrozen();
  });
});
