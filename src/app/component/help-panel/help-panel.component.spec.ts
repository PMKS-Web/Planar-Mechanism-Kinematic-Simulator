import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HelpPanelComponent } from './help-panel.component';
import { NotificationService } from '../../services/notification.service';

/**
 * The feedback form, against a deploy that cannot send.
 *
 * How the key is found is `MailService`'s, and its spec says how; what this
 * form owes the reader is the right sentence when there is none.
 */
describe('HelpPanelComponent, sending feedback', () => {
  let notifications: { id: string; text: string }[];
  let fetched: string[];

  const answerWith = (body: unknown, ok = true) => {
    globalThis.fetch = ((url: string) => {
      fetched.push(url);
      if (!ok) return Promise.reject(new Error('no such function'));
      return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
    }) as typeof fetch;
  };

  beforeEach(() => {
    notifications = [];
    fetched = [];
    TestBed.configureTestingModule({
      imports: [HelpPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: NotificationService,
          useValue: {
            failure: (id: string, text: string) => notifications.push({ id, text }),
            refusal: (id: string, text: string) => notifications.push({ id, text }),
            success: (id: string, text: string) => notifications.push({ id, text }),
          },
        },
      ],
    });
  });

  it('defines the shared terms used by editing and analysis', () => {
    answerWith({});
    const component = TestBed.createComponent(HelpPanelComponent).componentInstance;
    const terms = component.glossary.map((entry) => entry.term);
    expect(terms).toContain('Mechanism');
    expect(terms).toContain('Linkage');
    expect(terms).toContain('Reference frame');
    expect(terms).toContain('Center of mass');
    // The pair the app most often has to tell apart: a constraint that still
    // allows motion, and a mark that allows none.
    expect(terms).toContain('Fixed length, fixed angle');
    expect(terms).toContain('Lock');
  });

  it('tells the reader the build cannot send, rather than to try again', async () => {
    answerWith({});
    const fixture = TestBed.createComponent(HelpPanelComponent);
    const component = fixture.componentInstance;
    component.commentForm.setValue({
      comment: 'The gear will not retract.',
      email: '',
      response: false,
      diagnostics: false,
      project: false,
    });
    await component.sendCommentEmail();

    expect(notifications.length).toBe(1);
    const [only] = notifications;
    expect(only.id).toBe('feedback.no-key');
    // The way out is an address, not a retry: nothing about this clears with
    // time, so "try again later" would be an instruction that cannot work.
    expect(only.text).toContain('help@pmksplus.com');
    expect(only.text).not.toContain('try again');
    // And the button is released, or the form is dead until the drawer closes.
    expect(component.sendingEmail).toBe(false);
  });
});
