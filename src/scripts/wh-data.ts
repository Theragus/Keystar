/**
 * Builds `src/modules/wormholes/data/static.json` from CCP's static data export (system names, security, regions,
 * wormhole classes) and anoik.is (wormhole types, system effects and statics — community data, credited in the UI).
 * The output is committed; run this by hand after an expansion:
 *
 *   pnpm wh:data              # downloads into .cache/wh-data/ once, then reuses it
 *   pnpm wh:data --refresh    # downloads again
 *   pnpm wh:data --sde <zip> --anoik <json>   # use files you saved yourself
 *
 * Behind an HTTP proxy, Node's fetch needs NODE_USE_ENV_PROXY=1 to honour HTTPS_PROXY.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import {
  CLASS_BY_ID,
  CLASS_KEYS,
  classFromSecurity,
  type ClassKey,
  type KspaceRow,
  type StaticFile,
  type WormholeType,
  type WspaceRow,
} from "@/modules/wormholes/static";

const SDE_URL = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const ANOIK_URL = "https://anoik.is/static/static.json";
const CACHE_DIR = path.join(process.cwd(), ".cache", "wh-data");
const OUTPUT = path.join(process.cwd(), "src", "modules", "wormholes", "data", "static.json");

/** Jove regions: no player access. */
const HIDDEN_REGIONS = new Set([10000004, 10000017, 10000019]);
const SDE_FILES = ["mapSolarSystems.jsonl", "mapConstellations.jsonl", "mapRegions.jsonl", "_sde.jsonl"];

export interface SdeSystem {
  _key: number;
  name: { en: string };
  securityStatus: number;
  regionID: number;
  constellationID: number;
  wormholeClassID?: number;
}
export interface SdeArea {
  _key: number;
  name?: { en: string };
  wormholeClassID?: number;
}
export interface SdeInput {
  systems: SdeSystem[];
  constellations: SdeArea[];
  regions: SdeArea[];
  build: number | null;
}

interface AnoikType {
  typeID: number;
  dest: string | null;
  src: string[] | null;
  static: boolean | null;
  lifetime: number | null;
  total_mass: number | null;
  max_mass_per_jump: number | null;
  mass_regen: number | null;
}
export interface AnoikInput {
  version?: number;
  systems: Record<string, { solarSystemID: number; wormholeClass: string; effectName: string | null; statics: string[] }>;
  wormholes: Record<string, AnoikType>;
  effects: Record<string, Record<string, string[]>>;
}

const isClassKey = (v: unknown): v is ClassKey => typeof v === "string" && (CLASS_KEYS as readonly string[]).includes(v);

function classKeys(values: string[] | null, warn: (m: string) => void, code: string): ClassKey[] | null {
  if (values === null) return null;
  return values.filter((v): v is ClassKey => {
    if (isClassKey(v)) return true;
    warn(`Type ${code}: unknown class "${v}"`);
    return false;
  });
}

/** Pure transform from the two sources to the committed file; returns warnings for anything inconsistent. */
export function buildStaticData(
  anoik: AnoikInput,
  sde: SdeInput,
  generatedAt = new Date().toISOString(),
): { data: StaticFile; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const constellations = new Map(sde.constellations.map((c) => [c._key, c]));
  const regionsById = new Map(sde.regions.map((r) => [r._key, r]));

  const types: Record<string, WormholeType> = {};
  for (const code of Object.keys(anoik.wormholes).sort()) {
    const w = anoik.wormholes[code];
    if (w.dest !== null && !isClassKey(w.dest)) warn(`Type ${code}: unknown destination "${w.dest}"`);
    types[code] = {
      id: w.typeID,
      dest: isClassKey(w.dest) ? w.dest : null,
      src: classKeys(w.src, warn, code),
      static: Boolean(w.static),
      life: w.lifetime,
      mass: w.total_mass,
      jump: w.max_mass_per_jump,
      regen: w.mass_regen,
    };
  }

  const effects: StaticFile["effects"] = {};
  for (const name of Object.keys(anoik.effects).sort()) {
    effects[name] = Object.entries(anoik.effects[name]).map(([modifier, steps]) => [modifier, steps]);
  }

  const anoikById = new Map(Object.values(anoik.systems).map((s) => [s.solarSystemID, s]));
  const wspace: WspaceRow[] = [];
  const kspace: KspaceRow[] = [];
  const usedRegions = new Set<number>();
  for (const s of [...sde.systems].sort((a, b) => a._key - b._key)) {
    if (s._key < 30_000_000 || s._key >= 32_000_000 || HIDDEN_REGIONS.has(s.regionID)) continue;
    const classId =
      s.wormholeClassID ??
      constellations.get(s.constellationID)?.wormholeClassID ??
      regionsById.get(s.regionID)?.wormholeClassID;
    const name = s.name.en;
    if (s._key >= 31_000_000) {
      const cls = classId !== undefined ? CLASS_BY_ID[classId] : undefined;
      const a = anoikById.get(s._key);
      if (!cls) {
        warn(`${name}: unknown wormhole class ${classId}`);
        continue;
      }
      if (!a) warn(`${name}: missing on anoik.is`);
      else if (a.wormholeClass !== cls) warn(`${name}: class ${cls} in the SDE, ${a.wormholeClass} on anoik.is`);
      const statics = (a?.statics ?? []).filter((code) => {
        if (types[code]) return true;
        warn(`${name}: unknown static ${code}`);
        return false;
      });
      wspace.push([s._key, name, cls, s.regionID, a?.effectName ?? null, statics]);
    } else {
      const fromId = classId !== undefined ? CLASS_BY_ID[classId] : undefined;
      const cls = fromId === "hs" || fromId === "ls" || fromId === "ns" || fromId === "pochven" ? fromId : classFromSecurity(s.securityStatus);
      kspace.push([s._key, name, Math.round(s.securityStatus * 10_000) / 10_000, s.regionID, cls]);
    }
    usedRegions.add(s.regionID);
  }
  const wspaceIds = new Set(wspace.map((r) => r[0]));
  for (const a of Object.values(anoik.systems)) {
    if (!wspaceIds.has(a.solarSystemID)) warn(`anoik.is system ${a.solarSystemID} is not in the SDE`);
  }
  const thera = wspace.filter((r) => r[2] === "thera").length;
  if (thera !== 1) warn(`Expected exactly one Thera, found ${thera}`);

  const regions: Record<string, string> = {};
  for (const id of [...usedRegions].sort((a, b) => a - b)) regions[String(id)] = regionsById.get(id)?.name?.en ?? String(id);

  return {
    data: {
      meta: { generatedAt, sdeBuild: sde.build, anoikVersion: anoik.version ?? null },
      regions,
      effects,
      types,
      wspace,
      kspace,
    },
    warnings,
  };
}

