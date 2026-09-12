import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { EditableTitleComponent } from './editable-title.component';
import { ActiveObjService } from '../../../services/active-obj.service';
import { MechanismService } from '../../../services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';
import { KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';

/**
 * Driven through the row, the way a reader renames: press Rename, type, press
 * Save. The name check itself is private to the block, so what a spec can see
 * is what the reader sees -- the refusal the notification carries, or the
 * field going away because the name was taken.
 */
describe('EditableTitleComponent names', () => {
  const selected = { id: 'A', name: 'Crank' };
  let fixture: ComponentFixture<EditableTitleComponent>;
  let refusal: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    selected.name = 'Crank';
    refusal = vi.fn();
    await TestBed.configureTestingModule({
      imports: [EditableTitleComponent, NoopAnimationsModule],
      providers: [
        { provide: ActiveObjService, useValue: { getSelectedObj: () => selected } },
        {
          provide: MechanismService,
          useValue: {
            joints: [selected, { id: 'B', name: 'Output' }],
            links: [{ id: 'AB', name: 'Coupler' }],
            forces: [{ id: 'F1', name: 'Load' }],
            updateMechanism: vi.fn(),
          },
        },
        { provide: NotificationService, useValue: { refusal } },
        { provide: KeyboardShortcutsService, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditableTitleComponent);
    fixture.componentRef.setInput('deleteAction', () => {});
    fixture.detectChanges();
  });

  const host = () => fixture.nativeElement as HTMLElement;
  /** One button for both halves of the gesture: Rename outside edit mode, Save inside it. */
  const renameOrSave = () => host().querySelector<HTMLButtonElement>('.mini-buttons.blue')!;
  const field = () => host().querySelector<HTMLInputElement>('#title-input-box');

  /** Rename to `name` through the row, and say what the block refused it with, if anything. */
  function rename(name: string): string {
    if (!field()) {
      renameOrSave().click();
      fixture.detectChanges();
    }
    field()!.value = name;
    field()!.dispatchEvent(new Event('input'));
    const before = refusal.mock.calls.length;
    renameOrSave().click();
    fixture.detectChanges();
    return refusal.mock.calls.length > before ? refusal.mock.calls.at(-1)![1] : '';
  }

  it('allows the selected object to keep its own name', () => {
    expect(rename('Crank')).toBe('');
    expect(field()).toBeNull();
    expect(selected.name).toBe('Crank');
  });

  it('requires one word made from English letters and numbers', () => {
    expect(rename('output link')).toContain('one word');
    expect(rename('output-link')).toContain('one word');
    expect(field()).not.toBeNull();
  });

  it('rejects a case-insensitive duplicate across all object types', () => {
    expect(rename('output')).toContain('already in use');
    expect(rename('COUPLER')).toContain('already in use');
    expect(rename('load')).toContain('already in use');
    expect(selected.name).toBe('Crank');
  });
});
