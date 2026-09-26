import { Cylinder } from '../cylinder';
import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, RealLink } from '../link';
import {
  bodyAngles,
  deg,
  distAt,
  fmt,
  halfTurnTimes,
  isGroundPin,
  longestStraightRun,
  Samples,
  sideWord,
} from './fact-math';

/**
 * "How the parts relate": the facts that name a mechanism.
 *
 * The first run's misses were not wrong numbers but missing relations: a
 * wiper's two blades were listed as two unrelated rockers, a pumpjack's beam
 * as one more rocking link. Each fact here is a relation between parts that
 * the per-part lines above cannot express.
 */
export interface RelationContext {
  bodies: Link[];
  visible: Joint[];
  hidden: Set<string>;
  samples: Samples;
  cylinders: Cylinder[];
  label: (joint: Joint) => string;
  bodyLabel: (link: Link) => string;
}

/** A link its author drew as a disc: a wheel or a flywheel. */
export const isDisc = (link: Link) => link instanceof RealLink && link.isCircle;

export function describeRelations(ctx: RelationContext): string[] {
  const lines = [
    ...fourBarLoops(ctx),
    ...sliderCranks(ctx),
    ...slotCranks(ctx),
    ...cylinderLevers(ctx),
    ...movingTogether(ctx),
    ...levers(ctx),
    ...pathPlacement(ctx),
  ];
  return ['### How the parts relate', ...(lines.length ? lines : ['- Nothing notable.'])];
}

export const jointsOf = (ctx: RelationContext, body: Link) =>
  body.joints.filter((joint) => !ctx.hidden.has(joint.id) && ctx.samples.paths.has(joint.id));

/** How far a body's orientation swings over the solved cycle, in degrees. */
export function sweepOf(ctx: RelationContext, body: Link): number {
  const angles = bodyAngles(jointsOf(ctx, body), ctx.samples);
  return angles ? deg(Math.max(...angles) - Math.min(...angles)) : 0;
}

export const turnsFully = (ctx: RelationContext, body: Link) =>
  !ctx.samples.mechanism.reciprocates && sweepOf(ctx, body) > 300;

export function traced(ctx: RelationContext): Joint[] {
  return ctx.visible.filter(
    (joint) => joint instanceof RealJoint && joint.showCurve && !isGroundPin(joint)
  );
}

/** One ground-crank-coupler-crank-ground loop: g1-j1 on `left`, j1-j2 on `coupler`, j2-g2 on `right`. */
export interface FourBar {
  g1: Joint;
  j1: Joint;
  j2: Joint;
  g2: Joint;
  left: Link;
  coupler: Link;
  right: Link;
}

/** Every four-bar loop in the mechanism, each once. */
export function findFourBars(ctx: RelationContext): FourBar[] {
  const loops: FourBar[] = [];
  const seen = new Set<string>();
  for (const left of ctx.bodies) {
    for (const g1 of jointsOf(ctx, left).filter(isGroundPin)) {
      for (const j1 of jointsOf(ctx, left).filter((j) => !isGroundPin(j))) {
        for (const right of ctx.bodies) {
          if (right === left) continue;
          for (const g2 of jointsOf(ctx, right).filter((j) => isGroundPin(j) && j !== g1)) {
            for (const j2 of jointsOf(ctx, right).filter((j) => !isGroundPin(j) && j !== j1)) {
              const coupler = ctx.bodies.find(
                (b) =>
                  b !== left &&
                  b !== right &&
                  jointsOf(ctx, b).includes(j1) &&
                  jointsOf(ctx, b).includes(j2) &&
                  !jointsOf(ctx, b).some(isGroundPin)
              );
              if (!coupler) continue;
              const key = [g1, j1, j2, g2]
                .map((j) => j.id)
                .sort()
                .join();
              if (seen.has(key)) continue;
              seen.add(key);
              loops.push({ g1, j1, j2, g2, left, coupler, right });
            }
          }
        }
      }
    }
  }
  return loops;
}

/** Every four-bar loop, classified by Grashof's rule. */
function fourBarLoops(ctx: RelationContext): string[] {
  const len = (a: Joint, b: Joint) => distAt(ctx.samples, a, b);
  return findFourBars(ctx).map(({ g1, j1, j2, g2, left, coupler, right }) =>
    classifyFourBar([
      {
        name: `${ctx.bodyLabel(left)} (${g1.id}-${j1.id})`,
        value: len(g1, j1),
        side: true,
        turns: turnsFully(ctx, left),
        sweep: sweepOf(ctx, left),
      },
      {
        name: `${ctx.bodyLabel(coupler)} (${j1.id}-${j2.id})`,
        value: len(j1, j2),
        sweep: sweepOf(ctx, coupler),
      },
      {
        name: `${ctx.bodyLabel(right)} (${g2.id}-${j2.id})`,
        value: len(g2, j2),
        side: true,
        turns: turnsFully(ctx, right),
        sweep: sweepOf(ctx, right),
      },
      { name: `ground ${g1.id}-${g2.id}`, value: len(g1, g2) },
    ])
  );
}

