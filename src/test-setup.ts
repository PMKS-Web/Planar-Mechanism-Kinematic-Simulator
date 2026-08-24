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
 * Raised rather than the specs split up: the work is genuine numeric work and
 * a slow test is not a failing one. A test that hangs still fails, four times
 * later than it used to.
 */
vi.setConfig({ testTimeout: 20000 });

beforeEach(() => {
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
