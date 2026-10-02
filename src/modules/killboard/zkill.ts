/**
 * Minimal zKillboard API client (https://github.com/zKillboard/zKillboard/wiki).
 *
 * zKillboard asks API users to send a descriptive User-Agent, accept gzip and
 * not hammer the server: requests are spaced out process-wide, and responses
 * are cached by zKillboard for an hour, so polling more often gains nothing.
 * Each entry is the full ESI killmail plus zKillboard's `zkb` block.
 */

export interface ZkillAttacker {
  character_id?: number;
  corporation_id?: number;
  alliance_id?: number;
  faction_id?: number;
  ship_type_id?: number;
  weapon_type_id?: number;
  damage_done: number;
  final_blow: boolean;
  security_status?: number;
}

export interface ZkillKillmail {
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim: {
    character_id?: number;
    corporation_id?: number;
    alliance_id?: number;
    faction_id?: number;
    ship_type_id: number;
    damage_taken: number;
  };
  attackers: ZkillAttacker[];
  zkb: {
    hash: string;
    locationID?: number;
    fittedValue?: number;
    droppedValue?: number;
    destroyedValue?: number;
    totalValue?: number;
    points?: number;
    npc?: boolean;
    solo?: boolean;
    awox?: boolean;
    labels?: string[];
  };
}

/** Which killmails to list: the last N seconds (max 7 days) or a calendar month. */
export type ZkillWindow = { pastSeconds: number } | { year: number; month: number };

export class ZkillError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ZkillError";
  }
}

export interface ZkillClientOptions {
  userAgent: string;
  baseUrl?: string;
  /** Minimum gap between two requests from this process. */
  minIntervalMs?: number;
  maxAttempts?: number;
  /** Safety cap on pages per listing. */
  maxPages?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_PAST_SECONDS = 7 * 24 * 3600;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function windowPath(window: ZkillWindow): string {
  if ("pastSeconds" in window) {
    // zKillboard only accepts multiples of an hour, up to 7 days.
    const s = Math.min(MAX_PAST_SECONDS, Math.max(3600, Math.ceil(window.pastSeconds / 3600) * 3600));
    return `pastSeconds/${s}/`;
  }
  return `year/${window.year}/month/${window.month}/`;
}

export class ZkillClient {
  private nextSlot = 0;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ZkillClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://zkillboard.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? realSleep;
  }

  /** One page of killmails involving a corporation (kills and losses). */
  corporationPage(corporationId: number, window: ZkillWindow, page: number): Promise<ZkillKillmail[]> {
    return this.get(`/api/corporationID/${corporationId}/${windowPath(window)}page/${page}/`);
  }

  /** Every killmail involving a corporation in the window, page by page (newest first). */
  async *corporationKillmails(corporationId: number, window: ZkillWindow): AsyncGenerator<ZkillKillmail[]> {
    const maxPages = this.opts.maxPages ?? 100;
    for (let page = 1; page <= maxPages; page++) {
      const rows = await this.corporationPage(corporationId, window, page);
      if (!rows.length) return;
      yield rows;
    }
  }

  private async throttle(): Promise<void> {
    const interval = this.opts.minIntervalMs ?? 1100;
    const now = Date.now();
    const wait = this.nextSlot - now;
    this.nextSlot = Math.max(now, this.nextSlot) + interval;
    if (wait > 0) await this.sleep(wait);
  }

  async get(path: string): Promise<ZkillKillmail[]> {
    const attempts = this.opts.maxAttempts ?? 4;
    let lastError: ZkillError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.throttle();
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { "User-Agent": this.opts.userAgent, "Accept-Encoding": "gzip", Accept: "application/json" },
        });
      } catch (err) {
        lastError = new ZkillError(`zKillboard unreachable: ${(err as Error).message}`, null);
        await this.sleep(2000 * attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastError = new ZkillError(`zKillboard responded ${res.status}`, res.status);
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt);
        continue;
      }
      if (!res.ok) {
        // 403 usually means a missing/blocked User-Agent or too many requests from this IP.
        throw new ZkillError(`zKillboard responded ${res.status} for ${path}`, res.status);
      }
      const body: unknown = await res.json();
      if (!Array.isArray(body)) {
        const message = (body as { error?: string } | null)?.error ?? "unexpected response";
        throw new ZkillError(`zKillboard: ${message}`, res.status);
      }
      return body.filter(isKillmail);
    }
    throw lastError ?? new ZkillError("zKillboard request failed", null);
  }
}

function isKillmail(value: unknown): value is ZkillKillmail {
  const v = value as ZkillKillmail;
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isSafeInteger(v.killmail_id) &&
    typeof v.killmail_time === "string" &&
    typeof v.zkb?.hash === "string" &&
    typeof v.victim?.ship_type_id === "number" &&
    Array.isArray(v.attackers)
  );
}

/** Calendar months (UTC) overlapping [since, until], oldest first. */
export function monthsBetween(since: Date, until: Date): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = since.getUTCFullYear();
  let m = since.getUTCMonth() + 1;
  const endKey = until.getUTCFullYear() * 12 + until.getUTCMonth();
  while (y * 12 + (m - 1) <= endKey) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface KillmailRow {
  killmailId: number;
  hash: string;
  killmailTime: Date;
  solarSystemId: number;
  victimCharacterId: number | null;
  victimCorporationId: number | null;
  victimAllianceId: number | null;
  victimShipTypeId: number;
  damageTaken: number;
  attackerCount: number;
  totalValue: number;
  fittedValue: number;
  destroyedValue: number;
  droppedValue: number;
  points: number;
  npc: boolean;
  solo: boolean;
  awox: boolean;
  labels: string[];
}

export interface AttackerRow {
  killmailId: number;
  idx: number;
  characterId: number | null;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  shipTypeId: number | null;
  weaponTypeId: number | null;
  damageDone: number;
  finalBlow: boolean;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const id = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/** Flattens a zKillboard entry into table rows. Pure, so it is easy to test. */
export function toRows(km: ZkillKillmail): { killmail: KillmailRow; attackers: AttackerRow[] } {
  return {
    killmail: {
      killmailId: km.killmail_id,
      hash: km.zkb.hash,
      killmailTime: new Date(km.killmail_time),
      solarSystemId: km.solar_system_id,
      victimCharacterId: id(km.victim.character_id),
      victimCorporationId: id(km.victim.corporation_id),
      victimAllianceId: id(km.victim.alliance_id),
      victimShipTypeId: km.victim.ship_type_id,
      damageTaken: num(km.victim.damage_taken),
      attackerCount: km.attackers.length,
      totalValue: num(km.zkb.totalValue),
      fittedValue: num(km.zkb.fittedValue),
      destroyedValue: num(km.zkb.destroyedValue),
      droppedValue: num(km.zkb.droppedValue),
      points: Math.trunc(num(km.zkb.points)),
      npc: km.zkb.npc === true,
      solo: km.zkb.solo === true,
      awox: km.zkb.awox === true,
      labels: Array.isArray(km.zkb.labels) ? km.zkb.labels.filter((l) => typeof l === "string") : [],
    },
    attackers: km.attackers.map((a, idx) => ({
      killmailId: km.killmail_id,
      idx,
      characterId: id(a.character_id),
      corporationId: id(a.corporation_id),
      allianceId: id(a.alliance_id),
      factionId: id(a.faction_id),
      shipTypeId: id(a.ship_type_id),
      weaponTypeId: id(a.weapon_type_id),
      damageDone: Math.trunc(num(a.damage_done)),
      finalBlow: a.final_blow === true,
    })),
  };
}
