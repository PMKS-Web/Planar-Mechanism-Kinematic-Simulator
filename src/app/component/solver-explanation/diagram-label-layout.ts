/** Measure actual SVG text after rendering, then choose the nearest free label position. */
export function separateDiagramLabels(svg: SVGSVGElement) {
  const labels = [...svg.querySelectorAll<SVGTextElement>('[data-diagram-label]')];
  labels.forEach((label) => label.removeAttribute('transform'));
  const boxes = labels.map((label) => label.getBBox());
  const placed = [{ x: 0, y: 165, width: 82, height: 85 }];
  labels.forEach((label, i) => {
    const box = boxes[i];
    if (!box.width || !box.height) return;
    const candidates = [[0, 0]];
    for (let radius = 12; radius <= 180; radius += 12)
      for (let j = 0; j < 12; j++)
        candidates.push([
          radius * Math.cos((j * Math.PI) / 6),
          radius * Math.sin((j * Math.PI) / 6),
        ]);
    const overlaps = (x: number, y: number) =>
      placed.reduce(
        (sum, p) =>
          sum +
          Math.max(0, Math.min(x + box.width + 3, p.x + p.width) - Math.max(x - 3, p.x)) *
            Math.max(0, Math.min(y + box.height + 3, p.y + p.height) - Math.max(y - 3, p.y)),
        0
      );
    const candidatesInBounds = candidates.map(([dx, dy]) => ({
      x: Math.max(4, Math.min(356 - box.width, box.x + dx)),
      y: Math.max(26, Math.min(201 - box.height, box.y + dy)),
    }));
    const best = candidatesInBounds.reduce<{ x: number; y: number; score: number }>(
      (best, p) => {
        const score = overlaps(p.x, p.y) * 1000 + Math.hypot(p.x - box.x, p.y - box.y);
        return score < best.score ? { ...p, score } : best;
      },
      { x: box.x, y: box.y, score: Infinity }
    );
    label.setAttribute('transform', `translate(${best.x - box.x} ${best.y - box.y})`);
    placed.push({ ...best, width: box.width, height: box.height });
  });
}
