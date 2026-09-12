import { ForceExplanation, LinearSystemExplanation } from './solver-explanation';

export type WorksheetSign = 1 | -1;

/** A change of unknown coordinates: A D · D x = b, since D² = I. */
export function signedSystem(
  system: LinearSystemExplanation,
  signs: number[]
): LinearSystemExplanation {
  return {
    ...system,
    A: system.A.map((row) => row.map((value, i) => value * (signs[i] ?? 1))),
    x: system.x.map((value, i) => value * (signs[i] ?? 1)),
  };
}

/** One pin force has two columns but one action/reaction convention. */
export function forceConventions(trace: ForceExplanation) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      positiveBody: string;
      negativeBody?: string;
      couple: boolean;
      columns: number[];
      options: string[];
    }
  >();
  for (const body of trace.bodies)
    for (const load of body.loads) {
      if (load.column === undefined || load.sign !== 1) continue;
      const opposite = trace.bodies.find((b) =>
        b.loads.some((l) => l.column === load.column && l.sign === -1)
      );
      const key = JSON.stringify([
        load.kind,
        load.jointId,
        body.id,
        opposite?.id,
        load.couple !== undefined,
      ]);
      const group = groups.get(key) ?? {
        key,
        label:
          load.kind === 'drive'
            ? load.couple === undefined
              ? 'Input Force'
              : 'Input Moment'
            : `Joint ${load.jointId}${load.couple === undefined ? '' : ' · Couple'}`,
        positiveBody: body.id,
        negativeBody: opposite?.id,
        couple: load.couple !== undefined,
        columns: [],
        options: [`+ on ${body.id}`, `− on ${body.id}`],
      };
      group.columns.push(load.column);
      groups.set(key, group);
    }
  return [...groups.values()];
}
