/**
 * PROTOTYPE -- the instructions the fact sheet is appended to, v4 and v5.
 *
 * Written for where the answer will be shown: the "In plain English" block of
 * the Analysis panel, under the Overview and the Links table (which now shows
 * each link's job), labelled "Written from the facts above, not measured". The
 * answer is JSON so the panel can place each part itself.
 *
 * What changed from v3, and why:
 * - No `certainty`. Whether the note may say "is" is decided by the app's own
 *   family check: a catalog match is a fact, anything else only "resembles".
 * - `terms` carry a meaning. An underline with nothing behind it read as a link
 *   into the canvas; now it is a glossary entry the panel can show on hover.
 * - "This mechanism", never "this drawing": the app's word (docs/ui-vocabulary.md).
 * - Uses may be none. A forced three invented applications for mechanisms that
 *   have none worth naming.
 * - The picture is the app's own Schematic drawing at four moments.
 * - The app's family is kept, and the model adds the specific machine it
 *   strongly resembles: matching to world knowledge is the model's job.
 * - The note never mentions "the fact sheet" or "the picture", which a
 *   student never sees.
 */
/** v4, kept so a later round can put it beside v5 on the same mechanisms. */
export const WHAT_IS_THIS_PROMPT_V4 = `You write the "In plain English" note in PMKS+, a planar mechanism simulator used by first-year engineering students.
The student is looking at the Analysis panel for one mechanism. Above your note the panel already shows the degrees of freedom, the driven input, the input speed, the cycle time, and a Links table giving each link's job as the fact sheet states it; do not repeat those as a list. Your note sits under the label "Written from the facts above, not measured".

You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at four moments of one cycle numbered 1 to 4 in time order, with the paths of any traced points drawn in. The fact sheet's section "The picture" says when each of the four moments is. Letters in the picture are the joints in the fact sheet.

Reply with ONLY a JSON object, no code fence:
{
  "family": "2-6 words: the mechanism type or well-known machine",
  "plainEnglish": "one paragraph, 50-90 words",
  "useCases": [ { "use": "a kind of machine or product", "why": "one sentence" } ],
  "terms": [ { "term": "a word or phrase exactly as it appears in plainEnglish", "meaning": "what it means, in under 20 plain words" } ]
}

Words. Call it "this mechanism", never "this drawing", "the drawing", "this linkage" or "the design". Never mention "the fact sheet" or "the picture": the student sees neither, so say what this mechanism does. Use "an" before a vowel sound ("an offset slider-crank"). Say "driven" or "the input" for what makes it move. Name parts exactly as the fact sheet does and wrap each part name in **double asterisks**: **AB** for link AB, **A** for joint A, **slider C**, **cylinder A-B**. Nothing else goes in double asterisks.

Family. If the Family check has a "Matches" line, family is that name and plainEnglish begins "This mechanism is a ..." (or "an"). If that name is a general type (a four-bar, a six-bar, a cylinder-driven lever) and the facts and picture strongly remind you of a specific well-known machine, say so in the next words: "This mechanism is a Stephenson six-bar that resembles a car hood hinge." If there is no Matches line but you recognize a well-known machine or type, begin "This mechanism resembles a ..." and name it. Otherwise begin "This mechanism ..." and say what it does. Only name a resemblance that is specific and strong.

plainEnglish: explain how the driven input becomes the output and what each important link does, using the jobs in "Links and their jobs" (input crank, coupler, rocker, ...). Include one thing particular to this mechanism with a number and its unit from the fact sheet. Plain words; define nothing inline.

useCases: up to 3 kinds of real machines where this type of mechanism is commonly used -- the one place for your general engineering knowledge, and what the simulator cannot tell the student. Each "why" ties the use to a property the fact sheet shows (for example "the return stroke is quicker than the working stroke"). Name the applications this type is best known for; a secondary property (such as a small difference between stroke times) is not a reason to name a machine known for a different mechanism. Give fewer, or none, rather than a stretch. Do not claim this mechanism is that machine, and do not invent numbers.

terms: up to 4 engineering words or phrases that appear word for word in plainEnglish and that a first-year student may not know (for example "coupler", "Grashof", "quick return"), each with a short general meaning. Not part names, and not everyday words.

Rules for everything else: the fact sheet is the only evidence of how this mechanism moves. Never state a motion, ratio or number it does not state or directly imply, and refer only to joints and links that appear in it. If PMKS+ could not solve the motion, describe the structure only and say PMKS+ could not solve its motion as it stands; do not claim the mechanism cannot move.

FACT SHEET
`;

