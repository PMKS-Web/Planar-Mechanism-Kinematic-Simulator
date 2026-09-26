import type { Config } from '@netlify/functions';

import {
  geminiRequestBody,
  replyOf,
  validPicture,
  validSheet,
} from '../../src/app/model/what-is-this/gemini-request';

/**
 * "What is this?": one machine's fact sheet and picture in, the note Gemini
 * wrote about it out.
 *
 * The function exists to keep the Gemini key off the page. `getEmailJSKey`
 * hands its key to the browser, which is fine for EmailJS, whose key is public
 * by design; this one must never leave here. The browser sends only a sheet and
 * a picture, never a prompt: the instructions are added here, and a request
 * that does not look like something PMKS+ wrote is refused, so the endpoint
 * cannot be used as a general Gemini proxy. docs/what-is-this-shipping.md is
 * the design.
 *
 * Nothing logged here may carry the sheet, the picture or the key: an author's
 * names can be anything, and a log is read by more people than a request.
 *
 * Replies: 200 `{ reply }`; 400 for a request PMKS+ did not write; 405 for
 * anything but POST; 429 `{ busy: true }` when Gemini's quota is spent (Netlify
 * answers 429 itself, before this runs, past the rate limit below); 500 or 502
 * `{ failed: true }` otherwise.
 */

const GEMINI_MODELS = 'https://generativelanguage.googleapis.com/v1beta/models';

/** The model the evaluation chose; WHAT_IS_THIS_MODEL, set on the site, overrides it. */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * One deadline for the whole ask, retry included. The 90th percentile is 7.8 s;
 * a student still waiting at 25 s is better served by "Try again", and the
 * function itself is cut off at 60.
 */
const DEADLINE_MS = 25_000;

/** Gemini's 503 means "high demand", which a second later has often passed. */
const RETRY_503_AFTER_MS = 1_000;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const asked = await askedFor(req);
  if (!asked) return new Response(null, { status: 400 });
  const key = Netlify.env.get('GEMINI_API_KEY');
  if (!key) {
    console.error('what-is-this: GEMINI_API_KEY is not set on this site');
    return failed(500);
  }
  const model = Netlify.env.get('WHAT_IS_THIS_MODEL') || DEFAULT_MODEL;
  try {
    const response = await askGemini(key, model, asked.sheet, asked.picture);
    if (response.status === 429) return busy(await retryAfter(response));
    if (!response.ok) {
      console.error(`what-is-this: ${model} answered ${response.status}`);
      await response.body?.cancel();
      return failed(502);
    }
    const reply = replyOf(await response.json());
    if (!reply) {
      console.error(`what-is-this: ${model} answered without a note to show`);
      return failed(502);
    }
    return Response.json({ reply });
  } catch (error) {
    // A timeout, a dropped connection or a body that is not JSON. Only the
    // error's name is logged: its message can quote what was sent.
    console.error(`what-is-this: asking ${model} failed (${nameOf(error)})`);
    return failed(502);
  }
};

export const config: Config = {
  path: '/api/what-is-this',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

/** The sheet and picture the browser sent, or undefined when it sent anything else. */
async function askedFor(
  req: Request
): Promise<{ sheet: string; picture: string | undefined } | undefined> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return undefined;
  }
  if (typeof body !== 'object' || body === null) return undefined;
  const { sheet, picture } = body as Record<string, unknown>;
  return validSheet(sheet) && validPicture(picture) ? { sheet, picture } : undefined;
}

/** Gemini's answer, asked once more after a 503. */
async function askGemini(
  key: string,
  model: string,
  sheet: string,
  picture: string | undefined
): Promise<Response> {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const body = JSON.stringify(geminiRequestBody(sheet, picture));
  const ask = () =>
    fetch(`${GEMINI_MODELS}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body,
      signal,
    });
  const first = await ask();
  if (first.status !== 503) return first;
  await first.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, RETRY_503_AFTER_MS));
  return ask();
}

/**
 * How many seconds Gemini asked us to wait, if it said: a Retry-After header,
 * or the RetryInfo its error body carries (the form it usually uses).
 */
async function retryAfter(response: Response): Promise<string | undefined> {
  const header = response.headers.get('retry-after');
  if (header) return header;
  try {
    const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(await response.text())?.[1];
    return delay ? String(Math.ceil(Number(delay))) : undefined;
  } catch {
    return undefined;
  }
}

function busy(retryAfterSeconds: string | undefined): Response {
  const headers: Record<string, string> = retryAfterSeconds
    ? { 'retry-after': retryAfterSeconds }
    : {};
  return Response.json({ busy: true }, { status: 429, headers });
}

function failed(status: 500 | 502): Response {
  return Response.json({ failed: true }, { status });
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
