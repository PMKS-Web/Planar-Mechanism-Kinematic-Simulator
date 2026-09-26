import { WHAT_IS_THIS_VERSION } from './prompt';

/**
 * What a note is filed under: the prompt's version and the fact sheet it was
 * written from. One sheet describes one machine, so a note written once -- in
 * this browser, or at release time for a library template -- answers every
 * later asking of it, and a new prompt version files everything anew.
 *
 * Two rounds of cyrb53 with different seeds, 106 bits in all: this names cache
 * entries and guards nothing, so it needs no cryptographic hash, and a
 * synchronous one lets the panel look a note up while it draws.
 */
export function noteKey(sheet: string): string {
  const text = `${WHAT_IS_THIS_VERSION}\n${sheet}`;
  return cyrb53(text, 0x9e3779b9) + cyrb53(text, 0x85ebca6b);
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
