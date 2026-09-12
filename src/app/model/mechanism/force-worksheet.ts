import { BodyLoad, ForceExplanation, LinearSystemExplanation } from './solver-explanation';
import { MODEL_SCALE } from '../render-scale';
import { numericEquation, signedSum, texName, texNumber, vector } from './worksheet-math';
import { forceConventions, signedSystem, WorksheetSign } from './worksheet-conventions';

/** Joint-based symbols make the reaction shared by two free bodies recognizable. */
export function forceWorksheet(
  trace: ForceExplanation,
  system: LinearSystemExplanation,
  dynamic: boolean,
  conventions: Record<string, WorksheetSign> = {}
) {
  const symbols = system.unknowns.map((_, index) => {
    const load = trace.bodies
      .flatMap((b) => b.loads)
      .find((l) => l.column === index && l.sign === 1)!;
    if (load.kind === 'drive')
      return load.couple === undefined ? 'F_{\\mathrm{in}}' : 'M_{\\mathrm{in}}';
    if (load.couple !== undefined) return `T_{${texName(load.jointId!)}}`;
    const axis =
      Math.abs(load.direction![0] - 1) < 1e-12
        ? 'x'
        : Math.abs(load.direction![1] - 1) < 1e-12
          ? 'y'
          : 'n';
    const similar = trace.bodies
      .flatMap((b) => b.loads)
      .filter(
        (l) =>
          l.sign === 1 &&
          l.jointId === load.jointId &&
          l.direction?.[0] === load.direction?.[0] &&
          l.direction?.[1] === load.direction?.[1]
      );
    const suffix = similar.length > 1 ? `,${similar.findIndex((l) => l.column === index) + 1}` : '';
    return `${texName(load.jointId!)}_{${axis}${suffix}}`;
  });
  const choices = forceConventions(trace);
  const signs = system.unknowns.map(() => 1);
  choices.forEach((choice) =>
    choice.columns.forEach((i) => (signs[i] = conventions[choice.key] ?? 1))
  );
  system = signedSystem(system, signs);
  const namedSystem = {
    ...system,
    unknowns: system.unknowns.map((u, i) => ({ ...u, label: symbols[i] })),
  };
  const bodies = trace.bodies.map((body) => {
    const id = texName(body.id);
    const loadSymbol = (load: BodyLoad) =>
      load.column === undefined
        ? load.kind === 'weight'
          ? `W_{${id}}`
          : `F_{${texName(load.label)}}`
        : symbols[load.column];
    const loads = [...body.loads]
      .sort((a, b) => Number(a.kind === 'weight') - Number(b.kind === 'weight'))
      .map((load) => ({
        ...load,
        sign: load.column === undefined ? load.sign : (load.sign ?? 1) * signs[load.column],
        symbol: loadSymbol(load),
        valueEquation:
          load.column === undefined
            ? loadSymbol(load)
            : `${loadSymbol(load)}=${texNumber(system.x[load.column])}`,
        displayLabel: loadSymbol(load)
          .replace(/\\mathrm\{(.*?)\}/g, '$1')
          .replace(/[{}\\]/g, '')
          .replace('_', ''),
      }));
    // x/y columns at a pin are a single force in the vector equation.
    const grouped = new Map<
      string,
      { sign: number; symbol: string; point: string; couple: boolean }
    >();
    for (const load of loads) {
      const sign = load.sign ?? 1;
      const point = load.jointId
        ? texName(load.jointId)
        : load.kind === 'weight'
          ? 'G'
          : texName(load.label);
      const pair = load.symbol.match(/_\{[xyn],(\d+)\}/)?.[1];
      const key = `${load.kind}|${point}|${sign}|${load.couple !== undefined}|${pair ?? ''}`;
      const symbol =
        load.couple !== undefined
          ? vector('M', load.kind === 'drive' ? '\\mathrm{in}' : point)
          : load.kind === 'reaction'
            ? vector('F', pair ? `${point},${pair}` : point)
            : load.kind === 'weight'
              ? vector('W', id)
              : vector('F', load.kind === 'drive' ? '\\mathrm{in}' : point);
      grouped.set(key, { sign, symbol, point, couple: load.couple !== undefined });
    }
    const groups = [...grouped.values()];
    const forceVector = `${signedSum(groups.filter((g) => !g.couple).map((g) => ({ coefficient: g.sign, symbol: g.symbol })))} = ${dynamic ? `m_{${id}}${vector('a', `G_{${id}}`)}` : vector('0', '')}`;
    const moments = groups.filter((g) => g.couple || g.point !== 'G');
    const momentVector = `${signedSum(moments.map((g) => ({ coefficient: g.sign, symbol: g.couple ? g.symbol : `\\left[${vector('r', `${g.point}/G`)}\\times${g.symbol}\\right]` })))} = ${dynamic ? `I_{G,${id}}${vector('\\alpha', id)}` : vector('0', '')}`;
    const components = Array.from({ length: body.rowCount }, (_, axis) => {
      const row = body.startRow + axis;
      const divisor = axis === 2 ? MODEL_SCALE : 1;
      const known = body.known[axis] / divisor,
        inertia = body.inertia[axis] / divisor;
      const terms = loads.map((load) => {
        if (load.column !== undefined) {
          const sign = load.sign ?? 1;
          if (axis < 2)
            return {
              coefficient: load.couple === undefined ? sign * (load.direction?.[axis] ?? 0) : 0,
              symbol: load.symbol,
            };
          if (load.couple !== undefined) return { coefficient: sign, symbol: load.symbol };
          const point = texName(load.jointId!);
          const [dx, dy] = load.direction!;
          if (dy === 0)
            return { coefficient: -sign * dx, symbol: `r_{${point}/G,y}${load.symbol}` };
          if (dx === 0) return { coefficient: sign * dy, symbol: `r_{${point}/G,x}${load.symbol}` };
          const lever = signedSum([
            { coefficient: dy, symbol: `r_{${point}/G,x}` },
            { coefficient: -dx, symbol: `r_{${point}/G,y}` },
          ]);
          return { coefficient: sign, symbol: `(${lever})${load.symbol}` };
        }
        if (load.kind === 'weight')
          return { coefficient: axis === 1 ? -1 : 0, symbol: load.symbol };
        if (axis < 2) return { coefficient: 1, symbol: `{${load.symbol}}_{${axis ? 'y' : 'x'}}` };
        return {
          coefficient: 1,
          symbol: `r_{${texName(load.label)}/G,x}{${load.symbol}}_{y}-r_{${texName(load.label)}/G,y}{${load.symbol}}_{x}`,
        };
      });
      const rhs = dynamic
        ? axis < 2
          ? `m_{${id}}a_{G,${axis ? 'y' : 'x'}}`
          : `I_{G,${id}}\\alpha_{${id}` + '}'
        : '0';
      return {
        label: axis === 2 ? 'Moment about G · z' : `Force · ${axis ? 'y' : 'x'}`,
        unit: axis === 2 ? 'N·m' : 'N',
        symbolic: `${signedSum(terms)} = ${rhs}`,
        collected: `${signedSum(system.A[row].map((a, i) => ({ coefficient: a, symbol: symbols[i] })))} = ${texNumber(system.b[row])}`,
        substitution: numericEquation(system.A[row], system.x, known, inertia),
      };
    });
    return { ...body, loads, forceVector, momentVector, components };
  });
  return {
    choices: choices.map((choice) => ({
      ...choice,
      selected: conventions[choice.key] === -1 ? 1 : 0,
      description: choice.negativeBody
        ? `The ${choice.couple ? 'couple' : 'force'} on ${choice.negativeBody} has the opposite sign.${choice.columns.length === 2 ? ' Both components change together.' : ''}`
        : 'Choose the reference direction on this body.',
    })),
    bodies,
    system: namedSystem,
    definitions: system.unknowns.map((unknown, i) => ({
      symbol: symbols[i],
      meaning: unknown.label.includes(' (')
        ? `Reaction at ${unknown.label.split(' (')[1].replace(')', '')}`
        : unknown.label,
      value: `${symbols[i]}=${texNumber(system.x[i])}\\;\\mathrm{${unknown.unit.replace('·', '\\,')}}`,
    })),
  };
}
