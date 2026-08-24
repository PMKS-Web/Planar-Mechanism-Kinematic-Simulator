import type { LibraryTemplateID } from '../../app/component/MODALS/templates/template-linkages';
import { PART_COLORS } from '../../app/model/joint-colors';
import type { FixtureLink, MechanismFixture } from './fixture';

/**
 * What colour each link of a library template is drawn in.
 *
 * The app hands colours out round-robin as links are drawn, which is right for
 * somebody building a mechanism — the next link is always a different colour
 * from the last one — and wrong for a template, where the drawing is finished
 * and the colours are the only labelling it has. Round-robin made the two arms
 * of the windshield wiper different colours and the two rods pushing them the
 * same one, which is exactly backwards from how the linkage reads.
 *
 * So a template's colours are decided here, from its structure, by three rules:
 *
 *  1. **Links pinned to the frame wear indigo; links that float wear teal.**
 *     The palette is three indigos and three teals, so this costs nothing and
 *     tells you at a glance which parts are anchored and which are carried.
 *  2. **Parts that do the same job share a colour** — the five con-rods of the
 *     radial engine, the two wiper arms, the mirrored halves of Peaucellier's
 *     cell, the parallel sides of the pantograph. That is the `same` table.
 *  3. **Parts that meet wear different colours**, or a pin joint reads as a
 *     weld. Rule 2 wins where the two disagree: two mirror-image bars meeting
 *     on the mirror line should match, and that is worth more than the pin.
 *
 * Within a family the shades are spent mid, dark, pale, so the two palest
 * colours only appear on a drawing with enough links to need them. They are
 * nearly the background, and a mechanism whose crank was one of them read as
 * having three links rather than four.
 */

/**
 * The palette split by family, each in the order its shades are spent.
 *
 * The pale one is last in both, and is treated as a last resort rather than
 * merely a late choice — see `rank`. It is nearly the background, so a drawing
 * that spent it on the part the template is named after (the backhoe's bucket,
 * the scissor lift's platform) read as having a hole where its subject was.
 */
const ANCHORED = [1, 2, 0] as const;
const FLOATING = [4, 5, 3] as const;

export interface TemplateParts {
  /**
   * The independent machines in a drawing that holds more than one, as lists
   * of link ids.
   *
   * Each is coloured from the top of the palette on its own, so three copies
   * of the same pump come out identical instead of the second starting
   * wherever the first ran out. Two machines never touch, so nothing is lost
   * by giving them the same colours.
   */
  machines?: string[][];
  /** Groups of links that are one part of the drawing and share one colour. */
  same?: string[][];
  /**
   * A link pinned to one of the six, by index, overruling everything above.
   *
   * For the cases the rules cannot see. They know which parts touch and which
   * are the same part; they do not know which part the drawing is *about*, and
   * a mechanism named after the one link that came out palest is a picture
   * that has lost its subject. Keyed by the link, or by the first member of a
   * group. Use it where the rule is wrong about a drawing, not to hand-colour
   * a drawing the rule got right.
   */
  fixed?: Record<string, number>;
}

/**
 * Which links of which template are the same part twice (or five times).
 *
 * Only what a reader would notice: a group here is a claim that two links do
 * the same job, and a wrong claim is worse than no claim. Everything absent is
 * coloured by the two structural rules alone.
 */
