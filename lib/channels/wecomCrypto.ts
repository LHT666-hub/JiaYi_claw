import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function verifyWecomSignature(token: string, timestamp: string, nonce: string, encrypted: string, signature: string) {
  const expected = createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest("hex");
  const left = Buffer.from(expected); const right = Buffer.from(signature || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function decryptWecomPayload(encrypted: string, encodingAesKey: string) {
  const key = Buffer.from(`${encodingAesKey}=`, "base64");
  if (key.length !== 32) throw new Error("INVALID_WECOM_AES_KEY");
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]);
  if (plain.length < 20) throw new Error("INVALID_WECOM_PAYLOAD");
  const messageLength = plain.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plain.length) throw new Error("INVALID_WECOM_LENGTH");
  return { message: plain.subarray(20, messageEnd).toString("utf8"), corpId: plain.subarray(messageEnd).toString("utf8") };
}

export function encryptChannelPayload(plainText: string, storageKey: string) {
  const key = /^[a-f0-9]{64}$/i.test(storageKey) ? Buffer.from(storageKey, "hex") : Buffer.from(storageKey, "base64");
  if (key.length !== 32) throw new Error("INVALID_CHANNEL_STORAGE_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}
