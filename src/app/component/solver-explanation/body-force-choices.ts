import { forceWorksheet } from '../../model/mechanism/force-worksheet';
import { WorksheetSign } from '../../model/mechanism/worksheet-conventions';

type Worksheet = ReturnType<typeof forceWorksheet>;

/** Controls describe arrows on this body, even when it is the negative side of a reaction. */
export function bodyForceChoices(body: Worksheet['bodies'][number], choices: Worksheet['choices']) {
  return body.loads.flatMap((load) => {
    if (load.column === undefined) return [];
    const group = choices.find((c) => c.columns.includes(load.column!))!;
    const axis = group.axes.find((a) => a.key === `${group.key}:${load.column}`)!;
    const other = group.positiveBody === body.id ? group.negativeBody : group.positiveBody;
    return [
      {
        ...axis,
        symbol: load.symbol,
        label: `${load.kind === 'drive' && load.couple !== undefined ? 'Input Moment' : load.displayLabel} on ${body.name}`,
        description: other
          ? `Changing this assumption also changes the ${load.jointId ? 'joint ' + load.jointId + ' ' : ''}assumption on link ${other}. Its reaction acts in the opposite direction.`
          : 'Positive assumed direction on this body.',
        selected: load.sign === -1 ? 1 : 0,
        positiveSign: load.originalSign as WorksheetSign,
      },
    ];
  });
}
