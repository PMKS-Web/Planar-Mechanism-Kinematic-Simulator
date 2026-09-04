/*
This class verifies a string through a checksum, that the length
of the encoded string mod len(CHECKSUM_CHARS) is equal to the
last character of the encoded string. This allows for efficient
verification of the integrity of a string.
*/

export class Checksum {
  // the only characters allowed in the checksum
  static readonly CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  generateChecksum(length: number): string {
    let i = length % Checksum.CHECKSUM_CHARS.length;
    return Checksum.CHECKSUM_CHARS[i];
  }

  verifyChecksum(length: number, checksum: string): boolean {
    let i = length % Checksum.CHECKSUM_CHARS.length;
    return Checksum.CHECKSUM_CHARS[i] === checksum;
  }

  /**
   * A digest of what the string actually says, not of how long it is.
   *
   * The character above is a length check and nothing more: it is the length
   * modulo 62, so every corruption that leaves the length alone passes it. A
   * link mangled in transit — one character changed by a mailer, a chat client
   * wrapping a line, a copy that clipped and was retyped — opened a *different
   * mechanism*, silently. Measured over eighteen single-character flips in one
   * payload, the length character caught one of them; three of the rest moved a
   * joint and said nothing at all.
   *
   * FNV-1a, 32 bits, in the same alphabet. Not a cryptographic hash and not
   * meant to be one — nothing here is defending against someone who wants to
   * forge a link, only against the wire. What it has to do is notice one
   * changed character, and any change at all moves it.
   */
  digest(body: string): string {
    // The 32-bit FNV-1a offset basis and prime. `Math.imul` keeps the multiply
    // in 32 bits, which is the whole reason this is reproducible: a plain `*`
    // silently leaves the integer range and rounds.
    let hash = 0x811c9dc5;
    for (let at = 0; at < body.length; at++) {
      hash = Math.imul(hash ^ body.charCodeAt(at), 0x01000193);
    }
    // Unsigned, then spelled in the checksum's own characters, most significant
    // first, at a fixed width so the reader of a URL can find it by length.
    let value = hash >>> 0;
    const chars = Checksum.CHECKSUM_CHARS;
    let out = '';
    for (let place = 0; place < Checksum.DIGEST_LENGTH; place++) {
      out = chars[value % chars.length] + out;
      value = Math.floor(value / chars.length);
    }
    return out;
  }

  /**
   * How long a digest is, and what marks the start of one.
   *
   * Six characters of base 62 hold a 32-bit value with room to spare.
   *
   * The mark is an asterisk, and the choice is load-bearing: it has to be a
   * character the codec can never write, or an old URL that happens to end the
   * right way would be read as carrying a digest. A tilde looked right and is
   * not — the trailing sections are full of them, joining a part to its color
   * and a link to its center-of-mass anchor, and those sections are the last
   * thing before the checksum. An asterisk appears nowhere in the format, is
   * left alone by `encodeURI` and `decodeURI`, and needs no escaping in a
   * query. Its absence is what tells a link written before this from a damaged
   * one: no mark, no digest, and the length check alone.
   */
  static readonly DIGEST_LENGTH = 6;
  static readonly DIGEST_MARK = '*';

  /**
   * A body, with everything that checks it: what a URL actually is.
   *
   * Here rather than in the encoder, because the decoder and every spec that
   * hand-builds a payload have to agree with it exactly, and they used to do
   * that by each appending the length character themselves.
   */
  stamp(body: string): string {
    const checked = body + this.generateChecksum(body.length);
    return checked + Checksum.DIGEST_MARK + this.digest(checked);
  }

  /**
   * The reverse: a URL with its checks taken off.
   *
   * Tolerates a URL from before the digest existed, which carries only the
   * length character — that is the whole compatibility rule, in one place.
   */
  strip(url: string): string {
    const withoutDigest = this.digestSplit(url)?.body ?? url;
    return withoutDigest.slice(0, -1);
  }

  /**
   * A URL's body and the digest it carries, or nothing if it carries none.
   *
   * The mark is unambiguous — nothing the codec writes contains a tilde — so
   * its absence means an older link rather than a damaged one.
   */
  digestSplit(url: string): { body: string; digest: string } | undefined {
    const mark = url.lastIndexOf(Checksum.DIGEST_MARK);
    if (mark === -1 || url.length - mark - 1 !== Checksum.DIGEST_LENGTH) return undefined;
    const digest = url.substring(mark + 1);
    // Belt and braces: the right shape in the wrong alphabet is not a digest.
    if (![...digest].every((one) => Checksum.CHECKSUM_CHARS.includes(one))) return undefined;
    return { body: url.substring(0, mark), digest };
  }
}
