import { describe, expect, it } from "vitest";
import { collectLinks, isPaleOnLight, mailPreview, parseColor, parseEveHtml, parseFontSize, plainText, type EveNode } from "@/modules/social/eve-html";
import { classifyLink, linkIds, resolveShowinfo, webUrlFor } from "@/modules/social/links";

const text = (s: string) => plainText(parseEveHtml(s));

describe("EVE HTML parser", () => {
  it("parses the markup the EVE client writes into mail", () => {
    const body =
      '<font size="12" color="#bfffffff">Fleet up in </font><font size="12" color="#ffd98d00"><a href="showinfo:5//30000142">Jita</a></font><font size="12" color="#bfffffff"> at 19:00<br>Bring a <b>Drake</b>.</font>';
    const nodes = parseEveHtml(body);
    expect(plainText(nodes)).toBe("Fleet up in Jita at 19:00\nBring a Drake.");
    expect(collectLinks(nodes)).toEqual(["showinfo:5//30000142"]);
    // 75 % white becomes rgba, size 12 is the default and adds nothing.
    expect(nodes[0]).toEqual({ t: "style", color: "rgba(255, 255, 255, 0.75)", size: undefined, letterSpacing: undefined, children: [{ t: "text", text: "Fleet up in " }] });
  });

  it("reads quoted, unquoted and attribute-tag attributes", () => {
    const nodes = parseEveHtml(
      "<a href=showinfo:34>Tritanium</a> <url=showinfo:5//30000142 alt='Current Solar System'>Jita</url> <color='0xFF33FFFF'>c</color> <fontsize=18>big</fontsize>",
    );
    const links = nodes.filter((n): n is Extract<EveNode, { t: "link" }> => n.t === "link");
    expect(links.map((l) => [l.href, l.title])).toEqual([
      ["showinfo:34", undefined],
      ["showinfo:5//30000142", "Current Solar System"],
    ]);
    const styles = nodes.filter((n): n is Extract<EveNode, { t: "style" }> => n.t === "style");
    expect(styles.map((s) => [s.color, s.size])).toEqual([
      ["rgb(51, 255, 255)", undefined],
      [undefined, 1.5],
    ]);
  });

  it("rewrites legacy <url:…> links", () => {
    expect(collectLinks(parseEveHtml("<url:showinfo:1377//90000001>Pilot</url>"))).toEqual(["showinfo:1377//90000001"]);
  });

  it("treats colours as alpha first and rejects anything else", () => {
    expect(parseColor("#ff4cffcc")).toBe("rgb(76, 255, 204)");
    expect(parseColor("0xff4cffccL")).toBe("rgb(76, 255, 204)");
    expect(parseColor("#80ff0000")).toBe("rgba(255, 0, 0, 0.5)");
    expect(parseColor("yellow")).toBe("rgb(255, 255, 0)");
    expect(parseColor("#ff000000")).toBeUndefined(); // black on a dark surface
    expect(parseColor("#10ffffff")).toBeUndefined(); // nearly transparent
    expect(parseColor("red;position:fixed")).toBeUndefined();
    expect(parseColor("expression(alert(1))")).toBeUndefined();
  });

  it("flags colours too pale for the light theme", () => {
    const pale = (c: string) => isPaleOnLight(parseColor(c)!);
    expect(pale("#bfffffff")).toBe(true); // the client's default 75 % white
    expect(pale("yellow")).toBe(true);
    expect(pale("#ffffd98d")).toBe(true); // the client's link gold
    expect(pale("#ff0000ff")).toBe(false); // pure blue reads on light
    expect(pale("#ff8b0000")).toBe(false); // dark red
    expect(pale("#808b0000")).toBe(true); // ...but not at half opacity
    expect(isPaleOnLight("var(--x)")).toBe(false);
  });

  it("scales and clamps font sizes", () => {
    expect(parseFontSize("12")).toBeUndefined();
    expect(parseFontSize("24")).toBe(1.75);
    expect(parseFontSize("2")).toBe(0.75);
    expect(parseFontSize("14")).toBe(1.17);
    expect(parseFontSize("abc")).toBeUndefined();
  });

  it("lets an unclosed tag own the rest and drops stray closes", () => {
    const nodes = parseEveHtml("a<b>bold</b></i>c<i>rest");
    expect(nodes).toEqual([
      { t: "text", text: "a" },
      { t: "bold", children: [{ t: "text", text: "bold" }] },
      { t: "text", text: "c" },
      { t: "italic", children: [{ t: "text", text: "rest" }] },
    ]);
  });

  it("lets the outer tag win when tags cross, and counts nested tags of the same name", () => {
    expect(parseEveHtml("<b>a<i>b</b>c</i>")).toEqual([
      { t: "bold", children: [{ t: "text", text: "a" }, { t: "italic", children: [{ t: "text", text: "b" }] }] },
      { t: "text", text: "c" },
    ]);
    expect(parseEveHtml("<b>a<b>b</b>c</b>d")).toEqual([
      { t: "bold", children: [{ t: "text", text: "a" }, { t: "bold", children: [{ t: "text", text: "b" }] }, { t: "text", text: "c" }] },
      { t: "text", text: "d" },
    ]);
  });

  it("decodes only the four EVE entities", () => {
    expect(text("Tom &amp; Jerry &lt;3 &gt; a&nbsp;b &quot;x&quot; &#39;")).toBe('Tom & Jerry <3 > a b &quot;x&quot; &#39;');
  });

  it("keeps literal newlines and turns <br> variants into breaks", () => {
    expect(text("one\r\ntwo<br>three<br/>four<br />five")).toBe("one\ntwo\nthree\nfour\nfive");
    expect(text("tab\there")).toBe("tab here");
  });

  it("keeps the text of unknown tags as text, never as markup", () => {
    const nodes = parseEveHtml('<loc>Hello</loc> <script>alert("x")</script><p>para</p><img src=x onerror=alert(1)>');
    expect(plainText(nodes)).toBe('Hello alert("x")para');
    expect(JSON.stringify(nodes)).not.toContain("onerror");
  });

  it("ignores style attributes and survives absurd nesting", () => {
    expect(parseEveHtml('<font style="position:fixed;inset:0">x</font>')).toEqual([{ t: "text", text: "x" }]);
    const deep = "<b>".repeat(5000) + "deep";
    expect(text(deep)).toBe("deep");
  });

  it("keeps a lone < that doesn't start a tag", () => {
    expect(text("a < b and 3<4")).toBe("a < b and 3<4");
  });

  it("builds a one-line preview", () => {
    expect(mailPreview("<font size=14><b>Op tonight</b></font><br>Form up   in <a href=showinfo:5//30000142>Jita</a>")).toBe(
      "Op tonight Form up in Jita",
    );
    expect(mailPreview("x".repeat(300), 20)).toHaveLength(20);
    expect(mailPreview(null)).toBe("");
    expect(mailPreview("<uppercase>loud</uppercase> quiet")).toBe("LOUD quiet");
  });
});

