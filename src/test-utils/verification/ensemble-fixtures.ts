import { MechanismFixture, FixtureLink, buildMechanism } from './fixture';
import { jansenLegFixture, pumpjackFixture } from './library-fixtures';
import { chebyshevStraightLineFixture } from './slot-fixtures';
import { peaucellierFixture } from './classic-fixtures';

/**
 * Drawings that hold several machines at once.
 *
 * Everything else in the library is one machine, and one machine cannot show
 * what this app grew the ability to do: partition a drawing, give each part of
 * it its own clock, and run them together or apart. These are the drawings
 * where that *is* the subject — two legs that only read as walking because they
 * are out of step with each other, two straight-line linkages whose difference
 * is only visible side by side, three pumps drifting in and out of phase.
 *
 * Each is composed from a mechanism the library already has, through `place`
 * below, rather than re-derived. A pumpjack is a pumpjack; three of them should
 * not be three chances to mistype its proportions.
 */

/** A cycle in six seconds at 1x, which is the pace the rest of the library opens at. */
const LIBRARY_RPM = 10;
const radPerSecond = (rpm: number) => (rpm * Math.PI) / 30;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * One machine, moved somewhere else on the grid and given fresh letters.
 *
 * Joint ids are single letters and a link id is the letters of its own joints
 * concatenated, so two copies of the same mechanism in one drawing would share
 * every id and the partitioner would treat them as one machine bolted together.
 * Re-lettering is therefore not cosmetic: it is what makes them two machines.
 *
 * Letters are handed out from `firstLetter` in the order the source lists its
 * joints, prismatic ids included — a slider's block is a joint too, and one
 * left behind under its old letter collides just as loudly.
 *
 * Masses are zeroed on the way through. Every drawing here is about motion, and
 * the library publishes massless unless the mechanism is about force.
 */
function place(
  source: MechanismFixture,
  firstLetter: string,
  offset: { x: number; y: number },
  drive?: { rpm: number },
  /** Turned about its own origin before it is moved, in radians. */
  turn = 0
): MechanismFixture {
  const sliders = source.sliders ?? (source.slider ? [source.slider] : []);
  const oldIds = [...source.joints.map((joint) => joint.id), ...sliders.map((one) => one.prisId)];
  const start = ALPHABET.indexOf(firstLetter);
  if (start < 0 || start + oldIds.length > ALPHABET.length) {
    throw new Error(`place: ${oldIds.length} letters will not fit starting at ${firstLetter}`);
  }
  const renamed = new Map(oldIds.map((id, index) => [id, ALPHABET[start + index]]));
  const rename = (id: string): string => {
    const to = renamed.get(id);
    if (!to) throw new Error(`place: nothing to rename ${id} to`);
    return to;
  };
  /** A link id is its joints' letters, so it re-letters one character at a time. */
  const renameLink = (id: string): string => [...id].map(rename).join('');
  const massless = (link: FixtureLink): FixtureLink => ({
    ...link,
    joints: renameLink(link.joints),
    mass: 0,
    moi: 0,
    subset: link.subset?.map(massless),
  });

  if (turn !== 0 && sliders.some((one) => one.angleRad !== undefined)) {
    // A grounded guide's direction is a world angle, and turning the joints
    // without turning it would leave the block sliding across its own slot.
    throw new Error('place: cannot turn a mechanism with a grounded guide');
  }
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  return {
    joints: source.joints.map((joint) => ({
      ...joint,
      id: rename(joint.id),
      x: joint.x * cos - joint.y * sin + offset.x,
      y: joint.x * sin + joint.y * cos + offset.y,
      ...(joint.input && drive ? { driveSpeed: drive.rpm } : {}),
    })),
    links: source.links.map(massless),
    ...(sliders.length
      ? {
          sliders: sliders.map((one) => ({
            ...one,
            at: rename(one.at),
            prisId: rename(one.prisId),
            ...(one.on
              ? {
                  on: {
                    carrier: renameLink(one.on.carrier),
                    a: rename(one.on.a),
                    b: rename(one.on.b),
                  },
                }
              : {}),
          })),
        }
      : {}),
    ...(source.welds ? { welds: source.welds.map(rename) } : {}),
    inputAngVel: source.inputAngVel,
  };
}

