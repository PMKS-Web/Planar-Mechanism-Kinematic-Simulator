export interface SampleIdentity {
  readonly revision: number;
  readonly partitionKey: string;
  readonly index: number;
  readonly time: number;
  readonly command: number;
  readonly direction: 1 | -1;
}

/** Snapshot readers cannot mutate a Map through a cast, or mutate the producer's original Map. */
export function snapshotMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  return Object.freeze(new SnapshotMap(entries));
}

class SnapshotMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>;
  constructor(entries: Iterable<readonly [K, V]>) {
    this.#values = new Map(entries);
  }
  get size(): number {
    return this.#values.size;
  }
  get(key: K): V | undefined {
    return this.#values.get(key);
  }
  has(key: K): boolean {
    return this.#values.has(key);
  }
  entries(): MapIterator<[K, V]> {
    return this.#values.entries();
  }
  keys(): MapIterator<K> {
    return this.#values.keys();
  }
  values(): MapIterator<V> {
    return this.#values.values();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#values) callback.call(thisArg, value, key, this);
  }
}

/** Only plain, newly owned result records enter this helper; Maps use snapshotMap separately. */
export function freezeResult<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeResult(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Every record this helper has already produced, so a second copy of one can be
 * skipped. A snapshot is frozen all the way down and therefore cannot be edited
 * behind a holder's back, which is the only thing copying it again would buy.
 */
const owned = new WeakSet<object>();

/** True of a record `snapshotCopy` produced: deeply frozen, and safe to key a memo on. */
export function isSnapshot(value: unknown): value is object {
  return typeof value === 'object' && value !== null && owned.has(value);
}

/** Published snapshots own all records, including nested Maps; freezing must not reach editable input. */
export function snapshotCopy<T>(value: T): T {
  const copied = new WeakMap<object, unknown>();
  const keep = <V>(item: V): V => {
    owned.add(item as object);
    return item;
  };
  const copy = (item: unknown): unknown => {
    if (item === null || typeof item !== 'object') return item;
    if (owned.has(item)) return item;
    if (copied.has(item)) return copied.get(item);
    if (item instanceof Map || item instanceof SnapshotMap) {
      const result = snapshotMap(
        [...item].map(([key, child]) => [copy(key), copy(child)] as const)
      );
      copied.set(item, result);
      return keep(result);
    }
    if (Array.isArray(item)) {
      const result: unknown[] = [];
      copied.set(item, result);
      result.push(...item.map(copy));
      return keep(Object.freeze(result));
    }
    const result: Record<string, unknown> = {};
    copied.set(item, result);
    for (const [key, child] of Object.entries(item))
      Object.defineProperty(result, key, { value: copy(child), enumerable: true });
    return keep(Object.freeze(result));
  };
  return copy(value) as T;
}
