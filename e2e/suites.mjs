/**
 * Every script in `e2e/`, and which CI lane it runs in.
 *
 * There is no test runner here, so there is nothing that knows the suites exist.
 * This is that list, and `run-suites.mjs` is what walks it. A script in `e2e/`
 * that neither list below names runs in the nightly until it is added, so a suite
 * added tomorrow is covered the night it lands without failing anyone's check.
 *
 * **`gate`** runs on every pull request, sharded four ways, and is meant to stay
 * around ten minutes. A suite is in it because it is quick and has been steady —
 * not because it matters more. The suites carry something like twelve hundred
 * fixed waits between them, tuned on the machines they were written on, and a
 * shared runner is slower and noisier than any of those. A required check that
 * goes red for that reason teaches people to press re-run, and a check people
 * press re-run on is worse than no check, because it costs attention and buys
 * nothing.
 *
 * **`nightly`** runs the lot against `staging` at 09:00 UTC, sharded eight ways,
 * retrying once so it can tell a break from a flake. Nobody waits for it, so it
 * can afford the quarter-hour audits. **This is where a suite earns the gate**:
 * move one across once it has been green for a couple of weeks, and move it back
 * out the first week it is not.
 *
 * `seconds` is roughly what the suite took on the machine that last measured it.
 * It is only used to balance the shards, so a stale number costs balance and
 * never correctness — and a run that overshoots its own estimate says so, which
 * is the cue to correct it.
 */

const BOTH = ['gate', 'nightly'];
const NIGHTLY = ['nightly'];

