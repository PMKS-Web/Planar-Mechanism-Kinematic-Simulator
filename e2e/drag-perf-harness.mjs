/**
 * Shared machinery for the drag performance suites.
 *
 * A drag is the one interaction that runs the whole pipeline on every pointer
 * move -- re-solve the cycle, rebuild the graphs, repaint -- so it is where a
 * slow change shows first. Two suites sit on this file:
 *
 *   - `drag-perf.mjs` measures a fixed set of drags with nothing attached and
 *     compares them to a committed baseline, so a change that makes dragging
 *     laggier fails a check instead of being noticed a month later;
 *   - `drag-profile.mjs` attaches the DevTools CPU profiler and tracer to one
 *     scenario and says where the time went, by stage and by function.
 *
 * Everything here drives the page through the DOM, so it works against a
 * production build as well as the dev server. The one exception is the call
 * counter, which wraps live prototypes through Angular's `window.ng` debug hook
 * and therefore only works in a dev build.
 *
 * Pointer events go through the DevTools protocol, and each one costs about
 * 8 ms of round trip before the app sees it. `harnessFloor` measures that on a
 * blank page so the suites can subtract it; what is left is close to the frame
 * time a reader gets, because a real browser coalesces pointer moves to one
 * per frame.
 */

import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const PLAYWRIGHT = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(PLAYWRIGHT + '/node_modules/playwright/index.mjs');

export const baseUrl = () =>
  process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://127.0.0.1:4200';

/** Pointer moves per drag, and how far each one travels. */
export const STEPS = 30;
const DX = 3;
const DY = -2;

/**
 * The scenarios both suites know by id.
 *
 * Each names a template, a mode, what to select, how many graph rows to open,
 * and what to drag. `traces` marks every moving joint as tracing its path
 * through the right-click menu first. `compare` switches the analysis panel's
 * before-drag comparison on (it needs a drag to exist, so one is made).
 */
export const SCENARIOS = [
  {
    id: 'edit-joint',
    name: '4-Bar · Edit · drag joint B',
    template: '4-Bar',
    mode: 'Edit',
    drag: { joint: 'B' },
  },
  {
    id: 'edit-link',
    name: '4-Bar · Edit · drag link BC',
    template: '4-Bar',
    mode: 'Edit',
    drag: { link: 'BC' },
  },
  {
    id: 'edit-traces',
    name: '4-Bar · Edit · traced paths shown · drag joint B',
    template: '4-Bar',
    mode: 'Edit',
    traces: ['A', 'B', 'C', 'D'],
    drag: { joint: 'B' },
  },
  {
    id: 'kin-1row',
    name: '4-Bar · Kinematic · C selected · 1 row · drag joint B',
    template: '4-Bar',
    mode: 'Kinematic',
    selectJoint: 'C',
    rows: 1,
    drag: { joint: 'B' },
  },
  {
    id: 'kin-3rows',
    name: '4-Bar · Kinematic · C selected · 3 rows · drag joint B',
    template: '4-Bar',
    mode: 'Kinematic',
    selectJoint: 'C',
    rows: 3,
    drag: { joint: 'B' },
  },
  {
    id: 'kin-3rows-compare',
    name: '4-Bar · Kinematic · 3 rows · compare on · drag joint B',
    template: '4-Bar',
    mode: 'Kinematic',
    selectJoint: 'C',
    rows: 3,
    compare: true,
    drag: { joint: 'B' },
  },
  {
    id: 'kin-link-3rows',
    name: '4-Bar · Kinematic · link BC selected · 3 rows · drag link BC',
    template: '4-Bar',
    mode: 'Kinematic',
    selectLink: 'BC',
    rows: 3,
    drag: { link: 'BC' },
  },
  {
    id: 'force-2rows',
    name: 'Crane_Two_Loads · Force · C selected · rows · drag joint C',
    template: 'Crane_Two_Loads',
    mode: 'Force',
    selectJoint: 'C',
    rows: 3,
    drag: { joint: 'C' },
  },
  {
    id: 'jansen-edit',
    name: 'Jansen_Leg · Edit · drag joint A',
    template: 'Jansen_Leg',
    mode: 'Edit',
    drag: { joint: 'A' },
  },
  {
    id: 'jansen-3rows',
    name: 'Jansen_Leg · Kinematic · A selected · 3 rows · drag joint A',
    template: 'Jansen_Leg',
    mode: 'Kinematic',
    selectJoint: 'A',
    rows: 3,
    drag: { joint: 'A' },
  },
  {
    id: 'four-machines',
    name: 'Four_Bar_Inversions · Edit · 4 machines · drag joint B',
    template: 'Four_Bar_Inversions',
    mode: 'Edit',
    drag: { joint: 'B' },
  },
];

