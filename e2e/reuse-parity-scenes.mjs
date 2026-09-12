/**
 * The scenes `reuse-parity.mjs` photographs, and the clicks that reach them.
 *
 * One scene per place the reuse backlog touches, plus the neighbors those
 * edits could disturb. A scene is deliberately a *pose*: a panel opened, a
 * section expanded, a control hovered or focused — never the animating canvas,
 * which is compared by the suites that own it.
 *
 * `clip` is the element photographed. Prefer the smallest box that contains
 * the change: a whole-viewport shot fails on anything, and then says nothing
 * about what moved.
 */

/**
 * A window that has been here before and has seen this release, so neither
 * the tutorial nor the release notes greets the scene uninvited. The same two
 * marks `quiet-start.mjs` uses.
 */
const QUIET = { tutorialSeen: 'true', whatsNewSeen: '2026.09' };

/** The four mode tabs, by the order they sit in the top strip. */
const MODE = { synthesis: 0, edit: 1, kinematic: 2, force: 3 };

/** Reopen the tutorial from the project menu, where a returning reader finds it. */
const openTutorial = async (page) => {
  await page.locator('.brandCard .iconButton').click();
  await page.locator('#tutorialButton').click();
  await page.locator('app-tutorial-panel').waitFor({ state: 'visible' });
};

const clickMode = (page, which) => page.locator('.tabStrip .tabButton').nth(MODE[which]).click();

/** Open a right-drawer page by its number (the statics on RightPanelComponent). */
const openDrawer = (page, n) =>
  page.evaluate(
    (n) => ng.getComponent(document.querySelector('app-right-panel')).constructor.tabClicked(n),
    n
  );

/** Select something on the canvas, which is what makes the Edit panel show a form. */
const selectFirstJoint = async (page) => {
  await page.locator('.joint, [id^="joint"]').first().click({ force: true });
};

/**
 * Select a whole machine, which is the only thing that draws the mechanism
 * panel. A background click selects the *grid*, not the mechanism, so this
 * goes through the service the way the setup drawer's own link does.
 */
const selectMechanism = (page, index = 0) =>
  page.evaluate((i) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.selectMechanism(i);
    ng.applyChanges(grid);
  }, index);