function classifyFourBar(
  bars: { name: string; value: number; side?: boolean; turns?: boolean; sweep?: number }[]
): string {
  const [a, b, c, d] = bars;
  const sorted = [...bars].sort((x, y) => x.value - y.value);
  const s = sorted[0];
  const l = sorted[3];
  const shortLong = s.value + l.value;
  const others = sorted[1].value + sorted[2].value;
  const listing = bars.map((bar) => `${bar.name} ${fmt(bar.value)}`).join(', ');
  const margin = `shortest + longest = ${fmt(shortLong)} vs the other two = ${fmt(others)}`;
  const near = (x: number, y: number) => Math.abs(x - y) < 0.002 * Math.max(x, y);
  let verdict: string;
  // Equal opposite bars are a parallelogram only while the coupler keeps its
  // angle; crossed, the same four lengths make an antiparallelogram.
  if (near(a.value, c.value) && near(b.value, d.value) && (b.sweep ?? 0) < 0.5) {
    verdict =
      'a parallelogram: opposite bars are equal and the coupler keeps its angle, so the coupler stays parallel to the ground line and the two side bars stay parallel to each other';
  } else if (near(a.value, c.value) && near(b.value, d.value)) {
    verdict = `an antiparallelogram (crossed four-bar): opposite bars are equal, but the coupler turns ${fmt(b.sweep ?? 0, 1)} deg, so it does not stay parallel to the ground line`;
  } else if (near(shortLong, others)) {
    verdict = `a change-point (borderline Grashof) four-bar (${margin})`;
  } else if (shortLong < others) {
    verdict =
      s === d
        ? `a Grashof double-crank (drag link): the ground is the shortest bar, so both side bars are able to turn fully (${margin})`
        : s.side
          ? `a Grashof crank-rocker: ${s.name} is the shortest bar, so it is able to turn fully while the opposite side bar only rocks (${margin})` +
            (s.turns
              ? ''
              : `. In this mechanism it does not turn fully: it sweeps ${fmt(s.sweep ?? 0, 1)} deg over the solved motion`)
          : `a Grashof double-rocker: the coupler is the shortest bar, so neither side bar can turn fully (${margin})`;
  } else {
    verdict = `a non-Grashof (triple-rocker) four-bar: no bar can turn fully relative to the ground (${margin})`;
  }
  return `- Four-bar loop: ${listing}. It is ${verdict}.`;
}

/** A crank (or rocking lever) driving a block on a fixed guide through a rod. */
function sliderCranks(ctx: RelationContext): string[] {
  const lines: string[] = [];
  const sliders = ctx.visible.filter(
    (j): j is PrisJoint => j instanceof PrisJoint && j.ground && ctx.samples.paths.has(j.id)
  );
  for (const slider of sliders) {
    for (const rod of ctx.bodies.filter((b) => jointsOf(ctx, b).includes(slider))) {
      for (const j1 of jointsOf(ctx, rod).filter((j) => j !== slider && !isGroundPin(j))) {
        const crank = ctx.bodies.find(
          (b) => b !== rod && jointsOf(ctx, b).includes(j1) && jointsOf(ctx, b).some(isGroundPin)
        );
        if (!crank) continue;
        const pivot = jointsOf(ctx, crank).find(isGroundPin)!;
        const r = distAt(ctx.samples, pivot, j1);
        const rodLength = distAt(ctx.samples, j1, slider);
        const g = ctx.samples.paths.get(pivot.id)![0];
        const s = ctx.samples.paths.get(slider.id)![0];
        const ux = Math.cos(slider.angle_rad);
        const uy = Math.sin(slider.angle_rad);
        const offset = Math.abs(-(g[0] - s[0]) * uy + (g[1] - s[1]) * ux);
        if (!turnsFully(ctx, crank) && sweepOf(ctx, crank) > 300) {
          lines.push(
            `- Slider-crank: ${ctx.bodyLabel(crank)} (radius ${fmt(r)} about ${pivot.id}) and slider ${ctx.label(slider)} are joined by rod ${ctx.bodyLabel(rod)} (length ${fmt(rodLength)}); ${ctx.bodyLabel(crank)} goes most of a turn and back again, because the input reverses.`
          );
          continue;
        }
        if (!turnsFully(ctx, crank)) {
          lines.push(
            `- Slider-crank arrangement driven by a rocking lever: ${ctx.bodyLabel(crank)} (arm ${fmt(r)} from its pivot ${pivot.id}, swinging ${fmt(sweepOf(ctx, crank), 1)} deg) pushes slider ${ctx.label(slider)} along its guide through rod ${ctx.bodyLabel(rod)} (length ${fmt(rodLength)}).`
          );
          continue;
        }
        const kind =
          offset < 0.02 * r
            ? 'in line with the crank pivot, so the two strokes are symmetric'
            : `offset ${fmt(offset)} from the crank pivot, which makes one stroke take longer than the other`;
        lines.push(
          `- Slider-crank: ${ctx.bodyLabel(crank)} (radius ${fmt(r)} about ${pivot.id}) drives slider ${ctx.label(slider)} through rod ${ctx.bodyLabel(rod)} (length ${fmt(rodLength)}, ${fmt(rodLength / r)}x the crank radius). The guide is ${kind}.`
        );
      }
    }
  }
  return lines;
}