export async function launch() {
  const browser = await chromium.launch({ headless: !process.env.PMKS_HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await startQuiet(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  cdp.__events = [];
  cdp.on('Tracing.dataCollected', (m) => cdp.__events.push(...m.value));
  return { browser, context, page, cdp };
}

// ---- finding things on screen ---------------------------------------------

export const jointAt = (page, id) =>
  page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      const marker = el.querySelector('[id^="joint_"]');
      if (marker?.id !== `joint_${wanted}`) continue;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }
    throw new Error('no joint ' + wanted + ' on screen');
  }, id);

export const linkAt = (page, id) =>
  page.evaluate((wanted) => {
    const el = document.querySelector(`#linkHolder [id="${wanted}"]`);
    if (!el) throw new Error('no link ' + wanted + ' on screen');
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  }, id);

/** Fit the drawing to the window, through the view controls' own button. */
export const fit = async (page) => {
  await page
    .locator('app-view-controls button', {
      has: page.locator('mat-icon', { hasText: 'crop_free' }),
    })
    .first()
    .click();
  await page.waitForTimeout(400);
};

export const mode = async (page, label) => {
  await page.locator('.tabButton', { hasText: label }).click();
  await page.waitForTimeout(600);
};

export const click = async (page, at) => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
};

/** Open the first `n` closed graph rows of the analysis panel; returns charts drawn. */
export async function openRows(page, n) {
  const headers = page.locator('app-analysis-graph-section .graphHeader');
  const count = await headers.count();
  let opened = 0;
  for (let i = 0; i < count && opened < n; i++) {
    const header = headers.nth(i);
    if ((await header.getAttribute('aria-expanded')) === 'true') {
      opened++;
      continue;
    }
    await header.click();
    opened++;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  return page.locator('.apexcharts-canvas').count();
}

export async function setCompare(page, on) {
  const toggle = page.locator('.compareToggle mat-slide-toggle');
  if (!(await toggle.count())) return 'no toggle';
  const checked = await toggle.evaluate(
    (el) => el.querySelector('button')?.getAttribute('aria-checked') === 'true'
  );
  if (checked !== on) {
    await toggle.click();
    await page.waitForTimeout(400);
  }
  return on;
}

/** Mark a joint as tracing its path, from its right-click menu. */
async function tracePath(page, id) {
  const at = await jointAt(page, id);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(400);
  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#contextMenu .cm-row')].find(
      (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Trace Path'
    );
    if (!row || row.classList.contains('cm-row--off')) return false;
    row.click();
    return true;
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return clicked;
}

/** Load a template and put the page in the scenario's state; returns what was set up. */
export async function loadScenario(page, sc) {
  await openMechanism(page, `${baseUrl()}/?${TEMPLATE_LINKAGES[sc.template]}`);
  if (sc.mode) await mode(page, sc.mode);
  await fit(page);
  let traced = 0;
  for (const id of sc.traces ?? []) if (await tracePath(page, id)) traced++;
  if (sc.selectJoint) await click(page, await jointAt(page, sc.selectJoint));
  if (sc.selectLink) await click(page, await linkAt(page, sc.selectLink));
  const charts = sc.rows ? await openRows(page, sc.rows) : 0;
  await fit(page);
  if (sc.compare !== undefined) {
    // A comparison needs a record, and a record needs a drag.
    const at = await dragTarget(page, sc);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 4, at.y - 3);
    await page.mouse.move(at.x + 8, at.y - 6);
    await page.mouse.up();
    await page.waitForTimeout(800);
    await setCompare(page, sc.compare);
  }
  return { charts, traced };
}

export const dragTarget = (page, sc) =>
  sc.drag.joint ? jointAt(page, sc.drag.joint) : linkAt(page, sc.drag.link);

// ---- dragging ---------------------------------------------------------------

