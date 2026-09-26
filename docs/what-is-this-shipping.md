# Shipping "What is this?"

> **Status:** Current, September 26, 2026. Built on `feature/what-is-this`, which stacks on
> `feature/explain-blockers-check-answers`. The prototype it was evaluated on is on
> `prototype/what-is-this` (`src/app/prototype/what-is-this/`), its evidence in
> [llm-features-evidence](llm-features-evidence/README.md), rounds 1 to 9.

How the feature reaches students: where the note sits in the app, how the request travels, how the
Gemini key is kept, and what the release process adds.

## What the student sees

**What Is This?** is a section of the per-machine panel, **Analysis for Mechanism M2** (and **Edit
Mechanism M2** in Edit), under its Mechanism Overview and Links. A drawing of several machines has a
note per machine, reached the way the panel is: the machine's row in the playback bar.

- **Everything above the note is PMKS+'s own**, and shows whether or not the note does: the family
  it matched (the Overview's **Family** row), and each link's job in the Links rows, whose names are
  part links. The jobs come from `model/what-is-this/roles.ts`, which is more precise than the roles
  the panel used to guess: it calls IJ a coupler where the panel said "Input".
- **The note** is a paragraph under "Written by AI from the facts above, not measured". Every part it
  names is a `part-link`, drawn by `prose-block` exactly as the setup drawer's are: pointing lights
  the part on the grid, pressing selects it. The terms it explains follow it as a short glossary,
  rather than a hover over the word, which a phone cannot do.
- **"Looks like" and "Where You'd Find It"** show only when `looks-like-gate.ts` opens: the author
  named a part with a word that says what it is for, PMKS+ matched a family that points at a kind of
  machine, or the author put a background image behind it.
- **A machine that does not run has no note.** The section says PMKS+ writes one once it runs; the
  panel's status chip and footer already point at what stops it.
- **Other states:** writing, could not be written (Try Again), busy (Try Again, grayed until the
  wait is over), and out of date: after an edit the earlier note stays in view, faded, under "This
  note was written before your last edit", until the reader presses Write a New Note. Undoing back
  to the drawing it was written for shows it as current again.

The note is written when the section first shows a machine nobody has asked about, because opening
the panel is the reader asking. After an edit it waits to be asked, so a reader tuning a length does
not spend a request on every step.

## What the app does, and what the model does

| Step | Where | Module |
| --- | --- | --- |
| Fact sheet for each machine (v9) | Browser | `model/what-is-this/machine-sheet.ts`, with `family-check.ts`, `roles.ts`, `relations.ts`, `sheet-lines.ts`, `cycle.ts` |
| The gate | Browser | `model/what-is-this/looks-like-gate.ts` |
| The picture: Schematic style, six tiles | Browser | `services/what-is-this/what-is-this-picture.service.ts` and `picture-*.ts` |
| The key a note is filed under | Browser | `model/what-is-this/note-key.ts` |
| Prompt, model call, schema | **Netlify Function** | `netlify/functions/what-is-this.mts`, `model/what-is-this/gemini-request.ts`, `prompt.ts` |
| Answer into panel pieces | Browser | `model/what-is-this/note-prose.ts`, `note-parts.ts` |
| States, cache, library | Browser | `services/what-is-this/what-is-this.service.ts`, `note-store.ts` |

`src/app/prototype/what-is-this/production-parity.spec.ts` holds the app's sheet to the prototype's
v9, word for word, on the 22 templates of round 6: change a sentence the model reads and that spec
says the evidence no longer speaks for the note.

**The sheet describes the start of the cycle, not the pose on screen.** Playback moves the drawing's
own joints, so the start geometry and the loads are read from the solved machine's first frame.

**The picture is taken from the canvas.** The evaluated pictures were Playwright screenshots of the
app in the Schematic style, zoomed so the machine's whole cycle filled a 960 by 700 window, joint
letters and traced paths on, centers of mass off. The service sets all of that, poses the machine at
each moment with `MechanismService.lookAt`, copies the canvas as SVG, and puts the reader's view
back, all inside one task, so nothing in between is painted. svg-pan-zoom applies a zoom to the page
on the next animation frame, which is what makes this possible: the app's marks are sized for the
picture's zoom while the page never shows it. The tiles are then drawn to PNG and laid out as the
prototype's Pillow tiler laid them out. A capture takes about 150 ms.

## The Netlify Function

`netlify/functions/what-is-this.mts`, a v2 function (`@netlify/functions` 6), at
`/api/what-is-this`.

- **The browser sends a sheet and a picture, never a prompt.** The instructions are added in the
  function, and a request that does not look like something PMKS+ wrote is refused with 400, so the
  endpoint is not a general Gemini proxy: a sheet is at most 30,000 characters, opens "Facts PMKS+
  computed" and has a "## Mechanism" heading; a picture is a base64 PNG under 1.5 MB.
- **Replies:** 200 `{ reply }`; 429 `{ busy: true }` with any Retry-After Gemini gave; 500 or 502
  `{ failed: true }`. Nothing it logs carries the sheet, the picture or the key.
- **Limits.** A synchronous function runs for up to 60 s and takes up to 6 MB. A request is about 3
  to 8 KB of sheet and a 100 to 500 KB picture. The function gives Gemini 25 s in all, retrying a
  503 once after a second; past that the student is better served by Try Again.
- **Rate limit.** Netlify's code-based rule, 10 requests a minute per IP and domain, applied before
  the function runs. A class behind one school address shares that, which the busy state covers.
- **Invocations.** The legacy Free, Starter and Pro plans allow 125,000 function invocations per site
  per month. The notes are cached in each browser and the library's ship with the app, so a class is
  nowhere near it; Gemini's own per-minute quota is the tighter ceiling.

### Running it locally

`npm start` has no functions, so `src/proxy.conf.json` sends `/api` to port 8788, and
`npm run what-is-this:dev` runs the very file Netlify deploys there, bundled with the esbuild the
Angular build brings. It reads `GEMINI_API_KEY` from the shell. Without it running, a note cannot
be written and the section says so; everything else works.

## The library's notes

The library templates' notes are written at release time and shipped in
`src/assets/what-is-this/library-notes.json`, so a first day of opening library mechanisms asks the
model nothing. `npm run what-is-this:library` writes them by opening every card of the library in
the running app, as a student does, and keeping what the app was given: a note is filed under its
sheet's key, and letting the app write it is the one way to be sure the key matches. It reuses the
notes the file already has and drops those no card leads to any more. Run it after a template or
the prompt changes, with the function and the app running as above. A file for another prompt
version is ignored.

A note the browser is given is also kept in `localStorage` (`whatIsThisNotes`, the latest 60), so a
student reopening a drawing does not ask again.

## The key

- **Never send it to the browser.** `getEmailJSKey` returns its key to the page, which is fine for
  EmailJS, whose key is public by design. The Gemini key stays in the function.
- **Set it in the Netlify UI**, not `netlify.toml`: a variable declared in `netlify.toml` never
  reaches a function, and the file stays the one-setting file it is. Scope it to Functions, mark it
  secret. `WHAT_IS_THIS_MODEL` overrides the model, `gemini-3.5-flash-lite` by default.
- **Both sites.** Branch and deploy-preview builds come from `pmksnew`, and production from its own
  site, so the variable is set on each. Consider a second key with a small quota for previews, so a
  preview cannot spend production's quota.
- **Rotating.** A deploy keeps the values it was built with. After changing the key, redeploy
  production and `staging`; older deploy previews keep the revoked key and say the note could not be
  written until rebuilt, which is harmless.
