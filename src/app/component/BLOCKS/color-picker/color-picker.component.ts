import {
  Component,
  OnChanges,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  input,
} from '@angular/core';
import { ColorService } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { RealJoint } from '../../../model/joint';
import { Force } from '../../../model/force';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class ColorPickerComponent implements OnInit, OnChanges {
  colorService = inject(ColorService);

  readonly link = input<RealLink>();
  readonly joint = input<RealJoint>();
  readonly force = input<Force>();
  readonly tooltip = input<string>();
  readonly type = input<string>();

  ngOnChanges(): void {
    const link = this.link();
    if (link) {
      this.selectColor(this.colorService.getIndexFromLinkColor(link.fill));
    }
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  ngOnInit(): void {}

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    const link = this.link();
    switch (this.type()) {
      case 'link':
        if (link) {
          link.fill = this.colorService.getLinkColorFromIndex(index);
        }
        break;
      case 'joint':
        break;
    }
  }

  getCorrectColors(): string[] {
    switch (this.type()) {
      case 'link':
        return this.colorService.getLinkColorOptions();
      case 'joint':
        return this.colorService.getJointColorOptions();
      case 'force':
        return this.colorService.getForceColorOptions();
      default:
        return [];
    }
  }
}
