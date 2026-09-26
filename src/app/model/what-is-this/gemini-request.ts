import { REPLY_SCHEMA, WHAT_IS_THIS_INSTRUCTIONS, WHAT_IS_THIS_QUESTION } from './prompt';
import type { WhatIsThisReply } from './prompt';

/**
 * The one request "What is this?" makes of Gemini, and the checks on either
 * side of it: what the browser may send, and what comes back.
 *
 * The Netlify Function (`netlify/functions/what-is-this.mts`) is the only
 * caller that holds the key; this file is free of Angular and of Node's own
 * modules so the function, the specs and the app can all import it. The body is
 * the one the evaluation sent (`askGemini` in the prototype's `run/ask.mjs`):
 * change a setting here and the evidence in docs/llm-features-evidence no
 * longer speaks for the note.
 *
 * The browser sends a fact sheet and a picture, never a prompt, and the checks
 * below are what keep the endpoint from being a general Gemini proxy: a request
 * has to look like something PMKS+ wrote. They are cheap on purpose, since they
 * run before anything is spent.
 */

/** A sheet is about 8 KB; four times that is not one PMKS+ wrote. */
export const MAX_SHEET_LENGTH = 30_000;

/** Base64 characters, so about 1.5 MB of PNG; the six-tile picture is 108 KB, 348 KB at most. */
export const MAX_PICTURE_LENGTH = 2_000_000;

const SHEET_OPENING = 'Facts PMKS+ computed';
const MECHANISM_HEADING = /^## Mechanism M/m;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type GeminiPart = { text: string } | { inlineData: { mimeType: 'image/png'; data: string } };

/** The body of `POST …/models/{model}:generateContent` for one machine's sheet and picture. */
export function geminiRequestBody(sheet: string, pictureBase64: string | undefined) {
  const parts: GeminiPart[] = [{ text: WHAT_IS_THIS_QUESTION }];
  if (pictureBase64) parts.push({ inlineData: { mimeType: 'image/png', data: pictureBase64 } });
  return {
    // The instructions end "FACT SHEET", so the sheet follows them directly.
    systemInstruction: { parts: [{ text: WHAT_IS_THIS_INSTRUCTIONS + sheet }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: REPLY_SCHEMA,
    },
  };
}

/**
 * The note Gemini wrote, from its response body, or undefined when there is
 * none worth showing. The schema makes a malformed reply unlikely rather than
 * impossible (a reply cut off at the token limit is still cut off), so the
 * shape is checked here, before the browser trusts it. A stray code fence
 * around the object is tolerated, as the evaluation's own parser tolerated it.
 */
export function replyOf(body: unknown): WhatIsThisReply | undefined {
  const text = replyText(body);
  if (text === undefined) return undefined;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    return replyShape(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

/** Whether the browser sent a fact sheet PMKS+ could have written. */
export function validSheet(sheet: unknown): sheet is string {
  return (
    typeof sheet === 'string' &&
    sheet.length <= MAX_SHEET_LENGTH &&
    sheet.startsWith(SHEET_OPENING) &&
    MECHANISM_HEADING.test(sheet)
  );
}

/** Whether the browser sent no picture, or a base64 PNG of a sensible size. */
export function validPicture(picture: unknown): picture is string | undefined {
  if (picture === undefined) return true;
  return (
    typeof picture === 'string' &&
    picture.length <= MAX_PICTURE_LENGTH &&
    picture.length % 4 === 0 &&
    BASE64.test(picture) &&
    startsLikePng(picture)
  );
}

/** Decodes only the first twelve characters: enough for the eight-byte signature. */
function startsLikePng(base64: string): boolean {
  if (base64.length < 12) return false;
  const head = atob(base64.slice(0, 12));
  return PNG_SIGNATURE.every((byte, i) => head.charCodeAt(i) === byte);
}

/** The first candidate's text parts, joined. */
function replyText(body: unknown): string | undefined {
  const candidates = field(body, 'candidates');
  if (!Array.isArray(candidates)) return undefined;
  const parts = field(field(candidates[0], 'content'), 'parts');
  if (!Array.isArray(parts)) return undefined;
  const text = parts
    .map((part) => field(part, 'text'))
    .filter((t): t is string => typeof t === 'string')
    .join('')
    .trim();
  return text || undefined;
}

/**
 * The reply, if it has a paragraph to show. Everything else is optional to the
 * panel, so a missing "resembles" reads as none, and a malformed use or term is
 * dropped rather than costing the student the whole note.
 */
function replyShape(parsed: unknown): WhatIsThisReply | undefined {
  const plainEnglish = field(parsed, 'plainEnglish');
  if (typeof plainEnglish !== 'string' || !plainEnglish.trim()) return undefined;
  const resembles = field(parsed, 'resembles');
  return {
    plainEnglish,
    resembles: typeof resembles === 'string' ? resembles : '',
    useCases: stringPairs(field(parsed, 'useCases'), 'use', 'why').map(([use, why]) => ({
      use,
      why,
    })),
    terms: stringPairs(field(parsed, 'terms'), 'term', 'meaning').map(([term, meaning]) => ({
      term,
      meaning,
    })),
  };
}

/** The two strings each item of a list carries under two keys, skipping an item without both. */
function stringPairs(list: unknown, a: string, b: string): [string, string][] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): [string, string][] => {
    const first = field(item, a);
    const second = field(item, b);
    return typeof first === 'string' && typeof second === 'string' ? [[first, second]] : [];
  });
}

/** One property of something that may not be an object. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}
