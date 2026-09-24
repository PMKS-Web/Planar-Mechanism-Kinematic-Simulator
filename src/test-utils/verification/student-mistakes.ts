import { MechanismFixture } from './fixture';

/**
 * Small drawings broken the way students break them.
 *
 * Not random linkages: two hundred floating bars teach nothing about what a
 * reader will meet. Each scenario starts from a mechanism a class would draw
 * -- a four-bar, one with a coupler point, a slider-crank, a Watt or a
 * Stephenson six-bar -- with its geometry chosen at random, so the positions
 * are never the tidy ones a hand-written fixture has. Then one or two mistakes
 * are made to it, each one a thing a student can do with a click or a
 * slightly careless drag: a pivot never grounded, a joint dropped next to
 * another rather than on it, a weld where a pin was meant, a bar across the
 * linkage, the input on the wrong joint.
 *
 * Every mistake records what undoes it. The advice the app gives can then be
 * followed step by step (`follow-advice.ts`) and scored twice: whether it ends
 * in a drawing that runs, and whether it ends in the one the student meant.
 */

/** What undoes a mistake, in the terms the diagnosis offers fixes in. */
export type Undo =
  | {
      kind: 'ground' | 'unground' | 'unweld' | 'weld' | 'pin-in-slot' | 'prismatic' | 'set-input';
      joint: string;
    }
  | { kind: 'delete-link'; link: string }
  | { kind: 'merge'; joint: string; onto: string }
  | { kind: 'add-link'; joints: string }
  | { kind: 'remove-input'; joint: string }
  | { kind: 'none' };

export interface Scenario {
  seed: number;
  /** Which mechanism was drawn before anything went wrong. */
  base: string;
  /** The drawing the student meant. */
  intended: MechanismFixture;
  /** The drawing they ended up with. */
  broken: MechanismFixture;
  mistakes: { name: string; undo: Undo }[];
}

/** A seeded stream in [0, 1), so any scenario can be rebuilt from its seed. */
export function randomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const between = (random: Random, low: number, high: number) => low + (high - low) * random();
const pick = <T>(random: Random, items: T[]): T => items[Math.floor(random() * items.length)];
const round = (value: number) => Math.round(value * 1000) / 1000;

/** A copy that can be edited without touching the one it came from. */
export function copyFixture(fixture: MechanismFixture): MechanismFixture {
  return JSON.parse(JSON.stringify(fixture)) as MechanismFixture;
}

// --- the mechanisms a class draws -------------------------------------------

function fourBar(random: Random, tracer: boolean): MechanismFixture {
  const d = between(random, 2.5, 4.5);
  const crank = between(random, 0.6, 1.2);
  const angle = between(random, 0.35, 2.8);
  const b = { x: crank * Math.cos(angle), y: crank * Math.sin(angle) };
  const c = { x: d * between(random, 0.55, 1.1), y: between(random, 1.4, 3) };
  const joints = [
    { id: 'A', x: 0, y: 0, ground: true, input: true },
    { id: 'B', x: round(b.x), y: round(b.y) },
    { id: 'C', x: round(c.x), y: round(c.y) },
    { id: 'D', x: round(d), y: 0, ground: true },
  ];
  const links = [{ joints: 'AB' }, { joints: 'BC' }, { joints: 'CD' }];
  if (tracer) {
    const offset = between(random, 0.6, 1.4);
    const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const length = Math.hypot(c.x - b.x, c.y - b.y);
    joints.push({
      id: 'E',
      x: round(mid.x - ((c.y - b.y) / length) * offset),
      y: round(mid.y + ((c.x - b.x) / length) * offset),
    });
    links[1] = { joints: 'BCE' };
  }
  return { joints, links, inputAngVel: 1 };
}

function sliderCrank(random: Random): MechanismFixture {
  const crank = between(random, 0.6, 1.2);
  const angle = between(random, 0.35, 2.8);
  const b = { x: crank * Math.cos(angle), y: crank * Math.sin(angle) };
  const rod = between(random, 2.2, 3.8);
  const offset = between(random, -0.4, 0.4);
  const c = { x: b.x + Math.sqrt(rod * rod - (offset - b.y) ** 2), y: offset };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: round(b.x), y: round(b.y) },
      { id: 'C', x: round(c.x), y: round(c.y) },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    sliders: [{ at: 'C', angleRad: 0 }],
    inputAngVel: 1,
  };
}

