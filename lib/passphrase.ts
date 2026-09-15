export const PASSPHRASE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";

type RandomFill = (target: Uint8Array) => Uint8Array;

export function generatePassphrase(
  length = 24,
  fillRandom: RandomFill = (target) => crypto.getRandomValues(target),
): string {
  if (!Number.isInteger(length) || length < 1) throw new Error("Invalid passphrase length");

  const alphabetSize = PASSPHRASE_CHARS.length;
  const unbiasedUpperBound = 256 - (256 % alphabetSize);
  let result = "";

  while (result.length < length) {
    const bytes = fillRandom(new Uint8Array(Math.max(32, (length - result.length) * 2)));
    for (const byte of bytes) {
      if (byte >= unbiasedUpperBound) continue;
      result += PASSPHRASE_CHARS[byte % alphabetSize];
      if (result.length === length) break;
    }
  }

  return result;
}