/** Bodies whose orientation changes identically, or as mirror images. */
function movingTogether(ctx: RelationContext): string[] {
  const series = ctx.bodies
    .map((body) => ({ body, angles: bodyAngles(jointsOf(ctx, body), ctx.samples) }))
    .filter((s): s is { body: Link; angles: number[] } => !!s.angles)
    .map((s) => ({ ...s, change: s.angles.map((a) => a - s.angles[0]) }))
    .filter((s) => deg(Math.max(...s.change) - Math.min(...s.change)) > 1);
  const lines: string[] = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i];
      const b = series[j];
      const same = Math.max(...a.change.map((v, k) => Math.abs(v - b.change[k])));
      const mirror = Math.max(...a.change.map((v, k) => Math.abs(v + b.change[k])));
      const sweep = fmt(deg(Math.max(...a.change) - Math.min(...a.change)), 1);
      if (deg(same) < 0.5) {
        lines.push(
          `- ${ctx.bodyLabel(a.body)} and ${ctx.bodyLabel(b.body)} turn together: their angles change identically at every instant (both sweep ${sweep} deg), so the angle between them never changes. ${parallelLines(ctx, a.body, b.body)}`
        );
      } else if (deg(mirror) < 0.5) {
        lines.push(
          `- ${ctx.bodyLabel(a.body)} and ${ctx.bodyLabel(b.body)} turn as mirror images: equal and opposite angle changes (${sweep} deg each).`
        );
      }
    }
  }
  return lines;
}

/**
 * Turning together fixes the angle between two bodies; it makes them parallel
 * only if some line on one is parallel to some line on the other to begin with.
 * The first sheet said "so they stay parallel" for every such pair.
 */
function parallelLines(ctx: RelationContext, a: Link, b: Link): string {
  const lines = (body: Link) => {
    const joints = jointsOf(ctx, body);
    const out: { name: string; angle: number; length: number; pivot: boolean }[] = [];
    for (let i = 0; i < joints.length; i++)
      for (let k = i + 1; k < joints.length; k++) {
        const p = ctx.samples.paths.get(joints[i].id)![0];
        const q = ctx.samples.paths.get(joints[k].id)![0];
        out.push({
          name: `${joints[i].id}-${joints[k].id}`,
          angle: Math.atan2(q[1] - p[1], q[0] - p[0]),
          length: Math.hypot(q[0] - p[0], q[1] - p[1]),
          pivot: isGroundPin(joints[i]) || isGroundPin(joints[k]),
        });
      }
    return out;
  };
  // Lines through each body's own pivot first (a wiper's arms, not its tie
  // points), then the longest pair.
  const rank = (la: { pivot: boolean; length: number }, lb: { pivot: boolean; length: number }) =>
    (la.pivot && lb.pivot ? 1000 : 0) + la.length + lb.length;
  let best: { a: string; b: string; rank: number } | undefined;
  for (const la of lines(a))
    for (const lb of lines(b)) {
      const between = Math.abs(deg(la.angle - lb.angle)) % 180;
      const off = Math.min(between, 180 - between);
      if (off < 0.5 && (!best || rank(la, lb) > best.rank))
        best = { a: la.name, b: lb.name, rank: rank(la, lb) };
    }
  return best
    ? `Line ${best.a} stays parallel to line ${best.b}.`
    : 'No line on one is parallel to a line on the other, so they are not parallel.';
}

