import "server-only";

// AES-GCM encryption for fighter weights.
// Uses Node's crypto.subtle (globalThis.crypto) under the Node runtime, no
// extra deps. Returns concatenated `iv (12) | ciphertext` so one blob goes to
// 0G Storage. The caller seals the 32-byte key separately.

const IV_BYTES = 12;

export interface EncryptResult {
  ciphertext: Uint8Array;
  key: Uint8Array; // 32 bytes
  iv: Uint8Array; // 12 bytes
}

// TypeScript's lib.dom.d.ts defines BufferSource as `ArrayBufferView<ArrayBuffer>`
// which doesn't align with `Uint8Array<ArrayBufferLike>` in strict mode.
// We cast through `unknown` at the call boundary to appease the checker;
// runtime behavior is identical.
const asBuf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export async function encryptWithRandomKey(plaintext: Uint8Array): Promise<EncryptResult> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await crypto.subtle.importKey("raw", asBuf(keyBytes), "AES-GCM", false, [
    "encrypt",
  ]);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuf(iv) },
    key,
    asBuf(plaintext),
  );
  const ct = new Uint8Array(ctBuf);
  const out = new Uint8Array(iv.byteLength + ct.byteLength);
  out.set(iv, 0);
  out.set(ct, iv.byteLength);
  return { ciphertext: out, key: keyBytes, iv };
}

export async function decryptWithKey(
  blob: Uint8Array,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  const iv = blob.slice(0, IV_BYTES);
  const ct = blob.slice(IV_BYTES);
  const key = await crypto.subtle.importKey("raw", asBuf(keyBytes), "AES-GCM", false, [
    "decrypt",
  ]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuf(iv) },
    key,
    asBuf(ct),
  );
  return new Uint8Array(pt);
}
