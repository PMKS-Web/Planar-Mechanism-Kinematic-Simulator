import { Component, input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { InputComponent } from '../BLOCKS/input/input.component';

/** The same authored fields in the editor and component gallery. */
@Component({
  selector: 'app-gear-fields',
  imports: [InputComponent],
  template: `
    <input-block [formGroup]="form()" _formControl="name" dataField="gear-name">Name</input-block>
    <input-block [formGroup]="form()" _formControl="teeth" dataField="gear-teeth"
      >Teeth</input-block
    >
    <input-block
      [formGroup]="form()"
      _formControl="diameter"
      [unit]="unit()"
      dataField="gear-diameter"
      >Pitch Diameter</input-block
    >
  `,
})
export class GearFieldsComponent {
  readonly form = input.required<FormGroup>();
  readonly unit = input('cm');
}
