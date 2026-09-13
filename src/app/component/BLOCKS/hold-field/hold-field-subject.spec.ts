import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HoldFieldComponent } from './hold-field.component';
import { GridUtilsService } from '../../../services/grid-utils.service';
import { MechanismService } from '../../../services/mechanism.service';

it('shows and toggles authored holds without constructing legacy services', async () => {
  await TestBed.configureTestingModule({
    imports: [HoldFieldComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: GridUtilsService,
        useFactory: () => {
          throw new Error('legacy grid');
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
  const fixture = TestBed.createComponent(HoldFieldComponent);
  const toggle = vi.fn();
  fixture.componentRef.setInput('subject', { dimensions: ['length'], holdable: true, toggle });
  fixture.componentRef.setInput(
    'formGroup',
    new FormGroup({ length: new FormControl('5 cm'), angle: new FormControl('30 deg') })
  );
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as {
    held(which: string): boolean;
    toggle(which: string, event: Event): void;
  };
  expect(component.held('length')).toBe(true);
  expect(component.held('angle')).toBe(false);
  component.toggle('angle', new Event('click'));
  expect(toggle).toHaveBeenCalledWith('angle');
});
