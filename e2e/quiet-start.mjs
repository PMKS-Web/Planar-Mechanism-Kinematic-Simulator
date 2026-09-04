/**
 * The localStorage a check should arrive with when it is not about the door.
 *
 * PMKS+ greets a reader on arrival -- the tutorial for somebody new, the
 * release notes for somebody returning -- and both of them land on top of the
 * app. A suite about the export panel does not want either, so it says it has
 * read them.
 *
 * `whatsNewSeen` has to match `WHATS_NEW_VERSION` in `src/app/model/whats-new.ts`
 * to count. `e2e/whats-new.mjs` asserts the app writes exactly this value, so
 * raising the version there fails one named check here rather than quietly
 * putting a dialog in front of every other suite.
 */
export const QUIET_START = {
  tutorialSeen: 'true',
  whatsNewSeen: '2026.09',
};

/** Apply it to a Playwright context before its first page is opened. */
export const startQuiet = (context) =>
  context.addInitScript((marks) => {
    for (const [key, value] of Object.entries(marks)) localStorage.setItem(key, value);
  }, QUIET_START);
