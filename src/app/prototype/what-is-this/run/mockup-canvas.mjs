// PROTOTYPE: the "What is this?" mock-up as a design canvas: the note inside the
// app's own Analysis panel, one artboard per situation. Reads the data
// run/mockup.mjs wrote and writes the canvas's files for the Artifact tool:
//   node src/app/prototype/what-is-this/run/mockup-canvas.mjs
// -> artifacts/what-is-this/mockup/canvas/project/{canvas.json,*.dc.html}
//
// The screens copy the app as feature/explain-blockers-check-answers draws it:
// the per-machine panel ("Analysis for Mechanism M2", Mechanism Overview,
// Links), the playback bar's row per machine, the setup drawer's issue block,
// and `part-link`'s look for a part named in a sentence.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = new URL('../../../../../artifacts/what-is-this/mockup/', import.meta.url).pathname;
const out = join(base, 'canvas', 'project');
mkdirSync(out, { recursive: true });
const read = (name) => JSON.parse(readFileSync(join(base, `${name}.json`), 'utf8'));

// The app's own tokens (src/styles/_tokens.scss).
const T = {
  brand: '#3f51b5',
  brandDark: '#303f9f',
  brandTint: '#e8eaf6',
  brandPale: '#c5cae9',
  brandWash: '#f5f6fb',
  sunken: '#f7f8fc',
  chip: '#eef0f4',
  selectedRow: '#e9ebf3',
  rule: '#eceef5',
  divider: '#e6e7ee',
  strong: '#202124',
  primary: '#2c2c2c',
  secondary: '#5f6368',
  tertiary: '#6b7080',
  selection: '#ffca28',
  ink: '#263238',
  successText: '#137333',
  successBg: '#e6f4ea',
  dangerText: '#c62828',
  dangerBg: '#fdecea',
  danger: '#f44336',
  warningText: '#b26a00',
  warningBg: '#fef3e0',
};

const ICON = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  kin: 'M3 17l5-6 4 4 8-9M3 21h18',
  force: 'M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z',
  synth: 'M4 18c4-10 12-10 16 0M7 9l2-2M17 9l-2-2',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  down: 'M12 4v12M6 11l6 6 6-6M5 20h14',
  stop: 'M7 7h10v10H7z',
  up: 'M6 15l6-6 6 6',
  chevron: 'M6 9l6 6 6-6',
  pen: 'M4 20h4L19 9l-4-4L4 16v4z',
  point: 'M9 11V5a2 2 0 014 0v6m0-2a2 2 0 014 0v3m-8-1a2 2 0 00-4 0v2c0 4 3 7 7 7h1a6 6 0 006-6v-3',
  com: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M3 12h18',
  abc: 'M4 16l3-8 3 8M5 13h4M13 8v8h3a2 2 0 000-4h-3m0 0h2.5a2 2 0 000-4H13',
  trace: 'M4 18c3 0 3-12 8-12s5 12 8 12',
  zoomOut: 'M11 4a7 7 0 100 14 7 7 0 000-14zM8 11h6M20 20l-4-4',
  zoomIn: 'M11 4a7 7 0 100 14 7 7 0 000-14zM8 11h6M11 8v6M20 20l-4-4',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  error: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v6M12 16v.5',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  sync: 'M7 4v16M17 4v16M4 8l3-4 3 4M14 16l3 4 3-4',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
};
const icon = (name, size = 20, color = 'currentColor', width = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[name]}"></path></svg>`;

