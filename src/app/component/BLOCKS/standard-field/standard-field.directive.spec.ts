import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StandardFieldDirective } from './standard-field.directive';

@Component({
  template: `
    <div [formGroup]="form">
      <input appStandardField type="text" formControlName="value" />
    </div>
  `,
  imports: [ReactiveFormsModule, StandardFieldDirective],
})
class HostComponent {
  // The panels that write their own boxes commit on blur, which is what makes
  // Enter-commits-by-blurring the same route in rather than a second one.
  form = new FormGroup({ value: new FormControl('12.00') }, { updateOn: 'blur' });
}

describe('StandardFieldDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let field: HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    field = fixture.nativeElement.querySelector('input');
    document.body.appendChild(fixture.nativeElement);
  });

  it('selects the whole value when the field is clicked', () => {
    field.focus();
    field.setSelectionRange(2, 2);

    field.dispatchEvent(new MouseEvent('click'));

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it('commits on Enter through the blur the form already commits on', () => {
    const form = fixture.componentInstance.form;
    field.focus();
    field.value = '34.00';
    field.dispatchEvent(new Event('input'));
    expect(form.value.value).toBe('12.00');

    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).not.toBe(field);
    expect(form.value.value).toBe('34.00');
  });
});