/** JSON with one system row per line, so regenerating produces readable diffs. */
export function serialise(data: StaticFile): string {
  const rows = (list: unknown[]) => `[\n${list.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`;
  const block = (value: unknown) => JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
  return [
    "{",
    `  "meta": ${block(data.meta)},`,
    `  "regions": ${JSON.stringify(data.regions)},`,
    `  "effects": ${JSON.stringify(data.effects)},`,
    `  "types": {\n${Object.entries(data.types)
      .map(([code, t]) => `    ${JSON.stringify(code)}: ${JSON.stringify(t)}`)
      .join(",\n")}\n  },`,
    `  "wspace": ${rows(data.wspace)},`,
    `  "kspace": ${rows(data.kspace)}`,
    "}",
    "",
  ].join("\n");
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

export function readSdeZip(zip: Uint8Array): SdeInput {
  const files = unzipSync(zip, { filter: (f) => SDE_FILES.includes(path.basename(f.name)) });
  const get = (name: string) => {
    const entry = Object.entries(files).find(([n]) => path.basename(n) === name);
    if (!entry) throw new Error(`${name} not found in the SDE zip`);
    return strFromU8(entry[1]);
  };
  let build: number | null = null;
  try {
    build = parseJsonl<{ buildNumber?: number }>(get("_sde.jsonl"))[0]?.buildNumber ?? null;
  } catch {
    // Older exports have no _sde.jsonl.
  }
  return {
    systems: parseJsonl<SdeSystem>(get("mapSolarSystems.jsonl")),
    constellations: parseJsonl<SdeArea>(get("mapConstellations.jsonl")),
    regions: parseJsonl<SdeArea>(get("mapRegions.jsonl")),
    build,
  };
}

async function download(url: string, file: string, refresh: boolean): Promise<string> {
  if (existsSync(file) && !refresh) return file;
  console.log(`Downloading ${url} …`);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "Keystar wh-data (https://github.com/Theragus/Keystar)" } });
  } catch (err) {
    throw new Error(
      `Could not reach ${url} (${(err as Error).message}). Behind a proxy, run with NODE_USE_ENV_PROXY=1, ` +
        `or download the file yourself and pass it with --sde / --anoik.`,
    );
  }
  if (!res.ok) throw new Error(`${url} answered ${res.status}; download it yourself and pass it with --sde / --anoik.`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  mkdirSync(CACHE_DIR, { recursive: true });
  const sdePath = argValue(args, "--sde") ?? (await download(SDE_URL, path.join(CACHE_DIR, "sde.zip"), refresh));
  const anoikPath = argValue(args, "--anoik") ?? (await download(ANOIK_URL, path.join(CACHE_DIR, "anoik.json"), refresh));

  const sde = readSdeZip(new Uint8Array(readFileSync(sdePath)));
  const anoik = JSON.parse(readFileSync(anoikPath, "utf8")) as AnoikInput;
  const { data, warnings } = buildStaticData(anoik, sde);
  const text = serialise(data);
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, text);

  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(
    `Wrote ${path.relative(process.cwd(), OUTPUT)} (${Math.round(text.length / 1024)} KB): ` +
      `${data.wspace.length} J-space and ${data.kspace.length} k-space systems, ${Object.keys(data.types).length} ` +
      `wormhole types, SDE build ${data.meta.sdeBuild ?? "?"}, anoik.is data version ${data.meta.anoikVersion ?? "?"}.`,
  );
}

const isMain = process.argv[1] && /wh-data\.(ts|mjs|js)$/.test(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