export const SUITES = [
  { name: 'analysis-audit', seconds: 224, lanes: NIGHTLY },
  { name: 'analysis-drawing-switches', seconds: 11, lanes: BOTH },
  { name: 'analysis-editing', seconds: 42, lanes: NIGHTLY },
  { name: 'analysis-setup', seconds: 8, lanes: BOTH },
  { name: 'attach-cylinder', seconds: 9, lanes: BOTH },
  { name: 'background-image', seconds: 26, lanes: BOTH },
  { name: 'circular-link', seconds: 4, lanes: BOTH },
  { name: 'context-menu', seconds: 26, lanes: BOTH },
  {
    name: 'context-menu-modes',
    seconds: 34,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'creation-previews', seconds: 27, lanes: BOTH },
  { name: 'cylinder-attach', seconds: 11, lanes: BOTH },
  { name: 'cylinder-drag', seconds: 12, lanes: BOTH },
  { name: 'cylinder-end-on-joint', seconds: 4, lanes: BOTH },
  { name: 'cylinder-mount', seconds: 36, lanes: BOTH },
  { name: 'cylinder-mount-render', seconds: 17, lanes: BOTH },
  { name: 'cylinder-panel', seconds: 16, lanes: BOTH },
  { name: 'cylinder-skin', seconds: 9, lanes: BOTH },
  {
    name: 'detail-fixes',
    seconds: 69,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'disabled-toggles', seconds: 5, lanes: BOTH },
  { name: 'dxf-sweep', seconds: 122, lanes: NIGHTLY },
  { name: 'edit-playback', seconds: 46, lanes: NIGHTLY },
  { name: 'edit-undo', seconds: 40, lanes: BOTH },
  { name: 'export-flow', seconds: 47, lanes: NIGHTLY },
  { name: 'field-overlay-reassert', seconds: 5, lanes: BOTH },
  {
    name: 'force-analysis-panels',
    seconds: 23,
    lanes: NIGHTLY,
    note: 'Launches whatever Chrome the machine has, by path, rather than the Chromium Playwright pins — so on a runner it drives whatever was installed that morning. On the first Linux run its own checks passed and `page.screenshot` then hung for thirty seconds. The gate installs Chromium only; this is why.',
  },
  { name: 'force-edit', seconds: 39, lanes: BOTH },
  { name: 'force-labels-and-legend', seconds: 20, lanes: BOTH },
  { name: 'force-units', seconds: 21, lanes: BOTH },
  {
    name: 'full-tour',
    seconds: 16,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'gallery-sweep', seconds: 236, lanes: NIGHTLY },
  { name: 'hover-dimensions', seconds: 34, lanes: BOTH },
  { name: 'input-settings-and-playback', seconds: 13, lanes: BOTH },
  {
    name: 'interaction-sweep',
    seconds: 425,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'keyboard-shortcuts', seconds: 33, lanes: BOTH },
  {
    name: 'left-nav-modes',
    seconds: 18,
    lanes: NIGHTLY,
    note: 'Launches whatever Chrome the machine has, by path, rather than the Chromium Playwright pins — so on a runner it drives whatever was installed that morning. On the first Linux run its own checks passed and `page.screenshot` then hung for thirty seconds. The gate installs Chromium only; this is why.',
  },
  { name: 'link-holds', seconds: 21, lanes: BOTH },
  { name: 'link-holds-angles', seconds: 6, lanes: BOTH },
  { name: 'link-labels', seconds: 35, lanes: BOTH },
  { name: 'locking', seconds: 21, lanes: BOTH },
  { name: 'mechanism-panel', seconds: 97, lanes: NIGHTLY },
  { name: 'menu-focus', seconds: 6, lanes: BOTH },
  { name: 'mobile', seconds: 81, lanes: NIGHTLY },
  { name: 'multi-mechanism-smoke', seconds: 3, lanes: BOTH },
  {
    name: 'multi-select-and-dxf',
    seconds: 59,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'notifications', seconds: 43, lanes: NIGHTLY },
  { name: 'phase1-drag', seconds: 47, lanes: NIGHTLY },
  {
    name: 'phase2-floating-slot',
    seconds: 7,
    lanes: NIGHTLY,
    note: 'Launches whatever Chrome the machine has, by path, rather than the Chromium Playwright pins — so on a runner it drives whatever was installed that morning. On the first Linux run its own checks passed and `page.screenshot` then hung for thirty seconds. The gate installs Chromium only; this is why.',
  },
  {
    name: 'phase3-slide',
    seconds: 8,
    lanes: NIGHTLY,
    note: 'Launches whatever Chrome the machine has, by path, rather than the Chromium Playwright pins — so on a runner it drives whatever was installed that morning. On the first Linux run its own checks passed and `page.screenshot` then hung for thirty seconds. The gate installs Chromium only; this is why.',
  },
  { name: 'phase4-animation', seconds: 21, lanes: BOTH },
  { name: 'phase4-build-from-scratch', seconds: 7, lanes: BOTH },
  { name: 'phase4-corner-arcs', seconds: 47, lanes: NIGHTLY },
  { name: 'phase4-cylinder', seconds: 10, lanes: BOTH },
  { name: 'phase4-gestures', seconds: 49, lanes: NIGHTLY },
  { name: 'phase4-invariants', seconds: 146, lanes: NIGHTLY },
  { name: 'phase4-marks', seconds: 14, lanes: BOTH },
  { name: 'phase4-stack-and-menu', seconds: 19, lanes: BOTH },
  { name: 'phase4-sticky-and-snap', seconds: 13, lanes: BOTH },
  { name: 'phase5-driven-cylinder', seconds: 8, lanes: BOTH },
  { name: 'playback-bar', seconds: 8, lanes: BOTH },
  { name: 'playback-direction', seconds: 13, lanes: BOTH },
  {
    name: 'playback-loop-indicator',
    seconds: 19,
    lanes: NIGHTLY,
    note: 'Launches firefox, webkit. The gate installs neither, and the machine that timed this list had neither, so the number beside it is a boot, not a run.',
  },
  { name: 'playback-stepping', seconds: 159, lanes: NIGHTLY },
  {
    name: 'playback-timing',
    seconds: 24,
    lanes: NIGHTLY,
    note: 'Launches whatever Chrome the machine has, by path, rather than the Chromium Playwright pins — so on a runner it drives whatever was installed that morning. On the first Linux run its own checks passed and `page.screenshot` then hung for thirty seconds. The gate installs Chromium only; this is why.',
  },
  {
    name: 'pointer-pairing',
    seconds: 4,
    lanes: NIGHTLY,
    note: 'Launches webkit. The gate installs neither, and the machine that timed this list had neither, so the number beside it is a boot, not a run.',
  },
  { name: 'posed-drag-fuzz', seconds: 117, lanes: NIGHTLY },
  { name: 'posed-edit-audit', seconds: 637, lanes: NIGHTLY },
  {
    name: 'posed-editing',
    seconds: 72,
    lanes: NIGHTLY,
    note: 'Red on staging when the lanes were written.',
  },
  { name: 'posed-editing-adversarial', seconds: 22, lanes: BOTH },
  { name: 'posed-menu', seconds: 17, lanes: BOTH },
  { name: 'reduced-motion', seconds: 3, lanes: BOTH },
  { name: 'release-export-ui', seconds: 6, lanes: BOTH },
  { name: 'right-drawer', seconds: 10, lanes: BOTH },
  { name: 'snap-alignment', seconds: 18, lanes: BOTH },
  { name: 'snap-to-grid', seconds: 12, lanes: BOTH },
  { name: 'synthesis-redesign', seconds: 94, lanes: NIGHTLY },
  { name: 'template-backdrops', seconds: 2, lanes: BOTH },
  { name: 'template-graphs', seconds: 438, lanes: NIGHTLY },
  { name: 'template-open', seconds: 28, lanes: BOTH },
  { name: 'top-strip-states', seconds: 194, lanes: NIGHTLY },
  { name: 'tutorial', seconds: 52, lanes: NIGHTLY },
  { name: 'two-mechanisms', seconds: 40, lanes: BOTH },
  { name: 'ui-copy', seconds: 18, lanes: BOTH },
  { name: 'unit-undo-view', seconds: 10, lanes: BOTH },
  { name: 'whats-new', seconds: 33, lanes: BOTH },
];

