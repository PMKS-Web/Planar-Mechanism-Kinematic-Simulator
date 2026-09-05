import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { EditableTitleComponent } from './editable-title.component';
import { ActiveObjService } from '../../../services/active-obj.service';
import { MechanismService } from '../../../services/mechanism.service';
import { NotificationService } from '../../../services/notification.service';
import { KeyboardShortcutsService } from '../../../services/keyboard-shortcuts.service';

describe('EditableTitleComponent names', () => {
  const selected = { id: 'A', name: 'Crank' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        { provide: ActiveObjService, useValue: { getSelectedObj: () => selected } },
        {
          provide: MechanismService,
          useValue: {
            joints: [selected, { id: 'B', name: 'Output' }],
            links: [{ id: 'AB', name: 'Coupler' }],
            forces: [{ id: 'F1', name: 'Load' }],
          },
        },
        { provide: NotificationService, useValue: {} },
        { provide: KeyboardShortcutsService, useValue: {} },
      ],
    });
  });

  const component = () => TestBed.runInInjectionContext(() => new EditableTitleComponent());

  it('allows the selected object to keep its own name', () => {
    expect(component().validateNewID('Crank')).toBe('');
  });

  it('requires one word made from English letters and numbers', () => {
    expect(component().validateNewID('output link')).toContain('one word');
    expect(component().validateNewID('output-link')).toContain('one word');
  });

  it('rejects a case-insensitive duplicate across all object types', () => {
    expect(component().validateNewID('output')).toContain('already in use');
    expect(component().validateNewID('COUPLER')).toContain('already in use');
    expect(component().validateNewID('load')).toContain('already in use');
  });
});