const startFrameSampler = (page) =>
  page.evaluate(() => {
    window.__frames = [];
    window.__sampling = true;
    const loop = (t) => {
      window.__frames.push(t);
      if (window.__sampling) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

const stopFrameSampler = async (page) => {
  const frames = await page.evaluate(() => {
    window.__sampling = false;
    return window.__frames;
  });
  const gaps = frames
    .slice(1)
    .map((t, i) => t - frames[i])
    .sort((a, b) => a - b);
  const q = (p) => Math.round(gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] ?? 0);
  return {
    count: gaps.length,
    medianMs: q(0.5),
    p90Ms: q(0.9),
    worstMs: q(1),
    over50ms: gaps.filter((g) => g > 50).length,
    over100ms: gaps.filter((g) => g > 100).length,
  };
};

/**
 * One drag with nothing attached: press, `STEPS` pointer moves, release.
 * `sign` flips the direction so a warm-up drag and a measured one cancel out
 * and the joint ends where it started.
 */
export async function plainDrag(page, start, sign = 1) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await startFrameSampler(page);
  const t0 = performance.now();
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(start.x + i * DX * sign, start.y + i * DY * sign);
  }
  const movesMs = performance.now() - t0;
  const frames = await stopFrameSampler(page);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return { movesMs: Math.round(movesMs), msPerMove: movesMs / STEPS, frames };
}

/**
 * What the protocol itself costs per pointer move, measured on a blank page
 * with a listener attached so the event has somewhere to go.
 */
export async function harnessFloor(page) {
  await page.goto('about:blank');
  await page.setContent(
    '<div style="width:1400px;height:800px"></div><script>document.addEventListener("pointermove",()=>{});</script>'
  );
  const samples = [];
  for (let rep = 0; rep < 3; rep++) {
    const r = await plainDrag(page, { x: 300, y: 400 }, rep % 2 ? -1 : 1);
    samples.push(r.msPerMove);
  }
  return Math.min(...samples);
}

// ---- profiling ----------------------------------------------------------------

/** The same drag with the CPU profiler and the tracer attached to it. */
export async function profiledDrag(page, cdp, start, sign = 1) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await startFrameSampler(page);
  await cdp.send('Tracing.start', {
    categories:
      'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute,disabled-by-default-v8.gc',
    transferMode: 'ReportEvents',
  });
  await page.evaluate(() => performance.mark('drag-start'));
  await cdp.send('Profiler.start');
  const t0 = performance.now();
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(start.x + i * DX * sign, start.y + i * DY * sign);
  }
  const movesMs = performance.now() - t0;
  await page.waitForTimeout(100);
  await page.evaluate(() => performance.mark('drag-end'));
  const { profile } = await cdp.send('Profiler.stop');
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.end');
  await done;
  const events = cdp.__events.splice(0);
  const frames = await stopFrameSampler(page);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const marks = {
    start: events.find((e) => e.name === 'drag-start')?.ts,
    end: events.find((e) => e.name === 'drag-end')?.ts,
  };
  const trace = marks.start && marks.end ? analyzeTrace(events, marks.start, marks.end) : null;
  const prof = await analyzeProfile(profile);
  return { movesMs: Math.round(movesMs), msPerMove: movesMs / STEPS, frames, trace, prof };
}

// Source maps, so anonymous closures in the bundle get a file. Vite's
// dependency chunks carry maps too, which is how node_modules time gets named.
const maps = new Map();
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlq(str) {
  const out = [];
  let shift = 0;
  let value = 0;
  for (const ch of str) {
    let digit = B64.indexOf(ch);
    const cont = digit & 32;
    digit &= 31;
    value += digit << shift;
    if (cont) {
      shift += 5;
      continue;
    }
    const neg = value & 1;
    value >>= 1;
    out.push(neg ? -value : value);
    shift = 0;
    value = 0;
  }
  return out;
}

async function mapFor(url) {
  if (maps.has(url)) return maps.get(url);
  let parsed = null;
  try {
    const [clean, query] = url.split('?');
    const res = await fetch(clean + '.map' + (query ? '?' + query : ''));
    if (res.ok) {
      const raw = await res.json();
      let src = 0;
      let sl = 0;
      let sc = 0;
      parsed = {
        sources: raw.sources,
        lines: raw.mappings.split(';').map((line) => {
          let gc = 0;
          const segs = [];
          if (!line) return segs;
          for (const seg of line.split(',')) {
            const f = decodeVlq(seg);
            gc += f[0];
            if (f.length >= 4) {
              src += f[1];
              sl += f[2];
              sc += f[3];
              segs.push([gc, src, sl]);
            } else segs.push([gc, -1, -1]);
          }
          return segs;
        }),
      };
    }
  } catch {
    parsed = null;
  }
  maps.set(url, parsed);
  return parsed;
}

