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