const HEAD = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&amp;display=swap" rel="stylesheet">
<style>
body{margin:0;font-family:Roboto,'Helvetica Neue',sans-serif;color:${T.primary};background:#fff}
a{color:${T.brand}}a:hover{color:${T.brandDark}}
.partLink{display:inline;margin:0;padding:0 4px;border:none;border-radius:3px;background:${T.brandTint};color:${T.brand};font:inherit;font-weight:500;line-height:18px;cursor:pointer;white-space:nowrap}
.partLink:hover{background:${T.brandPale}}
.partLink:focus-visible{outline:2px solid ${T.brand};outline-offset:1px}
.term{display:inline;margin:0;padding:0;border:none;background:none;font:inherit;color:inherit;text-decoration:underline dotted ${T.tertiary};text-underline-offset:3px;cursor:help}
.term:focus-visible{outline:2px solid ${T.brand};outline-offset:1px}
.rowButton{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:6px 16px;border:none;background:none;font:inherit;text-align:left;cursor:pointer;color:${T.primary}}
.rowButton:hover{background:${T.brandWash}}
.iconButton{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:none;border-radius:6px;background:none;color:${T.secondary};cursor:pointer}
.iconButton:hover{background:rgba(0,0,0,0.04)}
.textButton{display:inline-flex;align-items:center;gap:4px;margin:0;padding:4px 6px;border:none;border-radius:4px;background:none;font:inherit;color:${T.brand};cursor:pointer}
.textButton:hover{background:${T.brandWash}}
</style>
</helmet>
`;

/** The script every app screen shares: the solved motion on the canvas, and the panel's state. */
const SCRIPT = String.raw`
const PALETTE = ['#9fa8da', '#303e9f', '#0d125a', '#80cbc4', '#26A69A', '#00695C'];
const REGION = { x0: 440, x1: 1400, y0: 96, y1: 680 };
const sortLetters = (k) => k.replace('-', '').split('').sort().join('');

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { frame: 0, hover: null, selected: null, machine: 0, term: null, playing: true, fixes: true };
  }
  componentDidMount() {
    this.timer = setInterval(() => {
      if (!this.state.playing || DATA.motion.frames.length < 2) return;
      this.setState({ frame: (this.state.frame + 1) % DATA.motion.frames.length });
    }, 55);
  }
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  view() {
    if (this._view) return this._view;
    const m = DATA.motion;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = ([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    m.frames.forEach((f) => f.forEach(take));
    m.guides.forEach((g) => g.forEach(take));
    (m.discs || []).forEach((d) => { const [cx, cy] = m.frames[0][d.center]; take([cx - d.radius, cy - d.radius]); take([cx + d.radius, cy + d.radius]); });
    const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);
    const x1r = DATA.issue ? 1040 : REGION.x1;
    const s = Math.min((x1r - REGION.x0) / w, (REGION.y1 - REGION.y0) / h) * 0.86;
    const cx = (REGION.x0 + x1r) / 2, cy = (REGION.y0 + REGION.y1) / 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const at = ([x, y]) => [Math.round((cx + (x - mx) * s) * 10) / 10, Math.round((cy - (y - my) * s) * 10) / 10];
    const traced = m.joints.map((j, i) => (j.traced && m.frames.length > 1 ? m.frames.map((f) => at(f[i]).join(',')).join(' ') : null)).filter(Boolean);
    const length = (ids) => { let best = 0; for (const a of ids) for (const b of ids) { const p = m.frames[0][a], q = m.frames[0][b]; best = Math.max(best, Math.hypot(p[0] - q[0], p[1] - q[1])); } return best; };
    this._view = { at, s, traced, length };
    return this._view;
  }
  pathOf(ids, frame, at) {
    const pts = ids.map((i) => at(frame[i]));
    return 'M' + pts.map((p) => p.join(' ')).join('L') + (pts.length > 2 ? 'Z' : '');
  }
  partShapes(key, frame, at) {
    const m = DATA.motion;
    if (!key) return [];
    if (key.includes('-'))
      return m.cylinders.filter((c) => c.key === key).map((c) => { const [ax, ay] = at(frame[c.a]); const [bx, by] = at(frame[c.b]); return 'M' + ax + ' ' + ay + 'L' + bx + ' ' + by; });
    if (key.length === 1) {
      const i = m.joints.findIndex((j) => j.id === key);
      if (i < 0) return [];
      const [x, y] = at(frame[i]);
      return ['M' + (x - 0.1) + ' ' + y + 'L' + (x + 0.1) + ' ' + y];
    }
    return m.bodies.filter((b) => sortLetters(b.key) === sortLetters(key)).map((b) => this.pathOf(b.ids, frame, at));
  }
  // A sentence's pieces for the markup: text, a part as a part link (pointing
  // lights it, pressing selects it), and each term's first use, explained on hover.
  pieces(list, termsLeft) {
    const out = [];
    for (const piece of list || []) {
      if (typeof piece !== 'string') {
        const key = piece.part;
        out.push({ isPart: true, isText: false, isTerm: false, label: piece.label,
          enter: () => this.setState({ hover: key }), leave: () => this.setState({ hover: null }),
          press: () => this.setState({ selected: { key, label: piece.label }, hover: null }) });
        continue;
      }
      let text = piece;
      while (text) {
        let hit = null;
        for (const t of termsLeft) {
          const i = text.toLowerCase().indexOf(t.term.toLowerCase());
          if (i >= 0 && (!hit || i < hit.i)) hit = { i, t };
        }
        if (!hit) { out.push({ isText: true, isPart: false, isTerm: false, text }); break; }
        if (hit.i > 0) out.push({ isText: true, isPart: false, isTerm: false, text: text.slice(0, hit.i) });
        const word = text.slice(hit.i, hit.i + hit.t.term.length);
        const t = hit.t;
        out.push({ isTerm: true, isText: false, isPart: false, text: word,
          show: () => this.setState({ term: t }), hide: () => this.setState({ term: null }) });
        termsLeft.splice(termsLeft.indexOf(t), 1);
        text = text.slice(hit.i + word.length);
      }
    }
    return out;
  }
  renderVals() {
    const m = DATA.motion;
    const { at, s, traced, length } = this.view();
    const frame = m.frames[this.state.frame] || m.frames[0];
    const machine = DATA.machines[this.state.machine] || DATA.machines[0];
    const several = DATA.machines.length > 1;
    const inMachine = (key) => !several || machine.links.some((l) => l.letters === sortLetters(key));
    const bodies = m.bodies.map((b, i) => {
      const color = PALETTE[(i * 2 + 1) % PALETTE.length];
      return { d: this.pathOf(b.ids, frame, at), color, fill: b.ids.length > 2 ? color : 'none', faded: inMachine(b.key) ? '1' : '0.35' };
    });
    const discs = (m.discs || []).map((d) => { const [cx, cy] = at(frame[d.center]); return { cx, cy, r: Math.round(d.radius * s), color: bodies[d.body] ? bodies[d.body].color : PALETTE[0] }; });
    const halo = [];
    const lit = this.state.hover || (this.state.selected && this.state.selected.key);
    for (const d of this.partShapes(lit, frame, at)) halo.push({ d, width: 30, opacity: this.state.hover ? '0.85' : '1' });
    if (several && !lit)
      for (const b of m.bodies) if (inMachine(b.key)) halo.push({ d: this.pathOf(b.ids, frame, at), width: 22, opacity: '0.5' });
    const joints = m.joints.map((j, i) => { const [x, y] = at(frame[i]); return { x, y, label: j.id, ground: j.ground, lx: x + 9, ly: y - 11,
      tri: (x - 9) + ',' + (y + 13) + ' ' + (x + 9) + ',' + (y + 13) + ' ' + x + ',' + y,
      hatch: 'M' + (x - 11) + ' ' + (y + 13) + 'L' + (x + 11) + ' ' + (y + 13) + 'M' + (x - 8) + ' ' + (y + 13) + 'l-4 5M' + (x - 2) + ' ' + (y + 13) + 'l-4 5M' + (x + 4) + ' ' + (y + 13) + 'l-4 5M' + (x + 10) + ' ' + (y + 13) + 'l-4 5' }; });
    const cylinders = m.cylinders.map((c) => { const [ax, ay] = at(frame[c.a]); const [bx, by] = at(frame[c.b]); return { d: 'M' + ax + ' ' + ay + 'L' + bx + ' ' + by }; });
    const guides = m.guides.map(([p, q]) => { const [ax, ay] = at(p); const [bx, by] = at(q); return { d: 'M' + ax + ' ' + ay + 'L' + bx + ' ' + by }; });

    const note = machine.note;
    const paragraph = note ? this.pieces(note.paragraph, note.terms.slice()) : [];
    const uses = note ? note.uses.map((u) => ({ use: this.pieces(u.use, []), why: this.pieces(u.why, []) })) : [];
    const links = machine.links.map((l) => {
      const body = m.bodies.find((b) => sortLetters(b.key) === l.letters);
      const len = body ? length(body.ids) : 0;
      return { ...l, length: len ? len.toFixed(2) + ' ' + machine.unit : '', hasJob: !!l.job,
        enter: () => this.setState({ hover: l.key }), leave: () => this.setState({ hover: null }),
        press: () => this.setState({ selected: { key: l.key, label: l.label }, hover: null }) };
    });
    const rows = DATA.machines.map((mm, i) => ({ label: mm.label,
      bg: several && i === this.state.machine ? '#e9ebf3' : 'transparent',
      pick: () => this.setState({ machine: i, selected: null, hover: null, term: null }) }));
    const sel = this.state.selected;
    const selIsJoint = !!sel && sel.key.length === 1;
    // The part's own panel is titled as the app titles it: its kind, then its name.
    const selKind = !sel ? '' : /^cylinder/i.test(sel.label) ? 'Cylinder' : /^slider/i.test(sel.label) ? 'Slider' : selIsJoint ? 'Joint' : 'Link';
    const selName = !sel ? '' : sel.label.replace(/^(link|joint|slider|pin|point|cylinder)\s+/i, '').replace(/"/g, '');
    const issue = DATA.issue;
    return {
      bodies, discs, halo, joints, cylinders, guides, traced: traced.map((points) => ({ points })),
      machine, several,
      overview: machine.overview.filter((r) => r[0] !== 'Family').map((r) => ({ label: r[0], value: r[1] })),
      family: (machine.overview.find((r) => r[0] === 'Family') || [null, ''])[1],
      hasFamily: machine.overview.some((r) => r[0] === 'Family'),
      links, paragraph, uses, hasUses: uses.length > 0,
      looksLike: note ? note.looksLike : '', hasLooks: !!(note && note.looksLike),
      term: this.state.term || { term: '', meaning: '' }, hasTerm: !!this.state.term,
      rows,
      showMachine: !sel, showPart: !!sel, selLabel: selName, selKind,
      // In Edit (a machine that does not run) a part opens its properties, not graphs.
      graphs: DATA.issue ? (selIsJoint ? ['Position', 'Joint type', 'Lock'] : ['Length', 'Angle', 'Mass']) : selIsJoint ? ['Position', 'Velocity', 'Acceleration'] : ['Angle', 'Angular velocity', 'Angular acceleration'],
      back: () => this.setState({ selected: null }),
      togglePlay: () => this.setState({ playing: !this.state.playing }),
      playIcon: this.state.playing ? 'M8 5v14M16 5v14' : 'M8 5l11 7-11 7z',
      clockText: m.frames.length > 1 ? (this.state.frame / (m.frames.length - 1) * m.period).toFixed(2) + ' s' : '',
      scrub: m.frames.length > 1 ? Math.round(this.state.frame / (m.frames.length - 1) * 100) + '%' : '0%',
      hasIssue: !!issue,
      issueTitle: issue ? issue.title : '', issueExplain: issue ? issue.explain : '', issueLabel: issue ? issue.label : '',
      issueSummary: issue ? this.pieces(issue.summary, []) : [],
      fixes: issue ? issue.fixes.map((f) => ({ pieces: this.pieces(f, []) })) : [],
      fixesOpen: this.state.fixes, fixesText: this.state.fixes ? 'Hide fixes' : 'Show fixes',
      fixesIcon: this.state.fixes ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6',
      toggleFixes: () => this.setState({ fixes: !this.state.fixes }),
    };
  }
}
`;

/** A sentence's pieces: text, part links, and terms with their meaning on hover. */
const piecesOf = (list, item) => {
  const link = `<button type="button" class="partLink" onMouseEnter="{{ ${item}.enter }}" onMouseLeave="{{ ${item}.leave }}" onFocus="{{ ${item}.enter }}" onBlur="{{ ${item}.leave }}" onClick="{{ ${item}.press }}">{{ ${item}.label }}</button>`;
  const term = `<button type="button" class="term" onMouseEnter="{{ ${item}.show }}" onMouseLeave="{{ ${item}.hide }}" onFocus="{{ ${item}.show }}" onBlur="{{ ${item}.hide }}">{{ ${item}.text }}</button>`;
  return `<sc-for list="{{ ${list} }}" as="${item}" hint-placeholder-count="6"><sc-if value="{{ ${item}.isText }}" hint-placeholder-val="{{ true }}"><span>{{ ${item}.text }}</span></sc-if><sc-if value="{{ ${item}.isPart }}" hint-placeholder-val="{{ false }}">${link}</sc-if><sc-if value="{{ ${item}.isTerm }}" hint-placeholder-val="{{ false }}">${term}</sc-if></sc-for>`;
};

const chip = (text, bg, color) =>
  `<span style="font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 10px; background: ${bg}; color: ${color}">${text}</span>`;

const sectionHead = (name) =>
  `<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px; border-top: 1px solid ${T.rule}"><span style="font-size: 16px; font-weight: 500; color: ${T.brand}">${name}</span><span style="color: ${T.brand}; display: flex">${icon('up', 20)}</span></div>`;

/** "What is this?": the note, with its parts as links and its terms explained on hover. */
const noteSection = `<div style="padding: 2px 16px 16px">
<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${T.tertiary}">${icon('pen', 14)}Written by AI from the facts above, not measured</div>
<sc-if value="{{ hasLooks }}" hint-placeholder-val="{{ true }}">
<div style="display: flex; align-items: baseline; gap: 10px; margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: ${T.sunken}"><span style="font-size: 12px; color: ${T.secondary}; white-space: nowrap">Looks like</span><span style="font-size: 14px; font-weight: 500; color: ${T.strong}">{{ looksLike }}</span></div>
</sc-if>
<p style="margin: 10px 0 0; font-size: 14px; line-height: 23px; color: ${T.primary}">${piecesOf('paragraph', 'p')}</p>
<sc-if value="{{ hasTerm }}" hint-placeholder-val="{{ false }}">
<div role="status" style="margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: ${T.brandWash}; font-size: 13px; line-height: 18px"><span style="font-weight: 500">{{ term.term }}</span><span style="color: ${T.secondary}"> — {{ term.meaning }}</span></div>
</sc-if>
<sc-if value="{{ hasUses }}" hint-placeholder-val="{{ true }}">
<div style="margin-top: 14px; font-size: 12px; font-weight: 500; color: ${T.secondary}; text-transform: uppercase; letter-spacing: 0.4px">Where you’d find it</div>
<sc-for list="{{ uses }}" as="u" hint-placeholder-count="2">
<div style="margin-top: 6px; font-size: 14px; line-height: 20px"><div style="font-weight: 500; color: ${T.strong}">${piecesOf('u.use', 'x')}</div><div style="color: ${T.secondary}">${piecesOf('u.why', 'y')}</div></div>
</sc-for>
</sc-if>
<div style="display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid ${T.rule}; font-size: 13px; line-height: 18px; color: ${T.secondary}"><span style="display: flex; flex-shrink: 0; color: ${T.brand}">${icon('point', 18)}</span><span>Point at a blue part name to find it on the grid; press it to select the part.</span></div>
</div>`;

/** What stands in the note's place when the machine cannot run: a pointer to its fix. */
const blockedSection = `<div style="padding: 2px 16px 16px; font-size: 14px; line-height: 21px; color: ${T.primary}">
PMKS+ describes a mechanism once it runs. Mechanism {{ machine.label }} needs one fix first: see <span style="font-weight: 500">Analysis setup</span>, open on the right.
</div>`;

/** The machine's panel, or, once a part is pressed, the part's own. */
function panel(titleVerb, statusChip, whatBody, partVerb = 'Kinematic Analysis for') {
  return `<sc-if value="{{ showMachine }}" hint-placeholder-val="{{ true }}">
<div style="padding: 14px 16px 12px">
<div style="font-size: 20px; font-weight: 500; color: ${T.strong}">${titleVerb} Mechanism {{ machine.label }}</div>
<div style="margin-top: 8px">${statusChip}</div>
</div>
${sectionHead('Mechanism Overview')}
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; padding: 4px 16px 14px">
<sc-if value="{{ hasFamily }}" hint-placeholder-val="{{ true }}"><div style="grid-column: 1 / span 2"><div style="font-size: 12px; color: ${T.secondary}">Family</div><div style="font-size: 14px; color: ${T.strong}; margin-top: 2px">{{ family }}</div></div></sc-if>
<sc-for list="{{ overview }}" as="o" hint-placeholder-count="5"><div><div style="font-size: 12px; color: ${T.secondary}">{{ o.label }}</div><div style="font-size: 14px; color: ${T.strong}; margin-top: 2px">{{ o.value }}</div></div></sc-for>
</div>
${sectionHead('Links')}
<div style="padding: 0 0 10px">
<sc-for list="{{ links }}" as="l" hint-placeholder-count="4">
<div style="display: flex; align-items: baseline; gap: 12px; padding: 4px 16px; font-size: 14px">
<span style="min-width: 64px"><button type="button" class="partLink" onMouseEnter="{{ l.enter }}" onMouseLeave="{{ l.leave }}" onFocus="{{ l.enter }}" onBlur="{{ l.leave }}" onClick="{{ l.press }}">{{ l.label }}</button></span>
<span style="flex-grow: 1; color: ${T.secondary}">{{ l.job }}</span>
<span style="color: ${T.secondary}; white-space: nowrap">{{ l.length }}</span>
</div>
</sc-for>
</div>
${sectionHead('What is this?')}
${whatBody}
</sc-if>
<sc-if value="{{ showPart }}" hint-placeholder-val="{{ false }}">
<div style="padding: 12px 16px">
<button type="button" class="textButton" onClick="{{ back }}" style="margin: 0 0 8px -6px; font-size: 13px">${icon('back', 16)}Mechanism {{ machine.label }}</button>
<div style="font-size: 20px; font-weight: 500; color: ${T.strong}">${partVerb} {{ selKind }} {{ selLabel }}</div>
<div style="font-size: 13px; color: ${T.secondary}; margin-top: 4px">Selected from its name: the part the grid shows in amber.</div>
</div>
<sc-for list="{{ graphs }}" as="g" hint-placeholder-count="3">
<div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid ${T.rule}; font-size: 15px"><span>{{ g }}</span><span style="display: flex; color: ${T.secondary}">${icon('chevron', 18)}</span></div>
</sc-for>
</sc-if>`;
}

/** The setup drawer's issue block, as the branch draws it, with the fixes open. */
const setupDrawer = `<div style="position: absolute; right: 12px; top: 72px; width: 348px; background: #fff; border-radius: 8px; border-top: 4px solid ${T.brand}; box-shadow: 0 2px 6px rgba(0,0,0,0.2)">
<div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px"><span style="font-size: 20px; font-weight: 500; color: ${T.strong}">Analysis setup</span><span style="display: flex; color: ${T.secondary}">${icon('close', 20)}</span></div>
<div style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid ${T.rule}"><span style="font-size: 16px; font-weight: 500; color: ${T.brand}; text-decoration: underline">Mechanism M1</span>${chip('1 fix', T.dangerBg, T.dangerText)}</div>
<div style="display: flex; gap: 10px; padding: 6px 16px 16px">
<span style="display: flex; flex-shrink: 0; color: ${T.danger}">${icon('error', 20, T.danger, 2)}</span>
<div style="font-size: 13px; line-height: 20px">
<div style="font-size: 14px; font-weight: 500; color: ${T.strong}">{{ issueTitle }}</div>
<p style="margin: 2px 0 6px">${piecesOf('issueSummary', 'q')}</p>
<button type="button" class="textButton" onClick="{{ toggleFixes }}" style="margin-left: -6px; font-size: 13px; font-weight: 500">{{ fixesText }}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{{ fixesIcon }}"></path></svg></button>
<sc-if value="{{ fixesOpen }}" hint-placeholder-val="{{ true }}">
<p style="margin: 6px 0; color: ${T.secondary}">{{ issueExplain }}</p>
<p style="margin: 6px 0 2px; font-weight: 500; color: ${T.dangerText}">{{ issueLabel }}</p>
<sc-for list="{{ fixes }}" as="f" hint-placeholder-count="2"><div style="padding: 2px 0">• ${piecesOf('f.pieces', 'z')}</div></sc-for>
</sc-if>
</div>
</div>
</div>`;

/** One app screen: the chrome, the panel, the canvas, the playback bar. */
function appScreen({ title, data, mode, panelHtml, drawer = '', status }) {
  const tab = (name, glyph, chipText, chipBg, chipColor, active) =>
    `<div style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 6px; ${active ? `border: 1px solid ${T.brand}; background: ${T.brandWash}; color: ${T.brand};` : `border: 1px solid transparent; color: ${T.primary};`} font-size: 15px; font-weight: 500">${icon(glyph, 20)}<span>${name}</span>${chipText ? chip(chipText, chipBg, chipColor) : ''}</div>`;
  const blocked = mode === 'edit';
  return `${HEAD(title)}<div style="position: relative; width: 1440px; height: 900px; overflow: hidden; background-color: #fff; background-image: linear-gradient(#eef0f4 1px, transparent 1px), linear-gradient(90deg, #eef0f4 1px, transparent 1px); background-size: 26px 26px; font-family: Roboto, 'Helvetica Neue', sans-serif">
<svg width="1440" height="900" viewBox="0 0 1440 900" style="position: absolute; left: 0; top: 0" role="img" aria-label="The mechanism on the grid">
<sc-for list="{{ halo }}" as="h" hint-placeholder-count="0"><path d="{{ h.d }}" fill="none" stroke="${T.selection}" stroke-width="{{ h.width }}" stroke-linecap="round" stroke-linejoin="round" opacity="{{ h.opacity }}"></path></sc-for>
<sc-for list="{{ guides }}" as="g" hint-placeholder-count="0"><path d="{{ g.d }}" stroke="${T.ink}" stroke-width="3" stroke-dasharray="2 5" fill="none"></path></sc-for>
<sc-for list="{{ traced }}" as="t" hint-placeholder-count="0"><polyline points="{{ t.points }}" fill="none" stroke="#ef5350" stroke-width="1.6" opacity="0.8"></polyline></sc-for>
<sc-for list="{{ discs }}" as="c" hint-placeholder-count="0"><circle cx="{{ c.cx }}" cy="{{ c.cy }}" r="{{ c.r }}" fill="${T.brandTint}" stroke="{{ c.color }}" stroke-width="4" opacity="0.9"></circle></sc-for>
<sc-for list="{{ bodies }}" as="b" hint-placeholder-count="3"><path d="{{ b.d }}" fill="{{ b.fill }}" fill-opacity="0.55" stroke="{{ b.color }}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="{{ b.faded }}"></path></sc-for>
<sc-for list="{{ cylinders }}" as="c" hint-placeholder-count="0"><path d="{{ c.d }}" stroke="#0d125a" stroke-width="16" stroke-linecap="round"></path></sc-for>
<sc-for list="{{ joints }}" as="j" hint-placeholder-count="4"><g>
<sc-if value="{{ j.ground }}" hint-placeholder-val="{{ false }}"><path d="{{ j.hatch }}" stroke="${T.ink}" stroke-width="1.6" fill="none"></path><polygon points="{{ j.tri }}" fill="${T.ink}"></polygon></sc-if>
<circle cx="{{ j.x }}" cy="{{ j.y }}" r="6" fill="#fffde7" stroke="${T.ink}" stroke-width="1.6"></circle>
<text x="{{ j.lx }}" y="{{ j.ly }}" font-size="12" font-weight="500" fill="${T.ink}" font-family="Roboto, sans-serif">{{ j.label }}</text>
</g></sc-for>
</svg>
<div style="position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.18)">
${icon('menu', 22, T.primary)}
<span style="font-weight: 700; font-size: 16px; color: ${T.brandDark}; letter-spacing: 0.3px">PMKS+</span>
</div>
<div style="position: absolute; left: 132px; top: 12px; display: flex; align-items: center; gap: 6px; height: 48px; padding: 0 8px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.18)">
${tab('Synthesis', 'synth')}
${tab('Edit', 'edit', '', '', '', blocked)}
<div style="width: 1px; height: 24px; background: ${T.divider}"></div>
${blocked ? tab('Kinematic Analysis', 'kin', '1 fix', T.dangerBg, T.dangerText) : tab('Kinematic Analysis', 'kin', 'Ready', T.successBg, T.successText, true)}
${tab('Force Analysis', 'force', '1 to set', T.chip, T.secondary)}
</div>
<div style="position: absolute; right: 12px; top: 12px; display: flex; align-items: center; gap: 4px; height: 48px; padding: 0 12px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.18); color: ${T.tertiary}; font-size: 14px">
<span style="display: flex; align-items: center; gap: 6px; padding: 0 8px">${icon('undo', 18)}Undo</span>
<span style="display: flex; align-items: center; gap: 6px; padding: 0 8px">${icon('redo', 18)}Redo</span>
${blocked ? '' : `<span style="display: flex; align-items: center; gap: 6px; padding: 0 8px; color: ${T.primary}">${icon('down', 18)}Export Data</span>`}
</div>
<div style="position: absolute; left: 12px; top: 72px; width: 400px; max-height: 718px; overflow-y: auto; background: #fff; border-radius: 8px; border-top: 4px solid ${T.brand}; box-shadow: 0 2px 6px rgba(0,0,0,0.2)">
${panelHtml}
</div>
${drawer}
<sc-if value="{{ several }}" hint-placeholder-val="{{ false }}">
<div style="position: absolute; left: 566px; top: 694px; display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 12px; background: #fff; border-radius: 6px 6px 0 0; box-shadow: 0 -1px 2px rgba(0,0,0,0.08); font-size: 13px; color: ${T.secondary}">${icon('sync', 14)}Synchronize mechanisms</div>
</sc-if>
<div style="position: absolute; left: 377px; bottom: 38px; display: flex; align-items: center; gap: 10px; height: 60px; padding: 0 14px; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.2)">
<span style="font-size: 14px; color: ${T.secondary}; width: 28px; text-align: center">1x</span>
<button type="button" aria-label="Play or pause" onClick="{{ togglePlay }}" style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: none; border-radius: 6px; background: ${blocked ? T.chip : T.brand}; cursor: pointer"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="{{ playIcon }}"></path></svg></button>
<span style="display: flex; color: ${T.tertiary}">${icon('stop', 20)}</span>
</div>
<div style="position: absolute; left: 549px; bottom: 38px; width: 520px; padding: 6px 0; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.2)">
<sc-for list="{{ rows }}" as="r" hint-placeholder-count="1">
<button type="button" class="rowButton" onClick="{{ r.pick }}" style="background: {{ r.bg }}">
<span style="font-size: 13px; font-weight: 500; color: ${T.brand}; width: 24px">{{ r.label }}</span>
${blocked ? `${chip('1 fix', T.dangerBg, T.dangerText)}<span style="font-size: 13px; color: ${T.primary}; flex-grow: 1">before it will run.</span><span style="font-size: 13px; color: ${T.brand}">Analysis setup</span>` : `<span style="font-size: 12px; color: ${T.secondary}; flex-grow: 1">Counter-clockwise · Reverses</span><span style="font-size: 12px; color: ${T.secondary}">{{ clockText }}</span>`}
</button>
</sc-for>
<div style="margin: 2px 16px 4px; height: 4px; border-radius: 2px; background: ${T.brandPale}"><div style="width: {{ scrub }}; height: 4px; border-radius: 2px; background: ${T.brand}"></div></div>
</div>
<div style="position: absolute; right: 12px; bottom: 38px; display: flex; align-items: center; gap: 2px; height: 60px; padding: 0 8px; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.2)">
<button type="button" class="iconButton" aria-label="Show center of mass">${icon('com')}</button>
<button type="button" class="iconButton" aria-label="Show joint names" style="background: ${T.chip}">${icon('abc')}</button>
<button type="button" class="iconButton" aria-label="Show traced paths">${icon('trace')}</button>
<div style="width: 1px; height: 24px; background: ${T.divider}"></div>
<button type="button" class="iconButton" aria-label="Zoom out">${icon('zoomOut')}</button>
<button type="button" class="iconButton" aria-label="Zoom in">${icon('zoomIn')}</button>
<button type="button" class="iconButton" aria-label="Fit to view">${icon('fit')}</button>
</div>
<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 28px; display: flex; align-items: center; gap: 18px; padding: 0 14px; background: #fff; border-top: 1px solid ${T.rule}; font-size: 13px; color: ${T.secondary}">
<span style="font-weight: 500; color: ${T.primary}">${blocked ? 'Edit' : 'Kinematic'}</span>
<span style="flex-grow: 1">${status}</span>
<span>Units: {{ machine.unit }}, g, N, degrees</span>
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
${SCRIPT}
</script>
</body>
</html>
`;
}

/** The section's other faces, side by side: writing, failed, busy, and out of date. */
function statesBoard() {
  const card = (title, body) =>
    `<div style="width: 400px; background: #fff; border-radius: 8px; border-top: 4px solid ${T.brand}; box-shadow: 0 2px 6px rgba(0,0,0,0.2)">
<div style="padding: 12px 16px 4px; font-size: 13px; font-weight: 500; color: ${T.tertiary}; text-transform: uppercase; letter-spacing: 0.4px">${title}</div>
${sectionHead('What is this?')}
<div style="padding: 2px 16px 18px; font-size: 14px; line-height: 21px; color: ${T.primary}">${body}</div>
</div>`;
  const bar = (w) =>
    `<div style="height: 10px; width: ${w}; border-radius: 5px; background: ${T.chip}; margin-top: 10px"></div>`;
  const retry = (label, enabled = true) =>
    `<button type="button" class="textButton" style="margin-top: 10px; margin-left: -6px; font-weight: 500; ${enabled ? '' : `color: ${T.tertiary}; cursor: default`}">${icon('refresh', 16)}${label}</button>`;
  return `${HEAD('States of the note')}<div style="width: 920px; height: 700px; box-sizing: border-box; padding: 40px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; background: ${T.sunken}; font-family: Roboto, 'Helvetica Neue', sans-serif">
${card(
  'Writing',
  `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${T.tertiary}">${icon('pen', 14)}Writing a plain-English note…</div>${bar('100%')}${bar('92%')}${bar('96%')}${bar('60%')}<div style="margin-top: 12px; font-size: 13px; color: ${T.secondary}">Two to twelve seconds. The Overview and Links above are PMKS+’s own and are already here.</div>`
)}
${card(
  'Could not be written',
  `The plain-English note could not be written this time. Everything above is computed by PMKS+ and is unaffected.${retry('Try again')}`
)}
${card(
  'Busy',
  `Notes are busy right now: too many are being written at once. Try again in a minute.${retry('Try again in 0:48', false)}`
)}
${card(
  'The mechanism changed',
  `<div style="padding: 8px 10px; border-radius: 6px; background: ${T.warningBg}; color: ${T.warningText}; font-size: 13px">This note was written before your last edit, so it may no longer match.</div><div style="margin-top: 10px; color: ${T.secondary}">The earlier note stays below, faded, until a new one is written.</div>${retry('Write it again')}`
)}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":920,"height":700}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
}

