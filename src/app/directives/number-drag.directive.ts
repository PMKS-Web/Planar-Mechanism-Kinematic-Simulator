import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/** A click still edits text; a vertical drag adjusts the displayed number.
 * Commit through the field's normal input/blur path once, so one drag is one undo.
 */
@Directive({
  selector: 'input[numberDrag]',
  host: {
    '[style.touch-action]': "'none'",
    '[style.cursor]': "field.disabled || field.readOnly ? 'default' : 'ns-resize'",
  },
})
export class NumberDragDirective {
  protected readonly field = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private gesture?: { id: number; y: number; text: string; value: number; suffix: string };
  private dragging = false;
  private suppressClick = false;

  @HostListener('pointerdown', ['$event'])
  protected down(event: PointerEvent): void {
    const field = this.field;
    if (event.button !== 0 || field.disabled || field.readOnly) return;
    const parsed = field.value.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)$/i);
    if (!parsed || !Number.isFinite(Number(parsed[1]))) return;
    this.suppressClick = false;
    this.dragging = false;
    this.gesture = {
      id: event.pointerId,
      y: event.clientY,
      text: field.value,
      value: Number(parsed[1]),
      suffix: parsed[2],
    };
    field.setPointerCapture?.(event.pointerId);
  }

  @HostListener('pointermove', ['$event'])
  protected move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const distance = gesture.y - event.clientY;
    if (!this.dragging && Math.abs(distance) < 5) return;
    this.dragging = true;
    event.preventDefault();
    const explicitStep = Number(this.field.getAttribute('step'));
    const step = explicitStep > 0 ? explicitStep : 0.1;
    const value = gesture.value + Math.trunc(distance / 5) * step * (event.shiftKey ? 0.1 : 1);
    this.field.value = `${Number(value.toFixed(8))}${gesture.suffix}`;
  }

  @HostListener('pointerup', ['$event'])
  protected up(event: PointerEvent): void {
    if (!this.gesture || event.pointerId !== this.gesture.id) return;
    const changed = this.dragging && this.field.value !== this.gesture.text;
    this.suppressClick = this.dragging;
    this.gesture = undefined;
    if (changed) {
      this.field.dispatchEvent(new Event('input', { bubbles: true }));
      this.field.dispatchEvent(new Event('change', { bubbles: true }));
      const focused = this.field.ownerDocument.activeElement === this.field;
      this.field.blur();
      // Touch can begin without focusing the field, but blur-updated forms
      // still need their normal commit event.
      if (!focused) this.field.dispatchEvent(new FocusEvent('blur'));
    }
  }

  @HostListener('click', ['$event'])
  protected click(event: MouseEvent): void {
    if (!this.suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressClick = false;
  }

  @HostListener('pointercancel')
  @HostListener('lostpointercapture')
  @HostListener('window:blur')
  protected cancel(): void {
    if (this.gesture) this.field.value = this.gesture.text;
    this.gesture = undefined;
    this.dragging = false;
  }

  @HostListener('keydown.escape', ['$event'])
  protected escape(event: Event): void {
    if (!this.gesture) return;
    event.stopPropagation();
    this.cancel();
  }
}
