import { Mechanism } from './mechanism';
import { KinematicSnapshot } from './solver-explanation';
import { PrisJoint, RealJoint } from '../joint';
import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { column, signedSum, texName, texNumber, vector } from './worksheet-math';

/** Symbolic kinematics is written from directed edges, never from sorted link IDs. */
export function kinematicWorksheet(mechanism: Mechanism, step: number, rates: KinematicSnapshot) {
  const joints = mechanism.joints[step];
  const links = mechanism.links[step];
  const scaled = (v: [number, number] | undefined) =>
    v ? column(v.map((n) => n / MODEL_SCALE)) : '\\text{unavailable}';
  const loops = mechanism.requiredLoops.map((loop, index) => {
    const edges = loop.edges.map((edge) => ({
      ...edge,
      from: joints.find((j) => j.id === edge.fromId)!,
      to: joints.find((j) => j.id === edge.toId)!,
    }));
    const first = edges[0]?.from,
      last = edges.at(-1)?.to;
    const r = (from: string, to: string) => vector('r', `${texName(to)}/${texName(from)}`);
    const closure = first && last ? r(last.id, first.id) : '0';
    const position = [...edges.map((e) => r(e.from.id, e.to.id)), closure].join('+') + '=\\vec0';
    const velocity =
      edges.map((e) => vector('v', `${texName(e.to.id)}/${texName(e.from.id)}`)).join('+') +
      '+\\underbrace{\\vec v_{\\mathrm{ground}}}_{0}=\\vec0';
    const acceleration =
      edges.map((e) => vector('a', `${texName(e.to.id)}/${texName(e.from.id)}`)).join('+') +
      '+\\underbrace{\\vec a_{\\mathrm{ground}}}_{0}=\\vec0';
    const velocityTerms = edges.map((e) =>
      e.kind === 'link'
        ? `${vector('\\omega', texName(e.linkId))}\\times${r(e.from.id, e.to.id)}`
        : `${vector('v', `${texName(e.to.id)}/${texName(e.from.id)}`)}`
    );
    const accelerationTerms = edges.map((e) =>
      e.kind === 'link'
        ? `${vector('\\alpha', texName(e.linkId))}\\times${r(e.from.id, e.to.id)}+${vector('\\omega', texName(e.linkId))}\\times\\left(${vector('\\omega', texName(e.linkId))}\\times${r(e.from.id, e.to.id)}\\right)`
        : `${vector('a', `${texName(e.to.id)}/${texName(e.from.id)}`)}`
    );
    const systemRows = (acc: boolean) => {
      const system = acc ? rates.acceleration : rates.velocity;
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
      w = vector('\\omega', id),
      a = vector('\\alpha', id);
    const grounded = source instanceof RealJoint && source.ground && !(source instanceof PrisJoint);
    const base = (symbol: string) =>
      grounded ? `\\underbrace{${vector(symbol, origin)}}_{0}` : vector(symbol, origin);
    const v = com ? rates.bodyVelocity.get(body.id) : rates.jointVelocity.get(point.id);
    const acc = com ? rates.bodyAcceleration.get(body.id) : rates.jointAcceleration.get(point.id);
    const vs = rates.jointVelocity.get(source.id),
      as = rates.jointAcceleration.get(source.id);
    const omega = rates.omega.get(body.id),
      alpha = rates.alpha.get(body.id);
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
      velocityNumbers: `${scaled(vs)}+${column([`-${texNumber(omega!)}(${texNumber(dy)})`, `${texNumber(omega!)}(${texNumber(dx)})`])}=${scaled(v)}`,
      accelerationNumbers: `${scaled(as)}+${column([`-${texNumber(alpha!)}(${texNumber(dy)})-${texNumber(omega!)}^2(${texNumber(dx)})`, `${texNumber(alpha!)}(${texNumber(dx)})-${texNumber(omega!)}^2(${texNumber(dy)})`])}=${scaled(acc)}`,
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
  return { loops, points, centers };
}
