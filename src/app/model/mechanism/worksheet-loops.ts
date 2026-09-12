import { Mechanism } from './mechanism';
import { Loop, LoopEdge } from './loop-solver';
import { PrisJoint, RealJoint } from '../joint';
import { LinearSystemExplanation } from './solver-explanation';

export type WorksheetEdge = LoopEdge | { kind: 'ground'; fromId: string; toId: string };
export interface WorksheetLoop {
  id: string;
  edges: WorksheetEdge[];
  coefficients: number[];
}

export const loopPath = (edges: WorksheetEdge[]) =>
  edges.length ? [edges[0].fromId, ...edges.map((e) => e.toId)].join(' → ') : '';
export function defaultWorksheetLoops(loops: Loop[]): WorksheetLoop[] {
  return loops.map((loop, index) => {
    const edges: WorksheetEdge[] = loop.edges.map((edge) => ({ ...edge }));
    if (edges.length && edges[0].fromId !== edges.at(-1)!.toId)
      edges.push({ kind: 'ground', fromId: edges.at(-1)!.toId, toId: edges[0].fromId });
    return { id: loopPath(edges), edges, coefficients: loops.map((_, i) => Number(i === index)) };
  });
}

export function reverseWorksheetLoop(loop: WorksheetLoop): WorksheetLoop {
  const edges = [...loop.edges].reverse().map((e) => ({ ...e, fromId: e.toId, toId: e.fromId }));
  return { id: loopPath(edges), edges, coefficients: loop.coefficients.map((n) => -n) };
}

/** Signed body/joint incidences telescope through tracer points on the same body. */
function incidences(edges: WorksheetEdge[]) {
  const result = new Map<string, number>();
  const add = (body: string, joint: string, value: number) => {
    const key = JSON.stringify([body, joint]);
    result.set(key, (result.get(key) ?? 0) + value);
  };
  for (const edge of edges) {
    const body =
      edge.kind === 'ground'
        ? 'F:'
        : edge.kind === 'link'
          ? `L:${edge.linkId}`
          : `S:${edge.sliderId}`;
    add(body, edge.fromId, -1);
    add(body, edge.toId, 1);
  }
  return result;
}

/** Real row reduction, retaining orientation (GF(2) would lose equation signs). */
function reduce(matrix: number[][], columns: number) {
  const rows = matrix.map((r) => [...r]);
  const pivots: number[] = [];
  for (let col = 0; col < columns && pivots.length < rows.length; col++) {
    const at = pivots.length;
    const next = rows.findIndex((r, i) => i >= at && Math.abs(r[col]) > 1e-9);
    if (next < 0) continue;
    [rows[at], rows[next]] = [rows[next], rows[at]];
    const divisor = rows[at][col];
    rows[at] = rows[at].map((n) => n / divisor);
    rows.forEach((row, i) => {
      if (i === at) return;
      const factor = row[col];
      rows[i] = row.map((n, j) => n - factor * rows[at][j]);
    });
    pivots.push(col);
  }
  return { rows, pivots };
}

function basisCoordinates(edges: WorksheetEdge[], basis: WorksheetLoop[]) {
  const vectors = basis.map((l) => incidences(l.edges));
  const target = incidences(edges);
  const keys = new Set([...target.keys(), ...vectors.flatMap((v) => [...v.keys()])]);
  const { rows, pivots } = reduce(
    [...keys].map((key) => [...vectors.map((v) => v.get(key) ?? 0), target.get(key) ?? 0]),
    basis.length
  );
  if (
    rows.some(
      (row) =>
        row.slice(0, basis.length).every((n) => Math.abs(n) < 1e-9) &&
        Math.abs(row[basis.length]) > 1e-9
    )
  )
    return undefined;
  const coordinates = basis.map(() => 0);
  pivots.forEach((col, i) => (coordinates[col] = rows[i][basis.length]));
  return coordinates;
}