async function resolve(url, line, col) {
  const m = await mapFor(url);
  if (!m) return null;
  const segs = m.lines[line];
  if (!segs || !segs.length) return null;
  let lo = 0;
  let hi = segs.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid][0] <= col) {
      best = segs[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (!best || best[1] < 0) return null;
  return { file: m.sources[best[1]].replace(/^(\.\.\/)+/, ''), line: best[2] + 1 };
}

/** Which part of the app a source file belongs to, for the per-bucket totals. */
export function bucket(file) {
  if (!file) return 'native / unknown';
  if (/apexcharts|global:scripts\.js/.test(file)) return 'apexcharts';
  if (/@angular\/core|vite\/deps\/@angular_core|vite\/deps\/chunk-/.test(file))
    return '@angular/core';
  if (/@angular\/(cdk|material|animations|common|platform)/.test(file))
    return '@angular/cdk+material+common';
  if (/zone\.js|zone__js/.test(file)) return 'zone.js';
  if (/node_modules\/rxjs|vite\/deps\/rxjs/.test(file)) return 'rxjs';
  if (/svg-pan-zoom|hammer/.test(file)) return 'svg-pan-zoom / hammer';
  if (/node_modules|vite\/deps/.test(file)) return 'other node_modules';
  if (/model\/mechanism\/(position|kinematic|force|loop)/.test(file))
    return 'solvers (position/kinematic/force/loop)';
  if (/model\/mechanism/.test(file)) return 'model/mechanism (partition, Mechanism, anchor)';
  if (/model\//.test(file)) return 'model (links, joints, marks, link paths)';
  if (/mechanism\.service/.test(file)) return 'MechanismService';
  if (/analysis-graph|analysis-apex|analysis-compare|analysis-panel|analysis-sample/.test(file))
    return 'analysis graphs (components, bridge, sampler)';
  if (/new-grid/.test(file)) return 'new-grid component';
  if (/svg-grid\.service/.test(file)) return 'SvgGridService';
  if (/services\//.test(file)) return 'other services';
  if (/component\//.test(file)) return 'other components';
  return 'other app code';
}

const fnKey = (n) => {
  const c = n.callFrame;
  return `${c.functionName}|${c.url}|${c.lineNumber}|${c.columnNumber}`;
};

/**
 * Self time by function, file and bucket, and inclusive time by function name.
 * Inclusive time counts a sample once per distinct function on its stack, so
 * recursion does not double it.
 */
export async function analyzeProfile(profile, top = 25) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const selfUs = new Map();
  const totalUs = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const id = profile.samples[i];
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const key = fnKey(byId.get(cur));
      if (seen.has(key)) continue;
      seen.add(key);
      totalUs.set(key, (totalUs.get(key) ?? 0) + dt);
    }
  }
  const labels = new Map();
  const label = async (n) => {
    const k = fnKey(n);
    if (labels.has(k)) return labels.get(k);
    const cf = n.callFrame;
    let file = null;
    if (cf.url) {
      const r = await resolve(cf.url, cf.lineNumber, cf.columnNumber);
      file = r ? `${r.file}:${r.line}` : cf.url.replace(baseUrl(), '') + ':' + (cf.lineNumber + 1);
    }
    const out = {
      name: cf.functionName || '(anonymous)',
      file: file ?? `(${cf.functionName || 'native'})`,
      bucket: bucket(file),
    };
    labels.set(k, out);
    return out;
  };
  const ms = (us) => Math.round(us / 100) / 10;
  const selfByFn = new Map();
  const byBucket = new Map();
  const byFile = new Map();
  const NATIVES = [
    'getBBox',
    'get clientWidth',
    'getBoundingClientRect',
    'setAttribute',
    'getComputedStyle',
  ];
  const callers = {};
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    const l = await label(n);
    selfByFn.set(`${l.name} — ${l.file}`, (selfByFn.get(`${l.name} — ${l.file}`) ?? 0) + us);
    const b = ['(idle)', '(garbage collector)', '(program)', '(root)'].includes(l.name)
      ? l.name
      : l.bucket;
    byBucket.set(b, (byBucket.get(b) ?? 0) + us);
    const f = l.file.replace(/:\d+$/, '');
    byFile.set(f, (byFile.get(f) ?? 0) + us);
    if (NATIVES.includes(l.name)) {
      // Charged to the nearest app or library frame above, which is who asked.
      let cur = parent.get(id);
      let who = '?';
      while (cur !== undefined) {
        const p = await label(byId.get(cur));
        if (/^src\/app|scripts\.js|apexcharts/.test(p.file)) {
          who = `${p.name} — ${p.file}`;
          break;
        }
        cur = parent.get(cur);
      }
      callers[l.name] ??= {};
      callers[l.name][who] = (callers[l.name][who] ?? 0) + us;
    }
  }
  const totalByName = new Map();
  for (const [key, us] of totalUs) {
    const l = await label(profile.nodes.find((x) => fnKey(x) === key));
    const k = `${l.name} — ${l.file.replace(/:\d+$/, '')}`;
    totalByName.set(k, Math.max(totalByName.get(k) ?? 0, us));
  }
  const sorted = (m) => [...m].sort((a, b) => b[1] - a[1]);
  for (const k of Object.keys(callers)) {
    callers[k] = Object.entries(callers[k])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w, us]) => `${ms(us)} ms ${w}`);
  }
  return {
    totalMs: ms(total),
    buckets: sorted(byBucket).map(([k, v]) => [k, ms(v)]),
    files: sorted(byFile)
      .slice(0, top)
      .map(([k, v]) => [k, ms(v)]),
    self: sorted(selfByFn)
      .slice(0, top)
      .map(([k, v]) => [k, ms(v)]),
    total: sorted(totalByName)
      .slice(0, 60)
      .map(([k, v]) => [k, ms(v)]),
    callers,
  };
}

