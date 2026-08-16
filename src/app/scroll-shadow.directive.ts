import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, inject } from '@angular/core';

/**
 * Say when a scrolling card has something above it, out of sight.
 *
 * These cards keep their title in place and scroll everything else under it,
 * so a card scrolled off its own top read as a card that simply started
 * there: the first setting ran up beneath the title and was gone, leaving
 * white space that looked like the top of the panel rather than the middle of
 * it. The host carries a `scrolled` class while there is anything above, and
 * the card's own stylesheet says what to do about it -- which is a shadow
 * under the title, cast onto whatever is passing beneath.
 *
 * The listener is bound outside Angular. Through the template it would run
 * change detection for every frame of every scroll, on panels that hold a
 * hundred controls; nothing here needs the framework, since it is one class on
 * the element being scrolled.
 */
@Directive({
  selector: '[appScrollShadow]',
})
export class ScrollShadowDirective implements AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly onScroll = () => {
    const box = this.host.nativeElement;
    box.classList.toggle('scrolled', box.scrollTop > 1);
  };

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() =>
      this.host.nativeElement.addEventListener('scroll', this.onScroll, { passive: true })
    );
  }

  ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('scroll', this.onScroll);
  }
}
