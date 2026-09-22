import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NumberDragDirective } from './number-drag.directive';

@Component({
  imports: [NumberDragDirective, ReactiveFormsModule],
  template: '<input numberDrag [formControl]="value" />',
})
class Host {
  value = new FormControl('2.00 cm', { updateOn: 'blur' });
}

describe('numeric field dragging', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const pointer = (type: string, y: number) =>
      input.dispatchEvent(
        new PointerEvent(type, {
          clientY: y,
          pointerId: 1,
          button: 0,
          bubbles: true,
        })
      );
    return { fixture, input, pointer, control: fixture.componentInstance.value };
  }

  it('previews the number with its unit, then commits once on release', () => {
    const { input, pointer, control } = setup();
    const changed = vi.fn();
    control.valueChanges.subscribe(changed);
    input.focus();
    pointer('pointerdown', 100);
    pointer('pointermove', 75);
    expect(input.value).toBe('2.5 cm');
    expect(control.value).toBe('2.00 cm');
    pointer('pointermove', 50);
    pointer('pointerup', 50);
    expect(control.value).toBe('3 cm');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('leaves a normal click and an escaped drag uncommitted', () => {
    const { input, pointer, control } = setup();
    pointer('pointerdown', 100);
    pointer('pointermove', 98);
    pointer('pointerup', 98);
    expect(control.value).toBe('2.00 cm');
    pointer('pointerdown', 100);
    pointer('pointermove', 75);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer('pointerup', 75);
    expect(input.value).toBe('2.00 cm');
    expect(control.value).toBe('2.00 cm');
  });

  it('does not drag disabled or read-only fields', () => {
    const { input, pointer, control, fixture } = setup();
    control.disable();
    fixture.detectChanges();
    pointer('pointerdown', 100);
    pointer('pointermove', 50);
    pointer('pointerup', 50);
    expect(input.value).toBe('2.00 cm');
    control.enable();
    fixture.detectChanges();
    input.readOnly = true;
    pointer('pointerdown', 100);
    pointer('pointermove', 50);
    pointer('pointerup', 50);
    expect(input.value).toBe('2.00 cm');
  });
});
