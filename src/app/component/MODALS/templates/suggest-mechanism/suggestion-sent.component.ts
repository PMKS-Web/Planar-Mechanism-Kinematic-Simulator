import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ViewportService } from 'src/app/services/viewport.service';
import { CardFace, TemplateCardComponent } from '../template-card/template-card.component';
import { SentSuggestion } from './suggestion';

/**
 * What the reader sees once a suggestion has gone: a view, not a toast.
 *
 * A toast would say "sent" over a form that still held everything, which
 * reads as nothing having happened -- and Send pressed again is a second
 * email. The form is left as it was until Suggest Another clears it.
 */
@Component({
  selector: 'app-suggestion-sent',
  templateUrl: './suggestion-sent.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, TemplateCardComponent],
})
export class SuggestionSentComponent {
  readonly viewport = inject(ViewportService);

  readonly sent = input.required<SentSuggestion>();
  readonly another = output<void>();
  readonly library = output<void>();

  /** What happens if it is added, and whether anyone hears about it. */
  readonly outcome = computed(() => {
    const sent = this.sent();
    const where = sent.credit ? 'with your name on its card' : 'the library';
    const reply = sent.email ? `, and we will write to ${sent.email}` : '';
    return `it goes in ${where}${reply}.`;
  });

  readonly face = computed<CardFace>(() => {
    const sent = this.sent();
    return {
      name: sent.title,
      description: sent.description,
      thumbnail: sent.still,
      credit: sent.credit || undefined,
    };
  });
}
