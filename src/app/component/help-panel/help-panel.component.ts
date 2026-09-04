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
import emailjs from '@emailjs/browser';
import { environment } from '../../../environments/environment';
import { AnalyticsService } from '../../services/analytics.service';
import { NotificationService } from '../../services/notification.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { SubtitleComponent } from '../BLOCKS/subtitle/subtitle.component';
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
    CollapsibleSubsecitonComponent,
    ButtonComponent,
    SubtitleComponent,
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
    { term: 'Start pose', meaning: 'The position treated as time zero for playback and analysis.' },
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

  private getBrowserName(): string {
    const agent = window.navigator.userAgent.toLowerCase();
    switch (true) {
      case agent.indexOf('edge') > -1:
        return 'Edge';
      case agent.indexOf('opr') > -1 && !!(window as unknown as Record<string, unknown>)['opr']:
        return 'Opera';
      case agent.indexOf('chrome') > -1 &&
        !!(window as unknown as Record<string, unknown>)['chrome']:
        return 'Chrome';
      case agent.indexOf('trident') > -1:
        return 'Internet Explorer';
      case agent.indexOf('firefox') > -1:
        return 'Firefox';
      case agent.indexOf('safari') > -1:
        return 'Safari';
      default:
        return 'Other';
    }
  }

  private detectBrowserVersion(): string {
    const userAgent = navigator.userAgent;
    let tem;
    let matchTest =
      userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

    if (/trident/i.test(matchTest[1])) {
      tem = /\brv[ :]+(\d+)/g.exec(userAgent) || [];
      return 'IE ' + (tem[1] || '');
    }
    if (matchTest[1] === 'Chrome') {
      tem = userAgent.match(/\b(OPR|Edge)\/(\d+)/);
      if (tem != null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    matchTest = matchTest[2]
      ? [matchTest[1], matchTest[2]]
      : [navigator.appName, navigator.appVersion, '-?'];
    if ((tem = userAgent.match(/version\/(\d+)/i)) != null) matchTest.splice(1, 1, tem[1]);
    return matchTest.join(' ');
  }

  /**
   * The key this build sends mail with, or nothing if it has none.
   *
   * Two ways to have none, and the reader needs the same thing in both: no
   * function at all, which is a local `ng serve`, and a function that answers
   * without a key, which is a deploy whose `EMAIL_JS_KEY` was never set.
   *
   * The second one used to pass for success. `JSON.stringify({apiKey: undefined})`
   * is `{}`, so an unconfigured site answers 200 with an empty object, nothing
   * throws, and the old code went on to initialize EmailJS with `undefined` and
   * post a message that could not be delivered. What the reader was told was
   * "Message failed to send. Please try again later" -- an invitation to keep
   * pressing a button that could never work, about a fault no amount of trying
   * would clear. Checked here instead, so the one place that knows the key is
   * missing is the place that says so.
   */
  private async mailKey(): Promise<string | undefined> {
    try {
      const response = await fetch('/.netlify/functions/getEmailJSKey');
      const key: unknown = (await response.json())?.apiKey;
      return typeof key === 'string' && key.length > 0 ? key : undefined;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  readonly sendCommentEmail = async (): Promise<void> => {
    this.sendingEmail = true;
    if (this.commentForm.invalid) {
      this.notify.refusal('feedback.incomplete', 'Fill in the form before sending it.');
      this.sendingEmail = false;
      return;
    }

    const emailJSKey = await this.mailKey();
    if (!emailJSKey) {
      this.notify.failure(
        'feedback.no-key',
        'This build of PMKS+ has no key for the mail service, so the form cannot send. ' +
          'Write to help@pmksplus.com instead.'
      );
      this.sendingEmail = false;
      return;
    }
    emailjs.init(emailJSKey);

    let browserInfo = '';
    if (this.commentForm.value.diagnostics) {
      browserInfo += 'Browser: ';
      browserInfo += this.getBrowserName();
      browserInfo += '\n Browser Version: ';
      browserInfo += this.detectBrowserVersion();
      browserInfo += '\n OS: ';
      browserInfo += window.navigator.platform;
      browserInfo += '\n User Agent: ';
      browserInfo += window.navigator.userAgent;
      browserInfo += '\n App Version: ';
      browserInfo += environment.appVersion;
    } else {
      browserInfo = 'User did not allow diagnostics';
    }

    let projectURL = 'User did not leave a project URL';
    if (this.commentForm.value.project) {
      projectURL = this.urlGenerationService.generateFullUrl();
    }

    const params = {
      to_email: 'help@pmksplus.com',
      message: this.commentForm.value.comment
        ? this.commentForm.value.comment
        : 'User did not leave a comment',
      email: this.commentForm.value.email
        ? this.commentForm.value.email
        : 'User did not leave an email and does not want a response',
      diagnostic: browserInfo,
      project: projectURL,
    };

    emailjs
      .send('service_pg2k647', 'template_kfwdx5c', params)
      .then(() => {
        this.notify.success('feedback.sent', 'Message sent. Thank you for your feedback!');
        this.sendingEmail = false;
        this.commentForm.reset();
      })
      .catch((error: unknown) => {
        console.log(error);
        this.notify.failure(
          'feedback.send-failed',
          'Message failed to send. Please try again later or contact us directly at: help@pmksplus.com'
        );
        this.sendingEmail = false;
      });
  };
}
