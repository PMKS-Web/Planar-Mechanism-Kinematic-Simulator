import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { MechanismService } from 'src/app/services/mechanism.service';
import { MechanismOverviewService } from 'src/app/services/mechanism-overview.service';
import { UrlGenerationService } from 'src/app/services/url-generation.service';
import { HELP_ADDRESS, MailService, NO_MAIL_KEY } from 'src/app/services/mail.service';
import { NotificationService } from 'src/app/services/notification.service';
import { ViewportService } from 'src/app/services/viewport.service';
import { canvasSnapshot } from 'src/app/services/export/canvas-svg';
import { issueText } from 'src/app/model/mechanism/setup-issue';
import { SegmentedComponent } from '../../../BLOCKS/segmented/segmented.component';
import { CardFace, TemplateCardComponent } from '../template-card/template-card.component';
import { TEMPLATE_CARDS, TemplateCard } from '../template-catalog';
import {
  libraryCardFor,
  MechanismSourceKind,
  MechanismSummary,
  PastedLink,
  readPastedLink,
  summarize,
  svgDataUrl,
} from './mechanism-source';
import {
  CREDIT_LIMIT,
  DESCRIPTION_LIMIT,
  fieldError,
  FIELD_ORDER,
  SentSuggestion,
  sectionName,
  SUGGESTABLE_SECTIONS,
  SuggestionForm,
  suggestionParams,
  TITLE_LIMIT,
  whatToFix,
} from './suggestion';
import { SuggestionDraftService } from './suggestion-draft.service';

/**
 * The EmailJS template a suggestion is sent with.
 *
 * The feedback form's, for now: `suggestionParams` writes the whole suggestion
 * into the `message` that template reads, beside each field on its own, so a
 * template written for suggestions can replace this id without the form
 * changing.
 */
const SUGGESTION_TEMPLATE = 'template_kfwdx5c';

/** A picture for a card whose drawing is not there yet: white, like the grid. */
const NO_STILL = svgDataUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="400"></svg>'
);

const INCOMPLETE = 'suggest.incomplete';
const SEND_FAILED = 'suggest.send-failed';

/** How long typing in the link field waits before the link is read. */
const READ_AFTER_MS = 250;

/**
 * Suggest a Mechanism: the form, and beside it the card it would become.
 *
 * A view inside the library dialog rather than a dialog of its own, so the
 * preview is drawn at the card's real size beside the cards it would join,
 * and the way back is to the library exactly as the reader left it. The form
 * itself belongs to the dialog, which is what lets it survive the Sent view
 * and a trip back to the library.
 */
