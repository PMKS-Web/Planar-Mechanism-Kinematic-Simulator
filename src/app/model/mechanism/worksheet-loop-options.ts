import { Mechanism } from './mechanism';
import { PrisJoint, RealJoint } from '../joint';
import { replaceWorksheetLoop, WorksheetLoop } from './worksheet-loops';

const catalog = new WeakMap<Mechanism, { paths: string[]; limited: boolean }>();

/** Simple cycles in the body/joint graph; a body is visited once, so tracer triangles add no false loops. */
function enumerate(mechanism: Mechanism) {
  const remembered = catalog.get(mechanism);
  if (remembered) return remembered;
  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  const body = (id: string, joints: string[]) =>
    joints.forEach((joint) => {
      connect(`j:${joint}`, id);
      connect(id, `j:${joint}`);
    });
  mechanism.links[0].forEach((link) =>
    body(
      `l:${link.id}`,
      link.joints.map((j) => j.id)
    )
  );
  body(
    'frame',
    mechanism.joints[0].filter((j) => j instanceof RealJoint && j.ground).map((j) => j.id)
  );
  mechanism.joints[0].forEach((j) => {
    if (j instanceof PrisJoint && j.isFloating && j.isSlotWellFormed && j.slotJointA)
      body(`s:${j.id}`, [j.id, j.slotJointA.id]);
  });
  const paths = new Set<string>();
  let visits = 0,
    limited = false;
  const nodes = [...adjacency.keys()].filter((n) => n.startsWith('j:')).sort();
  for (const start of nodes) {
    const walk = (path: string[], visited: Set<string>) => {
      if (++visits > 30000 || paths.size >= 512) {
        limited = true;
        return;
      }
      for (const next of adjacency.get(path.at(-1)!) ?? []) {
        if (next === start && path.length >= 4) {
          const joints = path.filter((n) => n.startsWith('j:')).map((n) => n.slice(2));
          const reverse = [joints[0], ...joints.slice(1).reverse()];
          const canonical = [joints, reverse].sort((a, b) =>
            a.join(' → ').localeCompare(b.join(' → '))
          )[0];
          paths.add([...canonical, canonical[0]].join(' → '));
        } else if (!visited.has(next) && (!next.startsWith('j:') || next > start)) {
          visited.add(next);
          walk([...path, next], visited);
          visited.delete(next);
        }
        if (limited) return;
      }
    };
    walk([start], new Set([start]));
    if (limited) break;
  }
  const result = { paths: [...paths].sort(), limited };
  catalog.set(mechanism, result);
  return result;
}

export function worksheetLoopOptions(
  mechanism: Mechanism,
  selected: WorksheetLoop[],
  index: number
) {
  const all = enumerate(mechanism);
  const paths = [
    ...new Set([selected[index].id, ...selected.map((l) => l.id), ...all.paths]),
  ].sort();
  const options = paths.flatMap((path) => {
    const result = replaceWorksheetLoop(mechanism, selected, index, path);
    // Only genuine closed paths in the rate system belong in the menu.
    if (result.reason && !result.reason.includes('repeats information')) return [];
    return [
      {
        value: path,
        label: path + (result.reason ? ' (dependent)' : ''),
        disabled: !!result.reason,
      },
    ];
  });
  return { options, limited: all.limited };
}
