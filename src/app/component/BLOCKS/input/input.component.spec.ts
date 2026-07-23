import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { InputComponent } from './input.component';

describe('InputComponent', () => {
  let fixture: ComponentFixture<InputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InputComponent],
      imports: [
        ReactiveFormsModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatTooltipModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InputComponent);
    fixture.componentInstance.formGroup = new FormGroup({ value: new FormControl(1) });
    fixture.componentInstance._formControl = 'value';
  });

  it('renders a supplied unit inside the form field without changing its numeric value', () => {
    fixture.componentInstance.unit = 'kg·cm²';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-unit')?.textContent.trim()).toBe('kg·cm²');
    expect(fixture.nativeElement.querySelector('.customInputForm').classList).toContain('has-unit');
    expect(fixture.componentInstance.formGroup.value.value).toBe(1);
  });

  it('keeps the compact field when no unit is supplied', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-unit')).toBeNull();
    expect(fixture.nativeElement.querySelector('.customInputForm').classList).not.toContain(
      'has-unit'
    );
    expect(fixture.nativeElement.querySelector('.customInputForm').classList).not.toContain('wide');
  });

  it('widens the field on request, for values that carry a long unit in their text', () => {
    fixture.componentInstance.wide = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.customInputForm').classList).toContain('wide');
  });
});
