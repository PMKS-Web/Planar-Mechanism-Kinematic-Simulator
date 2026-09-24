// PROTOTYPE: the checks a script can make on one answer, so a person's vote is
// spent on taste. Every check compares the answer with the fact sheet it was
// written from; none of them knows what the mechanism really is, except the
// family keywords, which are the library's own names for the ten templates.
//
// A flag is a reason to look, not a verdict: a number can be derived honestly
// (a difference of two stated numbers), and a family can be right in other words.

/** Words that name each template's family: `full` is the name, `near` is its class. */
const FAMILY = {
  '4-Bar': { full: /crank[- ]?rocker/i, near: /four[- ]?bar/i },
  Slider_Crank: { full: /slider[- ]?crank/i, near: /crank|piston/i },
  Whitworth_Quick_Return: { full: /whitworth/i, near: /quick[- ]?return|slotted[- ]link/i },
  Scotch_Yoke: { full: /scotch[- ]?yoke/i, near: /yoke|slotted/i },
  Chebyshev_Straight_Line: { full: /chebyshev|tchebych/i, near: /straight[- ]?line/i },
  Jansen_Leg: { full: /jansen|strandbeest/i, near: /walking|leg/i },
  Windshield_Wiper: {
    full: /wiper/i,
    near: /parallelogram|crank[- ]?rocker|dual[- ]rocker|double[- ]rocker/i,
  },
  Cylinder_Boom: { full: /boom/i, near: /hydraulic|cylinder/i },
  Hood_Hinge: { full: /hood/i, near: /hinge|six[- ]?bar|watt|stephenson/i },
  Pumpjack: {
    full: /pump ?jack|beam pump|walking beam|nodding donkey|sucker[- ]rod/i,
    near: /beam/i,
  },
};

/** The machine each template is drawn from, as its uses would name it; none for a generic linkage. */
const APPLICATION = {
  Slider_Crank: /engine|pump|compressor/i,
  Whitworth_Quick_Return: /shaper|slotting|planer|metal/i,
  Scotch_Yoke: /pump|engine|compressor|valve/i,
  Jansen_Leg: /walk|robot|strandbeest|legged/i,
  Windshield_Wiper: /wiper/i,
  Cylinder_Boom: /excavator|boom|backhoe|crane|loader/i,
  Hood_Hinge: /hood/i,
  Pumpjack: /oil|well|pump ?jack/i,
};

export function applicationMatch(template, answer) {
  const expected = APPLICATION[template];
  if (!expected) return 'n/a';
  const uses = (answer?.useCases ?? []).map((u) => `${u.use} ${u.why}`).join(' ');
  return expected.test(uses) ? 'named' : 'missed';
}

export function familyMatch(template, answer) {
  const keys = FAMILY[template];
  if (!keys || !answer) return 'unknown';
  const opening = `${answer.family ?? ''} ${(answer.plainEnglish ?? '').split(/[.:;]/)[0]}`;
  if (keys.full.test(opening)) return 'named';
  if (keys.near.test(opening)) return 'class';
  return 'missed';
}

