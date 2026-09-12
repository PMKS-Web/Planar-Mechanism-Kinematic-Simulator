import { BodyLoad, LinearSystemExplanation } from './solver-explanation';
import { referenceSystem, COM_REFERENCE, COM_TEX } from './force-reference';
import { column, numericEquation, signedSum, texName, texNumber, vector } from './worksheet-math';
import { MODEL_SCALE } from '../render-scale';

type ReferenceBody = ReturnType<typeof referenceSystem>['bodies'][number];
type NamedLoad = BodyLoad & { symbol: string; originalSign: number };

/** Write vector definitions, determinant steps and scalar balances from the same signed loads. */
export function forceBodyEquations(
  body: ReferenceBody,
  loads: NamedLoad[],
  system: LinearSystemExplanation,
  dynamic: boolean
) {
  const id = texName(body.id),
    ref = body.reference.id === COM_REFERENCE ? COM_TEX : texName(body.reference.id);
  const pointOf = (load: NamedLoad) =>
    load.kind === 'weight' ? COM_TEX : texName(load.jointId ?? load.applicationId ?? load.label);
  const component = (load: NamedLoad, axis: number) => {
    if (load.column !== undefined)
      return { coefficient: (load.sign ?? 1) * (load.direction?.[axis] ?? 0), symbol: load.symbol };
    if (load.kind === 'weight') return { coefficient: axis === 1 ? -1 : 0, symbol: load.symbol };
    return {
      coefficient: 1,
      symbol: `F_{${texName(load.applicationId ?? load.label)},${axis ? 'y' : 'x'}}`,
    };
  };
  const arms = (load: NamedLoad) => {
    const point = pointOf(load);
    const dx = (load.point[0] - body.reference.point[0]) * body.lengthToM;
    const dy = (load.point[1] - body.reference.point[1]) * body.lengthToM;
    const zero = Math.abs(dx) + Math.abs(dy) < 1e-12;
    return {
      dx,
      dy,
      zero,
      rx: zero ? '0' : `r_{${point}/${ref},x}`,
      ry: zero ? '0' : `r_{${point}/${ref},y}`,
      symbol: vector('r', `${point}/${ref}`),
    };
  };
  const grouped = new Map<string, NamedLoad[]>();
  loads.forEach((load) => {
    const pair = load.symbol.match(/_\{[xyn],(\d+)\}/)?.[1] ?? '';
    const key = `${load.kind}|${pointOf(load)}|${load.couple !== undefined}|${pair}`;
    grouped.set(key, [...(grouped.get(key) ?? []), load]);
  });
  const groups = [...grouped.values()].map((items) => {
    const load = items[0];
    const uniform = items.every((l) => l.sign === load.sign);
    // Mixed X/Y conventions live in the vector's components; the opposite body still gets -F.
    const sign = load.column === undefined ? 1 : uniform ? (load.sign ?? 1) : load.originalSign;
    const pair = load.symbol.match(/_\{[xyn],(\d+)\}/)?.[1];
    const point = pointOf(load);
    const subscript =
      load.kind === 'drive'
        ? '\\mathrm{in}'
        : load.kind === 'weight'
          ? id
          : pair
            ? `${point},${pair}`
            : point;
    const symbol = vector(
      load.couple !== undefined ? 'M' : load.kind === 'weight' ? 'W' : 'F',
      subscript
    );
    const fx = signedSum(
      items.map((l) => {
        const c = component(l, 0);
        return { ...c, coefficient: c.coefficient / sign };
      })
    );
    const fy = signedSum(
      items.map((l) => {
        const c = component(l, 1);
        return { ...c, coefficient: c.coefficient / sign };
      })
    );
    const arm = arms(load);
    return { ...arm, load, items, sign, symbol, fx, fy };
  });
  const forceVector = `${signedSum(groups.filter((g) => g.load.couple === undefined).map((g) => ({ coefficient: g.sign, symbol: g.symbol })))}=${dynamic ? `m_{${id}}${vector('a', COM_TEX)}` : '\\vec0'}`;
  const inertiaMoment = `I_{${COM_TEX},${id}}${vector('\\alpha', id)}`;
  const translated = body.reference.id !== COM_REFERENCE;
  const momentRight = dynamic
    ? inertiaMoment +
      (translated
        ? `+${vector('r', `${COM_TEX}/${ref}`)}\\times m_{${id}}${vector('a', COM_TEX)}`
        : '')
    : '\\vec0';
  const momentVector = `${signedSum(groups.filter((g) => g.load.couple !== undefined || !g.zero).map((g) => ({ coefficient: g.sign, symbol: g.load.couple !== undefined ? g.symbol : `\\left[${arms(g.load).symbol}\\times${g.symbol}\\right]` })))}=${momentRight}`;
  const crossProducts = groups
    .filter((g) => g.load.couple === undefined)
    .map((g) => {
      const arm = arms(g.load);
      const prefix = g.sign < 0 ? '-' : '';
      const physical = g.items.reduce((v, l) => [v[0] + l.vector[0], v[1] + l.vector[1]], [0, 0]);
      return {
        point:
          g.load.kind === 'weight'
            ? 'CoM'
            : (g.load.jointId ?? g.load.applicationId ?? g.load.label),
        zero: g.zero,
        definition: `${g.symbol}=${column([g.fx, g.fy, 0])},\\quad${arm.symbol}=${column([g.rx, g.ry, 0])}`,
        determinant: `${prefix}${arm.symbol}\\times${g.symbol}=${prefix}\\begin{vmatrix}\\hat i&\\hat j&\\hat k\\\\${g.rx}&${g.ry}&0\\\\${g.fx}&${g.fy}&0\\end{vmatrix}`,
        expansion: `=${prefix}${column(['0', '0', `(${g.rx})(${g.fy})-(${g.ry})(${g.fx})`])}`,
        numbers: `${arm.symbol}=${column([g.dx, g.dy, 0])}\\;\\mathrm m,\\quad${g.symbol}=${column([physical[0] / g.sign, physical[1] / g.sign, 0])}\\;\\mathrm N`,
        evaluation: `M_{${ref},z}=${prefix}\\left[(${texNumber(g.dx)})(${texNumber(physical[1] / g.sign)})-(${texNumber(g.dy)})(${texNumber(physical[0] / g.sign)})\\right]=${texNumber(g.dx * physical[1] - g.dy * physical[0])}\\;\\mathrm{N\\,m}`,
      };
    });
  const components = Array.from({ length: body.rowCount }, (_, axis) => {
    const row = body.startRow + axis;
    const terms = loads.flatMap((load) => {
      if (axis < 2) return load.couple === undefined ? [component(load, axis)] : [];
      if (load.couple !== undefined) return [{ coefficient: load.sign ?? 1, symbol: load.symbol }];
      const arm = arms(load);
      if (arm.zero) return [];
      const x = component(load, 0),
        y = component(load, 1);
      return [
        { coefficient: y.coefficient, symbol: `${arm.rx}${y.symbol}` },
        { coefficient: -x.coefficient, symbol: `${arm.ry}${x.symbol}` },
      ];
    });
    const rhs = !dynamic
      ? '0'
      : axis < 2
        ? `m_{${id}}a_{${COM_TEX},${axis ? 'y' : 'x'}}`
        : `I_{${COM_TEX},${id}}\\alpha_{${id}}` +
          (translated
            ? `+r_{${COM_TEX}/${ref},x}m_{${id}}a_{${COM_TEX},y}-r_{${COM_TEX}/${ref},y}m_{${id}}a_{${COM_TEX},x}`
            : '');
    return {
      label:
        axis === 2 ? `Moment about ${body.reference.label} · z` : `Force · ${axis ? 'y' : 'x'}`,
      unit: axis === 2 ? 'N·m' : 'N',
      symbolic: `${signedSum(terms)}=${rhs}`,
      collected: `${signedSum(system.A[row].map((a, i) => ({ coefficient: a, symbol: system.unknowns[i].label })))}=${texNumber(system.b[row])}`,
      substitution: numericEquation(
        system.A[row],
        system.x,
        body.known[axis] / (axis === 2 ? MODEL_SCALE : 1),
        body.inertia[axis] / (axis === 2 ? MODEL_SCALE : 1)
      ),
    };
  });
  return { forceVector, momentVector, crossProducts, components };
}
