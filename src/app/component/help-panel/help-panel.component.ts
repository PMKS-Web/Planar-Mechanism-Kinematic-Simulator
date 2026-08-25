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

  readonly sendCommentEmail = async (): Promise<void> => {
    this.sendingEmail = true;
    if (this.commentForm.invalid) {
      this.notify.refusal('feedback.incomplete', 'Fill in the form before sending it.');
      this.sendingEmail = false;
      return;
    }

    let emailJSKey = '';
    try {
      const res = await fetch('/.netlify//functions/getEmailJSKey').then((response) =>
        response.json()
      );
      emailJSKey = res.apiKey;
    } catch (err) {
      console.log(err);
      this.notify.failure(
        'feedback.no-key',
        'It looks like you are in a development environment. If this is not the case, please try again later or contact us directly at: help@pmksplus.com'
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