/** A four-bar with a second loop hung off its rocker (Watt) or its coupler point (Stephenson). */
function sixBar(random: Random, kind: 'watt' | 'stephenson'): MechanismFixture {
  const fixture = fourBar(random, kind === 'stephenson');
  const byId = (id: string) => fixture.joints.find((joint) => joint.id === id)!;
  const c = byId('C');
  const d = byId('D');
  let from: string;
  if (kind === 'watt') {
    // The rocker carried on past C, and a third joint on it.
    const k = between(random, 0.3, 0.6);
    fixture.joints.push({ id: 'E', x: round(c.x + (c.x - d.x) * k + 0.3), y: round(c.y + 0.5) });
    fixture.links[2] = { joints: 'CDE' };
    from = 'E';
  } else {
    from = 'E';
  }
  const start = byId(from);
  const g = { x: round(d.x + between(random, 1.2, 2.5)), y: 0 };
  fixture.joints.push({
    id: 'F',
    x: round((start.x + g.x) / 2 + between(random, 0.4, 1.2)),
    y: round((start.y + g.y) / 2 + between(random, 0.2, 1)),
  });
  fixture.joints.push({ id: 'G', x: g.x, y: g.y, ground: true });
  fixture.links.push({ joints: `${from}F` }, { joints: 'FG' });
  return fixture;
}

/** A four-bar whose coupler is bent at a knee: two bars welded at C, the rocker at E. */
function bentCouplerFourBar(random: Random): MechanismFixture {
  const d = between(random, 2.5, 4.5);
  const crank = between(random, 0.6, 1.2);
  const angle = between(random, 0.35, 2.8);
  const b = { x: crank * Math.cos(angle), y: crank * Math.sin(angle) };
  const e = { x: d * between(random, 0.55, 1.1), y: between(random, 1.4, 3) };
  const knee = between(random, 0.5, 1.2);
  const mid = { x: (b.x + e.x) / 2, y: (b.y + e.y) / 2 };
  const length = Math.hypot(e.x - b.x, e.y - b.y);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: round(b.x), y: round(b.y) },
      {
        id: 'C',
        x: round(mid.x - ((e.y - b.y) / length) * knee),
        y: round(mid.y + ((e.x - b.x) / length) * knee),
      },
      { id: 'D', x: round(d), y: 0, ground: true },
      { id: 'E', x: round(e.x), y: round(e.y) },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'BCE', subset: [{ joints: 'BC' }, { joints: 'CE' }] },
      { joints: 'DE' },
    ],
    welds: ['C'],
    inputAngVel: 1,
  };
}

/** A Scotch yoke: the crank pin B rides a slot in the yoke CD, which slides on a Prismatic guide at C. */
function scotchYoke(random: Random): MechanismFixture {
  const crank = between(random, 0.6, 1.2);
  const angle = between(random, 0.35, 2.8);
  const b = { x: crank * Math.cos(angle), y: crank * Math.sin(angle) };
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: round(b.x), y: round(b.y) },
      { id: 'C', x: round(b.x), y: round(-between(random, 1.2, 2)) },
      { id: 'D', x: round(b.x), y: round(b.y + between(random, 0.8, 1.6)) },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [
      { at: 'B', on: { carrier: 'CD', a: 'C', b: 'D' } },
      { at: 'C', angleRad: 0 },
    ],
    welds: ['C'],
    inputAngVel: 1,
  };
}

const BASES: Record<string, (random: Random) => MechanismFixture> = {
  'four-bar': (random) => fourBar(random, false),
  'four-bar with a coupler point': (random) => fourBar(random, true),
  'slider-crank': sliderCrank,
  'Watt six-bar': (random) => sixBar(random, 'watt'),
  'Stephenson six-bar': (random) => sixBar(random, 'stephenson'),
  'four-bar with a bent coupler': bentCouplerFourBar,
  'Scotch yoke': scotchYoke,
};

// --- the mistakes -----------------------------------------------------------

