import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';
import { environment } from '../../environments/environment';

/** Where every form in the app sends to. */
export const HELP_ADDRESS = 'help@pmksplus.com';

/** The EmailJS service both forms send through. */
const MAIL_SERVICE = 'service_pg2k647';

/**
 * What a form says when this build cannot send at all.
 *
 * One sentence for every form, because the fault is the build's and the way
 * round it is the same whatever the reader was writing.
 */
export const NO_MAIL_KEY =
  'This build of PMKS+ has no key for the mail service, so the form cannot send. ' +
  `Write to ${HELP_ADDRESS} instead.`;

/**
 * Mail from the app to the team, through EmailJS.
 *
 * The Help panel's Send Feedback form had this to itself. The library's
 * Suggest a Mechanism form sends the same way, and two copies of "how do we
 * read the key" would disagree the first time one of them was fixed.
 */
@Injectable({ providedIn: 'root' })
export class MailService {
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
  async key(): Promise<string | undefined> {
    try {
      const response = await fetch('/.netlify/functions/getEmailJSKey');
      const key: unknown = (await response.json())?.apiKey;
      return typeof key === 'string' && key.length > 0 ? key : undefined;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  /**
   * Send one message with one of the account's templates.
   *
   * Resolves to `'no-key'` rather than throwing when the build cannot send, so
   * each form can tell that apart from a send that was tried and failed.
   * Rejects when EmailJS does.
   */
  async send(template: string, params: Record<string, string>): Promise<'sent' | 'no-key'> {
    const key = await this.key();
    if (!key) return 'no-key';
    emailjs.init(key);
    await emailjs.send(MAIL_SERVICE, template, params);
    return 'sent';
  }

  /** Browser, OS and app version, which is what opening a reader's drawing as they saw it needs. */
  diagnostics(): string {
    return [
      `Browser: ${browserName()}`,
      ` Browser Version: ${browserVersion()}`,
      ` OS: ${window.navigator.platform}`,
      ` User Agent: ${window.navigator.userAgent}`,
      ` App Version: ${environment.appVersion}`,
    ].join('\n');
  }
}

function browserName(): string {
  const agent = window.navigator.userAgent.toLowerCase();
  const global = window as unknown as Record<string, unknown>;
  switch (true) {
    case agent.indexOf('edge') > -1:
      return 'Edge';
    case agent.indexOf('opr') > -1 && !!global['opr']:
      return 'Opera';
    case agent.indexOf('chrome') > -1 && !!global['chrome']:
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

function browserVersion(): string {
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