const TEMPLATE_PARTS: Partial<Record<LibraryTemplateID, TemplateParts>> = {
  // Five identical con-rods on one crankpin. They all meet at the hub, so this
  // is rule 2 overruling rule 3 — and it should: they are one part, made five
  // times, and colouring them apart would invent a difference the engine does
  // not have.
  Radial_Engine: { same: [['AB', 'AC', 'AD', 'AE', 'AF']] },
  // The two arms that carry the blades. The drive link and the tie rod between
  // them do different jobs and stay apart.
  Windshield_Wiper: { same: [['BCPT', 'DQU']] },
  // Everything in it comes in twos, mirrored about the cylinder's axis: the two
  // arms, and the two short links reaching each of them. The two rails are the
  // exception — they are not a mirror pair but they are the same part twice, a
  // fixed guide, so they match for the other reason.
  Cylinder_Gripper: {
    same: [
      ['KL', 'OP'],
      ['GM', 'IT'],
      ['HQ', 'JV'],
      ['MQS', 'TVX'],
    ],
  },
  // Mirror images about the line the pen rules: the two bars off the fixed
  // pivot, then the near and far pairs of the rhombus. Colouring the halves
  // alike is what makes the symmetry — the whole reason the linkage works —
  // visible in a still picture.
  Peaucellier: {
    same: [
      ['OA', 'OB'],
      ['AP', 'BP'],
      ['AQ', 'BQ'],
    ],
  },
  // Opposite sides of the parallelogram. A pantograph is a parallelogram that
  // stays one while it moves, and matching the parallel pairs says so.
  Pantograph: {
    same: [
      ['JKO', 'LP'],
      ['KP', 'JLT'],
    ],
  },
  // Every bar the foot hangs from touches it, so the rule runs the teals out
  // and leaves the foot — the whole point of the drawing — the palest of them.
  // Spending the pale one on the thin bar up by the frame instead costs a bar
  // nobody looks at and buys back the part everybody does.
  Jansen_Leg: { fixed: { CE: 3 } },
  Three_Machines: {
    machines: [
      ['AB', 'BC', 'CD'],
      ['EF', 'FG'],
      ['HI', 'IJ', 'JK'],
    ],
  },
  // Two legs of one gait: same linkage, half a cycle apart. Identical colours
  // are what make it read as one animal rather than two mechanisms.
  Walking_Pair: {
    machines: [
      ['AB', 'BD', 'CDE', 'BF', 'CF', 'EG', 'FGH'],
      ['IJ', 'JL', 'KLM', 'JN', 'KN', 'MO', 'NOP'],
    ],
  },
  // Chebyshev beside Peaucellier, each coloured as its own template is, so the
  // comparison is between the paths and not between two palettes.
  Straight_Line_Pair: {
    machines: [
      ['AC', 'BCD', 'BE'],
      ['HI', 'GJ', 'GK', 'JI', 'KI', 'JL', 'KL'],
    ],
    same: [
      ['GJ', 'GK'],
      ['JI', 'KI'],
      ['JL', 'KL'],
    ],
  },
  // The one drawing where colour carries an argument rather than a structure.
  // It is the same four bars four times, and what changes is which one is
  // held still — so a bar keeps its colour across all four, and the missing
  // colour in each is the bar being held. The anchored/floating rule would say
  // the opposite: it would repaint a bar every time its job changed, which is
  // exactly the thing this drawing exists to say does not make it a new bar.
  Four_Bar_Inversions: {
    machines: [
      ['AB', 'BC', 'CD'],
      ['EF', 'FG', 'GH'],
      ['IJ', 'JK', 'KL'],
      ['MN', 'NO', 'OP'],
    ],
    fixed: {
      // L1 indigo, L2 teal, L3 navy, L4 dark teal, wherever each turns up.
      AB: 4,
      BC: 2,
      CD: 5,
      EF: 1,
      FG: 5,
      GH: 2,
      IJ: 4,
      JK: 1,
      KL: 5,
      MN: 1,
      NO: 4,
      OP: 2,
    },
  },
  Pumping_Field: {
    machines: [
      ['AB', 'BC', 'CDE', 'EF'],
      ['HI', 'IJ', 'JKL', 'LM'],
      ['OP', 'PQ', 'QRS', 'ST'],
    ],
  },
};

/**
 * A link, reduced to what deciding its colour needs.
 *
 * Both a fixture spec and a decoded drawing can say this much, which is what
 * lets the five hand-authored templates be coloured by the same rule as the
 * generated ones without either side learning the other's shape.
 */
export interface ColorableLink {
  id: string;
  jointIds: string[];
}

/** One coloured thing: a link, or several links that are one part. */
interface Unit {
  links: string[];
  anchored: boolean;
  /** Every joint any member touches, for deciding what it meets. */
  joints: Set<string>;
}

const meets = (one: Unit, other: Unit): boolean =>
  [...one.joints].some((joint) => other.joints.has(joint));

/** The colour of every link in a library template, keyed by link id. */
export function libraryTemplateFills(
  id: LibraryTemplateID,
  fixture: MechanismFixture
): Map<string, string> {
  const grounds = new Set(fixture.joints.filter((joint) => joint.ground).map((joint) => joint.id));
  const fills = logicalFills(
    fixture.links.map((link) => ({ id: link.joints, jointIds: [...link.joints] })),
    grounds,
    TEMPLATE_PARTS[id] ?? {},
    id
  );
  // A compound's members take the body's colour: welded they are drawn as one
  // shape, so a subset in some other colour is a colour nobody can see that
  // would surface the moment the weld came off.
  const spread = (link: FixtureLink): void =>
    link.subset?.forEach((member) => {
      fills.set(member.joints, fills.get(link.joints)!);
      spread(member);
    });
  fixture.links.forEach(spread);
  return fills;
}

