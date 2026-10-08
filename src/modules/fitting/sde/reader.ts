import { ByteBuffer } from "flatbuffers";

/*
 * Reads the patched SDE the dogma engine uses (`@eveshipfit/sde`, `dist/sde.dat`, schema `specs/eve.fbs`) so the
 * browser can show names, market groups and slots from the very same file the engine calculates with. Hand-written
 * against the FlatBuffers runtime instead of `flatc`-generated code: the schema is small and the field order below
 * follows `eve.fbs` exactly (vtable slot = declaration index). Per-type attributes and effects stay in the buffer and
 * are read on demand: materialising them all would cost far more memory than the file itself.
 */

const FILE_IDENTIFIER = "ESF1";

export interface SdeType {
  id: number;
  name: string;
  groupId: number;
  categoryId: number;
  published: boolean;
  factionId: number;
  marketGroupId: number;
  metaGroupId: number;
  raceId: number;
  capacity: number | null;
  mass: number | null;
  radius: number | null;
  volume: number | null;
  /** Tech III hulls: the type ids of their modes. */
  modeTypeIds: number[];
  /** Buffer position of the table, for the on-demand readers. */
  readonly pos: number;
}

export interface SdeGroup {
  id: number;
  name: string;
  categoryId: number;
  published: boolean;
}

export interface SdeMarketGroup {
  id: number;
  name: string;
  /** 0 at the root. */
  parentId: number;
  typeIds: number[];
  childIds: number[];
}

export interface SdeAttribute {
  id: number;
  name: string;
  displayName: string;
  defaultValue: number;
  highIsGood: boolean;
  stackable: boolean;
  published: boolean;
  unitId: number;
  categoryId: number;
  iconId: number;
}

export type EffectCategory = "passive" | "active" | "target" | "area" | "online" | "overload" | "dungeon" | "system";
const EFFECT_CATEGORIES: EffectCategory[] = ["passive", "active", "target", "area", "online", "overload", "dungeon", "system"];

export interface SdeEffect {
  id: number;
  name: string;
  displayName: string;
  category: EffectCategory;
  published: boolean;
  isAssistance: boolean;
  isOffensive: boolean;
  dischargeAttributeId: number;
  durationAttributeId: number;
  falloffAttributeId: number;
  rangeAttributeId: number;
  trackingSpeedAttributeId: number;
}

export interface SdeUnit {
  id: number;
  name: string;
  displayName: string;
}

export interface TypeEffect {
  effectId: number;
  isDefault: boolean;
}

export interface Sde {
  buildNumber: number;
  majorVersion: number;
  releaseDate: string;
  types: Map<number, SdeType>;
  groups: Map<number, SdeGroup>;
  categories: Map<number, { id: number; name: string; published: boolean }>;
  marketGroups: Map<number, SdeMarketGroup>;
  metaGroups: Map<number, string>;
  attributes: Map<number, SdeAttribute>;
  attributeIdByName: Map<string, number>;
  effects: Map<number, SdeEffect>;
  effectIdByName: Map<string, number>;
  units: Map<number, SdeUnit>;
  /** A type's base dogma attributes (attribute id → value); empty for unknown types. */
  typeAttributes(typeId: number): Map<number, number>;
  /** A type's dogma effects; empty for unknown types. */
  typeEffects(typeId: number): TypeEffect[];
}

class Table {
  constructor(
    readonly bb: ByteBuffer,
    readonly pos: number,
  ) {}
  private off(field: number): number {
    return this.bb.__offset(this.pos, 4 + field * 2);
  }
  int32(field: number, fallback = 0): number {
    const o = this.off(field);
    return o ? this.bb.readInt32(this.pos + o) : fallback;
  }
  int8(field: number, fallback = 0): number {
    const o = this.off(field);
    return o ? this.bb.readInt8(this.pos + o) : fallback;
  }
  bool(field: number): boolean {
    const o = this.off(field);
    return o ? this.bb.readInt8(this.pos + o) !== 0 : false;
  }
  float32(field: number, fallback = 0): number {
    const o = this.off(field);
    return o ? this.bb.readFloat32(this.pos + o) : fallback;
  }
  /** `float32 = null` in the schema: absent means null. */
  optionalFloat32(field: number): number | null {
    const o = this.off(field);
    return o ? this.bb.readFloat32(this.pos + o) : null;
  }
  string(field: number): string {
    const o = this.off(field);
    return o ? (this.bb.__string(this.pos + o) as string) : "";
  }
  /** Start position and length of a vector field; null when absent. */
  vector(field: number): { start: number; length: number } | null {
    const o = this.off(field);
    if (!o) return null;
    return { start: this.bb.__vector(this.pos + o), length: this.bb.__vector_len(this.pos + o) };
  }
  int32s(field: number): number[] {
    const v = this.vector(field);
    if (!v) return [];
    const out = new Array<number>(v.length);
    for (let i = 0; i < v.length; i++) out[i] = this.bb.readInt32(v.start + i * 4);
    return out;
  }
  tables(field: number): Table[] {
    const v = this.vector(field);
    if (!v) return [];
    const out = new Array<Table>(v.length);
    for (let i = 0; i < v.length; i++) out[i] = new Table(this.bb, this.bb.__indirect(v.start + i * 4));
    return out;
  }
}

