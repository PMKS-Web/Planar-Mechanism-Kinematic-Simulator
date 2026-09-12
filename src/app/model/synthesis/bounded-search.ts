import { Interval } from './path-types';

/** Repeatable 32-bit PRNG, local to each search (never replaces Math.random). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BoundedSearchOptions {
  bounds: Interval[];
  population: number;
  generations: number;
  refinementIterations: number;
  random: () => number;
  stop: () => boolean;
}

/** Bounded DE/rand/1/bin followed by coordinate refinement; yields after each generation. */
export function* boundedSearch(
  objective: (point: number[]) => number,
  options: BoundedSearchOptions
): Generator<void> {
  const { bounds, random, stop } = options,
    dimensions = bounds.length;
  const score = (unit: number[]) =>
    objective(unit.map((n, i) => bounds[i][0] + n * (bounds[i][1] - bounds[i][0])));
  const population: { point: number[]; score: number }[] = [];
  for (let i = 0; i < options.population && !stop(); i++) {
    const point = bounds.map(() => random());
    population.push({ point, score: score(point) });
  }
  if (population.length < 4) return;
  for (let generation = 0; generation < options.generations && !stop(); generation++) {
    const weight = 0.5 + 0.4 * random();
    for (let i = 0; i < population.length && !stop(); i++) {
      const picks = new Set<number>([i]);
      while (picks.size < 4) picks.add(Math.floor(random() * population.length));
      const [, r1, r2, r3] = [...picks];
      const forced = Math.floor(random() * dimensions);
      const trial = population[i].point.map((old, j) => {
        if (j !== forced && random() > 0.85) return old;
        const value =
          population[r1].point[j] + weight * (population[r2].point[j] - population[r3].point[j]);
        return value < 0 || value > 1 ? random() : value;
      });
      const value = score(trial);
      if (value < population[i].score) population[i] = { point: trial, score: value };
    }
    yield;
  }
  let best = population.reduce((a, b) => (a.score <= b.score ? a : b));
  let step = 0.025;
  for (
    let iteration = 0;
    iteration < options.refinementIterations && !stop() && step > 1e-7;
    iteration++
  ) {
    let improved = false;
    for (let j = 0; j < dimensions && !stop(); j++) {
      for (const sign of [-1, 1]) {
        if (stop()) break;
        const trial = [...best.point];
        trial[j] = Math.max(0, Math.min(1, trial[j] + sign * step));
        const value = score(trial);
        if (value < best.score) {
          best = { point: trial, score: value };
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.5;
    yield;
  }
}