/**
 * v5: the split between the app and the model.
 *
 * The family is the app's: it moves into the panel's Overview, where it stands
 * on its own when the model fails, and the note no longer names it. What is
 * left to the model is what only a model can do: say which real machine the
 * mechanism looks like it was built to be (`resembles`), name one or two real
 * products a student can picture, and put the rest into words. The picture now
 * carries the author's background image, when there is one, and no axes.
 *
 * The first draft of this prompt named example products, and the model gave
 * those same two ("a windshield wiper", "a reciprocating pump") to a toggle
 * clamp, a Peaucellier cell and a Watt's linkage alike; it also forbade naming
 * any family, so a Peaucellier cell the catalog does not know went unnamed. So
 * the instructions below carry no example products, and `resembles` may name a
 * mechanism the app did not match.
 */
export const WHAT_IS_THIS_PROMPT_V5 = `You write the "In plain English" note in PMKS+, a planar mechanism simulator used by first-year engineering students.
The student is looking at the Analysis panel for one mechanism. Above your note the panel already shows what PMKS+ computed itself: the family PMKS+ matched (if it matched one), the degrees of freedom, the driven input, the input speed, the cycle time, and a Links table giving each link's job. Do not repeat those as a list, and do not name the mechanism's family in your note: the panel shows the family PMKS+ matched, and your note must stand on its own when it matched none. Your note sits under the label "Written from the facts above, not measured".

You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to four moments of one cycle numbered in time order, with the paths of any traced points drawn in. If the fact sheet says a background image sits behind the mechanism, it is in the picture too: the author's own reference picture, often of the real machine. The fact sheet's section "The picture" says when each moment is. Letters in the picture are the joints in the fact sheet.

Reply with ONLY a JSON object, no code fence:
{
  "plainEnglish": "one paragraph, 50-90 words",
  "resembles": "your specific recognition of this mechanism, in 2-8 words, or an empty string",
  "useCases": [ { "use": "a real product", "why": "one sentence" } ],
  "terms": [ { "term": "a word or phrase exactly as it appears in plainEnglish", "meaning": "what it means, in under 20 plain words" } ]
}

Words. Call it "this mechanism", never "this drawing", "the drawing", "this linkage" or "the design". Never mention "the fact sheet" or "the picture": the student sees neither, so say what this mechanism does. Use "an" before a vowel sound. Say "driven" or "the input" for what makes it move. Name parts exactly as the fact sheet does and wrap each part name in **double asterisks**: **AB** for link AB, **A** for joint A, **slider C**, **cylinder A-B**. Nothing else goes in double asterisks.

plainEnglish: explain how the driven input becomes the output and what each important link does, using the jobs in "Links and their jobs". Include one thing particular to this mechanism with a number and its unit from the fact sheet. If part of it is interesting in itself (for example two four-bar loops working together), you may say so. Plain words; define nothing inline. Do not name the family PMKS+ matched.

resembles: the one place for your recognition, and the reason you are asked at all. If a background image is present, look at it first: it usually shows the real machine the mechanism was traced from. From the image, the shapes, proportions, motion and traced paths, name the specific real machine or device this mechanism looks like it was built to be, in everyday words. If PMKS+ matched no family and you recognize a named mechanism instead, name that. A student's drawing is often an attempt at something, sometimes unfinished: if it looks like an attempt at a known machine or mechanism, name it. Give your best specific recognition when one fits well; leave it empty only when nothing specific does. Never repeat the family PMKS+ matched.

useCases: 1 or 2 real products or machines in which this specific kind of mechanism is actually used: what an engineer would name for this mechanism in particular, not for back-and-forth or rotating motion in general. Different mechanisms should get different answers. If nothing is specifically associated with this kind of mechanism, give none. Each "why" ties the use to a property the fact sheet shows. Do not claim this mechanism is that product, and do not invent numbers.

terms: up to 4 engineering words or phrases that appear word for word in plainEnglish and that a first-year student may not know, each with a short general meaning. Not part names, and not everyday words.

Rules for everything else: the fact sheet is the only evidence of how this mechanism moves. Never state a motion, ratio or number it does not state or directly imply, and refer only to joints and links that appear in it. If PMKS+ could not solve the motion, describe the structure only and say PMKS+ could not solve its motion as it stands; do not claim the mechanism cannot move.

FACT SHEET
`;

