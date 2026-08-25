/**
 * One known drawing scale at the start of every test.
 *
 * `SettingsService.objectScale` is a process-wide static, and the solver
 * measures real things against it: a cylinder's stroke, the ends of a slot, the
 * tolerance a sealed cylinder's collinearity is judged by. Specs that need a
 * particular scale set it — and, until this file existed, walked away, so the
 * next spec in the worker inherited whatever the last one wanted.
 *
 * That is what made the suite intermittently red in a way that moved around:
 * `url-sealed-cylinder`, `cylinder-lifecycle`, `mechanism.service` and
 * `input-toggle` all failed on different runs of the same commit, each time
 * because a mechanism had been solved at a scale its assertions were not
 * written for.
 *
 * Fixtures built through `buildMechanism` pin their own scale and put it back;
 * this covers everything else — anything assembled by hand, or through
 * `MechanismBuilder` or the test harness.
 */
import { beforeEach, vi } from 'vitest';
import { SettingsService } from './app/services/settings.service';
import { MODEL_SCALE } from './app/model/render-scale';

/**
 * Long enough for the specs that solve a mechanism per assertion.
 *
 * Vitest allows a test five seconds. Most here want milliseconds, but a
 * handful walk the whole fixture gallery — sixty-odd mechanisms, each solved
 * through a full cycle and encoded — and those take about three seconds on an
 * idle machine. Three of five is fine until the workers are all busy or the
 * laptop is doing something else, at which point they cross the line and the
 * suite goes red somewhere different every run, which reads as a real
 * intermittent bug and costs an afternoon before it turns out to be a clock.
 *
 * Twenty was not enough either. `fixture-gallery` and `template-payloads` both
 * crossed it on a machine running a production build and a handful of dev
 * servers alongside the suite — seven red tests that all passed on their own a
 * minute later. That is the same failure the paragraph above describes, at a
 * larger number, and the fix is the same: a machine under load is the ordinary
 * case on a laptop, not the corner.
 *
 * Sixty is about twenty times the idle cost of the slowest spec here, which is
 * enough that crossing it means something is genuinely wrong rather than
 * merely busy. Raised rather than the specs split up: the work is genuine
 * numeric work and a slow test is not a failing one. A test that hangs still
 * fails, later than it used to.
 *
 * `hookTimeout` with it: the setup that builds a fixture before a test is the
 * same work under the same load, and a suite whose hooks time out at five
 * seconds is red for the same reason its tests were.
 */
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

beforeEach(() => {
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
