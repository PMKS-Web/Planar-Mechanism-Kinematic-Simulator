import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { EditableTitleComponent } from './editable-title.component';
import { ActiveObjService } from '../../../services/active-obj.service';
import { MechanismService } from '../../../services/mechanism.service';

it('renames an authored subject without constructing a legacy authority', async () => {
  await TestBed.configureTestingModule({
    imports: [EditableTitleComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: ActiveObjService,
        useFactory: () => {
          throw new Error('legacy selection');
        },
      },
      {
        provide: MechanismService,
        useFactory: () => {
          throw new Error('legacy authority');
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(EditableTitleComponent);
  const rename = vi.fn(() => true);
  fixture.componentRef.setInput('subject', { name: 'Bracket', rename });
  fixture.componentRef.setInput('deleteAction', () => {});
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Bracket');
  const component = fixture.componentInstance as unknown as {
    gotoEditMode(): void;
    newIDForm: { controls: { newID: { setValue(value: string): void } } };
    saveNewID(): void;
  };
  component.gotoEditMode();
  component.newIDForm.controls.newID.setValue('Carrier');
  component.saveNewID();
  expect(rename).toHaveBeenCalledWith('Carrier');
});
