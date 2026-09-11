/** The untrusted JSON boundary rejects unknown fields instead of silently losing future physics. */
export type Shape = (value: unknown) => boolean;
export const finite: Shape = (value) => typeof value === 'number' && Number.isFinite(value);
export const boolean: Shape = (value) => typeof value === 'boolean';
export const text =
  (maximum = 2048): Shape =>
  (value) =>
    typeof value === 'string' && value.length <= maximum;
export const id: Shape = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
export const literal =
  (...values: readonly unknown[]): Shape =>
  (value) =>
    values.includes(value);
export const list =
  (shape: Shape, maximum = 20000): Shape =>
  (value) =>
    Array.isArray(value) && value.length <= maximum && Array.from(value).every(shape);
export const either =
  (...shapes: readonly Shape[]): Shape =>
  (value) =>
    shapes.some((shape) => shape(value));
export const object =
  (required: Record<string, Shape>, optional: Record<string, Shape> = {}): Shape =>
  (value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return false;
    const record = value as Record<string, unknown>;
    return (
      Object.entries(required).every(
        ([key, shape]) => Object.hasOwn(record, key) && shape(record[key])
      ) &&
      Object.keys(record).every(
        (key) =>
          Object.hasOwn(required, key) ||
          (Object.hasOwn(optional, key) &&
            (record[key] === undefined || optional[key](record[key])))
      )
    );
  };
export const point = object({ x: finite, y: finite });
export const pose = object({ x: finite, y: finite, angle: finite });

/** Bound aggregate work as well as each collection before the reference/geometry validator runs. */
export function boundedJson(value: unknown, maximumNodes = 200000): boolean {
  let nodes = 0;
  const walk = (item: unknown, depth: number): boolean => {
    if (++nodes > maximumNodes || depth > 32) return false;
    if (item === null || typeof item !== 'object') return true;
    return Object.values(item).every((child) => walk(child, depth + 1));
  };
  return walk(value, 0);
}
