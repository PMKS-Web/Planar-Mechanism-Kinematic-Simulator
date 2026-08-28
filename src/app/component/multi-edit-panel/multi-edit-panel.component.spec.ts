import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { MultiEditService } from '../../services/multi-edit.service';
import { SelectionBatchService } from '../../services/selection-batch.service';
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

  /** The header's trash can. */
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
});