/** A body pivoted between two of its joints: a beam or seesaw. One line per body. */
function levers(ctx: RelationContext): string[] {
  const lines: string[] = [];
  for (const body of ctx.bodies) {
    // A wheel carrying a crank pin and a spoke point is not a seesaw, and the
    // word sent the model looking for levers.
    if (isDisc(body)) continue;
    const joints = jointsOf(ctx, body);
    const pivot = joints.find(isGroundPin);
    if (!pivot) continue;
    const g = ctx.samples.paths.get(pivot.id)![0];
    const arms = joints
      .filter((j) => j !== pivot)
      .map((j) => {
        const p = ctx.samples.paths.get(j.id)![0];
        return {
          joint: j,
          angle: Math.atan2(p[1] - g[1], p[0] - g[0]),
          length: Math.hypot(p[0] - g[0], p[1] - g[1]),
        };
      });
    let best: { a: (typeof arms)[number]; b: (typeof arms)[number]; between: number } | undefined;
    for (let i = 0; i < arms.length; i++) {
      for (let k = i + 1; k < arms.length; k++) {
        let between = Math.abs(deg(arms[i].angle - arms[k].angle)) % 360;
        if (between > 180) between = 360 - between;
        if (between >= 150 && (!best || between > best.between)) {
          best = { a: arms[i], b: arms[k], between };
        }
      }
    }
    if (!best) continue;
    const [short, long] = [best.a, best.b].sort((x, y) => x.length - y.length);
    lines.push(
      `- ${ctx.bodyLabel(body)} is a lever (beam) pivoted at ${pivot.id} between ${best.a.joint.id} and ${best.b.joint.id}: they sit on opposite sides of the pivot (arms ${fmt(best.a.length)} and ${fmt(best.b.length)}), so the two ends always move in opposite directions, and ${long.joint.id} moves ${fmt(long.length / short.length)}x as far as ${short.joint.id}.`
    );
  }
  return lines;
}

/**
 * A crank driving a pin in another link's slot: the inverted slider-crank
 * family. Which member it is follows from two lengths and the solved motion.
 */
function slotCranks(ctx: RelationContext): string[] {
  const lines: string[] = [];
  const riders = ctx.visible.filter(
    (j): j is PrisJoint => j instanceof PrisJoint && !!j.carrier && ctx.samples.paths.has(j.id)
  );
  for (const rider of riders) {
    const slotted = rider.carrier!;
    const crank = ctx.bodies.find(
      (b) => b !== slotted && jointsOf(ctx, b).includes(rider) && jointsOf(ctx, b).some(isGroundPin)
    );
    if (!crank) continue;
    const crankPivot = jointsOf(ctx, crank).find(isGroundPin)!;
    const r = distAt(ctx.samples, crankPivot, rider);
    const slottedPivot = jointsOf(ctx, slotted).find(isGroundPin);
    const drive = `${ctx.bodyLabel(crank)} (radius ${fmt(r)} about ${crankPivot.id}) drives ${ctx.bodyLabel(slotted)} through pin ${rider.id} riding in a slot on ${ctx.bodyLabel(slotted)}`;
    if (sweepOf(ctx, slotted) < 0.5) {
      lines.push(
        `- ${drive}. ${ctx.bodyLabel(slotted)} cannot turn, so it follows only the part of ${rider.id}'s circular motion along its own guide: a steady crank gives it a smooth back-and-forth (harmonic) motion.`
      );
    } else if (slottedPivot) {
      const d = distAt(ctx.samples, crankPivot, slottedPivot);
      lines.push(
        `- ${drive}, which pivots at ${slottedPivot.id}, ${fmt(d)} from ${crankPivot.id}. ` +
          (r > d
            ? `The crank radius is larger than that pivot distance, so ${ctx.bodyLabel(slotted)} turns fully but unevenly (the rotating-slotted-link arrangement).${halfTurns(ctx, slotted)}`
            : `The crank radius is smaller than that pivot distance, so ${ctx.bodyLabel(slotted)} only rocks, and its two swings take different times (the oscillating-slotted-link arrangement).`)
      );
    }
  }
  return lines;
}