interface Mistake {
  name: string;
  /** Makes the mistake, or says it cannot be made to this drawing. */
  make(fixture: MechanismFixture, random: Random): Undo | undefined;
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nextLetter = (fixture: MechanismFixture) =>
  [...letters].find((letter) => !fixture.joints.some((joint) => joint.id === letter))!;
const sliderAt = (fixture: MechanismFixture, id: string) =>
  (fixture.sliders ?? []).some((slider) => slider.at === id);
const linksAt = (fixture: MechanismFixture, id: string) =>
  fixture.links.filter((link) => link.joints.includes(id));
const joined = (fixture: MechanismFixture, a: string, b: string) =>
  fixture.links.some((link) => link.joints.includes(a) && link.joints.includes(b));
const sorted = (ids: string) => [...ids].sort().join('');

const MISTAKES: Mistake[] = [
  {
    name: 'a pivot left ungrounded',
    make(fixture, random) {
      const pivots = fixture.joints.filter((joint) => joint.ground && !joint.input);
      if (pivots.length === 0) return undefined;
      const pivot = pick(random, pivots);
      pivot.ground = false;
      if (sliderAt(fixture, pivot.id)) fixture.detach = [...(fixture.detach ?? []), pivot.id];
      return { kind: 'ground', joint: pivot.id };
    },
  },
  {
    name: 'a moving joint grounded',
    make(fixture, random) {
      const moving = fixture.joints.filter(
        (joint) => !joint.ground && !sliderAt(fixture, joint.id)
      );
      if (moving.length === 0) return undefined;
      const joint = pick(random, moving);
      joint.ground = true;
      return { kind: 'unground', joint: joint.id };
    },
  },
  {
    name: 'no input set',
    make(fixture) {
      const input = fixture.joints.find((joint) => joint.input);
      if (!input) return undefined;
      input.input = false;
      return { kind: 'set-input', joint: input.id };
    },
  },
  {
    name: 'the input on the wrong joint',
    make(fixture, random) {
      const input = fixture.joints.find((joint) => joint.input);
      const others = fixture.joints.filter((joint) => !joint.input);
      if (!input || others.length === 0) return undefined;
      input.input = false;
      pick(random, others).input = true;
      return { kind: 'set-input', joint: input.id };
    },
  },
  {
    name: 'a second input',
    make(fixture, random) {
      const others = fixture.joints.filter((joint) => !joint.input && joint.ground);
      if (others.length === 0) return undefined;
      const second = pick(random, others);
      second.input = true;
      return { kind: 'remove-input', joint: second.id };
    },
  },
  {
    name: 'a bar drawn across the linkage',
    make(fixture, random) {
      const pairs = fixture.joints.flatMap((a, i) =>
        fixture.joints
          .slice(i + 1)
          .filter((b) => !joined(fixture, a.id, b.id) && !(a.ground && b.ground))
          .map((b) => sorted(a.id + b.id))
      );
      if (pairs.length === 0) return undefined;
      const joints = pick(random, pairs);
      fixture.links.push({ joints });
      return { kind: 'delete-link', link: joints };
    },
  },
  {
    name: 'a link left hanging off a joint',
    make(fixture, random) {
      const from = pick(random, fixture.joints);
      const id = nextLetter(fixture);
      fixture.joints.push({
        id,
        x: round(from.x + between(random, -1.5, 1.5)),
        y: round(from.y + between(random, 0.5, 1.5)),
      });
      const joints = sorted(from.id + id);
      fixture.links.push({ joints });
      return { kind: 'delete-link', link: joints };
    },
  },
  {
    name: 'a joint dropped next to another instead of on it',
    make(fixture, random) {
      const shared = fixture.joints.filter(
        (joint) => linksAt(fixture, joint.id).length >= 2 && !sliderAt(fixture, joint.id)
      );
      if (shared.length === 0) return undefined;
      const joint = pick(random, shared);
      const link = pick(random, linksAt(fixture, joint.id));
      const id = nextLetter(fixture);
      const miss = between(random, 0.04, 0.15);
      const angle = between(random, 0, Math.PI * 2);
      fixture.joints.push({
        id,
        x: round(joint.x + miss * Math.cos(angle)),
        y: round(joint.y + miss * Math.sin(angle)),
        ground: joint.ground,
      });
      // A new letter keeps its place in the link: ids are sorted letters.
      link.joints = sorted(link.joints.replace(joint.id, id));
      return { kind: 'merge', joint: id, onto: joint.id };
    },
  },
  {
    name: 'a pin welded by mistake',
    make(fixture, random) {
      const pins = fixture.joints.filter(
        (joint) => linksAt(fixture, joint.id).length === 2 && !sliderAt(fixture, joint.id)
      );
      if (pins.length === 0) return undefined;
      const pin = pick(random, pins);
      // As the app welds: the two links become one compound body, keeping
      // what they were as its members, and the joint says it is welded.
      const [first, second] = linksAt(fixture, pin.id);
      fixture.links = fixture.links.filter((link) => link !== first && link !== second);
      fixture.links.push({
        joints: sorted([...new Set(first.joints + second.joints)].join('')),
        subset: [first, second],
      });
      fixture.welds = [...(fixture.welds ?? []), pin.id];
      return { kind: 'unweld', joint: pin.id };
    },
  },
  {
    name: 'a weld left off',
    make(fixture, random) {
      const compounds = fixture.links.filter((link) => link.subset && link.subset.length > 1);
      const welded = (fixture.welds ?? []).filter(
        (id) => !sliderAt(fixture, id) && compounds.some((link) => link.joints.includes(id))
      );
      if (welded.length === 0) return undefined;
      const joint = pick(random, welded);
      const compound = compounds.find((link) => link.joints.includes(joint))!;
      fixture.links.splice(fixture.links.indexOf(compound), 1, ...compound.subset!);
      fixture.welds = fixture.welds!.filter((id) => id !== joint);
      return { kind: 'weld', joint };
    },
  },
  {
    name: 'a Prismatic slider left as a Pin-in-slot',
    make(fixture) {
      const slide = (fixture.sliders ?? []).find(
        (slider) => !slider.on && (fixture.welds ?? []).includes(slider.at)
      );
      if (!slide) return undefined;
      fixture.welds = fixture.welds!.filter((id) => id !== slide.at);
      return { kind: 'prismatic', joint: slide.at };
    },
  },
  {
    name: 'a slider that may not turn',
    make(fixture) {
      const slider = (fixture.sliders ?? [])[0];
      if (!slider || slider.on || (fixture.welds ?? []).includes(slider.at)) return undefined;
      fixture.welds = [...(fixture.welds ?? []), slider.at];
      return { kind: 'pin-in-slot', joint: slider.at };
    },
  },
  {
    name: 'a link deleted',
    make(fixture, random) {
      const input = fixture.joints.find((joint) => joint.input)?.id ?? '';
      const candidates = fixture.links.filter((link) => !link.joints.includes(input));
      if (candidates.length === 0) return undefined;
      const link = pick(random, candidates);
      fixture.links.splice(fixture.links.indexOf(link), 1);
      return { kind: 'add-link', joints: link.joints };
    },
  },
  {
    name: 'a stray link drawn off to the side',
    make(fixture, random) {
      const xs = fixture.joints.map((joint) => joint.x);
      const a = nextLetter(fixture);
      fixture.joints.push({
        id: a,
        x: round(Math.max(...xs) + 2),
        y: round(between(random, 0, 2)),
      });
      const b = nextLetter(fixture);
      fixture.joints.push({
        id: b,
        x: round(Math.max(...xs) + 3.5),
        y: round(between(random, 0, 2)),
      });
      fixture.links.push({ joints: sorted(a + b) });
      return { kind: 'delete-link', link: sorted(a + b) };
    },
  },
  {
    name: 'the frame drawn as a bar between two pivots',
    make(fixture) {
      const pivots = fixture.joints.filter((joint) => joint.ground && !sliderAt(fixture, joint.id));
      if (pivots.length < 2 || joined(fixture, pivots[0].id, pivots[1].id)) return undefined;
      fixture.links.push({ joints: sorted(pivots[0].id + pivots[1].id) });
      // Harmless on purpose: a drawing that should still run.
      return { kind: 'none' };
    },
  },
];

/** Every mistake's name, for reports that list them all whether or not they came up. */
export const MISTAKE_NAMES = MISTAKES.map((mistake) => mistake.name);

/**
 * `count` scenarios from `seed`, each a base mechanism with `mistakes` mistakes
 * made to it (one or two, chosen per scenario when left out).
 */
export function studentScenarios(count: number, seed: number, mistakes?: 1 | 2): Scenario[] {
  const scenarios: Scenario[] = [];
  for (let n = 0; scenarios.length < count && n < count * 10; n++) {
    const scenarioSeed = seed * 100003 + n;
    const random = randomStream(scenarioSeed);
    const base = pick(random, Object.keys(BASES));
    const intended = BASES[base](random);
    const broken = copyFixture(intended);
    const made: Scenario['mistakes'] = [];
    const wanted = mistakes ?? (random() < 0.7 ? 1 : 2);
    for (let tries = 0; made.length < wanted && tries < 10; tries++) {
      const mistake = pick(random, MISTAKES);
      if (made.some((one) => one.name === mistake.name)) continue;
      const undo = mistake.make(broken, random);
      if (undo) made.push({ name: mistake.name, undo });
    }
    if (made.length === 0 || broken.links.length > 10) continue;
    scenarios.push({ seed: scenarioSeed, base, intended, broken, mistakes: made });
  }
  return scenarios;
}