// The categories DevTools' Performance panel uses, near enough.
const CATEGORY = {
  scripting: [
    'FunctionCall',
    'EvaluateScript',
    'v8.compile',
    'v8.compileModule',
    'TimerFire',
    'EventDispatch',
    'RunMicrotasks',
    'FireAnimationFrame',
    'RequestAnimationFrame',
    'CancelAnimationFrame',
    'v8.run',
    'V8.Execute',
    'RunTask',
    'ScheduleStyleRecalculation',
    'RequestIdleCallback',
    'FireIdleCallback',
    'TimerInstall',
    'TimerRemove',
    'UserTiming',
  ],
  gc: [
    'MajorGC',
    'MinorGC',
    'GCEvent',
    'V8.GCFinalizeMC',
    'V8.GCScavenger',
    'BlinkGC.AtomicPhase',
    'V8.GC_MARK_COMPACTOR',
    'V8.GCIncrementalMarking',
    'V8.GCIncrementalMarkingStart',
    'V8.GCIncrementalMarkingFinalize',
    'V8.GCScavenge',
  ],
  rendering: [
    'UpdateLayoutTree',
    'RecalculateStyles',
    'Layout',
    'HitTest',
    'UpdateLayerTree',
    'PrePaint',
    'InvalidateLayout',
    'LayoutShift',
    'IntersectionObserverController::computeIntersections',
    'ResizeObserver',
    'Animation',
  ],
  painting: [
    'Paint',
    'PaintImage',
    'Commit',
    'CompositeLayers',
    'RasterTask',
    'Layerize',
    'DecodeImage',
    'ResizeImage',
    'PaintSetup',
    'UpdateLayer',
    'ScrollLayer',
    'Rasterize',
    'DrawFrame',
    'BeginFrame',
    'ActivateLayerTree',
    'BeginMainThreadFrame',
  ],
};
const categoryOf = (name) => {
  for (const [c, names] of Object.entries(CATEGORY)) if (names.includes(name)) return c;
  return null;
};

