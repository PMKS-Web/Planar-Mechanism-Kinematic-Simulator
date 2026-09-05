import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { InputComponent } from './input.component';
import { DualInputComponent } from '../dual-input/dual-input.component';

@Component({
  imports: [InputComponent, DualInputComponent],
  template: `
    <input-block [formGroup]="form" _formControl="mass" [unitOptions]="units" unitFormControl="unit"
      >Mass</input-block
    >
    <dual-input-block [formGroup]="form" formControl1="x" formControl2="y" tooltip="Position"
      >Joint Position</dual-input-block
    >
    <dual-input-block
      [formGroup]="form"
      formSubGroup="relative"
      formControl1="distance"
      formControl2="angle"
      label1="D"
      label2="⊾"
      tooltip="Relative placement"
      >Joint C</dual-input-block
    >
    <dual-input-block
      [formGroup]="form"
      formControl1="x"
      formControl2="y"
      noHeader
      tooltip="Mass center"
      >Center of Mass</dual-input-block
    >
  `,
})
class FieldsHost {
  readonly units = [{ value: 'kg', label: 'kg' }];
  readonly form = new FormGroup({
    mass: new FormControl(1),
    unit: new FormControl('kg'),
    x: new FormControl(0),
    y: new FormControl(0),
    relative: new FormGroup({ distance: new FormControl(1), angle: new FormControl(90) }),
  });
}

describe('shared field accessible names', () => {
  it('associates each field with its quantity and expanded axis caption', () => {
    const fixture = TestBed.createComponent(FieldsHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const controls = [...host.querySelectorAll('input, select')];
    const names = controls.map((control) =>
      control
        .getAttribute('aria-labelledby')!
        .split(' ')
        .map((id) => host.querySelector(`[id="${id}"]`)!.textContent!.trim())
        .join(' ')
    );
    expect(names).toEqual([
      'Mass',
      'Mass Unit',
      'Joint Position X',
      'Joint Position Y',
      'Joint C Distance',
      'Joint C Angle',
      'Center of Mass X',
      'Center of Mass Y',
    ]);
    const ids = [...host.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id) => id.startsWith('pmks-'));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
