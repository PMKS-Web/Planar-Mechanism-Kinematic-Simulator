# Shipping "What is this?"

> **Status:** Current design, September 25, 2026. Nothing here is built into the app yet; the
> prototype is on `prototype/what-is-this` (`src/app/prototype/what-is-this/`), its evidence in
> [llm-features-evidence](llm-features-evidence/README.md), rounds 1 to 9.

How the feature reaches students: where the note sits in the app, how the request travels, how the
Gemini key is kept, and what has to be settled before it is switched on.

## What the student sees

"What is this?" is a section of the per-machine panel on feature/explain-blockers-check-answers,
**Analysis for Mechanism M2**, under its Mechanism Overview and Links. A drawing of several
machines has a note per machine, reached the way the panel is: the machine's row in the playback
bar. The design canvas "What Is This? in PMKS+" shows five screens: one mechanism, several, a note
the gate trims, a machine that does not run, and the section's other states.

- **Everything above the note is PMKS+'s own**, and shows whether or not the note does: the family
  it matched (a new Overview row), and each link's job in the Links rows (`roles.ts` is more
  precise than today's roles: it calls IJ a coupler where the panel now says "Input").
- **The note** is a paragraph under "Written by AI from the facts above, not measured". Every part
  it names is a `part-link`, drawn by `prose-block` exactly as the setup drawer's are: pointing
  lights the part on the grid, pressing selects it.
- **"Looks like" and "Where you'd find it"** show only when `looks-like-gate.ts` opens: the author
  named a part with a word that says what it is for, PMKS+ matched a family that points at a kind
  of machine, or the author put a background photograph behind it.
- **A machine that does not run has no note.** Its panel says so and points at the setup drawer,
  where the branch already explains the blocker and its fixes.
- **Other states:** writing (2.5 s median, 7.8 s at the 90th percentile on Flash-Lite), could not
  be written, busy (rate-limited), and out of date after an edit.

## What the app does, and what the model does

| Step | Where | Module in the prototype |
| --- | --- | --- |
| Fact sheet for the selected machine (v9) | Browser | `mechanism-facts.ts`, `family-check.ts`, `roles.ts`, `relations.ts` |
| The gate | Browser | `looks-like-gate.ts` |
| The picture: Schematic style, six tiles | Browser | captured by `run/schematic.mjs` today; in the app, the canvas rendered at six moments to PNG |
| Prompt, model call, schema | **Netlify Function** | `prompt.ts` (v9), `run/ask.mjs` (Gemini route) |
| Answer into panel pieces | Browser | `note-prose.ts` |

The browser sends the fact sheet and the picture, never a prompt: the instructions live in the
function, so the endpoint cannot be turned into a general Gemini proxy by rewriting them.

## The model

Gemini 3.5 Flash-Lite, with the v9 fact sheet, the picture, and the reply held to a JSON schema. Over
two blind askings of 41 machines it names the real machine in 87% of library askings, and its
"Looks like" is wrong in 13% of those it gives; with the gate, 31 of the 38 lines a student would
see were right, and nothing it hid was. It answered every request with valid JSON, in a median of
2.5 s. Gemini 3.8 Flash, tried on the same key, failed 6 of 7 requests (overloaded, then out of
quota), so a larger free Gemini model is not something a class can rely on.

## The Netlify Function

A v2 function (`export default async (req, context)` with an exported `config`), which needs
`@netlify/functions` 2 or later; the site has 1.4, for the v1 `getEmailJSKey` handler.

```ts
// netlify/functions/what-is-this.mts -- a sketch, not a deployed file
import type { Config, Context } from '@netlify/functions';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const { sheet, picture } = await req.json();
  if (!validSheet(sheet) || !validPicture(picture)) return new Response(null, { status: 400 });
  const key = Netlify.env.get('GEMINI_API_KEY');
  const model = Netlify.env.get('WHAT_IS_THIS_MODEL') ?? 'gemini-3.5-flash-lite';
  const reply = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key! },
      body: JSON.stringify(geminiRequest(PROMPT_V9, sheet, picture)), // schema, temperature 0.4
      signal: AbortSignal.timeout(25_000),
    }
  );
  if (reply.status === 429) return Response.json({ busy: true }, { status: 429 });
  if (!reply.ok) return Response.json({ failed: true }, { status: 502 });
  return Response.json(answerOf(await reply.json()));
};

export const config: Config = {
  path: '/api/what-is-this',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
```

- **Limits.** A synchronous function runs for up to 60 s and takes up to 6 MB (about 4.5 MB of
  binary once base64-encoded). A request is about 8 KB of sheet and a 108 KB picture (348 KB at
  most), so neither limit is close. Reject a sheet over 30 KB or a picture over 1.5 MB, and a sheet
  that does not open "Facts PMKS+ computed…" with a "## Mechanism" heading.
- **Rate limit.** Netlify's code-based rule, 10 requests a minute per IP, is on every plan (two
  rules per project on the free and starter plans). Gemini's own limits on the key sit behind it; a
  429 from either becomes the panel's "Busy" state.
- **Retries.** Gemini's 503 ("high demand") is worth one retry after a second. Nothing more: a
  student waiting ten seconds is better served by "Try again".
- **Caching.** The same sheet and picture always deserve the same note. Key a cache on a hash of
  the prompt version, model, sheet and picture (Netlify Blobs, or the browser's own storage for one
  student). Better still, **write the library templates' notes at release time** and ship them
  with the app: they never change, and they are most of what a class opens on day one.

## The key

- **Never send it to the browser.** `getEmailJSKey` returns its key to the page, which is fine for
  EmailJS, whose key is public by design. A Gemini key must stay in the function.
- **Set it in the Netlify UI**, not `netlify.toml`: a variable declared in `netlify.toml` never
  reaches a function, and the file stays the one-setting file it is. Scope it to Functions, mark it
  secret.
- **Both sites.** Branch and deploy-preview builds come from `pmksnew`, and production from its own
  site, so the variable is set on each. Consider a second key with a small quota for previews, so a
  preview cannot spend production's quota.
- **Rotating.** A deploy keeps the values it was built with. After changing the key, redeploy
  production and `staging`; older deploy previews keep the revoked key and show "could not be
  written" until rebuilt, which is harmless.

## Before switching it on

These are Google's terms for the Gemini API, and they decide whether the free tier can be used at
all; they are a question for whoever answers for PMKS+, not something the code can settle.

- **The free tier trains on what it is sent.** For unpaid use, Google "uses the content you submit
  to the Services and any generated responses to provide, improve, and develop Google products",
  and people may review it. A paid key does not. A student's drawing is not personal information,
  but an author's names can be anything.
- **Regions.** "You may use only Paid Services when making API Clients available to users in the
  European Economic Area, Switzerland, or the United Kingdom." PMKS+ is on the open web.
- **Age.** The terms require users to be 18 or older and rule out services "likely to be accessed
  by individuals under the age of 18". First-year engineering students mostly are, but not all, and
  the site is public.
- **Cost of the paid tier.** A note is about 3,400 input and 270 output tokens: a small fraction of
  a cent at Flash-Lite's prices. Set a budget alert on the Google Cloud project either way.