function readType(t: Table): SdeType {
  return {
    id: t.int32(0),
    name: t.string(1),
    groupId: t.int32(2),
    categoryId: t.int32(3),
    published: t.bool(4),
    factionId: t.int32(5),
    marketGroupId: t.int32(6),
    metaGroupId: t.int32(7),
    raceId: t.int32(8),
    capacity: t.optionalFloat32(9),
    mass: t.optionalFloat32(10),
    radius: t.optionalFloat32(11),
    volume: t.optionalFloat32(12),
    modeTypeIds: t.int32s(16),
    pos: t.pos,
  };
}

function readAttribute(t: Table): SdeAttribute {
  return {
    id: t.int32(0),
    name: t.string(1),
    displayName: t.string(2),
    defaultValue: t.float32(3),
    highIsGood: t.bool(4),
    stackable: t.bool(5),
    published: t.bool(6),
    unitId: t.int32(7),
    categoryId: t.int32(10),
    iconId: t.int32(11),
  };
}

function readEffect(t: Table): SdeEffect {
  return {
    id: t.int32(0),
    name: t.string(1),
    displayName: t.string(2),
    category: EFFECT_CATEGORIES[t.int8(3)] ?? "passive",
    published: t.bool(4),
    isAssistance: t.bool(6),
    isOffensive: t.bool(7),
    dischargeAttributeId: t.int32(12),
    durationAttributeId: t.int32(13),
    falloffAttributeId: t.int32(14),
    rangeAttributeId: t.int32(16),
    trackingSpeedAttributeId: t.int32(18),
  };
}

/** Parses `sde.dat`. Throws when the bytes are not an ESF SDE file. */
export function readSde(bytes: Uint8Array): Sde {
  const bb = new ByteBuffer(bytes);
  if (!bb.__has_identifier(FILE_IDENTIFIER)) throw new Error("Not an EVEShipFit SDE file");
  const root = new Table(bb, bb.readInt32(bb.position()) + bb.position());

  const types = new Map<number, SdeType>();
  for (const t of root.tables(1)) {
    const type = readType(t);
    types.set(type.id, type);
  }
  const groups = new Map<number, SdeGroup>();
  for (const t of root.tables(2)) groups.set(t.int32(0), { id: t.int32(0), name: t.string(1), categoryId: t.int32(2), published: t.bool(3) });
  const categories = new Map<number, { id: number; name: string; published: boolean }>();
  for (const t of root.tables(3)) categories.set(t.int32(0), { id: t.int32(0), name: t.string(1), published: t.bool(2) });

  const attributes = new Map<number, SdeAttribute>();
  const attributeIdByName = new Map<string, number>();
  for (const t of root.tables(4)) {
    const a = readAttribute(t);
    attributes.set(a.id, a);
    attributeIdByName.set(a.name, a.id);
  }
  const effects = new Map<number, SdeEffect>();
  const effectIdByName = new Map<string, number>();
  for (const t of root.tables(5)) {
    const e = readEffect(t);
    effects.set(e.id, e);
    effectIdByName.set(e.name, e.id);
  }

  const marketGroups = new Map<number, SdeMarketGroup>();
  for (const t of root.tables(8)) {
    const id = t.int32(0);
    marketGroups.set(id, { id, name: t.string(1), parentId: t.int32(2), typeIds: t.int32s(3), childIds: [] });
  }
  for (const g of marketGroups.values()) marketGroups.get(g.parentId)?.childIds.push(g.id);
  for (const g of marketGroups.values()) g.childIds.sort((a, b) => marketGroups.get(a)!.name.localeCompare(marketGroups.get(b)!.name));

  const metaGroups = new Map<number, string>();
  for (const t of root.tables(9)) metaGroups.set(t.int32(0), t.string(1));
  const units = new Map<number, SdeUnit>();
  for (const t of root.tables(10)) units.set(t.int32(0), { id: t.int32(0), name: t.string(1), displayName: t.string(2) });

  return {
    buildNumber: root.int32(0),
    majorVersion: root.int32(14),
    releaseDate: root.string(12),
    types,
    groups,
    categories,
    marketGroups,
    metaGroups,
    attributes,
    attributeIdByName,
    effects,
    effectIdByName,
    units,
    typeAttributes(typeId) {
      const out = new Map<number, number>();
      const type = types.get(typeId);
      if (!type) return out;
      const v = new Table(bb, type.pos).vector(13);
      if (!v) return out;
      for (let i = 0; i < v.length; i++) {
        // struct TypeDogmaAttribute { attribute_id: int32; value: float32 } — 8 bytes
        const p = v.start + i * 8;
        out.set(bb.readInt32(p), bb.readFloat32(p + 4));
      }
      return out;
    },
    typeEffects(typeId) {
      const type = types.get(typeId);
      if (!type) return [];
      const v = new Table(bb, type.pos).vector(14);
      if (!v) return [];
      const out = new Array<TypeEffect>(v.length);
      for (let i = 0; i < v.length; i++) {
        // struct TypeDogmaEffect { effect_id: int32; is_default: bool } — padded to 8 bytes
        const p = v.start + i * 8;
        out[i] = { effectId: bb.readInt32(p), isDefault: bb.readInt8(p + 4) !== 0 };
      }
      return out;
    },
  };
}