describe("EVE link schemes", () => {
  it("classifies showinfo, kill reports, fittings and web links", () => {
    expect(classifyLink("showinfo:1377//2112625428")).toEqual({ kind: "showinfo", typeId: 1377, itemId: 2112625428 });
    expect(classifyLink("showinfo:648")).toEqual({ kind: "showinfo", typeId: 648, itemId: null });
    expect(classifyLink("killReport:128345678:8f1c9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f")).toEqual({
      kind: "killReport",
      killmailId: 128345678,
      hash: "8f1c9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
    });
    expect(classifyLink("fitting:24698:2048;1:31718;3::")).toEqual({ kind: "fitting", dna: "24698:2048;1:31718;3::", shipTypeId: 24698 });
    expect(classifyLink("https://example.com/a?b=1")).toEqual({ kind: "web", url: "https://example.com/a?b=1" });
    expect(classifyLink("joinChannel:-12345")).toEqual({ kind: "client", scheme: "joinchannel" });
  });

  it("never treats unsafe or malformed links as links", () => {
    for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "showinfo:abc", "killReport:1:nothex", "//evil.example", "file:///etc/passwd"]) {
      expect(classifyLink(href)).toEqual({ kind: "invalid" });
    }
  });

  it("resolves showinfo links with CCP's group/category table", () => {
    expect(resolveShowinfo({ typeId: 648, itemId: null })).toBe("type");
    expect(resolveShowinfo({ typeId: 1377, itemId: 1 })).toBe("character");
    expect(resolveShowinfo({ typeId: 2, itemId: 1 })).toBe("corporation");
    expect(resolveShowinfo({ typeId: 16159, itemId: 1 })).toBe("alliance");
    expect(resolveShowinfo({ typeId: 5, itemId: 1 })).toBe("system");
    expect(resolveShowinfo({ typeId: 1380, itemId: 1 }, { groupId: 1, categoryId: 1 })).toBe("character");
    expect(resolveShowinfo({ typeId: 21646, itemId: 1 }, { groupId: 15, categoryId: 3 })).toBe("station");
    expect(resolveShowinfo({ typeId: 35833, itemId: 1 }, { groupId: 1657, categoryId: 65 })).toBe("structure");
    expect(resolveShowinfo({ typeId: 30889, itemId: 1 }, { groupId: 8, categoryId: 2 })).toBe("celestial");
    expect(resolveShowinfo({ typeId: 17926, itemId: 1 }, { groupId: 26, categoryId: 6 })).toBe("item");
    expect(resolveShowinfo({ typeId: 99999, itemId: 1 }, { entityCategory: "solar_system" })).toBe("system");
    expect(resolveShowinfo({ typeId: 99999, itemId: 1 })).toBe("item");
  });

  it("maps resolved links to web pages", () => {
    expect(webUrlFor("character", 1377, 90000001)).toBe("https://zkillboard.com/character/90000001/");
    expect(webUrlFor("system", 5, 30000142)).toBe("https://zkillboard.com/system/30000142/");
    expect(webUrlFor("type", 648, null)).toBe("https://everef.net/types/648");
    expect(webUrlFor("structure", 35833, 1021628175407)).toBeNull();
  });

  it("collects ids worth resolving, skipping 64-bit item ids", () => {
    expect(linkIds(["showinfo:1377//90000001", "showinfo:35833//1021628175407", "fitting:24698:2048;1::", "https://x.test"])).toEqual({
      typeIds: [1377, 35833, 24698],
      itemIds: [90000001],
    });
  });
});
