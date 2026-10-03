import { describe, expect, it } from "vitest";
import { likePattern, memberAuditHref, parseMemberAuditParams } from "@/core/member-audit-filters";

describe("member audit URL state", () => {
  it("reads search, filter and page, ignoring junk", () => {
    expect(parseMemberAuditParams({})).toEqual({ q: "", filter: "all", account: null, page: 1 });
    expect(parseMemberAuditParams({ q: "  Bravo  ", filter: "esi", page: "3" })).toEqual({
      q: "Bravo",
      filter: "esi",
      account: null,
      page: 3,
    });
    expect(parseMemberAuditParams({ q: ["a", "b"], filter: "nope", page: "-2" })).toEqual({
      q: "a",
      filter: "all",
      account: null,
      page: 1,
    });
    expect(parseMemberAuditParams({ account: "0B9D2C4E-1F2A-4B3C-8D4E-5F6A7B8C9D0E" }).account).toBe(
      "0b9d2c4e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
    );
    expect(parseMemberAuditParams({ account: "1; DROP TABLE users" }).account).toBeNull();
    expect(parseMemberAuditParams({ page: "0" }).page).toBe(1);
    expect(parseMemberAuditParams({ page: "9999999" }).page).toBe(1);
    expect(parseMemberAuditParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("links to a changed state, starting a new search or filter on page 1", () => {
    const current = { q: "bravo", filter: "esi" as const, account: null, page: 4 };
    expect(memberAuditHref()).toBe("/admin/members");
    expect(memberAuditHref(current)).toBe("/admin/members?q=bravo&filter=esi&page=4");
    expect(memberAuditHref(current, { page: 5 })).toBe("/admin/members?q=bravo&filter=esi&page=5");
    expect(memberAuditHref(current, { filter: "all" })).toBe("/admin/members?q=bravo");
    expect(memberAuditHref(current, { q: "", filter: "all" })).toBe("/admin/members");
    expect(memberAuditHref(undefined, { q: "A & B" })).toBe("/admin/members?q=A+%26+B");
    const account = "0b9d2c4e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
    expect(memberAuditHref(undefined, { filter: "esi", account })).toBe(`/admin/members?filter=esi&account=${account}`);
    expect(memberAuditHref({ ...current, account }, { account: null })).toBe("/admin/members?q=bravo&filter=esi");
  });

  it("escapes LIKE wildcards", () => {
    expect(likePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});
