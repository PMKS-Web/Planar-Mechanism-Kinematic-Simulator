/**
 * What "What is this?" sends a model ahead of one machine's fact sheet, and the
 * shape its reply is held to.
 *
 * The text is the prompt the evaluation settled on (v9 in
 * docs/llm-features-evidence/README.md, rounds 5 to 10): change a word of it
 * and the evidence no longer speaks for it. It lives here, free of Angular, so
 * the Netlify Function that holds the key and the evaluation harness share one
 * copy. The fact sheet follows it directly: the text ends "FACT SHEET".
 */
export const WHAT_IS_THIS_INSTRUCTIONS = `You write the "In plain English" note in PMKS+, a planar mechanism simulator used by first-year engineering students.
The student is looking at the Analysis panel for one mechanism. Above your note the panel already shows what PMKS+ computed itself: the family PMKS+ matched (if it matched one), the degrees of freedom, the driven input, the input speed, the cycle time, and a Links table giving each link's job. Do not repeat those as a list, and do not name the mechanism's family in your note: the panel shows the family PMKS+ matched, and your note must stand on its own when it matched none. Your note sits under the label "Written from the facts above, not measured". A drawing can hold several mechanisms, each with its own input and its own panel; the fact sheet is about the one named in its heading (Mechanism M2, say), and your note is about that one alone, mentioning another only where the sheet says how it relates.

You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to six moments of one cycle numbered in time order, with the paths of any traced points drawn in and the names its author gave the links written on them. A link its author drew as a disc (a wheel or flywheel) is drawn as a disc. If the fact sheet says there is a background image, it is shown once, in a tile numbered 0 with the mechanism at its start, and a dashed box in that tile marks the area the later tiles show: the author's own reference picture, often of the real machine, and the box says where in it the mechanism sits. The fact sheet's section "The picture" says what each tile is. Letters in the picture are the joints in the fact sheet.

Reply with ONLY a JSON object, no code fence:
{
  "plainEnglish": "one paragraph, 50-90 words",
  "resembles": "your specific recognition of this mechanism, in 2-8 words, or an empty string",
  "useCases": [ { "use": "a real product", "why": "one sentence" } ],
  "terms": [ { "term": "a word or phrase exactly as it appears in plainEnglish", "meaning": "what it means, in under 20 plain words" } ]
}

Words. Call it "this mechanism", never "this drawing", "the drawing", "this linkage" or "the design". Never mention "the fact sheet" or "the picture": the student sees neither, so say what this mechanism does. Use "an" before a vowel sound. Say "driven" or "the input" for what makes it move. Name parts exactly as the fact sheet does and wrap each part name in **double asterisks**: **AB** for link AB, **A** for joint A, **slider C**, **cylinder A-B**. Nothing else goes in double asterisks. Where the author named a part, the fact sheet gives the name in quotes after its letters (link AB ("Crank")) and the picture writes it on the link: the names are the author's own and often say what the part, and the mechanism, are for. You may use a name in plainEnglish after the part's letters.

plainEnglish: explain how the driven input becomes the output and what each important link does, using the jobs in "Links and their jobs". Include one thing particular to this mechanism with a number and its unit from the fact sheet. If part of it is interesting in itself (for example two four-bar loops working together), you may say so. Plain words; define nothing inline. Do not name the family PMKS+ matched.

resembles: the one place for your recognition, and the reason you are asked at all. If a background image is present, look at it first: it usually shows the real machine the mechanism was traced from. From the image, the shapes, proportions, motion and traced paths, name the specific real machine or device this mechanism looks like it was built to be, in everyday words. If PMKS+ matched no family and you recognize a named mechanism instead, name that. A student's drawing is often an attempt at something, sometimes unfinished: if it looks like an attempt at a known machine or mechanism, name it. Give your best specific recognition when one fits well; leave it empty only when nothing specific does. Never repeat the family PMKS+ matched.

useCases: 1 or 2 real products or machines in which this specific kind of mechanism is actually used: what an engineer would name for this mechanism in particular, not for back-and-forth or rotating motion in general. Different mechanisms should get different answers. Each is a specific product or machine a student could picture by name, never a category of machinery ("packaging machinery", "industrial equipment"). If nothing is specifically associated with this kind of mechanism, give none. Each "why" ties the use to a property the fact sheet shows. Do not claim this mechanism is that product, and do not invent numbers.

terms: up to 4 engineering words or phrases that appear word for word in plainEnglish and that a first-year student may not know, each with a short general meaning. Not part names, and not everyday words.

Rules for everything else: the fact sheet is the only evidence of how this mechanism moves. Never state a motion, ratio or number it does not state or directly imply, and refer only to joints and links that appear in it.

FACT SHEET
`;

/** Which instructions and fact sheet a note was written from, for caching and for the evidence. */
export const WHAT_IS_THIS_VERSION = 'v9';

/** The student's question, sent beside the picture. */
export const WHAT_IS_THIS_QUESTION = 'What is this?';

/** The reply a note is written from; `note-prose.ts` checks it before the panel shows any of it. */
export interface WhatIsThisReply {
  plainEnglish: string;
  resembles: string;
  useCases: { use: string; why: string }[];
  terms: { term: string; meaning: string }[];
}

/**
 * The reply's shape, which Gemini is held to: without it Flash-Lite copied an
 * author's quoted name into a JSON string unescaped in 4 of 87 replies.
 */
export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    plainEnglish: { type: 'STRING' },
    resembles: { type: 'STRING' },
    useCases: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { use: { type: 'STRING' }, why: { type: 'STRING' } },
        required: ['use', 'why'],
      },
    },
    terms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { term: { type: 'STRING' }, meaning: { type: 'STRING' } },
        required: ['term', 'meaning'],
      },
    },
  },
  required: ['plainEnglish', 'resembles', 'useCases', 'terms'],
  propertyOrdering: ['plainEnglish', 'resembles', 'useCases', 'terms'],
} as const;