function halfTurns(ctx: RelationContext, body: Link): string {
  const angles = bodyAngles(jointsOf(ctx, body), ctx.samples);
  const times = angles && halfTurnTimes(angles, ctx.samples.time);
  if (!times || times.slow / times.fast < 1.05) return '';
  return ` Its slowest half-turn takes ${fmt(times.slow)} s and the opposite half-turn ${fmt(times.fast)} s (time ratio ${fmt(times.slow / times.fast)}), so anything it drives back and forth through those two half-turns gets a slow stroke and a quick return.`;
}

/** A cylinder pushing a link round its pivot: extension in, rotation out. */
function cylinderLevers(ctx: RelationContext): string[] {
  const lines: string[] = [];
  for (const cylinder of ctx.cylinders) {
    const a = ctx.samples.paths.get(cylinder.mountA.id)!;
    const b = ctx.samples.paths.get(cylinder.mountB.id)!;
    const spans = a.map((p, i) => Math.hypot(b[i][0] - p[0], b[i][1] - p[1]));
    const extension = Math.max(...spans) - Math.min(...spans);
    for (const mount of [cylinder.mountA, cylinder.mountB]) {
      if (isGroundPin(mount)) continue;
      const lever = ctx.bodies.find(
        (body) => jointsOf(ctx, body).includes(mount) && jointsOf(ctx, body).some(isGroundPin)
      );
      if (!lever || extension < 1e-6) continue;
      const pivot = jointsOf(ctx, lever).find(isGroundPin)!;
      const sweep = sweepOf(ctx, lever);
      lines.push(
        `- The cylinder pushes ${ctx.bodyLabel(lever)} at ${mount.id}, ${fmt(distAt(ctx.samples, pivot, mount))} from its pivot ${pivot.id}: ${fmt(extension)} of extension swings it ${fmt(sweep, 1)} deg, about ${fmt(sweep / extension, 1)} deg per unit of extension.`
      );
    }
  }
  return lines;
}

/**
 * Where each traced path sits relative to the frame, and which edge of the path
 * a straight stretch forms -- a foot's flat stride is its bottom edge.
 */
function pathPlacement(ctx: RelationContext): string[] {
  const lines: string[] = [];
  const grounds = ctx.visible.filter(isGroundPin).map((j) => ctx.samples.paths.get(j.id)![0]);
  const reciprocates = ctx.samples.mechanism.reciprocates;
  for (const joint of traced(ctx)) {
    const path = ctx.samples.paths.get(joint.id)!;
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    if (grounds.length) {
      const gy = grounds.map((p) => p[1]);
      const gx = grounds.map((p) => p[0]);
      const where =
        Math.max(...ys) < Math.min(...gy)
          ? 'entirely below every ground pivot'
          : Math.min(...ys) > Math.max(...gy)
            ? 'entirely above every ground pivot'
            : Math.max(...xs) < Math.min(...gx)
              ? 'entirely left of every ground pivot'
              : Math.min(...xs) > Math.max(...gx)
                ? 'entirely right of every ground pivot'
                : 'overlapping the span of the ground pivots';
      lines.push(
        `- ${joint.id}'s path lies ${where} (path x ${fmt(Math.min(...xs))} to ${fmt(Math.max(...xs))}, y ${fmt(Math.min(...ys))} to ${fmt(Math.max(...ys))}; pivots x ${fmt(Math.min(...gx))} to ${fmt(Math.max(...gx))}, y ${fmt(Math.min(...gy))} to ${fmt(Math.max(...gy))}).`
      );
    }
    const run = longestStraightRun(path, !reciprocates, ctx.samples.time);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (!run || run.length < 0.25 * extent) continue;
    const normal: [number, number] = [-run.direction[1], run.direction[0]];
    const across = path.map(([x, y]) => x * normal[0] + y * normal[1]);
    const low = Math.min(...across);
    const high = Math.max(...across);
    const n = path.length;
    const runAcross =
      Array.from({ length: run.end - run.start + 1 }, (_, k) => across[(run.start + k) % n]).reduce(
        (sum, v) => sum + v,
        0
      ) /
      (run.end - run.start + 1);
    const span = high - low;
    if (span < 1e-9) continue;
    const onLow = runAcross - low < 0.1 * span;
    const onHigh = high - runAcross < 0.1 * span;
    if (!onLow && !onHigh) continue;
    const edge = sideWord(onLow ? [-normal[0], -normal[1]] : normal);
    lines.push(
      `- ${joint.id}'s nearly straight stretch (${fmt(run.length)} long, ${fmt(run.fraction * 100, 0)}% of the cycle) is the ${edge} edge of its path; the rest of the path bulges up to ${fmt(span)} away from it on one side.`
    );
  }
  return lines;
}
