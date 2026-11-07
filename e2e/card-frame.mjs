/**
 * Which library cards are framed on their picture rather than on their mechanism.
 *
 * A card is clipped to the box its mechanism draws, which suits a picture the
 * mechanism fills: a suspension, a pair of pliers. A locomotive's running gear
 * is the bottom third of the engine, so clipped to the gear its card cut off
 * the chimney and the cab and left a band of nothing under the rail. A card
 * named here is clipped to its picture instead, and the picture is drawn to
 * the card's shape. Shared by the still and the loop, which have to land on
 * each other.
 */
export const FRAMED_BY_PICTURE = new Set(['Steam_Locomotive']);

/**
 * The box the card's picture covers on screen.
 *
 * Throws rather than answering nothing: a card framed on a picture that never
 * arrived would be clipped tight to its mechanism and written out looking
 * like a card, which is worse than a run that stops.
 */
export async function pictureBox(page, id) {
  const box = await page.evaluate(() => {
    const rect = document.querySelector('#backgroundImageHolder image')?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0
      ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      : null;
  });
  if (!box) throw new Error(`${id} is framed on its picture, and its picture is not on the grid`);
  return box;
}
