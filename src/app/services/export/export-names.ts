import { visibleBodyName } from '../../model/body-label';
import { Cylinder, cylindersIn } from '../../model/cylinder';
import { Joint } from '../../model/joint';
import { Link, RealLink } from '../../model/link';

/**
 * What an exported file is allowed to call a joint or a body.
 *
 * A link's id is the sorted ids of its joints, which is a fine key and — the
 * moment one of those joints is a cylinder's buried inner end — a name that
 * offers the reader a joint the drawing never shows (D14, S11). The screen has
 * been careful about that since Stage 2; a file was not, and a file is read by
 * the same person. `id,name,joints` columns, a DXF layer in a CAD layer
 * manager, an Inkscape layer label: every one of them is a reader surface.
 *
 * **A body that holds nothing buried keeps its id, to the character.** That is
 * the whole of why this is not simply `visibleBodyName` everywhere: an export
 * of a drawing with no cylinder in it has to come out byte for byte as it did
 * before, and so does every row of a drawing that has one but does not touch
 * it. Only the bodies that would have named the buried joint are renamed.
 *
 * The substitute has to stay unique, because these columns are keys as well as
 * names: a welded body reads `CF`, and a plain bar between the same two joints
 * reads `CF` too. Where that happens the welded one says so — `CF welded` —
 * rather than falling back to the id, which is the thing being avoided. A
 * third claimant is numbered, which is not meaningful but is at least honest
 * about being a tie-break.
 */
export interface ExportNames {
  /** The joints nothing may name: every cylinder's buried inner end. */
  buried: ReadonlySet<string>;
  /** Whether this joint is one of them. */
  isBuried(joint: Joint): boolean;
  /** The id a file may print for a body — its own, unless that names a buried joint. */
  idOf(link: Link): string;
  /** The name a file may print for a body, under the same rule. */
  nameOf(link: Link): string;
  /** Of these joints, the ones a reader has been shown, in the order given. */
  shown(joints: readonly Joint[]): Joint[];
}

/** Every joint at or under a body, once each, in the order it meets them. */
function jointsUnder(body: Link): Joint[] {
  const found = new Map<string, Joint>();
  const visit = (link: Link): void => {
    link.joints.forEach((joint) => found.set(joint.id, joint));
    if (link instanceof RealLink) link.subset.forEach(visit);
  };
  visit(body);
  return [...found.values()];
}

/** The reader-safe names for one drawing, resolved once. */
export function exportNames(joints: readonly Joint[], links: readonly Link[]): ExportNames {
  const cylinders: readonly Cylinder[] = cylindersIn([...joints]);
  const buried = new Set(cylinders.map((cylinder) => cylinder.inner.id));
  const holdsBuried = (link: Link): boolean =>
    jointsUnder(link).some((joint) => buried.has(joint.id));

  // Everything that keeps its own id claims that id first, so a rename can
  // never land on one.
  const taken = new Set<string>();
  links.forEach((link) => {
    if (!holdsBuried(link)) taken.add(link.id);
  });

  const renamed = new Map<string, string>();
  links.forEach((link) => {
    if (!holdsBuried(link) || renamed.has(link.id)) return;
    const base = visibleBodyName(link, cylinders);
    const welded = link instanceof RealLink && link.subset.length > 0;
    let candidate = base;
    if (taken.has(candidate) && welded) candidate = `${base} welded`;
    for (let at = 2; taken.has(candidate); at++) candidate = `${base} ${at}`;
    taken.add(candidate);
    renamed.set(link.id, candidate);
  });

  return {
    buried,
    isBuried: (joint) => buried.has(joint.id),
    idOf: (link) => renamed.get(link.id) ?? link.id,
    // The typed name where there is one and it is safe; the id's replacement
    // otherwise. A body's `name` falls back to its id when nobody has typed
    // one, so an unnamed body would print the buried joint here too.
    nameOf: (link) =>
      holdsBuried(link) && link.name === link.id
        ? (renamed.get(link.id) ?? link.id)
        : (link as RealLink).name || link.id,
    shown: (list) => list.filter((joint) => !buried.has(joint.id)),
  };
}
