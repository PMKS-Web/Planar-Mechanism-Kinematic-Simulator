import { Component, ElementRef, input, output, viewChildren } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { TOOLTIPS_ARE_LABELS } from '../tooltips-are-labels';

/** Panel navigation, separate from a segmented control that edits a setting. */
@Component({
  selector: 'app-tabs-block',
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  imports: [MatTooltip],
  providers: [TOOLTIPS_ARE_LABELS],
})
export class TabsComponent {
  readonly options = input.required<readonly string[]>();
  readonly selected = input(0);
  readonly tooltips = input<readonly string[]>([]);
  /** A unique prefix shared with the caller's tabpanel aria-labelledby values. */
  readonly idPrefix = input.required<string>();
  readonly panelIds = input.required<readonly string[]>();
  readonly label = input.required<string>();
  readonly selectedChange = output<number>();
  /** Lets a panel preview the subject of a tab without selecting it. */
  readonly hoveredChange = output<number | null>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected select(index: number): void {
    if (index !== this.selected()) this.selectedChange.emit(index);
  }

  protected navigate(event: KeyboardEvent, index: number): void {
    const last = this.options().length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % (last + 1)
        : event.key === 'ArrowLeft'
          ? (index + last) % (last + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined) {
      // Vertical arrows retain native scrolling, without nudging the drawing.
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.stopPropagation();
      return;
    }
    event.preventDefault();
    // These keys navigate the panel, not the canvas behind it.
    event.stopPropagation();
    this.select(next);
    this.buttons()[next]?.nativeElement.focus();
  }
}
