import { Component, OnChanges, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { ColorService } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { Joint } from '../../../model/joint';
import { Force } from '../../../model/force';
import { MechanismService } from '../../../services/mechanism.service';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { INK_FLIPS_AT, luminanceOf } from '../../../model/contrast';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class ColorPickerComponent implements OnChanges {
  colorService = inject(ColorService);
  private mechanism = inject(MechanismService);

  readonly link = input<RealLink>();
  readonly joint = input<Joint>();
  readonly force = input<Force>();
  readonly tooltip = input<string>();
  readonly type = input<string>();

  /**
   * A whole selection to paint at once, instead of one part.
   *
   * The same swatches either way: choosing a color for eight links is the same
   * question as choosing one for a single link, so it is asked with the same
   * control rather than with a second one that would have to be kept looking
   * alike by hand. When the parts disagree no swatch is ticked -- there is no
   * one color to point at -- and pressing one gives them all that color.
   */
  readonly parts = input<readonly (RealLink | Joint | Force)[]>();

  ngOnChanges(): void {
    const link = this.link();
    if (link) this.selectedIndex = this.colorService.getIndexFromLinkColor(link.fill);
  }

  /** The index every selected part is already on, or -1 if they differ. */
  private commonIndex(parts: readonly (RealLink | Joint | Force)[]): number {
    const indices = parts.map((part) => this.indexOf(part));
    return indices.every((index) => index === indices[0]) ? (indices[0] ?? -1) : -1;
  }

  private indexOf(part: RealLink | Joint | Force): number {
    switch (this.type()) {
      case 'joint':
        return this.colorService.getIndexFromJointFamily((part as Joint).colorFamily);
      case 'force':
        return this.colorService.getIndexFromForceColor((part as Force).color);
      default:
        return this.colorService.getIndexFromLinkColor((part as RealLink).fill);
    }
  }

  private paint(part: RealLink | Joint | Force, index: number): void {
    switch (this.type()) {
      case 'joint':
        (part as Joint).colorFamily = this.colorService.getJointFamilyFromIndex(index);
        break;
      case 'force':
        (part as Force).color = this.colorService.getForceColorFromIndex(index);
        break;
      default:
        (part as RealLink).fill = this.colorService.getLinkColorFromIndex(index);
        break;
    }
  }

  /** One picker serves whichever part is selected, so the tick is read from it. */
  chosenIndex(): number {
    const parts = this.parts();
    if (parts) return parts.length ? this.commonIndex(parts) : -1;
    const joint = this.joint();
    const force = this.force();
    if (this.type() === 'joint' && joint) {
      return this.colorService.getIndexFromJointFamily(joint.colorFamily);
    }
    if (this.type() === 'force' && force) {
      return this.colorService.getIndexFromForceColor(force.color);
    }
    return this.selectedIndex;
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    const parts = this.parts();
    if (parts) {
      parts.forEach((part) => this.paint(part, index));
      // Undoable and carried in the URL, the same as painting one part: a
      // color a shared link dropped would not be worth putting on.
      this.mechanism.updateMechanism(true);
      return;
    }
    const link = this.link();
    const joint = this.joint();
    const force = this.force();
    switch (this.type()) {
      case 'link':
        if (link) {
          link.fill = this.colorService.getLinkColorFromIndex(index);
        }
        break;
      case 'joint':
        if (!joint) break;
        // The first swatch is the family every joint already wears, whose id is
        // empty -- so choosing it means "stop being different", and the URL
        // goes back to saying nothing about this joint.
        joint.colorFamily = this.colorService.getJointFamilyFromIndex(index);
        // Undoable, and carried in the URL: a color that a shared link dropped,
        // or that one undo wiped, would not be worth putting on.
        this.mechanism.updateMechanism(true);
        break;
      case 'force':
        if (!force) break;
        force.color = this.colorService.getForceColorFromIndex(index);
        this.mechanism.updateMechanism(true);
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

  /** What each swatch is called, for the reader who is hovering one. */
  nameOf(index: number): string {
    if (this.type() !== 'joint') return '';
    const family = this.colorService.getJointFamilies()[index];
    return family ? (index === 0 ? family.name + ' (default)' : family.name) : '';
  }

  /**
   * A tick the reader can see on the swatch it is standing on.
   *
   * It used to be white on every swatch, which was invisible on the pale end of
   * the link palette and on the first of the joint ones.
   */
  tickInk(color: string): string {
    // Against the middle of the swatch, which is what the tick is drawn over --
    // not the ring around it, which is a different color on every joint family
    // and would have put a white tick on four pale centers.
    return luminanceOf(color) > INK_FLIPS_AT ? '#263238' : '#ffffff';
  }
}
