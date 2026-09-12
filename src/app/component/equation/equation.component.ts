import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import katex from 'katex';

/** Display math with stacked fractions and a MathML equivalent for assistive
 * technology. Only bounded KaTeX output crosses the HTML trust boundary. */
@Component({
  selector: 'app-equation',
  encapsulation: ViewEncapsulation.None,
  template: '<div class="equation" [innerHTML]="rendered()"></div>',
  styleUrl: './equation.component.scss',
})
export class EquationComponent {
  readonly math = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly rendered = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      katex.renderToString(this.math(), {
        displayMode: true,
        output: 'htmlAndMathml',
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxExpand: 500,
        maxSize: 20,
      })
    )
  );
}