/** Every machine in one drawing, as one fixture. */
function merge(parts: MechanismFixture[], inputAngVel: number): MechanismFixture {
  return {
    joints: parts.flatMap((part) => part.joints),
    links: parts.flatMap((part) => part.links),
    sliders: parts.flatMap((part) => part.sliders ?? []),
    welds: parts.flatMap((part) => part.welds ?? []),
    inputAngVel,
  };
}

/**
 * The same mechanism, drawn where it stands part-way through its own cycle.
 *
 * Two legs read as walking only if one is up while the other is down, and a
 * drawing opens at timestep zero — so the phase difference has to be geometry,
 * not playback. Rather than re-derive the leg at a second crank angle and risk
 * picking the other assembly branch, this asks the solver: it builds the source
 * once, walks to the sample `share` of the way round, and reads the joints out
 * of that frame. Whatever branch the running mechanism is on is the branch the
 * second copy starts on, by construction.
 */
function posedAt(source: MechanismFixture, share: number): MechanismFixture {
  const { mechanism } = buildMechanism(source);
  const frames = mechanism.joints;
  const step = Math.min(frames.length - 1, Math.max(0, Math.round(share * (frames.length - 1))));
  const frame = frames[step];
  return {
    ...source,
    joints: source.joints.map((joint) => {
      const solved = frame.find((candidate) => candidate.id === joint.id);
      if (!solved) throw new Error(`posedAt: ${joint.id} is not in the solved frame`);
      return { ...joint, x: solved.x, y: solved.y };
    }),
  };
}

/** How far apart the two legs stand, in the leg's own (large) units. */
const STRIDE = 150;

/**
 * Two Jansen legs, half a cycle apart.
 *
 * One leg is a linkage; two legs out of step are a gait. The second starts half
 * a turn round, so one foot is planted while the other is lifting and swinging
 * forward — which is the thing a single-machine template cannot show, because
 * it is a relationship between two machines rather than a property of either.
 *
 * Both at the same speed, deliberately: legs that ran at different rates would
 * drift out of any gait at all within a few strides.
 */
export function walkingPairFixture(): MechanismFixture {
  const leg = jansenLegFixture();
  const near = place(leg, 'A', { x: 0, y: 0 }, { rpm: LIBRARY_RPM });
  const far = place(posedAt(leg, 0.5), 'I', { x: STRIDE, y: 0 }, { rpm: LIBRARY_RPM });
  return merge([near, far], radPerSecond(LIBRARY_RPM));
}

/**
 * An approximate straight line beside an exact one.
 *
 * Chebyshev's coupler midpoint runs *nearly* flat; Peaucellier's pen runs
 * exactly straight, and was the first linkage proved to. Both trace, and the
 * whole reason to draw them together is that "approximate" and "exact" are
 * words until you can see one path bow and the other not.
 *
 * Peaucellier is the larger of the two and sits to the right of it; they are
 * spaced to keep the two traced paths near enough to compare in one look
 * without either mechanism reaching into the other.
 */
export function straightLinePairFixture(): MechanismFixture {
  const approximate = place(
    chebyshevStraightLineFixture(),
    'A',
    { x: 0, y: 0 },
    { rpm: LIBRARY_RPM }
  );
  // Turned a quarter turn so its line runs the same way Chebyshev's does. The
  // cell rules a line perpendicular to its own ground axis, which is vertical
  // where it is drawn; two straight lines at right angles to each other are a
  // poor comparison, and the point of putting them together is the comparison.
  const exact = place(
    peaucellierFixture(),
    'G',
    { x: 11, y: 1.5 },
    { rpm: LIBRARY_RPM },
    -Math.PI / 2
  );
  return merge([approximate, exact], radPerSecond(LIBRARY_RPM));
}

/**
 * Three walking-beam pumps at three speeds.
 *
 * An oil field is not one pump, and the reason to draw three is that they are
 * not synchronised: the beams start together and drift apart, which is what
 * three playback rows on three clocks look like from the grid rather than from
 * the transport. The rates are close enough that they are plainly the same
 * machine and far enough apart to come out of step within a cycle or two.
 */
export function pumpingFieldFixture(): MechanismFixture {
  const unit = pumpjackFixture();
  const spacing = 13;
  const rates = [10, 8, 12];
  const wells = rates.map((rpm, index) =>
    place(unit, ALPHABET[index * 7], { x: index * spacing, y: 0 }, { rpm })
  );
  return merge(wells, radPerSecond(rates[0]));
}
