import { Checksum } from './checksum';

/** The old numeric decoder tolerates unknown digits; import must reject them before they become different geometry. */
export function checkProductionSyntax(payload: string): boolean {
  const sections = new Checksum().strip(payload).split('.');
  const numeric = (s: string) => /^[0-9A-Za-z_-]+$/.test(s);
  if (
    sections.length < 7 ||
    !numeric(sections[0]) ||
    sections[0].length > 2 ||
    sections[1].split(',').length !== 1 ||
    !numeric(sections[1]) ||
    sections[2].split(',').length !== 2 ||
    !sections[2].split(',').every(numeric) ||
    !/^[0-3]{3,4}$/.test(sections[3])
  )
    return false;
  let at = 4;
  for (; at < sections.length && sections[at] !== ''; at++) {
    const fields = sections[at].split(',');
    if (fields.length !== 5 || !numeric(fields[0][0]) || !fields.slice(2).every(numeric))
      return false;
  }
  if (at++ === sections.length) return false;
  for (; at < sections.length && sections[at] !== ''; at++) {
    const fields = sections[at].split(',');
    if (
      !/^[YNAMGnamg0-7][RP]/.test(fields[0]) ||
      fields.length < 9 ||
      !fields.slice(2, 6).every(numeric)
    )
      return false;
  }
  if (at++ === sections.length) return false;
  for (; at < sections.length && sections[at] !== ''; at++) {
    const fields = sections[at].split(',');
    if (fields.length !== 8 || !numeric(fields[0][0]) || !fields.slice(3).every(numeric))
      return false;
  }
  if (sections[at] === '') at++;
  // Production's optional selected object is not shared native selection. No extension tail is discarded.
  return at === sections.length || (at === sections.length - 1 && /^[NJLF]/.test(sections[at]));
}
