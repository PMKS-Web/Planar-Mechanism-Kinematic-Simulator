import { Mechanism } from './mechanism';
import { KinematicSnapshot } from './solver-explanation';
import { PrisJoint, RealJoint } from '../joint';
import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { column, signedSum, texName, texNumber, vector } from './worksheet-math';
import { defaultWorksheetLoops, loopSystem, WorksheetLoop } from './worksheet-loops';
import { signedSystem, WorksheetSign } from './worksheet-conventions';

/** Symbolic kinematics is written from directed edges, never from sorted link IDs. */
export function kinematicWorksheet(
  mechanism: Mechanism,
  step: number,
  rates: KinematicSnapshot,
  chosenLoops: WorksheetLoop[] = defaultWorksheetLoops(mechanism.requiredLoops),
  angular: WorksheetSign = 1,
  angularByBody: Record<string, WorksheetSign> = {}
) {
  const joints = mechanism.joints[step];
  const links = mechanism.links[step];
  const signOf = (id: string) => angularByBody[id] ?? angular;
  const convert = (system: KinematicSnapshot['velocity']) => {
    const rows = rates.route === 'loops' ? loopSystem(system, chosenLoops) : system;
    return (
      rows &&
      signedSystem(
        rows,
        rows.unknowns.map((u) =>
          u.unit.startsWith('rad/') ? signOf(u.label.slice(u.label.indexOf('_') + 1)) : 1
        )
      )
    );
  };
  const systems = { velocity: convert(rates.velocity), acceleration: convert(rates.acceleration) };
  const angularVector = (symbol: string, id: string) =>
    signOf(id) === 1
      ? vector(symbol, texName(id))
      : `\\left(-${vector(symbol, texName(id))}\\right)`;
  const scaled = (v: [number, number] | undefined) =>
    v ? column(v.map((n) => n / MODEL_SCALE)) : '\\text{unavailable}';
  const loops = chosenLoops.map((loop, index) => {
    const edges = loop.edges.map((edge) => ({
      ...edge,
      from: joints.find((j) => j.id === edge.fromId)!,
      to: joints.find((j) => j.id === edge.toId)!,
    }));
    const first = edges[0]?.from,
      last = edges.at(-1)?.to;
    const r = (from: string, to: string) => vector('r', `${texName(to)}/${texName(from)}`);
    const position = edges.map((e) => r(e.from.id, e.to.id)).join('+') + '=\\vec0';
    const velocity =
      edges
        .map((e) =>
          e.kind === 'ground'
            ? '\\underbrace{\\vec v_{\\mathrm{ground}}}_{0}'
            : vector('v', `${texName(e.to.id)}/${texName(e.from.id)}`)
        )
        .join('+') + '=\\vec0';
    const acceleration =
      edges
        .map((e) =>
          e.kind === 'ground'
            ? '\\underbrace{\\vec a_{\\mathrm{ground}}}_{0}'
            : vector('a', `${texName(e.to.id)}/${texName(e.from.id)}`)
        )
        .join('+') + '=\\vec0';
    const velocityTerms = edges
      .filter((e) => e.kind !== 'ground')
      .map((e) =>
        e.kind === 'link' && links.some((l) => l.id === e.linkId && l instanceof RealLink)
          ? `${angularVector('\\omega', e.linkId)}\\times${r(e.from.id, e.to.id)}`
          : `${vector('v', `${texName(e.to.id)}/${texName(e.from.id)}`)}`
      );
    const accelerationTerms = edges
      .filter((e) => e.kind !== 'ground')
      .map((e) =>
        e.kind === 'link' && links.some((l) => l.id === e.linkId && l instanceof RealLink)
          ? `${angularVector('\\alpha', e.linkId)}\\times${r(e.from.id, e.to.id)}+${angularVector('\\omega', e.linkId)}\\times\\left(${angularVector('\\omega', e.linkId)}\\times${r(e.from.id, e.to.id)}\\right)`
          : `${vector('a', `${texName(e.to.id)}/${texName(e.from.id)}`)}`
      );
    const systemRows = (acc: boolean) => {
      const system = acc ? systems.acceleration : systems.velocity;
      return [0, 1].flatMap((axis) => {
        if (!system?.A[index * 2 + axis]) return [];
        const symbols = system.unknowns.map((u) =>
          u.label.replace('ω', '\\omega').replace('α', '\\alpha').replace(/_(.*)/, '_{$1}')
        );
        return [
          `${signedSum(system.A[index * 2 + axis].map((a, i) => ({ coefficient: a, symbol: symbols[i] })))}=${texNumber(system.b[index * 2 + axis])}`,
        ];
      });
    };
    return {
      ...loop,
      index,
      edges,
      first,
      last,
      position,
      velocity,
      acceleration,
      velocityExpanded: `\\begin{gathered}${velocityTerms.map((t, i) => `${i ? '+' : ''}[${t}]`).join('\\\\')}=\\vec0\\end{gathered}`,
      accelerationExpanded: `\\begin{gathered}${accelerationTerms.map((t, i) => `${i ? '+' : ''}[${t}]`).join('\\\\')}=\\vec0\\end{gathered}`,
      velocityRows: systemRows(false),
      accelerationRows: systemRows(true),
      vectorRows: edges.map((e) => ({
        symbol: r(e.from.id, e.to.id),
        value: column([(e.to.x - e.from.x) / MODEL_SCALE, (e.to.y - e.from.y) / MODEL_SCALE, 0]),
      })),
    };
  });

  const bodyFor = (id: string) =>
    links.find((l) => l instanceof RealLink && l.joints.some((j) => j.id === id)) as
      RealLink | undefined;
  const motionAt = (point: { id: string; x: number; y: number }, body: RealLink, com = false) => {
    const source =
      body.joints.find(
        (j) => j.id !== point.id && j instanceof RealJoint && j.ground && !(j instanceof PrisJoint)
      ) ?? body.joints.find((j) => j.id !== point.id)!;
    if (!source) return undefined;
    const p = com ? `G_{${texName(body.id)}}` : texName(point.id),
      origin = texName(source.id),
      id = texName(body.id);
    const r = vector('r', `${p}/${origin}`),
      w = angularVector('\\omega', body.id),
      a = angularVector('\\alpha', body.id);
    const grounded = source instanceof RealJoint && source.ground && !(source instanceof PrisJoint);
    const base = (symbol: string) =>
      grounded ? `\\underbrace{${vector(symbol, origin)}}_{0}` : vector(symbol, origin);
    const v = com ? rates.bodyVelocity.get(body.id) : rates.jointVelocity.get(point.id);
    const acc = com ? rates.bodyAcceleration.get(body.id) : rates.jointAcceleration.get(point.id);
    const vs = rates.jointVelocity.get(source.id),
      as = rates.jointAcceleration.get(source.id);
    const omega = rates.omega.get(body.id),
      alpha = rates.alpha.get(body.id);
    const sign = signOf(body.id);
    const wNumber = `${sign === -1 ? '(-1)' : ''}(${texNumber(sign * omega!)})`;
    const aNumber = `${sign === -1 ? '(-1)' : ''}(${texNumber(sign * alpha!)})`;
    const dx = (point.x - source.x) / MODEL_SCALE,
      dy = (point.y - source.y) / MODEL_SCALE;
    return {
      id: point.id,
      bodyId: body.id,
      source: source.id,
      point,
      sourcePoint: source,
      title: com ? `Center of mass · ${body.name || body.id}` : `Joint ${point.id}`,
      radius: `${r}=${column([dx, dy, 0])}`,
      velocity: `${vector('v', p)}=${base('v')}+${w}\\times${r}`,
      acceleration: `${vector('a', p)}=${base('a')}+${a}\\times${r}+${w}\\times(${w}\\times${r})`,
      velocityNumbers: `${scaled(vs)}+${column([`-${wNumber}(${texNumber(dy)})`, `${wNumber}(${texNumber(dx)})`])}=${scaled(v)}`,
      accelerationNumbers: `${scaled(as)}+${column([`-${aNumber}(${texNumber(dy)})-\\left(${wNumber}\\right)^2(${texNumber(dx)})`, `${aNumber}(${texNumber(dx)})-\\left(${wNumber}\\right)^2(${texNumber(dy)})`])}=${scaled(acc)}`,
      velocityValue: `${vector('v', p)}=${scaled(v)}`,
      accelerationValue: `${vector('a', p)}=${scaled(acc)}`,
      v,
      acc,
      vs,
      as,
      omega,
      alpha,
      dx,
      dy,
    };
  };
  const points = joints
    .filter((j) => !(j instanceof PrisJoint))
    .flatMap((j) => {
      if (j instanceof RealJoint && j.ground) return [];
      const body = bodyFor(j.id);
      const result = body && motionAt(j, body);
      return result ? [result] : [];
    });
  const centers = links.flatMap((l) => {
    if (!(l instanceof RealLink)) return [];
    const result = motionAt({ id: `G_${l.id}`, x: l.CoM.x, y: l.CoM.y }, l, true);
    return result ? [result] : [];
  });
  return { loops, points, centers, ...systems };
}