const analysisPanel = panel('Analysis for', chip('Ready', T.successBg, T.successText), noteSection);
const files = {
  'Main.dc.html': appScreen({
    title: 'One mechanism',
    data: read('single'),
    mode: 'analysis',
    panelHtml: analysisPanel,
    status: 'Drag to tune · build in Edit',
  }),
  'Several.dc.html': appScreen({
    title: 'Several mechanisms',
    data: read('several'),
    mode: 'analysis',
    panelHtml: analysisPanel,
    status: 'Each mechanism has its own note: choose M1 or M2 in the playback bar',
  }),
  'Gated.dc.html': appScreen({
    title: 'Nothing names it',
    data: read('gated'),
    mode: 'analysis',
    panelHtml: analysisPanel,
    status: 'Drag to tune · build in Edit',
  }),
  'Blocked.dc.html': appScreen({
    title: 'It does not run',
    data: read('blocked'),
    mode: 'edit',
    panelHtml: panel('Edit', chip('1 fix', T.dangerBg, T.dangerText), blockedSection, 'Edit'),
    drawer: setupDrawer,
    status: '1 fix before analysis',
  }),
  'States.dc.html': statesBoard(),
};

const board = (x, y, w, h, title) => ({ x, y, w, h, title, is_interactive: true });
const canvas = {
  v: 3,
  createdOnFiles: { v: 1, at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') },
  title: 'What Is This? in PMKS+',
  launch: { view: 'canvas' },
  pages: [],
  boards: {
    'Main.dc.html': board(0, 0, 1440, 900, 'One mechanism: the note in its panel'),
    'Several.dc.html': board(1520, 0, 1440, 900, 'Several mechanisms: a note each'),
    'Gated.dc.html': board(3040, 0, 1440, 900, 'Nothing names it: no "Looks like", no uses'),
    'Blocked.dc.html': board(0, 1020, 1440, 900, 'It does not run: the fix instead of a note'),
    'States.dc.html': { x: 1520, y: 1020, w: 920, h: 700, title: 'The note’s other states' },
  },
  order: ['Main.dc.html', 'Several.dc.html', 'Gated.dc.html', 'Blocked.dc.html', 'States.dc.html'],
  notes: {
    heading: {
      x: 0,
      y: -300,
      text: '"What is this?" in the Analysis panel, one note per mechanism',
      kind: 'title1',
      maxW: 4480,
    },
    how: {
      x: 2560,
      y: 1020,
      w: 420,
      maxH: 700,
      text: 'Written by Gemini 3.5 Flash-Lite from fact sheet v9, blind; every note was made safe by PMKS+ before it shows (note-prose.ts): part names become the same part links the setup drawer uses, whether or not the model bolded them; "Looks like" and uses show only when the author named parts or PMKS+ matched a family that points at a machine, or a background photo is there; a "Looks like" that only repeats the family is dropped. Point at a blue part name to light it on the grid; press it to select it. Several mechanisms: press M1 or M2 in the playback bar.',
      color: 'blue',
    },
  },
  designSystems: [],
};
writeFileSync(join(out, 'canvas.json'), JSON.stringify(canvas, null, 2));
for (const [name, html] of Object.entries(files)) writeFileSync(join(out, name), html);
console.log(`wrote canvas.json and ${Object.keys(files).join(', ')} to ${out}`);
