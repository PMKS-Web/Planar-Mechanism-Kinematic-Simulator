/** First derivatives of edit constraints, including both changing local geometry and body poses. */
export interface EditScalar {
  readonly value: number;
  readonly gradient: readonly number[];
  /** Operand-scaled arithmetic uncertainty stays local to the row that uses it. */
  readonly roundoff: number;
}
export type EditPoint = { readonly x: EditScalar; readonly y: EditScalar };
export function editConstant(value: number, width: number): EditScalar {
  return { value, gradient: Array(width).fill(0), roundoff: Number.EPSILON * Math.abs(value) };
}
export function editVariable(value: number, width: number, column: number): EditScalar {
  return {
    value,
    gradient: Array.from({ length: width }, (_, i) => (i === column ? 1 : 0)),
    roundoff: Number.EPSILON * Math.abs(value),
  };
}
export function editAdd(a: EditScalar, b: EditScalar): EditScalar {
  return {
    value: a.value + b.value,
    gradient: a.gradient.map((v, i) => v + b.gradient[i]),
    roundoff: a.roundoff + b.roundoff + Number.EPSILON * (Math.abs(a.value) + Math.abs(b.value)),
  };
}
export function editScale(a: EditScalar, factor: number): EditScalar {
  return {
    value: a.value * factor,
    gradient: a.gradient.map((v) => v * factor),
    roundoff: Math.abs(factor) * a.roundoff + 2 * Number.EPSILON * Math.abs(a.value * factor),
  };
}
export function editSubtract(a: EditScalar, b: EditScalar): EditScalar {
  return editAdd(a, editScale(b, -1));
}
export function editMultiply(a: EditScalar, b: EditScalar): EditScalar {
  return {
    value: a.value * b.value,
    gradient: a.gradient.map((v, i) => v * b.value + a.value * b.gradient[i]),
    roundoff:
      Math.abs(a.value) * b.roundoff +
      Math.abs(b.value) * a.roundoff +
      a.roundoff * b.roundoff +
      Number.EPSILON * Math.abs(a.value * b.value),
  };
}
export function editSin(a: EditScalar): EditScalar {
  return {
    value: Math.sin(a.value),
    gradient: a.gradient.map((v) => v * Math.cos(a.value)),
    roundoff: a.roundoff + Number.EPSILON * Math.abs(Math.sin(a.value)),
  };
}
export function editCos(a: EditScalar): EditScalar {
  return {
    value: Math.cos(a.value),
    gradient: a.gradient.map((v) => -v * Math.sin(a.value)),
    roundoff: a.roundoff + Number.EPSILON * Math.abs(Math.cos(a.value)),
  };
}
export function editRotate(p: EditPoint, angle: EditScalar): EditPoint {
  const c = editCos(angle),
    s = editSin(angle);
  return {
    x: editSubtract(editMultiply(c, p.x), editMultiply(s, p.y)),
    y: editAdd(editMultiply(s, p.x), editMultiply(c, p.y)),
  };
}
export function editPointAdd(a: EditPoint, b: EditPoint): EditPoint {
  return { x: editAdd(a.x, b.x), y: editAdd(a.y, b.y) };
}
export function editPointSubtract(a: EditPoint, b: EditPoint): EditPoint {
  return { x: editSubtract(a.x, b.x), y: editSubtract(a.y, b.y) };
}