/** Files in `e2e/` that are not suites, and suites no runner can drive. */
export const NOT_RUN = [
  {
    name: 'chrome-provider-parity',
    why: 'Requires a separate untouched staging server through PMKS_BASELINE_URL; compares paired DOM, screenshots and S0 flow filmstrips.',
  },
  { name: 'app-ready', why: 'A helper the suites import: `waitForReady` and `openMechanism`.' },
  { name: 'filmstrip', why: 'A helper: burst frames and the contact sheet that tiles them.' },
  { name: 'quiet-start', why: 'A helper: seeds `localStorage` so no dialog covers the canvas.' },
  { name: 'template-payloads', why: 'A helper: the one reader of `template-linkages.ts`.' },
  {
    name: 'drag-perf-harness',
    why: 'A helper: the drag scenarios and the machinery two scripts share.',
  },
  { name: 'reuse-parity-scenes', why: 'A helper: the scene list `reuse-parity` photographs.' },
  { name: 'run-suites', why: 'The runner that walks this list.' },
  { name: 'suites', why: 'This list.' },
  { name: 'shot', why: 'A tool, not a check: one screenshot of one state, asserting nothing.' },
  {
    name: 'force-status-survey',
    why: 'A tool: prints what force analysis says for each template.',
  },
  { name: 'drag-profile', why: 'A tool: where one scenario’s drag time goes. Read, not judged.' },
  {
    name: 'readme-shots',
    why: 'Rewrites `docs/images/readme/`. A generator dirties the tree it runs in.',
  },
  { name: 'template-thumbnails', why: 'Rewrites `src/assets/gifs/`, and needs macOS `sips`.' },
  { name: 'template-animations', why: 'Rewrites `src/assets/gifs/`, and needs macOS `sips`.' },
  {
    name: 'real-mouse-slots',
    why: 'Drives the real system cursor through a compiled Swift helper and macOS Accessibility permission. A runner has no cursor to drive.',
  },
  {
    name: 'drag-perf',
    why: 'Its baseline is per machine — `drag-perf-baseline.json` records what this hardware managed. A shared runner shares its cores with whoever else is on the box, so the number it produces means nothing against that file.',
  },
  {
    name: 'reuse-parity',
    why: 'Needs a second dev server built from the branch’s base to compare against, and nine of its scenes declare an intended change, so it is green only against the base it was written for.',
  },
  {
    name: 'gallery-parity',
    why: 'Needs two Storybook builds. Worth automating against a pull request’s merge base — it catches what the app suites structurally cannot — but that is a job of its own, not a lane of this one.',
  },
];

export const lanesOf = () => ['gate', 'nightly'];
