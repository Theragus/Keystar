import { inArray, sql } from "drizzle-orm";
import {
  esiTokens,
  eveEntities,
  eveGroups,
  eveTypes,
  mailLabels,
  mailLists,
  mailMessages,
  syncJobs,
  type Db,
  type MailRecipient,
} from "@/core/db";
import { MAIL_JOB_KEY, MAIL_SCOPE } from "@/modules/social/module";

/**
 * Demo mail for one account: mail access on for two of its three characters
 * (the third shows the opt-in), labels, two mailing lists, and mail written
 * the way the EVE client writes it (fonts, colours, showinfo links, a kill
 * report, a fitting, client-only links), plus some malformed markup to show
 * it renders safely. One mail is shared by both mailboxes (a corp mail) and
 * one body is still "downloading". Another account gets a little mail too, so
 * the demo shows mail is private per account.
 */

const LIST_OPS = 145_156_001;
const LIST_SIGNUPS = 145_156_002;
const HOME = "Keystar Industries";

interface DemoMail {
  id: number;
  hoursAgo: number;
  from: string;
  to: (MailRecipient | string)[];
  subject: string;
  body: string | null;
  labels: number[];
  /** Mailboxes (character names) that hold this mail, with their read state. */
  boxes: Record<string, boolean>;
}

const font = (text: string, color = "#bfffffff", size = 12) => `<font size="${size}" color="${color}">${text}</font>`;

