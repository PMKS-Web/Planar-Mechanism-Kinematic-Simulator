import { BodyLoad, ForceExplanation, LinearSystemExplanation } from './solver-explanation';
import { texName, texNumber } from './worksheet-math';
import { labelApplicationPoints, referenceSystem } from './force-reference';
import { forceBodyEquations } from './force-body-equations';
import { forceConventions, signedSystem, WorksheetSign } from './worksheet-conventions';
import { forceAxes, forceAxisPairs } from './force-axes';

/** Joint-based symbols make the reaction shared by two free bodies recognizable. */
export function forceWorksheet(
  trace: ForceExplanation,
  system: LinearSystemExplanation,
  dynamic: boolean,
  conventions: Record<string, WorksheetSign> = {},
  momentPoints: Record<string, string> = {},
  unit = 'm',
  axisAngle = 0
) {
  trace = labelApplicationPoints(trace);
  const pairedColumns = new Set(forceAxisPairs(trace).flat());
  const symbols = system.unknowns.map((_, index) => {
    const load = trace.bodies
      .flatMap((b) => b.loads)
      .find((l) => l.column === index && l.sign === 1)!;
    if (load.kind === 'drive')
      return load.couple === undefined ? 'F_{\\mathrm{in}}' : 'M_{\\mathrm{in}}';
    if (load.couple !== undefined) return `T_{${texName(load.jointId!)}}`;
    const axis =
      axisAngle && !pairedColumns.has(index)
        ? 'n'
        : Math.abs(load.direction![0] - 1) < 1e-12
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
  const conventionTrace = trace;
  ({ trace, system } = forceAxes(trace, system, axisAngle));
  const signs = system.unknowns.map(() => 1);
  choices.forEach((choice) =>
    choice.columns.forEach(
      (i) => (signs[i] = conventions[`${choice.key}:${i}`] ?? conventions[choice.key] ?? 1)
    )
  );
  system = signedSystem(system, signs);
  const shifted = referenceSystem(trace, system, momentPoints, unit);
  const namedSystem = {
    ...shifted.system,
    unknowns: system.unknowns.map((u, i) => ({ ...u, label: symbols[i] })),
  };
  const bodies = shifted.bodies.map((body) => {
    const id = texName(body.id);
    const loadSymbol = (load: BodyLoad) =>
      load.column === undefined
        ? load.kind === 'weight'
          ? `W_{${id}}`
          : `F_{${texName(load.applicationId ?? load.label)}}`
        : symbols[load.column];
    const loads = [...body.loads]
      .sort((a, b) => Number(a.kind === 'weight') - Number(b.kind === 'weight'))
      .map((load) => ({
        ...load,
        originalSign: load.sign ?? 1,
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
    return { ...body, loads, ...forceBodyEquations(body, loads, namedSystem, dynamic) };
  });
  return {
    choices: choices.map((choice) => ({
      ...choice,
      axes: choice.columns.map((col) => {
        const load = conventionTrace.bodies
          .flatMap((b) => b.loads)
          .find((l) => l.column === col && l.sign === 1)!;
        const axis =
          load.couple !== undefined
            ? 'Moment'
            : axisAngle && !pairedColumns.has(col)
              ? 'Normal'
              : load.direction?.[0] === 1
                ? 'X'
                : load.direction?.[1] === 1
                  ? 'Y'
                  : 'Normal';
        return {
          key: `${choice.key}:${col}`,
          label: `${axis} Direction on ${choice.positiveBody}`,
          description: choice.negativeBody
            ? `The direction on ${choice.negativeBody} is opposite.`
            : 'Assumed direction before solving.',
          options:
            axis === 'X'
              ? axisAngle
                ? ['+X', '−X']
                : ['+X →', '−X ←']
              : axis === 'Y'
                ? axisAngle
                  ? ['+Y', '−Y']
                  : ['+Y ↑', '−Y ↓']
                : axis === 'Moment'
                  ? ['CCW ↺', 'CW ↻']
                  : ['+ Normal', '− Normal'],
          selected: signs[col] === -1 ? 1 : 0,
        };
      }),
      selected: conventions[choice.key] === -1 ? 1 : 0,
      description: choice.negativeBody
        ? `The ${choice.couple ? 'couple' : 'force'} on ${choice.negativeBody} has the opposite sign. Choose each component independently.`
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
