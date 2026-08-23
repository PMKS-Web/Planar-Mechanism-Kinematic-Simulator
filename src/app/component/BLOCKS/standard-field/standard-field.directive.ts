import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Gives a hand-written `<input>` the two manners every field composed from the
 * BLOCKS primitives already has: clicking it selects the whole value, and Enter
 * commits what was typed.
 *
 * `input-block` and `dual-input-block` wire both into their own templates, so a
 * panel built from them gets this for free and a panel that writes its own
 * boxes -- Synthesis, whose position rows are too dense a grid for a block that
 * renders a label and one field -- silently did not.
 *
 * Enter commits by blurring rather than by writing to the control, because the
 * panels' forms are `updateOn: 'blur'`: the blur *is* the commit, and reaching
 * past it would be a second route in that skips whatever the first one checks.
 */
@Directive({ selector: 'input[appStandardField]' })
export class StandardFieldDirective {
  private readonly el: ElementRef<HTMLInputElement> = inject(ElementRef);

  @HostListener('click')
  selectAll(): void {
    this.el.nativeElement.select();
  }

  @HostListener('keyup.enter')
  commit(): void {
    this.el.nativeElement.blur();
  }
}
