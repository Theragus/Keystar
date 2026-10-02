import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/core/env";

/**
 * Symmetric encryption helpers (AES-256-GCM) with purpose-specific keys
 * derived from APP_SECRET via HKDF, so one secret never encrypts two kinds of
 * data with the same key.
 */
export type KeyPurpose = "esi-token" | "oauth-state";

const keyCache = new Map<string, Buffer>();

export function deriveKey(purpose: KeyPurpose, secret: string = env().APP_SECRET): Buffer {
  const cacheKey = `${purpose}:${createHash("sha256").update(secret).digest("hex")}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret, "keystar", `keystar:${purpose}`, 32));
    keyCache.set(cacheKey, key);
  }
  return key;
}

const VERSION = "v1";

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, ivB64, dataB64, tagB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || dataB64 === undefined || !tagB64) {
    throw new Error("Unsupported ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptToken(token: string): string {
  return encrypt(token, deriveKey("esi-token"));
}

export function decryptToken(payload: string): string {
  return decrypt(payload, deriveKey("esi-token"));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function base64UrlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