/** Validate a user's closed walk against real body/slot connectivity and the complete basis. */
export function replaceWorksheetLoop(
  mechanism: Mechanism,
  selected: WorksheetLoop[],
  index: number,
  path: string
): { loop?: WorksheetLoop; reason?: string } {
  const ids = path
    .trim()
    .split(/[\s,→]+/)
    .filter(Boolean);
  if (ids.length < 3 || ids[0] !== ids.at(-1))
    return { reason: 'Close the path by repeating its first joint at the end.' };
  if (new Set(ids.slice(0, -1)).size !== ids.length - 1)
    return { reason: 'Visit each joint once, then return to the first joint.' };
  const joints = mechanism.joints[0];
  const edges: WorksheetEdge[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const from = joints.find((j) => j.id === ids[i]),
      to = joints.find((j) => j.id === ids[i + 1]);
    if (!from || !to)
      return {
        reason: `Joint ${!from ? ids[i] : ids[i + 1]} is not in this mechanism. Use the joint IDs shown in the sketch.`,
      };
    if (from instanceof RealJoint && to instanceof RealJoint && from.ground && to.ground) {
      edges.push({ kind: 'ground', fromId: from.id, toId: to.id });
      continue;
    }
    const slider = [from, to].find(
      (j) =>
        j instanceof PrisJoint &&
        j.isFloating &&
        j.isSlotWellFormed &&
        j.slotJointA?.id === (j === from ? to.id : from.id)
    ) as PrisJoint | undefined;
    const bodies = mechanism.links[0].filter(
      (b) => b.joints.some((j) => j.id === from.id) && b.joints.some((j) => j.id === to.id)
    );
    if (bodies.length + Number(!!slider) > 1)
      return {
        reason: `${from.id}–${to.id} has more than one connection. Include another joint on the desired link to distinguish the path.`,
      };
    if (slider) edges.push({ kind: 'slot', sliderId: slider.id, fromId: from.id, toId: to.id });
    else if (bodies.length)
      edges.push({ kind: 'link', linkId: bodies[0].id, fromId: from.id, toId: to.id });
    else
      return {
        reason: `${from.id} and ${to.id} have no connecting link or guide. Add the joint between them.`,
      };
  }
  const basis = defaultWorksheetLoops(mechanism.requiredLoops);
  const coefficients = basisCoordinates(edges, basis);
  if (!coefficients)
    return {
      reason:
        'This path is outside the available loop system. Choose a path through the connections used by this mechanism’s loop analysis.',
    };
  const rows = selected.map((loop, i) => (i === index ? coefficients : loop.coefficients));
  if (rows.length !== basis.length || reduce(rows, basis.length).pivots.length !== basis.length)
    return {
      reason:
        'This path repeats information in the other loops. Choose a different path so every independent closure is retained.',
    };
  return { loop: { id: loopPath(edges), edges, coefficients } };
}

/** The same row operation is applied to A and b, for both derivatives. */
export function loopSystem(
  system: LinearSystemExplanation | undefined,
  loops: WorksheetLoop[]
): LinearSystemExplanation | undefined {
  if (!system) return undefined;
  const A: number[][] = [],
    b: number[] = [],
    rows: string[] = [];
  loops.forEach((loop, index) => {
    for (let axis = 0; axis < 2; axis++) {
      A.push(
        system.unknowns.map((_, col) =>
          loop.coefficients.reduce((sum, c, k) => sum + c * system.A[2 * k + axis][col], 0)
        )
      );
      b.push(loop.coefficients.reduce((sum, c, k) => sum + c * system.b[2 * k + axis], 0));
      rows.push(`Loop ${index + 1} ${axis ? 'y' : 'x'} · ${loop.id}`);
    }
  });
  return {
    ...system,
    A: [...A, ...system.A.slice(loops.length * 2)],
    b: [...b, ...system.b.slice(loops.length * 2)],
    rows: [...rows, ...system.rows.slice(loops.length * 2)],
  };
}
