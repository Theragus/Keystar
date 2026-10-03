import { describe, expect, it } from "vitest";
import { likePattern, memberAuditHref, parseMemberAuditParams } from "@/core/member-audit-filters";

describe("member audit URL state", () => {
  it("reads search, filter and page, ignoring junk", () => {
    expect(parseMemberAuditParams({})).toEqual({ q: "", filter: "all", page: 1 });
    expect(parseMemberAuditParams({ q: "  Bravo  ", filter: "esi", page: "3" })).toEqual({ q: "Bravo", filter: "esi", page: 3 });
    expect(parseMemberAuditParams({ q: ["a", "b"], filter: "nope", page: "-2" })).toEqual({ q: "a", filter: "all", page: 1 });
    expect(parseMemberAuditParams({ page: "0" }).page).toBe(1);
    expect(parseMemberAuditParams({ page: "9999999" }).page).toBe(1);
    expect(parseMemberAuditParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("links to a changed state, starting a new search or filter on page 1", () => {
    const current = { q: "bravo", filter: "esi" as const, page: 4 };
    expect(memberAuditHref()).toBe("/admin/members");
    expect(memberAuditHref(current)).toBe("/admin/members?q=bravo&filter=esi&page=4");
    expect(memberAuditHref(current, { page: 5 })).toBe("/admin/members?q=bravo&filter=esi&page=5");
    expect(memberAuditHref(current, { filter: "all" })).toBe("/admin/members?q=bravo");
    expect(memberAuditHref(current, { q: "", filter: "all" })).toBe("/admin/members");
    expect(memberAuditHref(undefined, { q: "A & B" })).toBe("/admin/members?q=A+%26+B");
  });

  it("escapes LIKE wildcards", () => {
    expect(likePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});
