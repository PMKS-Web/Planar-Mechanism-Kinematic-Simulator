import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';

/**
 * One of a few, chosen by pressing it: a track with a pill that slides to the
 * chosen option.
 *
 * The one control for every "pick one" in the app -- the Magnitude / X & Y
 * split on a graph, the unit choices in Settings, a force's frame, the
 * export drawer's formats. They used to be three things: a Material button
 * toggle with a checkmark, a bordered strip of buttons in the export drawers,
 * and the graph's own split. One look, and the pill's slide is what tells a
 * reader the press landed.
 *
 * Index in, index out. What the index *means* is the caller's business, which
 * keeps this free of forms, enums and string values.
 */
@Component({
  selector: 'segmented-block',
  templateUrl: './segmented.component.html',
  styleUrls: ['./segmented.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SegmentedComponent implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The labels, in order. */
  readonly options = input.required<string[]>();
  /** Which one is chosen. */
  readonly selected = input<number>(0);
  readonly selectedChange = output<number>();
  readonly disabled = input<boolean>(false);
  /** A little shorter and tighter, for a row that has less room. */
  readonly compact = input<boolean>(false);
  /**
   * Whether the options share the width they are given equally, or each
   * takes what its label needs. A panel's full-width control shares; a
   * control at the end of a settings row fits, because "X, Y, Magnitude"
   * squeezed to a third of the row read "X, Y, Ma…".
   */
  readonly fill = input<boolean>(true);

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');
  private watch?: ResizeObserver;

  constructor() {
    // The pill follows the chosen option, and the option follows its label:
    // both are inputs, so a change to either re-measures after the view has
    // caught up with it.
    effect(() => {
      this.selected();
      this.options();
      this.fill();
      this.compact();
      queueMicrotask(() => this.measure());
    });
  }

  ngAfterViewInit(): void {
    // Before the first paint, so the pill is never seen arriving from nowhere.
    this.measure();
    if (typeof ResizeObserver === 'undefined') return;
    this.watch = new ResizeObserver(() => this.measure());
    this.watch.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.watch?.disconnect();
  }

  choose(index: number): void {
    if (this.disabled() || index === this.selected()) return;
    this.selectedChange.emit(index);
  }

  /**
   * Where the pill goes: the chosen option's own place and width, measured,
   * so options may be as wide as their labels and the pill still fits the
   * one under it exactly. Written as custom properties the stylesheet slides
   * between.
   */
  private measure(): void {
    const chosen = this.buttons()[this.selected()]?.nativeElement;
    if (!chosen) return;
    const style = this.host.nativeElement.style;
    style.setProperty('--thumb-left', `${chosen.offsetLeft}px`);
    style.setProperty('--thumb-width', `${chosen.offsetWidth}px`);
  }
}