@Component({
  selector: 'app-suggest-mechanism',
  templateUrl: './suggest-mechanism.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ReactiveFormsModule,
    MatIcon,
    NgTemplateOutlet,
    SegmentedComponent,
    TemplateCardComponent,
  ],
})
export class SuggestMechanismComponent implements OnInit, OnDestroy {
  private mechanism = inject(MechanismService);
  private overview = inject(MechanismOverviewService);
  private urls = inject(UrlGenerationService);
  private mail = inject(MailService);
  private notify = inject(NotificationService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private drafts = inject(SuggestionDraftService);
  readonly viewport = inject(ViewportService);

  readonly form = input.required<SuggestionForm>();
  /** Cancel: back to the library, with what was typed kept. */
  readonly back = output<void>();
  readonly sent = output<SentSuggestion>();

  readonly helpAddress = HELP_ADDRESS;
  readonly titleLimit = TITLE_LIMIT;
  readonly descriptionLimit = DESCRIPTION_LIMIT;
  readonly creditLimit = CREDIT_LIMIT;
  readonly sections = SUGGESTABLE_SECTIONS;
  readonly sourceOptions = ['Open Mechanism', 'Paste a Link'] as const;

  /** Nothing on the grid: the open mechanism is no mechanism. */
  readonly gridEmpty = this.mechanism.joints.length === 0;
  readonly emptyReason = 'Nothing on the grid yet. Draw a mechanism first, or paste a link to one.';

  /**
   * The open mechanism, read once: the grid cannot change while the library
   * covers it. The link itself is taken at Send, so the email carries what was
   * drawn when the reader pressed it.
   */
  readonly open: MechanismSummary | undefined = this.gridEmpty ? undefined : this.readOpen();
  readonly openStill: string = this.gridEmpty ? NO_STILL : this.snapshotOpen();

  pasted: PastedLink = { kind: 'empty' };
  /** A link typed or pasted, waiting to be read. */
  reading = false;
  private readTimer?: ReturnType<typeof setTimeout>;

  /** Errors show from the first Send on, and follow the typing after that. */
  submitted = false;
  /** Kept on the session's draft, so the views around the form hold still too. */
  get sending(): boolean {
    return this.drafts.sending;
  }
  /** The phone's Card Preview row, folded until it is asked for. */
  previewOpen = false;

  private watching?: Subscription;

  ngOnInit(): void {
    const form = this.form();
    if (this.gridEmpty) form.controls.source.setValue('pasted-link');
    // A draft carried back from the library still holds its link.
    if (form.controls.link.value) this.pasted = this.readLink(form.controls.link.value);
    this.watching = form.controls.link.valueChanges.subscribe((text) => this.linkTyped(text));
  }

  ngOnDestroy(): void {
    this.watching?.unsubscribe();
    clearTimeout(this.readTimer);
    // Its Try again would send from a form that is no longer on screen.
    this.notify.dismissId(SEND_FAILED);
  }

  get source(): MechanismSourceKind {
    return this.form().controls.source.value;
  }

  chooseSource(index: number): void {
    this.form().controls.source.setValue(index === 0 ? 'open-mechanism' : 'pasted-link');
  }

  /** The mechanism this suggestion is about, whichever source it comes from. */
  get summary(): MechanismSummary | undefined {
    if (this.source === 'open-mechanism') return this.open;
    return this.pasted.kind === 'opened' ? this.pasted.summary : undefined;
  }

  get still(): string {
    if (this.source === 'open-mechanism') return this.openStill;
    return this.pasted.kind === 'opened' ? this.pasted.still : NO_STILL;
  }

  /** The link field's own line: what it is waiting for, what it found, or why it will not do. */
  get linkMessage(): { text: string; bad: boolean } {
    if (this.reading) return { text: 'Opening the link…', bad: false };
    switch (this.pasted.kind) {
      case 'opened':
        return {
          text: `Opened: ${this.pasted.summary.name.toLowerCase()}, ${this.pasted.summary.meta}.`,
          bad: false,
        };
      case 'foreign':
        return {
          text: 'That is not a PMKS+ link. Copy one with Share Project in the project menu.',
          bad: true,
        };
      case 'broken':
        return {
          text: 'That link is cut short, so it does not open. Copy the whole link again.',
          bad: true,
        };
      default:
        return this.submitted
          ? { text: 'Paste a link to the mechanism.', bad: true }
          : {
              text: 'Copy one with Share Project in the project menu. Any PMKS+ link works, yours or someone else’s.',
              bad: false,
            };
    }
  }

  error(field: 'title' | 'description' | 'credit' | 'email' | 'consent'): string {
    return this.submitted ? fieldError(this.form(), field) : '';
  }

  over(field: 'title' | 'description' | 'credit', limit: number): boolean {
    return this.form().controls[field].value.length > limit;
  }

  // ---------- the preview ----------

  /** The card as the library would show it, empty fields standing in. */
  get face(): CardFace {
    const value = this.form().getRawValue();
    return {
      name: value.title.trim() || 'Your Title',
      description: value.description.trim() || 'One sentence about what it does.',
      thumbnail: this.still,
      credit: value.credit.trim() || undefined,
    };
  }

  /** The section heading over the preview. */
  get previewSection(): string {
    return sectionName(this.form().controls.section.value) ?? 'Section to be decided';
  }

  /** The card it would sit beside, faded, to place it in its section. */
  get neighbor(): TemplateCard {
    const section = this.form().controls.section.value;
    return (
      TEMPLATE_CARDS.find((card) => card.category === section) ??
      TEMPLATE_CARDS.find((card) => card.category === 'start') ??
      TEMPLATE_CARDS[0]
    );
  }

  /** What We Send, row by row; a row with nothing in it says so in gray. */
  get sends(): { label: string; value: string; none?: boolean }[] {
    const value = this.form().getRawValue();
    const section = sectionName(value.section);
    const email = value.email.trim();
    return [
      { label: 'To', value: HELP_ADDRESS },
      {
        label: 'Mechanism',
        value:
          this.source === 'open-mechanism'
            ? 'A link to the drawing on your grid'
            : 'The link you pasted',
      },
      { label: 'Section', value: section ?? 'Not sure', none: !section },
      { label: 'Reply to', value: email || 'No email, so no reply', none: !email },
      { label: 'Version', value: 'PMKS+ version and browser, to open it as you drew it' },
    ];
  }

  /** The note under the preview: why there is no name on it, or what the picture is. */
  get previewNote(): { icon: string; text: string } {
    if (!this.form().controls.credit.value.trim()) {
      return {
        icon: 'visibility_off',
        text: 'No credit line: Credit As is blank, so the card carries no name.',
      };
    }
    return {
      icon: 'photo_camera',
      text:
        this.source === 'open-mechanism'
          ? 'The picture is a still of your grid. If we add it, we draw a clean one and an animation for it.'
          : 'The picture is drawn from the link. If we add it, we draw a clean one and an animation for it.',
    };
  }

  // ---------- sending ----------

  async send(): Promise<void> {
    if (this.sending) return;
    this.submitted = true;
    const form = this.form();
    form.markAllAsTouched();
    // A link still waiting to be read is read now rather than refused.
    if (this.reading) this.readNow();

    const failing = FIELD_ORDER.map((entry) => entry.field).filter((field) =>
      field === 'link'
        ? this.source === 'pasted-link' && this.pasted.kind !== 'opened'
        : form.controls[field as keyof SuggestionForm['controls']].invalid
    );
    if (failing.length > 0) {
      // Said again rather than left standing: a second Send after fixing one
      // field has a shorter list, and the old one would name a fixed field.
      this.notify.dismissId(INCOMPLETE);
      this.notify.refusal(INCOMPLETE, whatToFix(failing), { cooldownMs: 0 });
      this.focus(failing[0]);
      return;
    }

    this.drafts.sending = true;
    // An earlier failure's Try again is this send now; left up, it would be a
    // second one.
    this.notify.dismissId(SEND_FAILED);
    const value = form.getRawValue();
    const project =
      this.source === 'open-mechanism'
        ? this.urls.generateFullUrl()
        : this.pasted.kind === 'opened'
          ? this.pasted.address
          : '';
    const params = suggestionParams(
      value,
      project,
      this.summary?.line ?? 'Not read',
      this.mail.diagnostics()
    );
    try {
      const outcome = await this.mail.send(SUGGESTION_TEMPLATE, params);
      if (outcome === 'no-key') {
        this.notify.failure('suggest.no-key', NO_MAIL_KEY);
        return;
      }
      this.sent.emit({
        title: value.title.trim(),
        description: value.description.trim(),
        credit: value.credit.trim(),
        email: value.email.trim(),
        section: sectionName(value.section),
        still: this.still,
      });
    } catch (error: unknown) {
      console.log(error);
      this.notify.failure(
        SEND_FAILED,
        'The suggestion did not send. Everything you typed is still here.',
        { actions: [{ label: 'Try again', run: () => void this.send() }] }
      );
    } finally {
      this.drafts.sending = false;
    }
  }

  /** Where Send leaves the reader: on the first thing it named. */
  private focus(field: string): void {
    const id = `suggest-${field}`;
    // After this pass, so a field the error has just turned red is the one focused.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus());
  }

  // ---------- reading the sources ----------

  private linkTyped(text: string): void {
    clearTimeout(this.readTimer);
    if (text.trim() === '') {
      this.reading = false;
      this.pasted = { kind: 'empty' };
      return;
    }
    this.reading = true;
    this.readTimer = setTimeout(() => this.readNow(), READ_AFTER_MS);
  }

  private readNow(): void {
    clearTimeout(this.readTimer);
    this.reading = false;
    this.pasted = this.readLink(this.form().controls.link.value);
  }

  private readLink(text: string): PastedLink {
    return readPastedLink(text, window.location.hostname);
  }

  /** The machine panel's own reading of each machine, so the two cannot disagree. */
  private readOpen(): MechanismSummary {
    const solved = this.mechanism.mechanisms.length === this.overview.count();
    const machines = solved
      ? Array.from({ length: this.overview.count() }, (_, index) => ({
          family: this.overview.family(index).name,
          runs: this.overview.ready(index),
        }))
      : [];
    const blocker =
      this.mechanism
        .readinessOfEachMechanism()
        .flatMap((readiness) => readiness.checks)
        .find((check) => check.severity === 'blocker') ?? this.mechanism.unassignedReports()[0];
    const summary = summarize(
      this.mechanism.joints,
      this.mechanism.links,
      machines,
      blocker ? issueText(blocker) : undefined
    );
    summary.inLibrary = libraryCardFor(this.urls.generateUrlQuery());
    return summary;
  }

  private snapshotOpen(): string {
    const svg = canvasSnapshot(560, 400);
    return svg ? svgDataUrl(svg) : NO_STILL;
  }
}
