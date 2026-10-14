import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/** Makes each block's element ids its own, however many share a page. */
let blocksMade = 0;

/**
 * One of a few, chosen by pressing it: a track with a pill that slides to the
 * chosen option.
 *
 * The one control for every "pick one" in the app -- the Magnitude / X & Y
 * split on a graph, the unit choices in Settings, a force's frame, the
 * export drawer's formats, a joint's type. They used to be three things: a
 * Material button toggle with a checkmark, a bordered strip of buttons in the
 * export drawers, and the graph's own split. One look, and the pill's slide is
 * what tells a reader the press landed.
 *
 * Index in, index out. What the index *means* is the caller's business, which
 * keeps this free of forms, enums and string values.
 */
@Component({
  selector: 'segmented-block',
  templateUrl: './segmented.component.html',
  styleUrls: ['./segmented.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class SegmentedComponent implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The labels, in order. */
  readonly options = input.required<readonly string[]>();
  /**
   * Which one is chosen, or -1 for none: a group of parts that disagree has no
   * one answer, and a pill under any option would claim one.
   */
  readonly selected = input<number>(0);
  readonly selectedChange = output<number>();
  readonly disabled = input<boolean>(false);
  /**
   * Options that cannot be chosen right now, by index: grayed in place, so
   * the reader can see the choice exists and is not theirs to make yet.
   */
  readonly disabledAt = input<readonly number[]>([]);
  /**
   * Why each grayed option cannot be chosen, by index, said when the reader
   * points at it. The caller hands over the model's own sentence.
   */
  readonly reasons = input<readonly (string | undefined)[]>([]);
  /** A little shorter and tighter, for a row that has less room. */
  readonly compact = input<boolean>(false);
  /**
   * Whether the options share the width they are given equally, or each
   * takes what its label needs. A panel's full-width control shares; a
   * control at the end of a settings row fits, because "X, Y, Magnitude"
   * squeezed to a third of the row read "X, Y, Ma…".
   */
  readonly fill = input<boolean>(true);
  /**
   * The options in two columns, wrapping onto rows. Four choices with a glyph
   * each do not fit one row of a 250px panel: shared four ways, every label
   * was cut to its first few letters.
   */
  readonly wrap = input<boolean, unknown>(false, { transform: booleanAttribute });
  /** A registered SVG icon for each option, drawn before its label. */
  readonly icons = input<readonly string[]>([]);
  /**
   * The chosen option is not valid as it stands -- a slider with nowhere to
   * slide -- and is drawn in the refusal ink. What is wrong, and the way out,
   * are the caller's to say beside the control.
   */
  readonly invalid = input<boolean>(false);
  /**
   * The name of the choice, on a row above the track with its help mark: the
   * row every field block draws. Without one there is no row, because most
   * pick-ones sit at the end of a row their panel has already named.
   */
  readonly label = input<string>();
  /** What the help mark says. */
  readonly tooltip = input<string>();
  /** Says Mixed on the label row, where the selected parts disagree. */
  readonly mixed = input<boolean>(false);

  /** The label's id and the hidden reasons' ids start with this. */
  protected readonly idPrefix = `segmented-${blocksMade++}`;

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');
  private watch?: ResizeObserver;
  /** Which option the pill was last put under, so a slide is only ever between two. */
  private restingAt?: number;

  constructor() {
    // The pill follows the chosen option, and the option follows its label:
    // both are inputs, so a change to either re-measures after the view has
    // caught up with it.
    effect(() => {
      this.selected();
      this.options();
      this.fill();
      this.compact();
      this.wrap();
      this.icons();
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

  protected choose(index: number): void {
    if (this.isDisabledAt(index) || index === this.selected()) return;
    this.selectedChange.emit(index);
  }

  protected isChosen(index: number): boolean {
    return index === this.selected();
  }

  protected hasChoice(): boolean {
    const at = this.selected();
    return at >= 0 && at < this.options().length;
  }

  protected isDisabledAt(index: number): boolean {
    return this.disabled() || this.disabledAt().includes(index);
  }

  /** Why an option is grayed, when it is grayed and a reason was given. */
  protected reasonAt(index: number): string | undefined {
    return this.isDisabledAt(index) ? this.reasons()[index] || undefined : undefined;
  }

  /**
   * Where the pill goes: the chosen option's own place and size, measured,
   * so options may be as wide as their labels, or wrap onto a second row, and
   * the pill still fits the one under it exactly. Written as custom properties
   * the stylesheet slides between.
   */
  private measure(): void {
    const at = this.selected();
    const chosen = this.buttons()[at]?.nativeElement;
    const host = this.host.nativeElement;
    if (!chosen) {
      // Nothing chosen, so no pill -- and whichever option is chosen next is
      // put in place rather than slid from wherever the last one stood.
      host.classList.add('settling');
      this.restingAt = undefined;
      return;
    }
    // A slide is a change the reader watched happen: from one option to
    // another while the control was on screen. A control arriving, or coming
    // back with the same value after the panel around it was rebuilt, snaps
    // into place -- a pill sliding into a panel that has just appeared says a
    // choice was made when none was.
    //
    // And a pass that changed nothing leaves the class alone. A caller that
    // writes its options inline hands this a fresh array every pass, which
    // re-runs the measurement -- and stamping "no transition" on a pill in
    // the middle of its slide is what froze the text pills while the one with
    // a held array slid.
    if (this.restingAt === undefined) host.classList.add('settling');
    else if (this.restingAt !== at) host.classList.remove('settling');
    host.style.setProperty('--thumb-left', `${chosen.offsetLeft}px`);
    host.style.setProperty('--thumb-top', `${chosen.offsetTop}px`);
    host.style.setProperty('--thumb-width', `${chosen.offsetWidth}px`);
    host.style.setProperty('--thumb-height', `${chosen.offsetHeight}px`);
    this.restingAt = at;
  }
}
