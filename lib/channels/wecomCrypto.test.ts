import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWecomPayload, encryptChannelPayload, verifyWecomSignature } from "./wecomCrypto";

function encryptWecom(message: string, corpId: string, keyText: string) {
  const key = Buffer.from(`${keyText}=`, "base64");
  const length = Buffer.alloc(4); length.writeUInt32BE(Buffer.byteLength(message));
  const plain = Buffer.concat([randomBytes(16), length, Buffer.from(message), Buffer.from(corpId)]);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
}

describe("WeCom channel cryptography", () => {
  it("verifies sorted SHA1 callback signatures", () => {
    const token = "callback-token"; const timestamp = "1720000000"; const nonce = "n-1"; const encrypted = "ciphertext";
    const signature = createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest("hex");
    expect(verifyWecomSignature(token, timestamp, nonce, encrypted, signature)).toBe(true);
    expect(verifyWecomSignature(token, timestamp, nonce, encrypted, `${signature.slice(0, -1)}0`)).toBe(false);
  });

  it("decrypts the official callback payload envelope", () => {
    const keyText = randomBytes(32).toString("base64").replace(/=$/, "");
    const encrypted = encryptWecom("<xml><Content>预约</Content></xml>", "ww-corp", keyText);
    expect(decryptWecomPayload(encrypted, keyText)).toEqual({ message: "<xml><Content>预约</Content></xml>", corpId: "ww-corp" });
  });

  it("encrypts retained channel messages without plaintext", () => {
    const result = encryptChannelPayload("居民血压 130/80", randomBytes(32).toString("hex"));
    expect(result).not.toContain("居民");
    expect(Buffer.from(result, "base64").length).toBeGreaterThan(28);
  });
});
