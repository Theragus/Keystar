import { describe, expect, it } from "vitest";
import { decrypt, decryptToken, deriveKey, encrypt, encryptToken, sha256Hex } from "@/core/crypto";
import { OAUTH_MAX_AGE_SECONDS, safeReturnTo, sealOAuthState, unsealOAuthState } from "@/core/auth/oauth-state";

describe("token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = encryptToken("refresh-token-value");
    expect(sealed).not.toContain("refresh-token-value");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed)).toBe("refresh-token-value");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("detects tampering", () => {
    const sealed = encryptToken("secret");
    const parts = sealed.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });

  it("separates keys by purpose", () => {
    const sealed = encrypt("x", deriveKey("esi-token"));
    expect(() => decrypt(sealed, deriveKey("oauth-state"))).toThrow();
  });

  it("hashes session tokens", () => {
    expect(sha256Hex("abc")).toHaveLength(64);
  });
});

describe("oauth state cookie", () => {
  const state = {
    state: "s".repeat(24),
    verifier: "v".repeat(64),
    intent: "login" as const,
    returnTo: "/mining",
    createdAt: Date.now(),
  };

  it("round-trips", () => {
    expect(unsealOAuthState(sealOAuthState(state))).toEqual(state);
  });

  it("rejects expired, garbage and missing values", () => {
    const old = { ...state, createdAt: Date.now() - (OAUTH_MAX_AGE_SECONDS + 1) * 1000 };
    expect(unsealOAuthState(sealOAuthState(old))).toBeNull();
    expect(unsealOAuthState("v1.garbage")).toBeNull();
    expect(unsealOAuthState(undefined)).toBeNull();
  });

  it("only allows same-origin relative return paths", () => {
    expect(safeReturnTo("/characters")).toBe("/characters");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo(null, "/x")).toBe("/x");
  });
});