/** Self time per category on the page's main thread, inside the marked window. */
export function analyzeTrace(events, windowStart, windowEnd) {
  const mainThreads = events
    .filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
    .map((e) => `${e.pid}:${e.tid}`);
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !(e.dur > 0)) continue;
    const k = `${e.pid}:${e.tid}`;
    if (!mainThreads.includes(k)) continue;
    if (e.ts + e.dur < windowStart || e.ts > windowEnd) continue;
    (byThread.get(k) ?? byThread.set(k, []).get(k)).push(e);
  }
  let busiest = null;
  for (const entry of byThread)
    if (!busiest || entry[1].length > busiest[1].length) busiest = entry;
  if (!busiest) return null;
  const list = busiest[1].sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const stack = [];
  let busy = 0;
  for (const e of list) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts)
      stack.pop();
    const clipped = Math.min(e.ts + e.dur, windowEnd) - Math.max(e.ts, windowStart);
    if (stack.length) stack[stack.length - 1].__self -= clipped;
    else busy += clipped;
    e.__self = clipped;
    stack.push(e);
  }
  const self = new Map();
  const byName = new Map();
  for (const e of list) {
    const c = categoryOf(e.name) ?? 'other';
    self.set(c, (self.get(c) ?? 0) + e.__self);
    byName.set(e.name, (byName.get(e.name) ?? 0) + e.__self);
  }
  const span = windowEnd - windowStart;
  const per = (us) => Math.round((us / span) * 1000);
  const perSecond = {};
  for (const [c, us] of self) perSecond[c] = per(us);
  perSecond.idle = per(span - busy);
  return {
    spanMs: Math.round(span / 1000),
    perSecond,
    topEvents: [...byName]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => [k, Math.round(v / 100) / 10]),
  };
}

// ---- counting, dev build only --------------------------------------------------

/**
 * Wrap the live prototypes so the next drag counts how often each stage ran
 * and how long it took. Needs Angular's `window.ng`, which a production build
 * does not expose.
 */
export async function armCounters(page) {
  const armed = await page.evaluate(() => {
    if (!window.ng) return false;
    const counts = (window.__counts = {});
    const wrap = (obj, name, label) => {
      if (!obj) return;
      const proto = Object.getPrototypeOf(obj);
      const orig = proto[name];
      if (typeof orig !== 'function' || orig.__counted) return;
      const wrapped = function (...args) {
        counts[label] = (counts[label] ?? 0) + 1;
        const t = performance.now();
        try {
          return orig.apply(this, args);
        } finally {
          counts[label + ' ms'] = (counts[label + ' ms'] ?? 0) + performance.now() - t;
        }
      };
      wrapped.__counted = true;
      proto[name] = wrapped;
    };
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    wrap(grid.mechanismSrv, 'updateMechanism', 'MechanismService.updateMechanism');
    wrap(grid.mechanismSrv, 'getJointPath', 'MechanismService.getJointPath');
    wrap(grid, 'dragArcs', 'canvas template evaluated (one change-detection pass)');
    wrap(
      grid.mechanismSrv.mechanisms.find((m) => m),
      'findFullMovementPos',
      'Mechanism position sweep (one per machine)'
    );
    wrap(
      grid.mechanismSrv.links.find((l) => /RealLink/.test(l.constructor.name)),
      'copyVisualGeometryFrom',
      'RealLink.copyVisualGeometryFrom (per link per timestep)'
    );
    const graph = document.querySelector('app-analysis-graph');
    if (graph) {
      const g = window.ng.getComponent(graph);
      wrap(g, 'updateChartData', 'AnalysisGraph.updateChartData (per row)');
      const sampler = Object.values(g).find(
        (v) => v?.constructor && /AnalysisSampleService/.test(v.constructor.name)
      );
      wrap(sampler, 'solve', 'AnalysisSampleService.solve (kinematics at one timestep)');
      if (window.ApexCharts) {
        wrap(
          new window.ApexCharts(document.createElement('div'), {
            chart: { type: 'line' },
            series: [],
          }),
          'updateOptions',
          'ApexCharts.updateOptions (per row)'
        );
      }
      window.__panelMutations = new MutationObserver((list) => {
        counts['DOM mutations in the analysis panel'] =
          (counts['DOM mutations in the analysis panel'] ?? 0) + list.length;
      });
      window.__panelMutations.observe(document.querySelector('app-analysis-panel'), {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return true;
  });
  return armed;
}

export const resetCounters = (page) =>
  page.evaluate(() => {
    for (const k of Object.keys(window.__counts ?? {})) delete window.__counts[k];
  });

export const readCounters = (page) => page.evaluate(() => window.__counts ?? {});