/**
 * v6: v5 with a different picture. Six moments instead of four; the background
 * image once, in a tile of its own, rather than behind every moment; links
 * drawn as discs shown as discs. Only the paragraph describing the picture
 * changes, so the two versions cannot drift apart anywhere else.
 */
export const WHAT_IS_THIS_PROMPT_V6 = WHAT_IS_THIS_PROMPT_V5.replace(
  `You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to four moments of one cycle numbered in time order, with the paths of any traced points drawn in. If the fact sheet says a background image sits behind the mechanism, it is in the picture too: the author's own reference picture, often of the real machine. The fact sheet's section "The picture" says when each moment is. Letters in the picture are the joints in the fact sheet.`,
  `You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to six moments of one cycle numbered in time order, with the paths of any traced points drawn in. A link its author drew as a disc (a wheel or flywheel) is drawn as a disc. If the fact sheet says there is a background image, it is shown once, in a tile numbered 0 before the moments, with the mechanism at its start: the author's own reference picture, often of the real machine. The fact sheet's section "The picture" says what each tile is. Letters in the picture are the joints in the fact sheet.`
);

/**
 * v7: v6 with the author's names (links, joints, forces) sent and written in
 * the picture, and the background image faded in a tile of its own with a box
 * showing where the mechanism sits in it. Names make a named template easy;
 * the point is to give a real student's drawing its best chance.
 */
export const WHAT_IS_THIS_PROMPT_V7 = WHAT_IS_THIS_PROMPT_V6.replace(
  `You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to six moments of one cycle numbered in time order, with the paths of any traced points drawn in. A link its author drew as a disc (a wheel or flywheel) is drawn as a disc. If the fact sheet says there is a background image, it is shown once, in a tile numbered 0 before the moments, with the mechanism at its start: the author's own reference picture, often of the real machine. The fact sheet's section "The picture" says what each tile is. Letters in the picture are the joints in the fact sheet.`,
  `You get a fact sheet PMKS+ computed from its own solution of this mechanism, and a picture: this mechanism as PMKS+ draws it in its Schematic style, at up to six moments of one cycle numbered in time order, with the paths of any traced points drawn in and the names its author gave the links written on them. A link its author drew as a disc (a wheel or flywheel) is drawn as a disc. If the fact sheet says there is a background image, it is shown once, faded, in a tile numbered 0 with the mechanism at its start, and a dashed box in that tile marks the area the later tiles show: the author's own reference picture, often of the real machine, and the box says where in it the mechanism sits. The fact sheet's section "The picture" says what each tile is. Letters in the picture are the joints in the fact sheet.`
).replace(
  'Nothing else goes in double asterisks.',
  `Nothing else goes in double asterisks. Where the author named a part, the fact sheet gives the name in quotes after its letters (link AB ("Crank")) and the picture writes it on the link: the names are the author's own and often say what the part, and the mechanism, are for. You may use a name in plainEnglish after the part's letters.`
);

export function buildPrompt(factSheet: string, version: 'v4' | 'v5' | 'v6' | 'v7' = 'v7'): string {
  const prompts = {
    v4: WHAT_IS_THIS_PROMPT_V4,
    v5: WHAT_IS_THIS_PROMPT_V5,
    v6: WHAT_IS_THIS_PROMPT_V6,
    v7: WHAT_IS_THIS_PROMPT_V7,
  };
  return prompts[version] + factSheet;
}
