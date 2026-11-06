import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroupDirective,
  FormsModule,
  NgForm,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AnalyticsService } from '../../services/analytics.service';
import { HELP_ADDRESS, MailService, NO_MAIL_KEY } from '../../services/mail.service';
import { NotificationService } from '../../services/notification.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';

/** Error when invalid control is dirty, touched, or submitted. */
export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}

/**
 * The Help drawer: one card with a section per subject, like Settings.
 *
 * It used to be two cards stacked in the drawer, each with a title of its own,
 * so the drawer had two accent bars and two headings competing with the one
 * that names it. A drawer is one thing; the subjects inside it are sections.
 */
@Component({
  selector: 'app-help-panel',
  templateUrl: './help-panel.component.html',
  styleUrls: ['./help-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionComponent,
    TitleBlock,
    CollapsibleSubsectionComponent,
    ButtonComponent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatCheckbox,
  ],
})
export class HelpPanelComponent {
  readonly shortcuts = inject(KeyboardShortcutsService);
  private fb = inject(FormBuilder);
  private notify = inject(NotificationService);
  private analytics = inject(AnalyticsService);
  private urlGenerationService = inject(UrlGenerationService);
  private mail = inject(MailService);

  sendingEmail = false;

  /** The vocabulary used across the editor, analyses, and exports. */
  readonly glossary = [
    {
      term: 'Mechanism',
      meaning: 'A connected assembly PMKS+ solves as one motion with one driven input.',
    },
    {
      term: 'Linkage',
      meaning: 'A system of rigid links joined together. A drawing can contain several mechanisms.',
    },
    { term: 'Link', meaning: 'A rigid body that keeps the joints on it a fixed distance apart.' },
    { term: 'Joint', meaning: 'A connection where links rotate or slide relative to one another.' },
    { term: 'Grounded', meaning: 'Fixed to the stationary reference frame.' },
    { term: 'Driven input', meaning: 'The joint or slider whose motion advances the mechanism.' },
    {
      term: 'Start pose',
      meaning: 'The position treated as time zero for animation and analysis.',
    },
    {
      term: 'Degrees of freedom',
      meaning:
        'The independent motions available. PMKS+ solves one degree of freedom per mechanism.',
    },
    {
      term: 'Tracer point',
      meaning: 'A point carried by one link whose path can be drawn over a full cycle.',
    },
    {
      term: 'Reference frame',
      meaning: 'The coordinate system used for a force: fixed to the grid or moving with its link.',
    },
    { term: 'Center of mass', meaning: 'The balance point used for a link’s weight and inertia.' },
    {
      term: 'Static force analysis',
      meaning: 'Balances each pose without motion-related inertia forces.',
    },
    {
      term: 'In-motion force analysis',
      meaning: 'Includes the inertia produced by the moving parts.',
    },
    {
      term: 'Fixed length, fixed angle',
      meaning:
        'A constraint on one bar: it keeps that value while its joints still move on the line or ' +
        'the arc the value leaves them. Released from the padlock in the panel.',
    },
    {
      term: 'Lock',
      meaning:
        'A mark on a joint, link or force that refuses to let it move at all. Different from a ' +
        'fixed length or angle, which allows the motions that keep the value true.',
    },
    {
      term: 'Toggle',
      meaning: 'A pose where a small input movement can produce very large output rates or forces.',
    },
    {
      term: 'Revolutions per minute (RPM)',
      meaning: 'The rotational speed unit used for a driven pin.',
    },
  ];

  commentForm = this.fb.group({
    comment: ['', Validators.required],
    email: ['', Validators.email],
    response: [false],
    diagnostics: [true],
    project: [true],
  });

  matcher = new MyErrorStateMatcher();

  // Arrows, because `button-block` takes the handler as a value and calls it
  // bare: as ordinary methods these arrived with no `this`, and the two that
  // open a link logged their analytics event off the end of an undefined
  // service -- after the tab had already opened, which is why it looked fine.
  readonly gotoHelpSite = (): void => {
    window.open('https://pmks.mech.website/pmks-web-how-to-videos/', '_blank');
    this.analytics.logEvent('goto_help_site');
  };

  readonly gotoGithub = (): void => {
    window.open('https://github.com/PMKS-Web/PMKSWeb', '_blank');
    this.analytics.logEvent('goto_github');
  };

  readonly sendCommentEmail = async (): Promise<void> => {
    this.sendingEmail = true;
    if (this.commentForm.invalid) {
      this.notify.refusal('feedback.incomplete', 'Fill in the form before sending it.');
      this.sendingEmail = false;
      return;
    }

    const browserInfo = this.commentForm.value.diagnostics
      ? this.mail.diagnostics()
      : 'User did not allow diagnostics';

    let projectURL = 'User did not leave a project URL';
    if (this.commentForm.value.project) {
      projectURL = this.urlGenerationService.generateFullUrl();
    }

    const params = {
      to_email: HELP_ADDRESS,
      message: this.commentForm.value.comment
        ? this.commentForm.value.comment
        : 'User did not leave a comment',
      email: this.commentForm.value.email
        ? this.commentForm.value.email
        : 'User did not leave an email and does not want a response',
      diagnostic: browserInfo,
      project: projectURL,
    };

    try {
      const outcome = await this.mail.send('template_kfwdx5c', params);
      if (outcome === 'no-key') {
        this.notify.failure('feedback.no-key', NO_MAIL_KEY);
        return;
      }
      this.notify.success('feedback.sent', 'Message sent. Thank you for your feedback!');
      this.commentForm.reset();
    } catch (error: unknown) {
      console.log(error);
      this.notify.failure(
        'feedback.send-failed',
        `Message failed to send. Please try again later or contact us directly at: ${HELP_ADDRESS}`
      );
    } finally {
      this.sendingEmail = false;
    }
  };
}
