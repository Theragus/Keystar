import { describe, expect, it } from "vitest";
import {
  applicationScopes,
  characterScopes,
  corporationScopes,
  memberScopeRequirements,
  optionalScopes,
  reauthorizeHref,
  scopesForIntent,
} from "@/core/modules/registry";
import { WALLET_SCOPE } from "@/modules/wallet/module";

const MINING = "esi-industry.read_character_mining.v1";
const CORP_MINING = "esi-industry.read_corporation_mining.v1";

function params(href: string) {
  return new URL(href, "http://x").searchParams;
}

describe("optional scopes", () => {
  it("keeps opt-in scopes out of the member and corporation sets", () => {
    expect(optionalScopes()).toEqual([WALLET_SCOPE]);
    expect(characterScopes()).toContain(MINING);
    expect(characterScopes()).not.toContain(WALLET_SCOPE);
    expect(corporationScopes()).not.toContain(WALLET_SCOPE);
    expect(memberScopeRequirements().some((s) => s.scope === WALLET_SCOPE)).toBe(false);
  });

  it("lists every scope for the EVE developer application", () => {
    expect(applicationScopes()).toEqual(expect.arrayContaining([MINING, CORP_MINING, WALLET_SCOPE]));
  });

  it("adds known opt-in scopes only when linking", () => {
    expect(scopesForIntent("login", [WALLET_SCOPE])).toEqual([]);
    expect(scopesForIntent("join", [WALLET_SCOPE])).toEqual(characterScopes());
    expect(scopesForIntent("link", [WALLET_SCOPE])).toContain(WALLET_SCOPE);
    expect(scopesForIntent("link-corp", [WALLET_SCOPE])).toEqual(expect.arrayContaining([CORP_MINING, WALLET_SCOPE]));
    expect(scopesForIntent("link", ["esi-mail.send_mail.v1", "bogus"])).toEqual(characterScopes());
  });

  it("re-authorises without dropping corporation or opt-in scopes", () => {
    const plain = params(reauthorizeHref([MINING]));
    expect(plain.get("intent")).toBe("link");
    expect(plain.get("with")).toBeNull();

    const corp = params(reauthorizeHref([MINING, CORP_MINING, WALLET_SCOPE]));
    expect(corp.get("intent")).toBe("link-corp");
    expect(corp.get("with")).toBe(WALLET_SCOPE);
  });

  it("adds and removes opt-in scopes", () => {
    const add = params(reauthorizeHref([MINING], { add: [WALLET_SCOPE], returnTo: "/mining/pnl/settings" }));
    expect(add.get("with")).toBe(WALLET_SCOPE);
    expect(add.get("returnTo")).toBe("/mining/pnl/settings");
    expect(params(reauthorizeHref([MINING, WALLET_SCOPE], { remove: [WALLET_SCOPE] })).get("with")).toBeNull();
    expect(params(reauthorizeHref([MINING], { add: ["bogus"] })).get("with")).toBeNull();
  });
});
