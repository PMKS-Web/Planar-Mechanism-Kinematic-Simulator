/**
 * Frame-by-frame capture of an interaction, and a contact sheet to read it on.
 *
 * A screenshot proves the end state. It says nothing about the twenty frames
 * before it, which is where interaction bugs actually live: a card that snaps
 * to its final width before anything slides, a label clipped for three frames
 * on its way in, a mechanism that jumps when a gesture takes hold. Every one of
 * those looks perfect in a before-and-after pair.
 *
 * Playwright can record video, but a `.webm` is not something that can be
 * *read* without decoding it, and there is no ffmpeg here. Numbered stills
 * composed into one sheet are the same evidence in a form that can be looked
 * at directly -- and the sheet is one image, so a whole animation costs about
 * what a single screenshot costs.
 *
 * Two bugs in one afternoon were found this way and by nothing else: the corner
 * card throwing Undo and Redo 200px left before the Export control had begun to
 * slide, and that control being clipped at the card's edge while it did.
 *
 *   import { filmstrip, contactSheet } from './filmstrip.mjs';
 *   const film = filmstrip(page, 'artifacts/my-check');
 *   await film.shot('before');
 *   await film.during(28, 12, 'sliding', () => page.locator('.tab').click());
 *   await contactSheet('artifacts/my-check/*sliding*.png', '/tmp/sheet.png', 3);
 *
 * Then *look at the sheet*. The point is to inspect the frames, not to collect
 * them: a suite that captures a filmstrip and asserts nothing has proved
 * nothing.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * A numbered burst capture bound to one page and one directory.
 *
 * `clip` narrows every frame to the region under test, which is usually the
 * right thing: a full-window frame scaled down far enough to tile is too small
 * to see a two-pixel clip in.
 */
export function filmstrip(page, dir, clip) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const shot = async (tag) => {
    await page.screenshot({
      path: `${dir}/${String(n++).padStart(3, '0')}-${tag}.png`,
      ...(clip ? { clip } : {}),
    });
  };
  return {
    shot,
    get frames() {
      return n;
    },
    /**
     * Frames every `everyMs` while `work` runs.
     *
     * The work is started rather than awaited first, so the capture covers the
     * animation instead of beginning after it.
     */
    async during(everyMs, count, tag, work) {
      const running = work();
      for (let i = 0; i < count; i++) {
        await shot(tag);
        await page.waitForTimeout(everyMs);
      }
      await running;
    },
  };
}

/**
 * Tile a set of frames into one image, in order.
 *
 * Through Pillow rather than a Node image library, because it is already on
 * this machine and this is the only thing here that needs one.
 */
export async function contactSheet(pattern, out, columns = 4, scale = 1) {
  const script = `
import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[1]))
if not files: sys.exit('no frames matched ' + sys.argv[1])
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
w, h = max(1, int(w * ${scale})), max(1, int(h * ${scale}))
ims = [im.resize((w, h)) for im in ims]
cols = ${columns}
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * 6, rows * h + (rows + 1) * 6), (232, 232, 236))
for i, im in enumerate(ims):
    r, c = divmod(i, cols)
    sheet.paste(im, (6 + c * (w + 6), 6 + r * (h + 6)))
sheet.save(sys.argv[2])
print(sys.argv[2], sheet.size, len(ims), 'frames')
`;
  const { stdout } = await run('python3', ['-c', script, pattern, out]);
  return stdout.trim();
}
