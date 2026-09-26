import { FamilyMatch, pointsAtMachine } from './family-check';

/**
 * Whether the panel shows the model's "Looks like".
 *
 * Asked blind, the model names the real machine almost only when something has
 * already named it: the names the author typed for its parts, or a family PMKS+
 * matched that points at a kind of machine. Without either it named the
 * machine in 2 of 25 askings and was wrong far more often than right (a hood
 * hinge came back as a sewing machine's needle drive). So PMKS+, not the model,
 * decides when the line is worth showing, and it decides from facts it has.
 * `docs/llm-features-evidence/README.md` (rounds 5 to 7) has the numbers.
 */
export interface LooksLikeGate {
  show: boolean;
  /** Why, for a reviewer: which names or which family let it through, or that nothing did. */
  because: string;
}

/**
 * The words a linkage's parts are called by whatever the machine: a part named
 * only with these ("Input lever", "Drag coupler", "Rocker") says what it does in
 * the chain, not what the mechanism is for. Round 6's teaching templates were
 * named that way, and the model invented a machine for them anyway.
 */
const ROLE_WORDS = new Set(
  (
    'input output driven driver drive follower crank cranks rocker rockers coupler couplers ' +
    'link links bar bars lever levers arm arms rod rods connecting slider sliders block ' +
    'ground frame fixed base pin pivot joint point ternary binary drag left right upper lower ' +
    'top bottom front back first second third one two three a b c the of and load force'
  ).split(' ')
);

/** A name with at least one word beyond the chain's own vocabulary: "Hood", "Luffing crank". */
const tellsPurpose = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => word.length > 0 && !ROLE_WORDS.has(word) && !/^\d+$/.test(word));

/**
 * Whether the author's background photograph opens the gate too. It depends on
 * the model: GPT-6 Astra, Claude Opus 5.5 and Gemini 3.5 Flash-Lite read the
 * photographs (the landing gear, the steering, the excavator: 17 of 18 more
 * lines right), GPT-6 Luna misread them (4 of 6 wrong). On, now that Gemini
 * writes the note; it would go off again for a model that misreads them.
 */
export const PHOTO_OPENS_GATE = true;

export function looksLikeGate(
  authorNames: string[],
  families: FamilyMatch[],
  photo = false
): LooksLikeGate {
  const machine = families.find(pointsAtMachine);
  const telling = authorNames.filter(tellsPurpose);
  if (telling.length)
    return {
      show: true,
      because: `the author named parts (${telling
        .slice(0, 4)
        .map((n) => `"${n}"`)
        .join(', ')}${telling.length > 4 ? ', ...' : ''})`,
    };
  if (machine) return { show: true, because: `PMKS+ matched ${machine.family}` };
  if (photo && PHOTO_OPENS_GATE)
    return { show: true, because: 'the author placed a background photograph of the machine' };
  const named = authorNames.length
    ? `the author's names (${authorNames
        .slice(0, 3)
        .map((n) => `"${n}"`)
        .join(', ')}) only say what the parts do`
    : 'the author named no parts';
  return {
    show: false,
    because: families.length
      ? `PMKS+ matched only a class of chain (${families[0].family}) and ${named}`
      : `PMKS+ matched no family and ${named}`,
  };
}
