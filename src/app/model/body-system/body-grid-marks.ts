/** Grid spacing is chosen in screen space; changing length units cannot turn hairlines into walls. */
export function bodyGridStep(pixelsPerUnit: number): number {
  const wanted = 70 / pixelsPerUnit,
    power = 10 ** Math.floor(Math.log10(wanted)),
    fraction = wanted / power;
  return (fraction < 2 ? 1 : fraction < 5 ? 2 : 5) * power;
}