export async function seedMail(
  db: Db,
  opts: { userId: string; characters: { characterId: number; name: string }[]; otherUserId: string; otherCharacterId: number; now: Date },
): Promise<number> {
  // The second character keeps mail access off, so the page shows the opt-in.
  const [main, , hauler] = opts.characters;
  const enabled = [main, hauler];
  const names = [
    "Tovan Rhask",
    "Selene Okaru",
    "Jorek Taln",
    "Ishani Calder",
    "Daiko Okaru",
    "Grim Halvard",
    "Zahra Imren",
    "Rhea Solenne",
    "Mira Rhask",
    HOME,
    "Rogue Drillers Inc.",
    "Osmon",
    "Sirseshin",
    "Ansila",
  ];
  const entities = await db.select({ id: eveEntities.id, name: eveEntities.name }).from(eveEntities).where(inArray(eveEntities.name, names));
  const idOf = (name: string) => {
    const id = [...opts.characters, ...entities.map((e) => ({ characterId: e.id, name: e.name }))].find((e) => e.name === name)?.characterId;
    if (!id) throw new Error(`Demo mail: unknown entity ${name}`);
    return id;
  };
  const character = (name: string): MailRecipient => ({ id: idOf(name), type: "character" });
  const showinfo = (typeId: number, name: string, itemId?: number) =>
    `<a href="showinfo:${typeId}${itemId ? `//${itemId}` : ""}">${name}</a>`;
  const pilot = (name: string) => font(showinfo(1377, name, idOf(name)), "#ffd98d00");
  const system = (name: string) => font(showinfo(5, name, idOf(name)), "#ffd98d00");
  const corp = (name: string) => font(showinfo(2, name, idOf(name)), "#ffd98d00");

  // Types the links point at (character type for portraits, ships and items for icons).
  await db
    .insert(eveGroups)
    .values([
      { groupId: 1, name: "Character", categoryId: 1 },
      { groupId: 543, name: "Exhumer", categoryId: 6 },
      { groupId: 18, name: "Mineral", categoryId: 4 },
      { groupId: 54, name: "Mining Laser", categoryId: 7 },
    ])
    .onConflictDoNothing();
  await db
    .insert(eveTypes)
    .values([
      { typeId: 1377, name: "Character", groupId: 1, volume: 0, published: false },
      { typeId: 22548, name: "Mackinaw", groupId: 543, volume: 3_750_000, published: true },
      { typeId: 34, name: "Tritanium", groupId: 18, volume: 0.01, published: true },
      { typeId: 24305, name: "Modulated Strip Miner II", groupId: 54, volume: 5, published: true },
    ])
    .onConflictDoNothing();

  const mails: DemoMail[] = [
    {
      id: 391_000_040,
      hoursAgo: 0.6,
      from: "Tovan Rhask",
      to: [{ id: idOf(HOME), type: "corporation" }],
      subject: "Moon extractions — week 41",
      labels: [4, 256],
      boxes: { [main.name]: false, [hauler.name]: true },
      body:
        font("<b>Moon extractions this week</b>", "#ffffa600", 14) +
        "<br><br>" +
        font(`Both refineries pop on schedule. Bring Rorquals and boosts, ${HOME} buyback is open the whole week.<br><br>`) +
        font("<b>Osmon</b> — Keystar Athanor: ") +
        system("Osmon") +
        font(" · Tuesday 19:00 ET · Zeolites, Sylvite, Cobaltite<br>") +
        font("<b>Sirseshin</b> — Deep Tatara: ") +
        system("Sirseshin") +
        font(" · Thursday 20:30 ET · Bitumens, Coesite, Titanite<br><br>") +
        "<color=0xff3399ccL>Reminder:</color>" +
        font(" fit ") +
        font(showinfo(24305, "Modulated Strip Miner II"), "#ffd98d00") +
        font(" with the right crystals, and stay aligned. Questions to ") +
        pilot("Mira Rhask") +
        font(".<br><br>o7<br>") +
        pilot("Tovan Rhask"),
    },
    {
      id: 391_000_039,
      hoursAgo: 3.5,
      from: "Selene Okaru",
      to: [character(main.name)],
      subject: "Lost a Mackinaw in Ansila — replacement fit",
      labels: [1],
      boxes: { [main.name]: false },
      body:
        font("Hey Aria,<br><br>got caught by a Catalyst gang in ") +
        system("Ansila") +
        font(" around downtime. Kill: ") +
        font('<a href="killReport:140000123:5d41402abc4b2a76b9719d911017c592ae8f1b3c">Mackinaw | Selene Okaru</a>', "#ffd98d00") +
        font("<br><br>Here is the fit I'd like the corp to replace (tanked this time):<br>") +
        font('<a href="fitting:22548:24305;1:2048;1:31718;2:3841;1::">Mackinaw — ice tank</a>', "#ffd98d00") +
        font(`<br><br>If you'd rather I buy the hull myself: ${showinfo(22548, "Mackinaw")} is about 312M in Jita.<br>`) +
        font("<i>Thanks!</i>", "#ff999999"),
    },
    {
      id: 391_000_038,
      hoursAgo: 7,
      from: "Jorek Taln",
      to: [{ id: LIST_OPS, type: "mailing_list" }],
      subject: "Mining op tonight 19:00 ET — Sirseshin",
      labels: [],
      boxes: { [main.name]: false, [hauler.name]: false },
      body:
        font("<fontsize=16><b>Mining op tonight</b></fontsize><br>", "#ffffffff") +
        font("Form up: ") +
        system("Sirseshin") +
        font(" · 19:00 ET · Fleet channel ") +
        font('<a href="joinChannel:-61234567">Keystar Mining</a>', "#ffd98d00") +
        font("<br>Comms: <hint='Mumble, the usual server'>voice</hint> as always.<br><br>") +
        font("Signup sheet and boosts:<t>") +
        font('<a href="https://www.eveonline.com/news">eveonline.com/news</a>', "#ffd98d00") +
        font("<br>Bring <uppercase>ice harvesters</uppercase> if you have them."),
    },
    {
      id: 391_000_037,
      hoursAgo: 26,
      from: main.name,
      to: [character("Ishani Calder"), character("Daiko Okaru")],
      subject: "Re: buyback rates for moon ore",
      labels: [2],
      boxes: { [main.name]: true },
      body:
        font("Ishani, Daiko,<br><br>we're keeping buyback at <b>92 % of Jita buy</b> for R4/R8 and <b>88 %</b> for R16+.<br>") +
        font("Contract to ") +
        corp(HOME) +
        font(" at the Athanor in ") +
        system("Osmon") +
        font(".<br><br>— Aria"),
    },
    {
      id: 391_000_036,
      hoursAgo: 38,
      from: "Grim Halvard",
      to: [character(main.name)],
      subject: "refinery access??",
      labels: [1],
      boxes: { [main.name]: false },
      // Hand-typed and malformed on purpose: an unclosed <b>, literal and real <script>, a javascript: link.
      body:
        "<b>hi,\n\nwe from " +
        corp("Rogue Drillers Inc.") +
        " want to mine your moon in Osmon. can we get access to the athanor?\n" +
        "we pay 5% tax. i typed &lt;script&gt;alert('hi')&lt;/script&gt; to test your killboard lol<script>alert('x')</script>\n" +
        '<a href="javascript:alert(1)">click here for our terms</a>\n\ngrim',
    },
    {
      id: 391_000_035,
      hoursAgo: 60,
      from: "Daiko Okaru",
      to: [character(main.name)],
      subject: "Jita prices for minerals",
      labels: [1, 512],
      boxes: { [main.name]: true },
      body:
        font("Quick numbers from this morning:<br><br>") +
        font(`${showinfo(34, "Tritanium")}<t>4.10 ISK<br>`) +
        font("Pyerite<t>8.90 ISK<br>Mexallon<t>48.50 ISK<br><br>") +
        font("Prices move fast, double check before you sell.", "#ff999999", 10),
    },
    {
      id: 391_000_034,
      hoursAgo: 98,
      from: "Zahra Imren",
      to: [{ id: LIST_SIGNUPS, type: "mailing_list" }],
      subject: "Ice belt rotation sign-ups",
      labels: [],
      boxes: { [main.name]: true },
      body: font("Reply with your preferred slot. Saturday and Sunday are still open.<br>No alts in the first wave, please."),
    },
    {
      id: 391_000_033,
      hoursAgo: 0.3,
      from: "Rhea Solenne",
      to: [character(hauler.name)],
      subject: "Hauling contract for compressed ice",
      labels: [1],
      boxes: { [hauler.name]: false },
      body: null, // not downloaded yet
    },
  ];
  // Older corp announcements so the list pages and dates span months (and last year).
  const announcements = [
    "Tax rate change",
    "New refinery online",
    "Doctrine update for mining fleets",
    "Holiday schedule",
    "Buyback program changes",
    "Security reminder: watch local",
    "Welcome our new members",
    "Structure fuel status",
    "Industry index jump in Osmon",
    "Corp hangar cleanup",
  ];
  announcements.forEach((subject, i) => {
    const old = i === announcements.length - 1;
    mails.push({
      id: 391_000_020 - i,
      hoursAgo: (old ? 400 : 8 + i * 6) * 24 + 5,
      from: i % 2 ? "Mira Rhask" : "Tovan Rhask",
      to: [{ id: idOf(HOME), type: "corporation" }],
      subject,
      labels: i % 3 === 0 ? [4, 256] : [4],
      boxes: { [main.name]: true, [hauler.name]: true },
      body: font(`${subject}.<br><br>Details in the corp bulletin. Fly safe.`),
    });
  });

  const rows: (typeof mailMessages.$inferInsert)[] = [];
  for (const m of mails) {
    for (const [name, isRead] of Object.entries(m.boxes)) {
      const box = opts.characters.find((c) => c.name === name)!;
      rows.push({
        characterId: box.characterId,
        mailId: m.id,
        userId: opts.userId,
        fromId: idOf(m.from),
        subject: m.subject,
        sentAt: new Date(opts.now.getTime() - m.hoursAgo * 3600_000),
        isRead,
        labels: m.labels,
        recipients: m.to.map((r) => (typeof r === "string" ? character(r) : r)),
        body: m.body,
        bodyFetchedAt: m.body === null ? null : opts.now,
      });
    }
  }
  // Another account's mail: never visible to the account above.
  rows.push({
    characterId: opts.otherCharacterId,
    mailId: 391_000_050,
    userId: opts.otherUserId,
    fromId: idOf("Tovan Rhask"),
    subject: "Your buyback contract",
    sentAt: new Date(opts.now.getTime() - 3600_000),
    isRead: false,
    labels: [1],
    recipients: [{ id: opts.otherCharacterId, type: "character" }],
    body: font("Accepted, thanks!"),
    bodyFetchedAt: opts.now,
  });
  await db.insert(mailMessages).values(rows);

  const labels = (characterId: number, extra: { labelId: number; name: string; color: string }[]) =>
    [
      { labelId: 1, name: "Inbox", color: "#ffffff" },
      { labelId: 2, name: "Sent", color: "#ffffff" },
      { labelId: 4, name: "[Corp]", color: "#ffffff" },
      { labelId: 8, name: "[Alliance]", color: "#ffffff" },
      ...extra,
    ].map((l) => ({ ...l, characterId, userId: opts.userId }));
  await db.insert(mailLabels).values([
    ...labels(main.characterId, [
      { labelId: 256, name: "Ops", color: "#ff6600" },
      { labelId: 512, name: "Market", color: "#0099ff" },
    ]),
    ...labels(hauler.characterId, [{ labelId: 256, name: "Ops", color: "#ff6600" }]),
  ]);
  await db.insert(mailLists).values([
    { characterId: main.characterId, mailingListId: LIST_OPS, userId: opts.userId, name: "Keystar Ops" },
    { characterId: main.characterId, mailingListId: LIST_SIGNUPS, userId: opts.userId, name: "Keystar Sign-ups" },
    { characterId: hauler.characterId, mailingListId: LIST_OPS, userId: opts.userId, name: "Keystar Ops" },
  ]);

  for (const c of enabled) {
    await db
      .update(esiTokens)
      .set({ scopes: sql`array_append(${esiTokens.scopes}, ${MAIL_SCOPE})` })
      .where(sql`${esiTokens.characterId} = ${c.characterId}`);
  }
  await db.insert(syncJobs).values(
    enabled.map((c) => ({
      jobKey: MAIL_JOB_KEY,
      ownerType: "character" as const,
      ownerId: c.characterId,
      lastStatus: "ok" as const,
      lastSummary: "0 new mails, 0 bodies",
      lastRunAt: new Date(opts.now.getTime() - 4 * 60_000),
      lastSuccessAt: new Date(opts.now.getTime() - 4 * 60_000),
      nextRunAt: new Date(opts.now.getTime() + 60_000),
    })),
  );
  return rows.length;
}
