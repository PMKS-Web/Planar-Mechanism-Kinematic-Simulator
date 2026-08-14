import { Directive, ElementRef, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appPrefixFocusAndSelect]',
  standalone: false,
})
export class FocusOnShowDirective implements OnInit {
  private el = inject(ElementRef);

  constructor() {
    const el = this.el;

    if (!el.nativeElement['focus']) {
      throw new Error('Element does not accept focus.');
    }
  }

  ngOnInit(): void {
    const input: HTMLInputElement = this.el.nativeElement as HTMLInputElement;
    input.focus();
    input.select();
  }
}
