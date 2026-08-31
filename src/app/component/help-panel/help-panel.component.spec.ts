import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HelpPanelComponent } from './help-panel.component';
import { NotificationService } from '../../services/notification.service';

/**
 * The feedback form's one dependency on the deployment: a key for the mail
 * service, fetched from a Netlify function.
 *
 * There are two ways to have no key and they used to be told apart by whether
 * `fetch` threw, which is the wrong question. A site with the function deployed
 * and `EMAIL_JS_KEY` unset answers 200 with `{}` -- because
 * `JSON.stringify({apiKey: undefined})` drops the field -- so nothing threw,
 * EmailJS was initialized with `undefined`, and the reader was told the message
 * had failed to send and to try again later. It was never going to send, and
 * trying again was never going to help. That is the case this file exists for.
 */
describe('HelpPanelComponent, finding the mail key', () => {
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

  /** The component's own lookup, which is private because nothing else needs it. */
  const mailKey = async (): Promise<string | undefined> => {
    const component = TestBed.createComponent(HelpPanelComponent).componentInstance;
    return (component as unknown as { mailKey: () => Promise<string | undefined> }).mailKey();
  };

  it('finds the key a configured deploy answers with', async () => {
    answerWith({ apiKey: 'aBcDeFgHiJkLmNoPq' });
    expect(await mailKey()).toBe('aBcDeFgHiJkLmNoPq');
  });

  it('asks the function by its real path, with one slash', async () => {
    answerWith({ apiKey: 'k' });
    await mailKey();
    expect(fetched).toEqual(['/.netlify/functions/getEmailJSKey']);
  });

  it('finds none where the deploy answers without one', async () => {
    // Exactly what an unconfigured site returns: 200, and an empty object.
    answerWith({});
    expect(await mailKey()).toBeUndefined();
  });

  it('finds none where the key is there but empty', async () => {
    answerWith({ apiKey: '' });
    expect(await mailKey()).toBeUndefined();
  });

  it('finds none where there is no function at all, which is a dev server', async () => {
    answerWith(undefined, false);
    expect(await mailKey()).toBeUndefined();
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