function sheetNames(sheet) {
  const joints = new Set();
  const jointLine = /^- Joints: (.*)$/m.exec(sheet)?.[1] ?? '';
  for (const m of jointLine.matchAll(/(?:^|; )([A-Z])(?: \("[^"]*"\))? \(/g)) joints.add(m[1]);
  const links = new Set([...sheet.matchAll(/\blink ([A-Z]{2,})\b/g)].map((m) => m[1]));
  return { joints, links };
}

/** A bold span or "link XY" that names no joint or link of the sheet. */
function unknownParts(text, sheet) {
  const { joints, links } = sheetNames(sheet);
  const known = (token) => {
    const t = token.replace(/^(link|joint|pin|slider|cylinder|ground|point)\s+/i, '').trim();
    if (joints.has(t) || links.has(t)) return true;
    const pair = /^([A-Z])\s*[-–]\s*([A-Z])$/.exec(t);
    return !!pair && joints.has(pair[1]) && joints.has(pair[2]);
  };
  const flagged = new Set();
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) if (!known(m[1])) flagged.add(m[1]);
  for (const m of text.matchAll(/\blinks? ([A-Z]{2,})\b/g)) if (!known(m[1])) flagged.add(m[1]);
  return [...flagged];
}

/** Numbers in the answer that no number in the sheet rounds to. */
function unsupportedNumbers(text, sheet) {
  const plain = text.replace(/\*\*[^*]+\*\*/g, ' ');
  const stated = [...sheet.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const out = [];
  for (const m of plain.matchAll(/(?<![A-Za-z\d.])-?\d+(?:\.\d+)?(?![A-Za-z\d])/g)) {
    const x = Number(m[0]);
    const decimals = (m[0].split('.')[1] ?? '').length;
    const half = 0.5 * 10 ** -decimals;
    const ok = stated.some(
      (y) => Math.abs(x - y) <= Math.max(half, 0.005 * Math.abs(y)) || Math.abs(x + y) <= half
    );
    if (!ok) out.push(m[0]);
  }
  return [...new Set(out)];
}

/** Motion words an answer used that its sheet gives no ground for. */
function unsupportedClaims(text, sheet) {
  const claims = [];
  const says = (re) => re.test(text);
  const sheetSays = (re) => re.test(sheet);
  if (says(/straight[- ]?line|straight path|in a straight/i) && !sheetSays(/straight/i))
    claims.push('straight-line motion');
  if (says(/parallel/i) && !sheetSays(/parallel/i)) claims.push('parallel');
  const quickInSheet = sheetSays(
    /quick return|slow stroke|fast on one half-turn|time ratio (1\.(0[5-9]|[1-9])|[2-9])/i
  );
  if (says(/quick(er)?[- ]return|fast(er)? return/i) && !quickInSheet) claims.push('quick return');
  if (says(/\bno (faster|quick(er)?) return|equal times|same time in both/i) && quickInSheet)
    claims.push('denies the quick return the sheet shows');
  for (const part of ['gear', 'cam', 'spring', 'belt', 'motor'])
    if (says(new RegExp(`\\b${part}s?\\b`, 'i')) && !sheetSays(new RegExp(`\\b${part}`, 'i')))
      claims.push(`a ${part}`);
  return claims;
}

const OPENING = { is: /^This is\b/, resembles: /^This resembles\b/, unsure: /^This linkage\b/ };

export function checkAnswer(template, answer, sheet) {
  if (!answer) return { family: 'unknown', application: 'n/a', flags: ['no parsed answer'] };
  const uses = answer.useCases ?? [];
  const text = [answer.plainEnglish ?? '', ...uses.map((u) => `${u.use}. ${u.why}`)].join('\n');
  const words = (answer.plainEnglish ?? '').split(/\s+/).filter(Boolean).length;
  const flags = [];
  const parts = unknownParts(text, sheet);
  if (parts.length) flags.push(`names parts not in the sheet: ${parts.join(', ')}`);
  const numbers = unsupportedNumbers(text, sheet);
  if (numbers.length) flags.push(`numbers not in the sheet: ${numbers.join(', ')}`);
  for (const claim of unsupportedClaims(text, sheet)) flags.push(`claims ${claim}`);
  if (words < 50 || words > 90) flags.push(`${words} words (asked for 50-90)`);
  if (uses.length < 2 || uses.length > 3) flags.push(`${uses.length} uses (asked for 2-3)`);
  const opening = OPENING[answer.certainty];
  if (opening && !opening.test(answer.plainEnglish ?? ''))
    flags.push(`opening does not match certainty "${answer.certainty}"`);
  return {
    family: familyMatch(template, answer),
    application: applicationMatch(template, answer),
    words,
    flags,
  };
}
