/**
 * Change the app from a suite the way a click would: inside Angular's zone.
 *
 * `page.evaluate` runs its function in a task of its own, outside the zone, so
 * Angular never hears that anything happened. A suite that opens a drawer,
 * selects a part or renames one through `ng.getComponent(...)` leaves the
 * change sitting in a field, unrendered, until something else causes a pass.
 *
 * For a long time something always did. The top bar booked an animation frame
 * inside the zone after every pass, which was itself a pass that booked the
 * next one: a whole-app check every frame, forever. Every poke a suite made was
 * on screen within 16 ms, and nobody had to know why. That loop is gone -- it
 * cost every keystroke in every field -- and nine gate suites went red at once,
 * each waiting for a drawer, a panel or a label its own poke had never told
 * Angular about.
 *
 * Inside the zone the poke behaves like the gesture it stands in for: Angular
 * checks the app when it returns, and any timer or promise the poke starts runs
 * inside too, so its later changes reach the screen as well.
 *
 * Use it for pokes, not for reads. Every call is a change-detection pass, and a
 * suite that reads through it on a poll is checking the app on a timer of its
 * own -- which hides exactly the bug the old loop hid: app code that changes
 * state outside the zone and is never rendered for it.
 */

/**
 * Run `work(arg)` in the page, inside Angular's zone, and return its result.
 *
 * `work` is sent as source, the way `page.evaluate` sends it, so it can close
 * over nothing from the suite: pass what it needs as `arg`.
 */
export function inAngular(page, work, arg) {
  return page.evaluate(
    ({ source, arg }) => {
      // The zone is not on `window`; the components that use it hold it. Found
      // by what it can do rather than by its field or class name, which a
      // development build mangles (`_NgZone`) and a refactor renames.
      const isZone = (value) =>
        !!value && typeof value.run === 'function' && typeof value.runOutsideAngular === 'function';
      const zone = ['app-new-grid', 'app-top-bar']
        .map((selector) => document.querySelector(selector))
        .map((host) => (host && window.ng ? window.ng.getComponent(host) : null))
        .flatMap((component) => (component ? Object.values(component) : []))
        .find(isZone);
      if (!zone) throw new Error('inAngular: no NgZone found -- has the app booted?');
      const run = new Function('arg', `return (${source})(arg)`);
      return zone.run(() => run(arg));
    },
    { source: work.toString(), arg }
  );
}

/** The same, handed the canvas component: `work(grid, arg)`. */
export function onGrid(page, work, arg) {
  return inAngular(
    page,
    ({ source, arg }) =>
      new Function('g', 'arg', `return (${source})(g, arg)`)(
        window.ng.getComponent(document.querySelector('app-new-grid')),
        arg
      ),
    { source: work.toString(), arg }
  );
}
