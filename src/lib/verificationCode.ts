/**
 * Turns a digest into the short code a student reads to the office.
 *
 * The alphabet leaves out vowels and look-alikes (`0/O`, `1/I`), so a code
 * cannot spell a word and cannot be misheard over a phone: 8 characters, shown
 * grouped 4-4. Pure and synchronous on purpose — the caller hashes, this maps,
 * which keeps the mapping itself unit-testable without a browser or a network.
 */
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";

export function deriveVerificationCode(seed: string): string {
  if (!seed) return "";
  let out = "";
  for (let i = 0; i < 8; i++) {
    // Walk the seed with a stride that is coprime with the alphabet length so
    // neighbouring digest characters do not land on neighbouring letters.
    const ch = seed.charCodeAt(i % seed.length);
    out += ALPHABET[(ch * 5 + i * 7) % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
