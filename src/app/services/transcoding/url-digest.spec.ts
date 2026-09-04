import { Checksum } from './checksum';
import { StringTranscoder } from './string-transcoder';

/**
 * What a shared link's checks actually catch.
 *
 * The format has carried one character of checksum since the beginning, and it
 * is the string's *length* modulo 62 — it says nothing about the contents. So
 * every corruption that left the length alone went through: a link mangled in
 * transit by a mailer, a chat client wrapping a line, a copy that clipped and
 * was retyped, opened a *different mechanism* and said nothing about it. That
 * is the worst failure a share can have, because the reader has no way to know.
 *
 * A digest of the contents rides after it. The rule that makes this safe to add
 * to a format already in circulation is that its mark is a character the codec
 * can never write, so its *absence* means an older link rather than a damaged
 * one — which is the first thing checked below.
 */
describe('the checks a shared link carries', () => {
  /**
   * A four-bar as the app wrote it *before* the digest existed.
   *
   * A literal, on purpose: what has to keep working is a string somebody
   * already has in a bookmark or an email, and a string built by today's
   * encoder cannot stand for one.
   */
  const LEGACY_FOUR_BAR =
    '2v.Fe,1E8.A,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..' +
    'YRAB,AB,0,0,0ix,08i,303e9f,A,B,,.YRBC,BC,0,0,32,NJ,26A69A,B,C,,.' +
    'YRCD,CD,0,0,nd,3P,0d125a,C,D,,...N_p';

  const ALPHABET = Checksum.CHECKSUM_CHARS;

  it('opens a link written before the digest existed, exactly as it always did', () => {
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(LEGACY_FOUR_BAR)).not.toThrow();
    expect(decoder.getJoints().map((joint) => joint.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('and the same link with a digest on it opens to the same mechanism', () => {
    const stamped = new Checksum().stamp(new Checksum().strip(LEGACY_FOUR_BAR));
    const before = new StringTranscoder();
    const after = new StringTranscoder();
    before.decodeURL(LEGACY_FOUR_BAR);
    after.decodeURL(stamped);
    expect(after.getJoints()).toEqual(before.getJoints());
  });

  it('refuses every single-character corruption, which the length check did not', () => {
    const body = LEGACY_FOUR_BAR;
    // What the app writes today: the same mechanism, with a digest on the end.
    const shared = new Checksum().stamp(new Checksum().strip(body));
    const digest = shared.slice(body.length);

    let lengthCheckCaught = 0;
    let digestCaught = 0;
    let tried = 0;
    for (let at = 0; at < body.length; at++) {
      const was = body[at];
      if (!ALPHABET.includes(was)) continue;
      const now = ALPHABET[(ALPHABET.indexOf(was) + 7) % ALPHABET.length];
      const damaged = body.slice(0, at) + now + body.slice(at + 1);
      tried++;

      // The format as it was: body and length character, nothing else. Most of
      // these went straight through, and some of them decoded into a mechanism
      // that was not the one shared.
      try {
        new StringTranscoder().decodeURL(damaged);
      } catch {
        lengthCheckCaught++;
      }

      // The format as it is: the digest is the one the *sender* wrote, which is
      // the whole point -- a wire does not recompute it on the way past.
      let caught = false;
      try {
        new StringTranscoder().decodeURL(damaged + digest);
      } catch {
        caught = true;
      }
      if (caught) digestCaught++;
    }

    expect(tried).toBeGreaterThan(20);
    expect(digestCaught).toBe(tried);
    // The measurement that made this worth doing.
    expect(lengthCheckCaught).toBeLessThan(tried);
  });

  it('leaves a body it has stamped exactly recoverable', () => {
    const checksum = new Checksum();
    const body = 'anything the codec might write, tildes ~ and all';
    expect(checksum.strip(checksum.stamp(body))).toBe(body);
  });

  it('reads no digest where the mark is part of the mechanism', () => {
    // The trailing sections join a part to its color with a tilde, so a URL can
    // legitimately end in one followed by six characters. That used to be the
    // mark, and it would have been read as a digest.
    const checksum = new Checksum();
    expect(checksum.digestSplit('...KFF1~ff0000x')).toBeUndefined();
  });
});
