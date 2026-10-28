import { MailService } from './mail.service';

/**
 * Every form's one dependency on the deployment: a key for the mail service,
 * fetched from a Netlify function.
 *
 * There are two ways to have no key and they used to be told apart by whether
 * `fetch` threw, which is the wrong question. A site with the function deployed
 * and `EMAIL_JS_KEY` unset answers 200 with `{}` -- because
 * `JSON.stringify({apiKey: undefined})` drops the field -- so nothing threw,
 * EmailJS was initialized with `undefined`, and the reader was told the message
 * had failed to send and to try again later. It was never going to send, and
 * trying again was never going to help. That is the case this file exists for.
 */
describe('MailService, finding the key', () => {
  let fetched: string[];

  const answerWith = (body: unknown, ok = true) => {
    globalThis.fetch = ((url: string) => {
      fetched.push(url);
      if (!ok) return Promise.reject(new Error('no such function'));
      return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
    }) as typeof fetch;
  };

  beforeEach(() => {
    fetched = [];
  });

  it('finds the key a configured deploy answers with', async () => {
    answerWith({ apiKey: 'aBcDeFgHiJkLmNoPq' });
    expect(await new MailService().key()).toBe('aBcDeFgHiJkLmNoPq');
  });

  it('asks the function by its real path, with one slash', async () => {
    answerWith({ apiKey: 'k' });
    await new MailService().key();
    expect(fetched).toEqual(['/.netlify/functions/getEmailJSKey']);
  });

  it('finds none where the deploy answers without one', async () => {
    // Exactly what an unconfigured site returns: 200, and an empty object.
    answerWith({});
    expect(await new MailService().key()).toBeUndefined();
  });

  it('finds none where the key is there but empty', async () => {
    answerWith({ apiKey: '' });
    expect(await new MailService().key()).toBeUndefined();
  });

  it('finds none where there is no function at all, which is a dev server', async () => {
    answerWith(undefined, false);
    expect(await new MailService().key()).toBeUndefined();
  });

  it('says it cannot send rather than trying, when there is no key', async () => {
    answerWith({});
    expect(await new MailService().send('template', {})).toBe('no-key');
  });
});
