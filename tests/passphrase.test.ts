import assert from "node:assert/strict";
import test from "node:test";

import { PASSPHRASE_CHARS, generatePassphrase } from "../lib/passphrase.ts";

test("generatePassphrase rejects biased byte values", () => {
  const chunks = [new Uint8Array([255, 0, 1, 2])];
  const fill = (target: Uint8Array) => {
    const next = chunks.shift();
    assert.ok(next);
    target.set(next.subarray(0, target.length));
    return target;
  };

  const result = generatePassphrase(3, fill);
  assert.equal(result, PASSPHRASE_CHARS[0] + PASSPHRASE_CHARS[1] + PASSPHRASE_CHARS[2]);
});
