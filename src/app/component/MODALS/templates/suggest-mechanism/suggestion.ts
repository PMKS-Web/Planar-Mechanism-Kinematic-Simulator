import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HELP_ADDRESS } from '../../../../services/mail.service';
import { TEMPLATE_CATEGORIES, TemplateCategoryID } from '../template-catalog';
import { MechanismSourceKind } from './mechanism-source';

/** As long as the library's own titles get, and what fits on one line of a card. */
export const TITLE_LIMIT = 40;
/** What three lines of a 300px card hold, which is what the caption reserves. */
export const DESCRIPTION_LIMIT = 140;
/** One line under the description, with the icon and "Suggested by". */
export const CREDIT_LIMIT = 40;

/** A section the reader may file a suggestion under, or none. */
export type SuggestedSection = Exclude<TemplateCategoryID, 'dev'> | 'unsure';

/** The sections offered, in the library's own order, and Not Sure last. */
export const SUGGESTABLE_SECTIONS: readonly { id: SuggestedSection; name: string }[] = [
  ...TEMPLATE_CATEGORIES.filter(
    (category): category is Exclude<(typeof TEMPLATE_CATEGORIES)[number], { id: 'dev' }> =>
      category.id !== 'dev'
  ),
  { id: 'unsure', name: 'Not Sure' },
];

/** A section's name, or nothing where the reader left it to us. */
export function sectionName(id: SuggestedSection): string | undefined {
  if (id === 'unsure') return undefined;
  return SUGGESTABLE_SECTIONS.find((section) => section.id === id)?.name;
}

/** Required means something other than spaces: a title of three blanks is no title. */
function written(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() !== ''
    ? null
    : { required: true };
}

export type SuggestionForm = FormGroup<{
  source: FormControl<MechanismSourceKind>;
  link: FormControl<string>;
  title: FormControl<string>;
  description: FormControl<string>;
  section: FormControl<SuggestedSection>;
  credit: FormControl<string>;
  email: FormControl<string>;
  consent: FormControl<boolean>;
}>;

/**
 * A blank suggestion.
 *
 * Over its limits is invalid rather than impossible: the inputs carry no
 * `maxlength`, so a pasted title arrives whole and the counter says how much to
 * cut, instead of the field quietly eating the end of it.
 */
export function blankSuggestion(): SuggestionForm {
  return new FormGroup({
    source: new FormControl<MechanismSourceKind>('open-mechanism', { nonNullable: true }),
    // Checked by the component, which is what knows whether the link opened.
    link: new FormControl('', { nonNullable: true }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [written, Validators.maxLength(TITLE_LIMIT)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [written, Validators.maxLength(DESCRIPTION_LIMIT)],
    }),
    section: new FormControl<SuggestedSection>('unsure', { nonNullable: true }),
    credit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(CREDIT_LIMIT)],
    }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    consent: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });
}

/** What a field says under itself when it will not do, or nothing when it will. */
export function fieldError(form: SuggestionForm, field: keyof SuggestionForm['controls']): string {
  const errors = form.controls[field].errors;
  if (!errors) return '';
  switch (field) {
    case 'title':
      return errors['required'] ? 'Give it a title.' : `Shorten it to ${TITLE_LIMIT} characters.`;
    case 'description':
      return errors['required']
        ? 'Say in one sentence what it does.'
        : `Shorten it to ${DESCRIPTION_LIMIT} characters.`;
    case 'credit':
      return `Shorten it to ${CREDIT_LIMIT} characters.`;
    case 'email':
      return 'That is not an email address.';
    case 'consent':
      return 'Tick this to send it. We can only add what we may publish.';
    default:
      return '';
  }
}

/** The fields in the order a reader meets them, and what each is called in a sentence. */
export const FIELD_ORDER: readonly { field: string; called: string }[] = [
  { field: 'link', called: 'the link' },
  { field: 'title', called: 'the title' },
  { field: 'description', called: 'the description' },
  { field: 'credit', called: 'the credit' },
  { field: 'email', called: 'the email' },
  { field: 'consent', called: 'the permission box' },
];

const COUNTS = ['', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things'];

/**
 * The refusal when Send finds something to fix: how many, and which.
 *
 * "Two things to fix before this can send: the title and the description."
 */
export function whatToFix(fields: readonly string[]): string {
  const called = FIELD_ORDER.filter((entry) => fields.includes(entry.field)).map(
    (entry) => entry.called
  );
  const count = COUNTS[called.length] ?? `${called.length} things`;
  const list =
    called.length <= 1
      ? called.join('')
      : `${called.slice(0, -1).join(', ')} and ${called[called.length - 1]}`;
  return `${count} to fix before this can send: ${list}.`;
}

/** What was sent, kept for the Sent view after the form is free to change. */
export interface SentSuggestion {
  title: string;
  description: string;
  credit: string;
  email: string;
  section?: string;
  still: string;
}

/**
 * The parameters the EmailJS template reads.
 *
 * Every field on its own, for a template written for suggestions, and the same
 * facts as one readable `message` as well -- so the feedback template, which
 * reads only `message`, `email`, `diagnostic` and `project`, delivers a
 * complete suggestion too.
 */
export function suggestionParams(
  value: ReturnType<SuggestionForm['getRawValue']>,
  project: string,
  summary: string,
  diagnostic: string
): Record<string, string> {
  const section = sectionName(value.section) ?? 'Not sure';
  const credit = value.credit.trim() || 'Anonymous';
  const email = value.email.trim() || 'No reply wanted';
  const title = value.title.trim();
  const description = value.description.trim();
  const source = value.source;
  return {
    to_email: HELP_ADDRESS,
    subject: `Library suggestion: ${title}`,
    title,
    description,
    section,
    credit,
    email,
    source,
    project,
    summary,
    diagnostic,
    consent: value.consent ? 'yes' : 'no',
    message: [
      `Library suggestion: ${title}`,
      '',
      `Title: ${title}`,
      `Description: ${description}`,
      `Section: ${section}`,
      `Credit as: ${credit}`,
      `Mechanism: ${summary}`,
      `From: ${source === 'pasted-link' ? 'a pasted link' : 'the open mechanism'}`,
      'Permission to add it to the library: yes',
    ].join('\n'),
  };
}