export const SCENES = [
  // ---------------------------------------------------------------- top strip
  {
    name: 'top-bar chips, valid mechanism',
    linkage: '4-Bar',
    clip: 'app-top-bar .topStrip',
  },
  {
    name: 'top-bar chips, blocked mechanism',
    // An empty drawing cannot be analyzed, so every chip shows its blocker.
    query: '',
    clip: 'app-top-bar .topStrip',
  },
  {
    name: 'top-bar corner card in analysis',
    linkage: '4-Bar',
    setup: (page) => clickMode(page, 'kinematic'),
    clip: 'app-top-bar .topStrip',
  },

  // ------------------------------------------------------------ left mode card
  {
    name: 'synthesis panel',
    linkage: '4-Bar',
    setup: (page) => clickMode(page, 'synthesis'),
    clip: 'app-left-tabs .panel',
  },
  {
    name: 'synthesis panel on empty drawing',
    query: '',
    setup: (page) => clickMode(page, 'synthesis'),
    clip: 'app-left-tabs .panel',
  },
  {
    name: 'edit panel, nothing selected',
    linkage: '4-Bar',
    setup: (page) => clickMode(page, 'edit'),
    clip: 'app-left-tabs .panel',
  },
  {
    name: 'edit panel, joint selected',
    linkage: '4-Bar',
    setup: async (page) => {
      await clickMode(page, 'edit');
      await selectFirstJoint(page);
    },
    clip: 'app-left-tabs .panel',
  },
  {
    name: 'mechanism panel, editable',
    linkage: '4-Bar',
    setup: async (page) => {
      await clickMode(page, 'edit');
      await selectMechanism(page);
    },
    clip: '.mechanismPanel',
  },
  {
    name: 'mechanism panel, read-only in analysis',
    linkage: '4-Bar',
    setup: async (page) => {
      await clickMode(page, 'kinematic');
      await selectMechanism(page);
    },
    clip: '.mechanismPanel',
  },
  {
    name: 'kinematic analysis panel',
    linkage: '4-Bar',
    setup: (page) => clickMode(page, 'kinematic'),
    clip: 'app-left-tabs .panel',
  },
  {
    name: 'force analysis panel',
    linkage: '4-Bar',
    setup: (page) => clickMode(page, 'force'),
    clip: 'app-left-tabs .panel',
  },

  // ------------------------------------------------------------- right drawer
  {
    name: 'drawer settings',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 1),
    clip: '#rightPanel',
  },
  {
    name: 'drawer help',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 3),
    clip: '#rightPanel',
  },
  {
    name: 'drawer debug and linkage table',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 4),
    clip: '#rightPanel',
  },
  {
    name: 'drawer kinematic setup',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 5),
    clip: '#rightPanel',
  },
  {
    name: 'drawer force setup',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 6),
    clip: '#rightPanel',
  },
  {
    name: 'drawer export',
    linkage: '4-Bar',
    setup: (page) => openDrawer(page, 7),
    clip: '#rightPanel',
  },
  {
    name: 'drawer force setup on empty drawing',
    query: '',
    setup: (page) => openDrawer(page, 6),
    clip: '#rightPanel',
  },

  // ---------------------------------------------------- tutorial and dialogs
  {
    name: 'tutorial card, first step',
    query: '',
    storage: QUIET,
    setup: openTutorial,
    clip: 'app-tutorial-panel',
  },
  {
    name: 'tutorial card, chip hint on step four',
    linkage: '4-Bar',
    storage: QUIET,
    setup: async (page) => {
      await openTutorial(page);
      // Step four is the one lesson about the app rather than about linkages,
      // and the only place the tutorial quotes a readiness chip.
      await page.evaluate(() => {
        const card = ng.getComponent(document.querySelector('app-tutorial-panel'));
        card.tutorial.goToStep(4);
        ng.applyChanges(card);
      });
    },
    clip: 'app-tutorial-panel',
  },
  {
    name: 'mechanism library',
    linkage: '4-Bar',
    storage: QUIET,
    setup: async (page) => {
      await page.locator('.brandCard .iconButton').click();
      await page.locator('#templatesButton').click();
      await page.locator('#templates').waitFor({ state: 'visible' });
    },
    clip: '#templates',
    settle: 900,
    expectedChange:
      'the close button is now one shared control, 32px and round. This one was a Material 40px icon button. Part of the deliberate unification of five different close buttons.',
  },
  {
    name: 'release notes',
    linkage: '4-Bar',
    // A window that has been here before, but not since this release: the one
    // state that opens the notes.
    storage: { tutorialSeen: 'true' },
    clip: '#whatsNew',
    settle: 900,
    expectedChange:
      'the close button is now one shared control, 32px and round. This one was a 36px with 6px corners. Part of the deliberate unification of five different close buttons.',
  },
  {
    name: 'CAD export dialog',
    linkage: '4-Bar',
    storage: QUIET,
    setup: async (page) => {
      await page.getByRole('button', { name: 'Project menu' }).click();
      await page.getByRole('button', { name: 'CAD Export' }).click();
      await page.locator('app-drawing-export').waitFor({ state: 'visible' });
    },
    clip: '.drawingExport',
    settle: 900,
    expectedChange:
      'the close button is now one shared control, 32px and round. This one was a Material 40px icon button. Part of the deliberate unification of five different close buttons.',
  },

  // -------------------------------------------------------- bottom furniture
  {
    name: 'playback bar',
    linkage: '4-Bar',
    clip: 'app-playback-bar .playbackRow',
  },
  {
    name: 'playback bar, two machines',
    linkage: 'Slider_Crank',
    clip: 'app-playback-bar .playbackRow',
  },
  {
    name: 'view controls',
    linkage: '4-Bar',
    clip: 'app-view-controls',
  },
  {
    name: 'bottom bar',
    linkage: '4-Bar',
    clip: '#bottomBar',
  },

  // ------------------------------------------------------------------- phone
  // Below the one breakpoint several of these rules change or switch off, and
  // two of the backlog's items are rules that currently reach each other
  // across a media query. A desktop-only comparison would not see it.
  {
    name: 'phone playback bar',
    linkage: '4-Bar',
    viewport: 'phone',
    storage: QUIET,
    clip: 'app-playback-bar .playbackRow',
  },
  {
    name: 'phone export drawer',
    linkage: '4-Bar',
    viewport: 'phone',
    storage: QUIET,
    setup: (page) => openDrawer(page, 7),
    clip: '#rightPanel',
    expectedChange:
      "each object's note ('grounded, input') is back. The playback bar's " +
      '.rowNote rule was written without a container selector, so below the ' +
      'phone breakpoint its display:none was hiding notes in a panel it has ' +
      'nothing to do with. Scoping that rule is the fix.',
  },
  {
    name: 'phone force setup drawer',
    linkage: '4-Bar',
    viewport: 'phone',
    storage: QUIET,
    setup: (page) => openDrawer(page, 6),
    clip: '#rightPanel',
  },
  {
    name: 'phone mechanism library',
    linkage: '4-Bar',
    viewport: 'phone',
    storage: QUIET,
    setup: async (page) => {
      await page.locator('.brandCard .iconButton').click();
      await page.locator('#templatesButton').click();
      await page.locator('#templates').waitFor({ state: 'visible' });
    },
    clip: '#templates',
    settle: 900,
    expectedChange:
      'the close button is now one shared control, 32px and round. This one was a Material 40px icon button. Part of the deliberate unification of five different close buttons.',
  },
  {
    name: 'phone top strip',
    linkage: '4-Bar',
    viewport: 'phone',
    storage: QUIET,
    clip: 'app-top-bar .topStrip',
  },
];