/** The rule itself, over anything that can name its links and their joints. */
export function logicalFills(
  links: ColorableLink[],
  grounds: ReadonlySet<string>,
  parts: TemplateParts = {},
  label = 'drawing'
): Map<string, string> {
  const byId = new Map(links.map((link) => [link.id, link]));
  const machines = parts.machines ?? [links.map((link) => link.id)];
  checkTable(label, links, machines, parts.same ?? []);

  const fills = new Map<string, string>();
  for (const machine of machines) {
    const grouped = new Map<string, string[]>();
    for (const group of parts.same ?? []) {
      if (group.every((link) => machine.includes(link))) grouped.set(group[0], group);
    }
    const taken = new Set(([] as string[]).concat(...[...grouped.values()]));

    // In the order the fixture lists its links, which is the order the drawing
    // was built in: a group takes the place of its first member.
    const units: Unit[] = [];
    for (const linkId of machine) {
      const group = grouped.get(linkId) ?? (taken.has(linkId) ? undefined : [linkId]);
      if (!group) continue;
      const joints = new Set(group.flatMap((member) => byId.get(member)!.jointIds));
      units.push({
        links: group,
        anchored: [...joints].some((joint) => grounds.has(joint)),
        joints,
      });
    }

    const chosen = new Map<Unit, number>();
    const used = new Map<number, number>();
    for (const unit of units) {
      const family = unit.anchored ? ANCHORED : FLOATING;
      const neighbours = new Set(
        units
          .filter((other) => chosen.has(other) && meets(unit, other))
          .map((other) => chosen.get(other)!)
      );
      // Rule 3 first; then the shade worn by the fewest other parts, so a
      // drawing spreads across the palette instead of pairing things that are
      // not pairs. The pale shade loses to any of that: repeating a colour on
      // two parts at opposite ends of a drawing costs less than making one of
      // them disappear, so it is taken only when a neighbour holds every other
      // shade in the family.
      const free = family.filter((shade) => !neighbours.has(shade));
      const pin = parts.fixed?.[unit.links[0]];
      const rank = (shade: number): number =>
        (shade === family[family.length - 1] ? 1000 : 0) + (used.get(shade) ?? 0);
      const pick =
        pin ??
        (free.length ? free : [...family]).reduce((best, shade) =>
          rank(shade) < rank(best) ? shade : best
        );
      chosen.set(unit, pick);
      used.set(pick, (used.get(pick) ?? 0) + 1);
      for (const linkId of unit.links) fills.set(linkId, PART_COLORS[pick]);
    }
    checkPins(label, units, chosen, parts.fixed ?? {});
  }
  return fills;
}

/**
 * A pin overrules the rules, so it is the one place they cannot protect you.
 *
 * `fixed` skips the neighbour check by design, which means a pin can quietly
 * paint a link the same colour as something it is joined to — the exact fault
 * this file exists to remove, reintroduced by the escape hatch from it. Groups
 * are allowed to do that and pins are not: a group is a claim that two links
 * are one part, and a pin is only a claim about a shade.
 */
function checkPins(
  label: string,
  units: Unit[],
  chosen: Map<Unit, number>,
  fixed: Record<string, number>
): void {
  for (const unit of units) {
    if (fixed[unit.links[0]] === undefined) continue;
    const clash = units.find(
      (other) => other !== unit && meets(unit, other) && chosen.get(other) === chosen.get(unit)
    );
    if (clash) {
      throw new Error(
        `${label}: ${unit.links.join('/')} is pinned to the colour ${clash.links.join('/')} ` +
          'already wears, and they are joined'
      );
    }
  }
}

/**
 * The table describes this fixture and no other.
 *
 * A link id is a string of joint letters, so a template whose geometry moves
 * renames its links, and a `same` group naming the old id would silently stop
 * grouping anything. Loud here rather than a colour nobody notices went wrong.
 */
function checkTable(
  id: string,
  links: ColorableLink[],
  machines: string[][],
  same: string[][]
): void {
  const all = links.map((link) => link.id);
  const listed = machines.flat();
  const missing = all.filter((link) => !listed.includes(link));
  const unknown = listed.filter((link) => !all.includes(link));
  if (missing.length || unknown.length || listed.length !== new Set(listed).size) {
    throw new Error(
      `${id}: the machines table must name every link exactly once — ` +
        `missing ${missing.join(', ') || 'none'}, unknown ${unknown.join(', ') || 'none'}`
    );
  }
  for (const group of same) {
    const strangers = group.filter((link) => !all.includes(link));
    if (strangers.length) {
      throw new Error(`${id}: no link named ${strangers.join(', ')} to group`);
    }
    const machine = machines.find((one) => one.includes(group[0]));
    if (!group.every((link) => machine!.includes(link))) {
      throw new Error(`${id}: ${group.join('/')} are grouped but are not one machine`);
    }
  }
}
