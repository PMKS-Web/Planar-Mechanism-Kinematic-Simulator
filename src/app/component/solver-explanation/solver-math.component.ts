import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import katex from 'katex';

@Component({
  selector: 'app-solver-math',
  template: '<div class="math" [class.inline]="inline()" [innerHTML]="rendered()"></div>',
  styles: [
    ':host { display:block; min-width:0; } .math { overflow-x:auto; overflow-y:hidden; padding:8px 2px; font-size:1em; } .math.inline { padding:0 2px; }',
  ],
})
export class SolverMathComponent {
  readonly equation = input.required<string>();
  readonly inline = input(false);
  private sanitizer = inject(DomSanitizer);
  protected readonly rendered = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      // Only KaTeX output reaches this binding. Resource loading and HTML commands stay disabled.
      katex.renderToString(this.equation(), {
        displayMode: !this.inline(),
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxExpand: 500,
        maxSize: 20,
      })
    )
  );
}
