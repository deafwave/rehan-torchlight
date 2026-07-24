/**
 * Canonical, calculation-neutral import boundary for TLI Lens.
 *
 * Compendium documents are planner state. tli_dump portable-v3 documents are
 * evidence snapshots and deliberately are not planner documents. This adapter
 * normalizes both into the same structural vocabulary without claiming that a
 * portable record has planner semantics which its source did not prove.
 */

export type SnapshotSourceKind =
  | "compendium"
  | "portable-v3"
  | "portable-converter";
export type DiagnosticSeverity = "warning" | "error";

export interface ImportDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  path: string;
  message: string;
}

export interface NormalizedIdentity {
  /** Stable identity. Labels are never used as catalog identity. */
  key: string;
  catalogId: string | null;
  nativeId: string | null;
  domain: string | null;
  label: string | null;
}

export interface NormalizedRoll {
  value: number | string | null;
  min: number | null;
  max: number | null;
  sign: string | null;
  unit: string | null;
}

export interface NormalizedModifier {
  key: string;
  family: string;
  id: string | null;
  text: string | null;
  tier: string | number | null;
  rolls: NormalizedRoll[];
  fingerprint: string;
}

export interface NormalizedGear {
  slot: string;
  itemKind: "gear" | "vorax" | "unmapped";
  instanceId: string | null;
  identity: NormalizedIdentity | null;
  name: string;
  rarity: string | null;
  category: string | null;
  subtype: string | null;
  itemLevel: number | null;
  equipped: boolean;
  missingReference: boolean;
  modifiers: NormalizedModifier[];
  diagnostics: string[];
  fingerprint: string;
}

export interface NormalizedSupport {
  slot: string;
  identity: NormalizedIdentity;
  type: string;
  level: number | null;
  tier: number | null;
  rank: number | null;
  rolls: Array<number | string>;
  fingerprint: string;
}

export interface NormalizedSkill {
  slot: string;
  kind: "active" | "passive" | "support" | "unknown";
  identity: NormalizedIdentity;
  level: number | null;
  enabled: boolean;
  supports: NormalizedSupport[];
  modules: NormalizedIdentity[];
  moduleSlots: Array<string | null>;
  fingerprint: string;
}

export interface NormalizedTree {
  slot: string;
  treeId: string;
  identity: NormalizedIdentity | null;
  nodePoints: Record<string, number>;
  selectedNotable12: string | null;
  selectedNotable24: string | null;
  prismId: string | null;
  prismFingerprint: string | null;
  fingerprint: string;
}

export interface NormalizedMemory {
  slot: string;
  instanceId: string | null;
  identity: NormalizedIdentity | null;
  name: string;
  type: string | null;
  rarity: string | null;
  modifiers: NormalizedModifier[];
  fingerprint: string;
}

export interface NormalizedSlate {
  key: string;
  position: string;
  identity: NormalizedIdentity | null;
  name: string;
  type: string | null;
  god: string | number | null;
  affixes: NormalizedModifier[];
  fingerprint: string;
}

export interface NormalizedKismet {
  key: string;
  identity: NormalizedIdentity | null;
  pactIndex: number | null;
  nodeId: string | null;
  rolls: Array<number | string>;
  fingerprint: string;
}

export interface NormalizedPact {
  slot: string;
  identity: NormalizedIdentity;
  level: number | null;
  allocatedNodes: string[];
  expansionFingerprint: string | null;
  kismets: NormalizedKismet[];
  fingerprint: string;
}

export interface NormalizedComponent {
  key: string;
  slot: string;
  identity: NormalizedIdentity | null;
  name: string;
  fingerprint: string;
}

export interface NormalizedHero {
  identity: NormalizedIdentity | null;
  name: string;
  level: number | null;
  selections: Record<string, string | null>;
  fingerprint: string;
}

export interface NormalizedLoadout {
  id: string;
  index: number;
  name: string;
  isCurrent: boolean;
  hero: NormalizedHero;
  gear: NormalizedGear[];
  skills: NormalizedSkill[];
  trees: NormalizedTree[];
  memories: NormalizedMemory[];
  slates: NormalizedSlate[];
  pactspirits: NormalizedPact[];
  prisms: NormalizedComponent[];
  scentBottleFingerprint: string | null;
  diagnostics: ImportDiagnostic[];
  fingerprint: string;
}

export interface NormalizedBuild {
  sourceKind: SnapshotSourceKind;
  sourceSchemaVersion: number | null;
  id: string;
  name: string;
  patch: string;
  capturedAt: string | null;
  loadouts: NormalizedLoadout[];
  diagnostics: ImportDiagnostic[];
  fingerprint: string;
}

export class SnapshotAdapterError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = "SnapshotAdapterError";
    this.code = code;
    this.path = path;
  }
}

type JsonObject = Record<string, any>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMPORT_DEPTH = 64;
const MAX_IMPORT_NODES = 250_000;

const PORTABLE_ROOT_FIELDS = [
  "schemaVersion",
  "capturedAt",
  "source",
  "compendiumImportable",
  "player",
  "proBuild",
  "mappingIssues",
] as const;

const PORTABLE_LOADOUT_FIELDS = [
  "hero",
  "heroMemories",
  "etherealPrisms",
  "gear",
  "vorax",
  "skills",
  "skillTree",
  "divinity",
  "pactspirits",
  "kismets",
  "scentBottle",
  "unmappedSourceCollections",
] as const;

const PORTABLE_ITEM_FIELDS = [
  "source",
  "instanceId",
  "identity",
  "location",
  "itemLevel",
  "rarity",
  "quality",
  "corroded",
  "affixes",
  "data",
  "diagnostics",
] as const;

const PORTABLE_AFFIX_FIELDS = [
  "bAffixInfoList",
  "baseAttrInfoList",
  "fixedBaseAffix",
  "prefixInfoList",
  "suffixInfoList",
  "enchantAffixList",
  "chipAffixList",
] as const;

const GEAR_SLOT_BY_NATIVE_ID = new Map<number, string>([
  [1, "helmet"],
  [2, "mainHand"],
  [3, "offHand"],
  [4, "chest"],
  [5, "necklace"],
  [6, "ring1"],
  [7, "ring2"],
  [8, "belt"],
  [9, "gloves"],
  [10, "boots"],
]);

const TALENT_TREE_BY_CAREER_ID = new Map<number, string>([
  [1, "god_of_might"],
  [2, "goddess_of_hunting"],
  [3, "goddess_of_knowledge"],
  [4, "god_of_war"],
  [5, "goddess_of_deception"],
  [6, "god_of_machines"],
  [11, "the_brave"],
  [12, "onslaughter"],
  [13, "warlord"],
  [14, "warrior"],
  [21, "marksman"],
  [22, "bladerunner"],
  [23, "druid"],
  [24, "assassin"],
  [31, "magister"],
  [32, "arcanist"],
  [33, "elementalist"],
  [34, "prophet"],
  [41, "shadowdancer"],
  [42, "ronin"],
  [43, "ranger"],
  [44, "sentinel"],
  [51, "shadowmaster"],
  [52, "psychic"],
  [53, "warlock"],
  [54, "lich"],
  [61, "machinist"],
  [62, "steel_vanguard"],
  [63, "alchemist"],
  [64, "artisan"],
]);

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function fail(code: string, path: string, detail: string): never {
  throw new SnapshotAdapterError(code, path, `${path}: ${detail}`);
}

/**
 * Imported JSON reaches recursive canonicalization later in this module.
 * Bound and validate its object graph iteratively first so a deeply nested,
 * cyclic, or extraordinarily wide programmatic input cannot overflow the
 * stack or monopolize the browser. Parsed JSON never contains aliases, so a
 * repeated object identity is also outside the accepted document contract.
 */
function assertImportShapeBudget(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_IMPORT_NODES) {
      fail(
        "import_shape_limit",
        "document",
        `contains more than ${MAX_IMPORT_NODES.toLocaleString("en-US")} values.`,
      );
    }
    if (entry.depth > MAX_IMPORT_DEPTH) {
      fail(
        "import_shape_limit",
        "document",
        `is nested more than ${MAX_IMPORT_DEPTH} levels deep.`,
      );
    }
    if (!entry.value || typeof entry.value !== "object") continue;
    const object = entry.value as object;
    if (seen.has(object)) {
      fail(
        "invalid_json_graph",
        "document",
        "contains a cyclic or repeated object reference rather than a JSON tree.",
      );
    }
    seen.add(object);
    const children = Array.isArray(entry.value)
      ? entry.value
      : Object.values(entry.value);
    for (const child of children) {
      pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
}

function requiredObject(value: unknown, path: string, code: string): JsonObject {
  if (!isObject(value)) fail(code, path, "must be an object.");
  return value;
}

function requiredArray(value: unknown, path: string, code: string): any[] {
  if (!Array.isArray(value)) fail(code, path, "must be an array.");
  return value;
}

function assertFields(
  value: JsonObject,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  code: string,
) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) fail(code, `${path}.${unexpected}`, "is not part of portable-v3.");
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) fail(code, `${path}.${missing}`, "is required by portable-v3.");
}

function assertNullableInteger(value: unknown, path: string) {
  if (value !== null && finiteInteger(value) === null) {
    fail("invalid_portable_v3", path, "must be a safe integer or null.");
  }
}

function assertNullableString(value: unknown, path: string) {
  if (value !== null && typeof value !== "string") {
    fail("invalid_portable_v3", path, "must be text or null.");
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

/** Deterministic, non-cryptographic semantic fingerprint for comparison keys. */
export function structuralFingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of canonicalJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function keyedFingerprints<T>(
  values: T[],
  key: (value: T) => string,
  fingerprint: (value: T) => string,
) {
  return values
    .map((value) => [key(value), fingerprint(value)] as const)
    .sort(([leftKey, leftFingerprint], [rightKey, rightFingerprint]) =>
      leftKey.localeCompare(rightKey) || leftFingerprint.localeCompare(rightFingerprint));
}

function identity(
  catalogIdValue: unknown,
  nativeIdValue: unknown,
  labelValue: unknown,
  domainValue: unknown,
  fallbackKey: string,
): NormalizedIdentity {
  const catalogId = nonEmptyString(catalogIdValue);
  const nativeId = scalarText(nativeIdValue);
  const label = nonEmptyString(labelValue);
  const domain = nonEmptyString(domainValue);
  return {
    key: catalogId
      ? `catalog:${domain ?? "unknown"}:${catalogId}`
      : nativeId
        ? `native:${domain ?? "unknown"}:${nativeId}`
        : fallbackKey,
    catalogId,
    nativeId,
    domain,
    label,
  };
}

function portableIdentity(value: unknown, fallbackKey: string): NormalizedIdentity | null {
  if (!isObject(value)) return null;
  return identity(value.compendiumId, value.gameId, value.label, value.domain, fallbackKey);
}

function itemIdentity(value: unknown, fallbackKey: string): NormalizedIdentity | null {
  const source = objectValue(value);
  return portableIdentity(source.special, `${fallbackKey}:special`)
    ?? portableIdentity(source.base, `${fallbackKey}:base`);
}

function roll(value: unknown): NormalizedRoll | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, min: null, max: null, sign: null, unit: null };
  }
  if (typeof value === "string" && value.trim()) {
    return { value: value.trim(), min: null, max: null, sign: null, unit: null };
  }
  if (!isObject(value)) return null;
  const observed = finiteNumber(value.value);
  const textValue = observed === null ? nonEmptyString(value.value) : null;
  return {
    value: observed ?? textValue,
    min: finiteNumber(value.minValue ?? value.min),
    max: finiteNumber(value.maxValue ?? value.max),
    sign: nonEmptyString(value.sign),
    unit: nonEmptyString(value.unit),
  };
}

function rolls(value: unknown): NormalizedRoll[] {
  return arrayValue(value).map(roll).filter((entry): entry is NormalizedRoll => Boolean(entry));
}

function modifier(
  family: string,
  value: unknown,
  index: number,
  definition?: JsonObject,
): NormalizedModifier {
  const source = objectValue(value);
  const id = scalarText(
    source.modId
      ?? source.modifierId
      ?? source.modGuid
      ?? source.guid
      ?? source.affixId
      ?? source.implicitId
      ?? source.blendId
      ?? source.sequenceId
      ?? source.tierId
      ?? source.Id
      ?? source.ID
      ?? source.id
      ?? definition?.modifierId
      ?? definition?.id,
  );
  const text = nonEmptyString(
    source.modifierDescription
      ?? source.description
      ?? source.name
      ?? source.rawText
      ?? source.descriptionTemplate
      ?? definition?.rawText
      ?? definition?.description
      ?? definition?.descriptionTemplate
      ?? definition?.normalDescriptionTemplate
      ?? definition?.corrodedDescriptionTemplate,
  );
  const rollSource = source.rolledValues
    ?? source.values
    ?? source.DynArgs
    ?? source.dynArgs
    ?? source.rollValues;
  const observedRolls = rollSource !== undefined
    ? rolls(rollSource)
    : (Object.hasOwn(source, "value") ? [roll(source)].filter(
        (entry): entry is NormalizedRoll => Boolean(entry),
      ) : []);
  const tier = scalarText(source.tier ?? source.Tier) ?? finiteInteger(source.tier ?? source.Tier);
  const semantic = { family, id, text, tier, rolls: observedRolls };
  return {
    key: `${family}:${id ?? index}`,
    family,
    id,
    text,
    tier,
    rolls: observedRolls,
    fingerprint: structuralFingerprint(semantic),
  };
}

function compendiumModifiers(itemValue: unknown): NormalizedModifier[] {
  const item = objectValue(itemValue);
  const result: NormalizedModifier[] = [];
  const addArray = (family: string, value: unknown) => {
    arrayValue(value).filter(Boolean).forEach((entry, index) =>
      result.push(modifier(family, entry, index)));
  };
  const addOne = (family: string, value: unknown) => {
    if (value !== null && value !== undefined) result.push(modifier(family, value, 0));
  };
  addArray("legendary", item.legendaryMods);
  addArray("implicit", objectValue(item.baseItem).implicits);
  addArray("prefix", item.prefixes);
  addArray("suffix", item.suffixes);
  addArray("vorax", item.affixes);
  addOne("base", item.baseAffix);
  addOne("base", item.baseAffix2);
  addOne("sweetDream", item.sweetDreamAffix);
  addOne("corrosion", item.corrosionImplicit);
  addOne("beltBlend", item.beltBlend);
  addOne("towerSequence", item.towerSequence);
  return result;
}

function metadataDefinitionMap(itemValue: unknown): Map<string, JsonObject> {
  const item = objectValue(itemValue);
  const selected = objectValue(item.identity?.special ?? item.identity?.base);
  const metadata = objectValue(selected.metadata);
  const definitions = new Map<string, JsonObject>();
  for (const field of [
    "prefixAffixes",
    "suffixAffixes",
    "baseAffixes",
    "sweetDreamAffixes",
    "corrosionImplicits",
    "beltBlends",
    "towerSequences",
    "legendaryMods",
    "randomAffixMods",
  ]) {
    for (const value of arrayValue(metadata[field])) {
      const definition = objectValue(value);
      for (const candidate of [
        definition.modifierId,
        definition.normalModifierId,
        definition.corrodedModifierId,
        definition.id,
        definition.affixId,
        definition.tierId,
      ]) {
        const key = scalarText(candidate);
        if (key) definitions.set(key, definition);
      }
    }
  }
  return definitions;
}

function rawAffixEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];
  if (["Id", "ID", "id", "modifierId", "ModifierId"].some((key) => Object.hasOwn(value, key))) {
    return [value];
  }
  return Object.values(value).flatMap(rawAffixEntries);
}

function portableModifiers(itemValue: unknown): NormalizedModifier[] {
  const item = objectValue(itemValue);
  const overlay = objectValue(objectValue(item.data).compendium);
  const materialized = compendiumModifiers(overlay);
  if (materialized.length > 0) return materialized;

  const definitions = metadataDefinitionMap(item);
  const result: NormalizedModifier[] = [];
  const affixes = objectValue(item.affixes);
  for (const family of PORTABLE_AFFIX_FIELDS) {
    rawAffixEntries(affixes[family]).forEach((entry, index) => {
      const source = objectValue(entry);
      const id = scalarText(
        source.Id ?? source.ID ?? source.id ?? source.ModifierId ?? source.modifierId,
      );
      result.push(modifier(family, entry, index, id ? definitions.get(id) : undefined));
    });
  }
  const selected = objectValue(item.identity?.special ?? item.identity?.base);
  arrayValue(objectValue(selected.metadata).implicits).forEach((entry, index) =>
    result.unshift(modifier("implicit", entry, index)));
  return result;
}

function normalizeNodePoints(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, points] of Object.entries(objectValue(value))) {
    const amount = finiteInteger(points);
    if (amount !== null && amount >= 0) result[key] = amount;
  }
  return result;
}

function validPortableIdentity(value: unknown, path: string) {
  if (value === null) return;
  const object = requiredObject(value, path, "invalid_portable_v3");
  assertFields(
    object,
    ["gameId", "domain", "compendiumId", "label", "metadata"],
    ["gameId", "domain", "compendiumId", "label"],
    path,
    "invalid_portable_v3",
  );
  if (typeof object.gameId !== "string") fail("invalid_portable_v3", `${path}.gameId`, "must be text.");
  assertNullableString(object.domain, `${path}.domain`);
  assertNullableString(object.label, `${path}.label`);
  if (object.compendiumId !== null
      && (!nonEmptyString(object.compendiumId) || !UUID_PATTERN.test(object.compendiumId))) {
    fail("invalid_portable_v3", `${path}.compendiumId`, "must be a UUID or null.");
  }
  if (Object.hasOwn(object, "metadata") && !isObject(object.metadata)) {
    fail("invalid_portable_v3", `${path}.metadata`, "must be an object when present.");
  }
}

function validatePortableItem(value: unknown, path: string) {
  const item = requiredObject(value, path, "invalid_portable_v3");
  assertFields(
    item,
    PORTABLE_ITEM_FIELDS,
    PORTABLE_ITEM_FIELDS,
    path,
    "invalid_portable_v3",
  );
  const source = requiredObject(item.source, `${path}.source`, "invalid_portable_v3");
  assertFields(
    source,
    ["collection", "key"],
    ["collection", "key"],
    `${path}.source`,
    "invalid_portable_v3",
  );
  if (!nonEmptyString(source.collection) || !nonEmptyString(source.key)) {
    fail("invalid_portable_v3", `${path}.source`, "collection and key must be non-empty text.");
  }
  assertNullableString(item.instanceId, `${path}.instanceId`);
  assertNullableInteger(item.itemLevel, `${path}.itemLevel`);
  assertNullableInteger(item.rarity, `${path}.rarity`);
  assertNullableInteger(item.quality, `${path}.quality`);
  if (item.corroded !== null && typeof item.corroded !== "boolean") {
    fail("invalid_portable_v3", `${path}.corroded`, "must be a boolean or null.");
  }
  const identities = requiredObject(item.identity, `${path}.identity`, "invalid_portable_v3");
  assertFields(
    identities,
    ["base", "special"],
    ["base", "special"],
    `${path}.identity`,
    "invalid_portable_v3",
  );
  validPortableIdentity(identities.base, `${path}.identity.base`);
  validPortableIdentity(identities.special, `${path}.identity.special`);
  const location = requiredObject(item.location, `${path}.location`, "invalid_portable_v3");
  assertFields(
    location,
    ["bag", "equipSlot", "page", "slot"],
    ["bag", "equipSlot", "page", "slot"],
    `${path}.location`,
    "invalid_portable_v3",
  );
  for (const field of ["bag", "equipSlot", "page", "slot"]) {
    assertNullableInteger(location[field], `${path}.location.${field}`);
  }
  const affixes = requiredObject(item.affixes, `${path}.affixes`, "invalid_portable_v3");
  assertFields(
    affixes,
    PORTABLE_AFFIX_FIELDS,
    PORTABLE_AFFIX_FIELDS,
    `${path}.affixes`,
    "invalid_portable_v3",
  );
  const itemDiagnostics = requiredArray(
    item.diagnostics,
    `${path}.diagnostics`,
    "invalid_portable_v3",
  );
  if (itemDiagnostics.some((entry) => typeof entry !== "string")) {
    fail("invalid_portable_v3", `${path}.diagnostics`, "must contain only text.");
  }
}

function validatePortableV3(value: JsonObject) {
  assertFields(
    value,
    PORTABLE_ROOT_FIELDS,
    PORTABLE_ROOT_FIELDS,
    "portable",
    "invalid_portable_v3",
  );
  if (finiteInteger(value.schemaVersion) !== 3) {
    fail(
      "unsupported_portable_version",
      "portable.schemaVersion",
      `version ${String(value.schemaVersion)} is not supported; expected version 3.`,
    );
  }
  if (value.compendiumImportable !== false) {
    fail(
      "invalid_portable_v3",
      "portable.compendiumImportable",
      "must be false for the portable evidence contract.",
    );
  }
  const dateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!nonEmptyString(value.capturedAt)
      || !dateTimePattern.test(value.capturedAt)
      || !Number.isFinite(Date.parse(value.capturedAt))) {
    fail("invalid_portable_v3", "portable.capturedAt", "must be an ISO date-time string.");
  }
  const source = requiredObject(value.source, "portable.source", "invalid_portable_v3");
  assertFields(
    source,
    ["kind", "executable", "profile", "catalogPatch", "layoutCompatible", "processState"],
    ["kind", "executable", "profile", "catalogPatch", "layoutCompatible", "processState"],
    "portable.source",
    "invalid_portable_v3",
  );
  if (source.kind !== "liveMemory") {
    fail("invalid_portable_v3", "portable.source.kind", "must be liveMemory.");
  }
  if (!nonEmptyString(source.catalogPatch)) {
    fail("invalid_portable_v3", "portable.source.catalogPatch", "must be non-empty text.");
  }
  if (typeof source.executable !== "string"
      || (source.profile !== null && typeof source.profile !== "string")
      || typeof source.layoutCompatible !== "boolean"
      || !new Set([
        "waiting",
        "connected",
        "incompatible",
        "error",
        "unsupportedPlatform",
      ]).has(source.processState)) {
    fail("invalid_portable_v3", "portable.source", "contains invalid profile fields.");
  }

  const player = requiredObject(value.player, "portable.player", "invalid_portable_v3");
  assertFields(
    player,
    ["playerId", "teamPlayerIds", "items"],
    ["playerId", "teamPlayerIds", "items"],
    "portable.player",
    "invalid_portable_v3",
  );
  assertNullableString(player.playerId, "portable.player.playerId");
  const teamIds = requiredArray(
    player.teamPlayerIds,
    "portable.player.teamPlayerIds",
    "invalid_portable_v3",
  );
  if (teamIds.some((entry) => typeof entry !== "string")) {
    fail("invalid_portable_v3", "portable.player.teamPlayerIds", "must contain text IDs.");
  }
  requiredArray(player.items, "portable.player.items", "invalid_portable_v3")
    .forEach((item, index) => validatePortableItem(item, `portable.player.items[${index}]`));

  const proBuild = requiredObject(value.proBuild, "portable.proBuild", "invalid_portable_v3");
  assertFields(
    proBuild,
    ["id", "name", "sourcePage", "loadout"],
    ["id", "loadout"],
    "portable.proBuild",
    "invalid_portable_v3",
  );
  assertNullableString(proBuild.id, "portable.proBuild.id");
  if (Object.hasOwn(proBuild, "name")) assertNullableString(proBuild.name, "portable.proBuild.name");
  if (Object.hasOwn(proBuild, "sourcePage")) {
    assertNullableString(proBuild.sourcePage, "portable.proBuild.sourcePage");
  }
  const loadout = requiredObject(
    proBuild.loadout,
    "portable.proBuild.loadout",
    "invalid_portable_v3",
  );
  assertFields(
    loadout,
    PORTABLE_LOADOUT_FIELDS,
    PORTABLE_LOADOUT_FIELDS,
    "portable.proBuild.loadout",
    "invalid_portable_v3",
  );
  const hero = requiredObject(
    loadout.hero,
    "portable.proBuild.loadout.hero",
    "invalid_portable_v3",
  );
  assertFields(
    hero,
    ["identity", "sourceName", "level", "sourceData"],
    ["identity", "sourceName", "level", "sourceData"],
    "portable.proBuild.loadout.hero",
    "invalid_portable_v3",
  );
  validPortableIdentity(hero.identity, "portable.proBuild.loadout.hero.identity");
  assertNullableString(hero.sourceName, "portable.proBuild.loadout.hero.sourceName");
  assertNullableInteger(hero.level, "portable.proBuild.loadout.hero.level");

  for (const sectionName of ["heroMemories", "etherealPrisms", "gear", "vorax", "skills"]) {
    const path = `portable.proBuild.loadout.${sectionName}`;
    const section = requiredObject(loadout[sectionName], path, "invalid_portable_v3");
    assertFields(
      section,
      ["sourceCollection", "items"],
      ["sourceCollection", "items"],
      path,
      "invalid_portable_v3",
    );
    assertNullableString(section.sourceCollection, `${path}.sourceCollection`);
    requiredArray(section.items, `${path}.items`, "invalid_portable_v3")
      .forEach((item, index) => validatePortableItem(item, `${path}.items[${index}]`));
  }
  for (const sectionName of ["skillTree", "divinity", "pactspirits", "kismets", "scentBottle"]) {
    const path = `portable.proBuild.loadout.${sectionName}`;
    const section = requiredObject(loadout[sectionName], path, "invalid_portable_v3");
    assertFields(
      section,
      ["sourceCollection", "records"],
      ["sourceCollection", "records"],
      path,
      "invalid_portable_v3",
    );
    assertNullableString(section.sourceCollection, `${path}.sourceCollection`);
    requiredArray(section.records, `${path}.records`, "invalid_portable_v3")
      .forEach((recordValue, index) => {
        const recordPath = `${path}.records[${index}]`;
        const record = requiredObject(recordValue, recordPath, "invalid_portable_v3");
        assertFields(
          record,
          ["sourceKey", "identity", "data"],
          ["sourceKey", "identity", "data"],
          recordPath,
          "invalid_portable_v3",
        );
        if (typeof record.sourceKey !== "string") {
          fail("invalid_portable_v3", `${recordPath}.sourceKey`, "must be text.");
        }
        validPortableIdentity(record.identity, `${recordPath}.identity`);
      });
  }
  const unmapped = requiredObject(
    loadout.unmappedSourceCollections,
    "portable.proBuild.loadout.unmappedSourceCollections",
    "invalid_portable_v3",
  );
  const unmappedNames = [
    "unclassifiedWearItems",
    "otherWearItems",
    "jewelItems",
    "heroCharacterItems",
  ];
  assertFields(
    unmapped,
    unmappedNames,
    unmappedNames,
    "portable.proBuild.loadout.unmappedSourceCollections",
    "invalid_portable_v3",
  );
  for (const sectionName of unmappedNames) {
    const path = `portable.proBuild.loadout.unmappedSourceCollections.${sectionName}`;
    const section = requiredObject(unmapped[sectionName], path, "invalid_portable_v3");
    assertFields(
      section,
      ["sourceCollection", "items"],
      ["sourceCollection", "items"],
      path,
      "invalid_portable_v3",
    );
    assertNullableString(section.sourceCollection, `${path}.sourceCollection`);
    requiredArray(section.items, `${path}.items`, "invalid_portable_v3")
      .forEach((item, index) => validatePortableItem(item, `${path}.items[${index}]`));
  }
  const issues = requiredArray(
    value.mappingIssues,
    "portable.mappingIssues",
    "invalid_portable_v3",
  );
  const issueKinds = new Set([
    "targetUnsupported",
    "sourceMissing",
    "sourcePartial",
    "catalogUnresolved",
    "ambiguous",
  ]);
  issues.forEach((issueValue, index) => {
    const path = `portable.mappingIssues[${index}]`;
    const issue = requiredObject(issueValue, path, "invalid_portable_v3");
    assertFields(
      issue,
      ["kind", "path", "sourcePath", "message"],
      ["kind", "path", "sourcePath", "message"],
      path,
      "invalid_portable_v3",
    );
    if (!issueKinds.has(issue.kind)
        || typeof issue.path !== "string"
        || typeof issue.message !== "string"
        || (issue.sourcePath !== null && typeof issue.sourcePath !== "string")) {
      fail("invalid_portable_v3", path, "contains invalid mapping-issue fields.");
    }
  });
}

function diagnostic(
  diagnostics: ImportDiagnostic[],
  code: string,
  path: string,
  message: string,
  severity: DiagnosticSeverity = "warning",
) {
  diagnostics.push({ code, path, message, severity });
}

function softArray(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): any[] {
  if (value === undefined || value === null) {
    diagnostic(diagnostics, "section_missing", path, "Section is missing; treated as empty.");
    return [];
  }
  if (!Array.isArray(value)) {
    diagnostic(diagnostics, "section_malformed", path, "Expected an array; treated as empty.");
    return [];
  }
  return value;
}

function compendiumGear(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedGear[] {
  const loadout = objectValue(loadoutValue);
  const gearSection = objectValue(loadout.gear);
  const voraxSection = objectValue(loadout.vorax);
  const inventory = new Map<string, { item: JsonObject; kind: "gear" | "vorax" }>();
  for (const [sectionName, section, kind] of [
    ["gear", gearSection, "gear"],
    ["vorax", voraxSection, "vorax"],
  ] as const) {
    softArray(section.inventory, `${path}.${sectionName}.inventory`, diagnostics)
      .forEach((itemValue, index) => {
        if (!isObject(itemValue)) {
          diagnostic(
            diagnostics,
            "malformed_item",
            `${path}.${sectionName}.inventory[${index}]`,
            "Item is not an object and was ignored.",
          );
          return;
        }
        const id = nonEmptyString(itemValue.id);
        if (!id) {
          diagnostic(
            diagnostics,
            "item_id_missing",
            `${path}.${sectionName}.inventory[${index}].id`,
            "Inventory item has no stable instance id and cannot be equipped.",
          );
          return;
        }
        if (inventory.has(id)) {
          diagnostic(
            diagnostics,
            "duplicate_item_id",
            `${path}.${sectionName}.inventory[${index}].id`,
            `Duplicate inventory id ${id}; the first record was retained.`,
          );
          return;
        }
        inventory.set(id, { item: itemValue, kind });
      });
  }

  const equipped = objectValue(gearSection.equipped);
  if (!isObject(gearSection.equipped)) {
    diagnostic(
      diagnostics,
      "gear_equipped_missing",
      `${path}.gear.equipped`,
      "Equipped gear map is missing; no equipment slots could be proven.",
    );
  }
  return Object.entries(equipped).map(([slot, reference]) => {
    const instanceId = nonEmptyString(reference);
    const entry = instanceId ? inventory.get(instanceId) : undefined;
    if (instanceId && !entry) {
      diagnostic(
        diagnostics,
        "equipped_reference_missing",
        `${path}.gear.equipped.${slot}`,
        `Equipped item ${instanceId} is absent from gear and Vorax inventories.`,
      );
    }
    const item = entry?.item ?? {};
    const legendary = objectValue(item.legendaryItem);
    const base = objectValue(item.baseItem);
    const voraxLegendary = arrayValue(item.affixes)
      .map(objectValue)
      .find((affix) => nonEmptyString(affix.legendaryId));
    const catalogId = legendary.legendaryId ?? base.baseItemId ?? voraxLegendary?.legendaryId;
    const label = nonEmptyString(
      item.customName
        ?? (entry?.kind === "vorax" ? voraxLegendary?.legendaryName : null)
        ?? item.displayName
        ?? legendary.name
        ?? base.name
        ?? voraxLegendary?.legendaryName
        ?? item.limbType,
    );
    const normalizedIdentity = catalogId
      ? identity(catalogId, null, label, entry?.kind ?? "gear", `compendium:${instanceId}`)
      : null;
    const modifiers = entry ? compendiumModifiers(item) : [];
    const semantic = {
      itemKind: entry?.kind ?? "gear",
      identity: normalizedIdentity?.key ?? null,
      rarity: scalarText(item.rarity),
      category: nonEmptyString(item.gearCategory),
      subtype: nonEmptyString(item.gearSubType),
      itemLevel: finiteInteger(item.itemLevel),
      modifiers: modifiers.map((value) => value.fingerprint),
      missingReference: Boolean(instanceId && !entry),
    };
    return {
      slot,
      itemKind: entry?.kind ?? "gear",
      instanceId,
      identity: normalizedIdentity,
      name: instanceId ? label ?? (entry ? "Unnamed item" : "Missing item reference") : "Empty",
      rarity: scalarText(item.rarity),
      category: nonEmptyString(item.gearCategory),
      subtype: nonEmptyString(item.gearSubType),
      itemLevel: finiteInteger(item.itemLevel),
      equipped: Boolean(instanceId),
      missingReference: Boolean(instanceId && !entry),
      modifiers,
      diagnostics: [],
      fingerprint: structuralFingerprint(semantic),
    };
  });
}

function compendiumSupport(
  supportValue: unknown,
  slot: number,
  fallback: string,
): NormalizedSupport | null {
  if (!isObject(supportValue)) return null;
  const guid = nonEmptyString(supportValue.supportGuid);
  if (!guid) return null;
  const normalizedIdentity = identity(
    guid,
    null,
    null,
    "skill",
    `${fallback}:support:${slot}`,
  );
  const values = arrayValue(supportValue.rollValues)
    .map(scalarText)
    .filter((value): value is string => value !== null)
    .map((value) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    });
  const semantic = {
    slot,
    identity: normalizedIdentity.key,
    type: nonEmptyString(supportValue.type) ?? "support",
    level: finiteInteger(supportValue.level),
    tier: finiteInteger(supportValue.tier),
    rank: finiteInteger(supportValue.rank),
    rolls: values,
  };
  return {
    slot: String(slot),
    identity: normalizedIdentity,
    type: semantic.type,
    level: semantic.level,
    tier: semantic.tier,
    rank: semantic.rank,
    rolls: values,
    fingerprint: structuralFingerprint(semantic),
  };
}

function compendiumSkills(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedSkill[] {
  const skills = objectValue(objectValue(loadoutValue).skills);
  const result: NormalizedSkill[] = [];
  for (const kind of ["active", "passive"] as const) {
    const field = kind === "active" ? "activeSkills" : "passiveSkills";
    softArray(skills[field], `${path}.skills.${field}`, diagnostics)
      .forEach((skillValue, index) => {
        if (skillValue === null) return;
        if (!isObject(skillValue)) {
          diagnostic(
            diagnostics,
            "malformed_skill",
            `${path}.skills.${field}[${index}]`,
            "Skill is not an object and was ignored.",
          );
          return;
        }
        const guid = nonEmptyString(skillValue.skillGuid);
        if (!guid) {
          diagnostic(
            diagnostics,
            "skill_identity_missing",
            `${path}.skills.${field}[${index}].skillGuid`,
            "Installed skill has no GUID and was ignored.",
          );
          return;
        }
        const slot = `${kind}:${index}`;
        const normalizedIdentity = identity(guid, null, null, "skill", `${path}:${slot}`);
        const supports = arrayValue(skillValue.supports)
          .map((value, supportIndex) =>
            compendiumSupport(value, supportIndex, `${path}:${slot}`))
          .filter((value): value is NormalizedSupport => Boolean(value));
        const moduleSlots = arrayValue(skillValue.modifiers)
          .map((value) => nonEmptyString(value));
        const modules = moduleSlots
          .map((value, moduleIndex) => {
            return value
              ? identity(value, null, null, "skill", `${path}:${slot}:module:${moduleIndex}`)
              : null;
          })
          .filter((value): value is NormalizedIdentity => Boolean(value));
        const semantic = {
          slot,
          kind,
          identity: normalizedIdentity.key,
          level: finiteInteger(skillValue.level),
          enabled: skillValue.enabled !== false,
          supports: supports.map((value) => value.fingerprint),
          moduleSlots,
        };
        result.push({
          ...semantic,
          identity: normalizedIdentity,
          supports,
          modules,
          moduleSlots,
          fingerprint: structuralFingerprint(semantic),
        });
      });
  }
  return result;
}

function compendiumTrees(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedTree[] {
  return softArray(
    objectValue(objectValue(loadoutValue).skillTree).slots,
    `${path}.skillTree.slots`,
    diagnostics,
  ).flatMap((slotValue, index) => {
    if (!isObject(slotValue)) {
      diagnostic(
        diagnostics,
        "malformed_tree",
        `${path}.skillTree.slots[${index}]`,
        "Talent slot is not an object and was ignored.",
      );
      return [];
    }
    const treeId = nonEmptyString(slotValue.treeId) ?? `unknown-tree-${index + 1}`;
    const nodePoints = normalizeNodePoints(slotValue.nodePoints);
    const prismId = nonEmptyString(
      slotValue.prismId ?? objectValue(slotValue.equippedPrism).prismId,
    );
    const prismEvidence = {
      prismId,
      equippedPrism: slotValue.equippedPrism ?? null,
      prismCoreTalentOverride: slotValue.prismCoreTalentOverride ?? null,
      inverseImageState: slotValue.inverseImageState ?? null,
    };
    const semantic = {
      slot: String(index),
      treeId,
      nodePoints,
      selectedNotable12: nonEmptyString(slotValue.selectedNotable12),
      selectedNotable24: nonEmptyString(slotValue.selectedNotable24),
      prism: prismEvidence,
    };
    return [{
      slot: semantic.slot,
      treeId,
      identity: identity(treeId, null, treeId, "talent-tree", `${path}:tree:${index}`),
      nodePoints,
      selectedNotable12: semantic.selectedNotable12,
      selectedNotable24: semantic.selectedNotable24,
      prismId,
      prismFingerprint: prismId || Object.values(prismEvidence).some(Boolean)
        ? structuralFingerprint(prismEvidence)
        : null,
      fingerprint: structuralFingerprint(semantic),
    }];
  });
}

function memoryModifiers(value: unknown): NormalizedModifier[] {
  const memory = objectValue(value);
  const result: NormalizedModifier[] = [];
  if (memory.baseStat) result.push(modifier("baseStat", memory.baseStat, 0));
  for (const [family, values] of [
    ["fixed", memory.fixedAffixes],
    ["random", memory.randomAffixes],
  ] as const) {
    arrayValue(values).forEach((entry, index) => result.push(modifier(family, entry, index)));
  }
  if (memory.lunarPhaseAffix) result.push(modifier("lunarPhase", memory.lunarPhaseAffix, 0));
  if (memory.revivedAffixLunarPhase) {
    result.push(modifier("revivedLunarPhase", memory.revivedAffixLunarPhase, 0));
  }
  return result;
}

function compendiumMemories(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedMemory[] {
  const section = objectValue(objectValue(loadoutValue).heroMemories);
  const inventory = new Map<string, JsonObject>();
  softArray(section.inventory, `${path}.heroMemories.inventory`, diagnostics)
    .forEach((memoryValue, index) => {
      if (!isObject(memoryValue)) return;
      const id = nonEmptyString(memoryValue.id);
      if (!id) {
        diagnostic(
          diagnostics,
          "memory_id_missing",
          `${path}.heroMemories.inventory[${index}].id`,
          "Memory has no stable instance id and cannot be equipped.",
        );
        return;
      }
      inventory.set(id, memoryValue);
    });
  const equipped = objectValue(section.equipped);
  return Object.entries(equipped).map(([slot, reference]) => {
    const referenceObject = objectValue(reference);
    const id = nonEmptyString(reference) ?? nonEmptyString(referenceObject.memoryId);
    const memory = id ? inventory.get(id) : undefined;
    if (id && !memory) {
      diagnostic(
        diagnostics,
        "equipped_memory_missing",
        `${path}.heroMemories.equipped.${slot}`,
        `Equipped memory ${id} is absent from inventory.`,
      );
    }
    const modifiers = memory ? memoryModifiers(memory) : [];
    const type = nonEmptyString(memory?.memoryType);
    const name = nonEmptyString(memory?.customName) ?? type ?? (id ? "Missing memory reference" : "Empty");
    const semantic = {
      slot,
      identity: id,
      type,
      rarity: scalarText(memory?.rarity),
      modifiers: modifiers.map((value) => value.fingerprint),
      specialReference: Object.keys(referenceObject).length ? referenceObject : null,
    };
    return {
      slot,
      instanceId: id,
      identity: id ? identity(null, id, name, "hero-memory", `memory:${id}`) : null,
      name,
      type,
      rarity: scalarText(memory?.rarity),
      modifiers,
      fingerprint: structuralFingerprint(semantic),
    };
  });
}

function slateAffixes(value: unknown): NormalizedModifier[] {
  return arrayValue(objectValue(value).affixes)
    .filter(Boolean)
    .map((entry, index) => modifier("divinity", entry, index));
}

function compendiumSlates(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedSlate[] {
  const section = objectValue(objectValue(loadoutValue).divinity);
  const inventory = new Map<string, JsonObject>();
  softArray(section.inventory, `${path}.divinity.inventory`, diagnostics)
    .forEach((slateValue) => {
      if (!isObject(slateValue)) return;
      const id = nonEmptyString(slateValue.id);
      if (id) inventory.set(id, slateValue);
    });
  return softArray(section.placements, `${path}.divinity.placements`, diagnostics)
    .flatMap((placementValue, index) => {
      const placement = objectValue(placementValue);
      const slateId = nonEmptyString(placement.slateId);
      if (!slateId) return [];
      const slate = inventory.get(slateId);
      if (!slate) {
        diagnostic(
          diagnostics,
          "placed_slate_missing",
          `${path}.divinity.placements[${index}].slateId`,
          `Placed slate ${slateId} is absent from inventory.`,
        );
      }
      const affixes = slateAffixes(slate);
      const catalogId = nonEmptyString(
        slate?.legendaryTemplateId ?? slate?.netherItemId ?? slate?.authorityEffectId,
      );
      const name = nonEmptyString(
        slate?.legendaryTemplate ?? slate?.netherType ?? slate?.type,
      ) ?? (slate ? "Divinity slate" : "Missing slate reference");
      const position = Number.isFinite(placement.row) && Number.isFinite(placement.col)
        ? `${placement.row}:${placement.col}`
        : String(index);
      const semantic = {
        position,
        slateId,
        catalogId,
        type: nonEmptyString(slate?.type),
        god: scalarText(slate?.god ?? placement.god ?? placement.godId),
        orientation: slate?.orientation ?? null,
        selectedCopyModIndex: slate?.selectedCopyModIndex ?? null,
        copyDirections: slate?.copyDirections ?? null,
        affixes: affixes.map((value) => value.fingerprint),
      };
      return [{
        key: slateId,
        position,
        identity: catalogId
          ? identity(catalogId, null, name, "divinity", `slate:${slateId}`)
          : identity(null, slateId, name, "divinity", `slate:${slateId}`),
        name,
        type: semantic.type,
        god: slate?.god ?? placement.god ?? placement.godId ?? null,
        affixes,
        fingerprint: structuralFingerprint(semantic),
      }];
    });
}

function compendiumPacts(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedPact[] {
  const loadout = objectValue(loadoutValue);
  const pacts = softArray(loadout.pactspirits, `${path}.pactspirits`, diagnostics);
  const kismets = softArray(loadout.kismets, `${path}.kismets`, diagnostics)
    .flatMap((value, index): NormalizedKismet[] => {
      if (!isObject(value)) return [];
      const pactIndex = finiteInteger(value.pactspritIndex);
      if (pactIndex === null || pactIndex < 0 || pactIndex >= pacts.length) {
        diagnostic(
          diagnostics,
          "kismet_owner_invalid",
          `${path}.kismets[${index}].pactspritIndex`,
          "Kismet does not point at an installed pactspirit slot.",
        );
      }
      const guid = nonEmptyString(value.kismetGuid);
      const normalizedIdentity = guid
        ? identity(guid, null, null, "kismet", `${path}:kismet:${index}`)
        : null;
      const values = arrayValue(value.rollValues)
        .map(scalarText)
        .filter((entry): entry is string => entry !== null)
        .map((entry) => Number.isFinite(Number(entry)) ? Number(entry) : entry);
      const semantic = {
        guid,
        pactIndex,
        nodeId: nonEmptyString(value.nodeId),
        rolls: values,
      };
      return [{
        key: `${pactIndex ?? "unknown"}:${semantic.nodeId ?? index}`,
        identity: normalizedIdentity,
        pactIndex,
        nodeId: semantic.nodeId,
        rolls: values,
        fingerprint: structuralFingerprint(semantic),
      }];
    });
  return pacts.flatMap((pactValue, index) => {
    if (!isObject(pactValue)) return [];
    const guid = nonEmptyString(pactValue.guid);
    if (!guid) {
      diagnostic(
        diagnostics,
        "pact_identity_missing",
        `${path}.pactspirits[${index}].guid`,
        "Installed pactspirit has no GUID and was ignored.",
      );
      return [];
    }
    const normalizedIdentity = identity(guid, null, null, "pactspirit", `${path}:pact:${index}`);
    const allocatedNodes = arrayValue(pactValue.allocatedNodes)
      .map(scalarText)
      .filter((value): value is string => value !== null);
    const ownedKismets = kismets.filter((value) => value.pactIndex === index);
    const semantic = {
      slot: String(index),
      identity: normalizedIdentity.key,
      level: finiteInteger(pactValue.level),
      allocatedNodes,
      expansions: pactValue.expansions ?? {},
      kismets: [...ownedKismets].map((value) => value.fingerprint).sort(),
    };
    return [{
      slot: semantic.slot,
      identity: normalizedIdentity,
      level: semantic.level,
      allocatedNodes,
      expansionFingerprint: Object.keys(objectValue(pactValue.expansions)).length
        ? structuralFingerprint(pactValue.expansions)
        : null,
      kismets: ownedKismets,
      fingerprint: structuralFingerprint(semantic),
    }];
  });
}

function compendiumPrisms(
  loadoutValue: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): NormalizedComponent[] {
  const section = objectValue(objectValue(loadoutValue).etherealPrisms);
  const inventory = new Map<string, JsonObject>();
  softArray(section.inventory, `${path}.etherealPrisms.inventory`, diagnostics)
    .forEach((value) => {
      if (isObject(value) && nonEmptyString(value.id)) inventory.set(value.id, value);
    });
  const claims: Array<{ slot: string; id: string }> = [];
  arrayValue(objectValue(objectValue(loadoutValue).skillTree).slots)
    .forEach((treeValue, index) => {
      const tree = objectValue(treeValue);
      const id = nonEmptyString(tree.prismId ?? objectValue(tree.equippedPrism).prismId);
      if (id) claims.push({ slot: `tree:${index}`, id });
    });
  for (const [slot, reference] of Object.entries(objectValue(section.equipped))) {
    const id = nonEmptyString(reference);
    if (id) claims.push({ slot: `prism-slot:${slot}`, id });
  }
  const seenClaims = new Set<string>();
  return claims.flatMap(({ slot, id }) => {
    if (seenClaims.has(id)) return [];
    seenClaims.add(id);
    const prism = inventory.get(id);
    if (!prism) {
      diagnostic(
        diagnostics,
        "equipped_prism_missing",
        `${path}.${slot.startsWith("tree:")
          ? `skillTree.slots[${slot.slice(5)}].prismId`
          : `etherealPrisms.equipped.${slot.slice(11)}`}`,
        `Equipped prism ${id} is absent from inventory.`,
      );
    }
    const baseId = nonEmptyString(prism?.baseId);
    return [{
      key: id,
      slot,
      identity: baseId
        ? identity(baseId, null, null, "ethereal-prism", `prism:${id}`)
        : identity(null, id, null, "ethereal-prism", `prism:${id}`),
      name: nonEmptyString(prism?.prismType) ?? (prism ? "Ethereal prism" : "Missing prism reference"),
      fingerprint: structuralFingerprint({ slot, id, prism: prism ?? null }),
    }];
  });
}

function compendiumHero(value: unknown, fallback: string): NormalizedHero {
  const hero = objectValue(value);
  const guid = nonEmptyString(hero.heroGuid);
  const name = nonEmptyString(hero.heroId) ?? "Unknown hero";
  const normalizedIdentity = guid
    ? identity(guid, null, name, "hero-trait", `${fallback}:hero`)
    : null;
  const selections: Record<string, string | null> = {};
  for (const [key, trait] of Object.entries(objectValue(hero.traits))) {
    selections[key] = nonEmptyString(trait);
  }
  const semantic = {
    identity: normalizedIdentity?.key ?? null,
    selections,
  };
  return {
    identity: normalizedIdentity,
    name,
    level: null,
    selections,
    fingerprint: structuralFingerprint(semantic),
  };
}

function normalizeCompendium(value: JsonObject): NormalizedBuild {
  const diagnostics: ImportDiagnostic[] = [];
  const container = requiredObject(value.loadouts, "build.loadouts", "invalid_compendium");
  const loadoutValues = requiredArray(
    container.loadouts,
    "build.loadouts.loadouts",
    "invalid_compendium",
  );
  if (loadoutValues.length === 0) {
    fail("invalid_compendium", "build.loadouts.loadouts", "must contain at least one loadout.");
  }
  const currentId = nonEmptyString(container.currentLoadoutId);
  const seenIds = new Set<string>();
  const loadouts = loadoutValues.map((loadoutValue, index): NormalizedLoadout => {
    const path = `build.loadouts.loadouts[${index}]`;
    const loadout = requiredObject(loadoutValue, path, "invalid_compendium");
    const sourceId = nonEmptyString(loadout.id);
    let id = sourceId ?? `loadout-${index + 1}`;
    if (!sourceId) {
      diagnostic(diagnostics, "loadout_id_missing", `${path}.id`, `Using fallback id ${id}.`);
    }
    if (seenIds.has(id)) {
      diagnostic(
        diagnostics,
        "duplicate_loadout_id",
        `${path}.id`,
        `Duplicate loadout id ${id}; a deterministic suffix was added.`,
      );
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);
    const localDiagnostics: ImportDiagnostic[] = [];
    const hero = compendiumHero(loadout.hero, path);
    const gear = compendiumGear(loadout, path, localDiagnostics);
    const skills = compendiumSkills(loadout, path, localDiagnostics);
    const trees = compendiumTrees(loadout, path, localDiagnostics);
    const memories = compendiumMemories(loadout, path, localDiagnostics);
    const slates = compendiumSlates(loadout, path, localDiagnostics);
    const pactspirits = compendiumPacts(loadout, path, localDiagnostics);
    const prisms = compendiumPrisms(loadout, path, localDiagnostics);
    const scentBottleFingerprint = loadout.scentBottle === null
      || loadout.scentBottle === undefined
      ? null
      : structuralFingerprint(loadout.scentBottle);
    diagnostics.push(...localDiagnostics);
    const semantic = {
      hero: hero.fingerprint,
      gear: keyedFingerprints(gear, (entry) => entry.slot, (entry) => entry.fingerprint),
      skills: keyedFingerprints(skills, (entry) => entry.slot, (entry) => entry.fingerprint),
      trees: keyedFingerprints(trees, (entry) => entry.slot, (entry) => entry.fingerprint),
      memories: keyedFingerprints(memories, (entry) => entry.slot, (entry) => entry.fingerprint),
      slates: keyedFingerprints(slates, (entry) => entry.position, (entry) => entry.fingerprint),
      pactspirits: keyedFingerprints(
        pactspirits,
        (entry) => entry.slot,
        (entry) => entry.fingerprint,
      ),
      prisms: keyedFingerprints(prisms, (entry) => entry.slot, (entry) => entry.fingerprint),
      scentBottleFingerprint,
    };
    return {
      id,
      index,
      name: nonEmptyString(loadout.name) ?? `Loadout ${index + 1}`,
      isCurrent: sourceId !== null && sourceId === currentId,
      hero,
      gear,
      skills,
      trees,
      memories,
      slates,
      pactspirits,
      prisms,
      scentBottleFingerprint,
      diagnostics: localDiagnostics,
      fingerprint: structuralFingerprint(semantic),
    };
  });
  const currentMatches = loadouts.filter((entry) => entry.isCurrent);
  if (currentMatches.length > 1) {
    diagnostic(
      diagnostics,
      "current_loadout_ambiguous",
      "build.loadouts.currentLoadoutId",
      `Current id ${currentId} matches duplicate loadouts; the first match was retained.`,
    );
    let retained = false;
    for (const loadout of loadouts) {
      if (!loadout.isCurrent) continue;
      loadout.isCurrent = !retained;
      retained = true;
    }
  }
  if (currentId && !loadoutValues.some((entry) => objectValue(entry).id === currentId)) {
    diagnostic(
      diagnostics,
      "current_loadout_missing",
      "build.loadouts.currentLoadoutId",
      `Current loadout ${currentId} is absent from loadouts.`,
    );
  }
  if (!loadouts.some((entry) => entry.isCurrent)) loadouts[0].isCurrent = true;
  const name = nonEmptyString(value.name) ?? "Imported Compendium build";
  const id = nonEmptyString(value.id) ?? `compendium-${structuralFingerprint({
    name,
    patch: value.patch,
    loadouts: loadouts.map((entry) => entry.fingerprint),
  })}`;
  const semantic = {
    sourceKind: "compendium",
    id,
    patch: nonEmptyString(value.patch) ?? "Unknown patch",
    loadouts: loadouts.map((entry) => entry.fingerprint),
  };
  return {
    sourceKind: "compendium",
    sourceSchemaVersion: null,
    id,
    name,
    patch: semantic.patch,
    capturedAt: null,
    loadouts,
    diagnostics,
    fingerprint: structuralFingerprint(semantic),
  };
}

function portableGear(value: JsonObject): NormalizedGear[] {
  const loadout = objectValue(value.proBuild).loadout;
  const unmapped = objectValue(loadout.unmappedSourceCollections);
  const result: NormalizedGear[] = [];
  for (const [sectionName, itemKind, sectionValue] of [
    ["gear", "gear", loadout.gear],
    ["vorax", "vorax", loadout.vorax],
    ["unclassifiedWearItems", "unmapped", unmapped.unclassifiedWearItems],
    ["otherWearItems", "unmapped", unmapped.otherWearItems],
    ["jewelItems", "unmapped", unmapped.jewelItems],
    ["heroCharacterItems", "unmapped", unmapped.heroCharacterItems],
  ] as const) {
    arrayValue(objectValue(sectionValue).items).forEach((itemValue, index) => {
      const item = objectValue(itemValue);
      const source = objectValue(item.source);
      const location = objectValue(item.location);
      const nativeSlot = finiteInteger(location.equipSlot);
      const slot = itemKind === "unmapped"
        ? `unmapped:${sectionName}:${source.key ?? index}`
        : nativeSlot === null
          ? `unplaced:${source.collection ?? sectionName}:${source.key ?? index}`
          : GEAR_SLOT_BY_NATIVE_ID.get(nativeSlot) ?? `native-slot-${nativeSlot}`;
      const normalizedIdentity = itemIdentity(item.identity, `portable:${sectionName}:${source.key ?? index}`);
      const selected = objectValue(item.identity?.special ?? item.identity?.base);
      const metadata = objectValue(selected.metadata);
      const overlay = objectValue(objectValue(item.data).compendium);
      const name = nonEmptyString(
        overlay.customName
          ?? overlay.displayName
          ?? objectValue(overlay.legendaryItem).name
          ?? objectValue(overlay.baseItem).name
          ?? metadata.voraxDisplayName
          ?? normalizedIdentity?.label,
      ) ?? `Imported ${itemKind}`;
      const modifiers = portableModifiers(item);
      const semantic = {
        itemKind,
        identity: normalizedIdentity?.key ?? null,
        rarity: scalarText(overlay.rarity ?? item.rarity),
        category: nonEmptyString(overlay.gearCategory ?? metadata.category),
        subtype: nonEmptyString(overlay.gearSubType ?? metadata.subtype),
        itemLevel: finiteInteger(overlay.itemLevel ?? item.itemLevel),
        modifiers: modifiers.map((entry) => entry.fingerprint),
        location,
      };
      result.push({
        slot,
        itemKind,
        instanceId: nonEmptyString(item.instanceId),
        identity: normalizedIdentity,
        name,
        rarity: semantic.rarity,
        category: semantic.category,
        subtype: semantic.subtype,
        itemLevel: semantic.itemLevel,
        equipped: itemKind !== "unmapped"
          && (nativeSlot !== null || source.collection === "WearItems"),
        missingReference: false,
        modifiers,
        diagnostics: [
          ...(itemKind === "unmapped" ? ["Target relationship is not proven."] : []),
          ...arrayValue(item.diagnostics)
            .map(nonEmptyString)
            .filter((entry): entry is string => entry !== null),
        ],
        fingerprint: structuralFingerprint(semantic),
      });
    });
  }
  return result;
}

interface PortablePlacement {
  kind: "active" | "passive" | "support";
  slot: number;
  ownerKind?: "active" | "passive";
  ownerSlot?: number;
}

function portableSkillPlacement(itemValue: unknown): PortablePlacement | null {
  const placement = objectValue(objectValue(objectValue(itemValue).data).compendiumPlacement);
  const kind = nonEmptyString(placement.kind);
  const slot = finiteInteger(placement.slot);
  if ((kind === "active" || kind === "passive") && slot !== null && slot >= 0) {
    return { kind, slot };
  }
  const ownerKind = nonEmptyString(placement.ownerKind);
  const ownerSlot = finiteInteger(placement.ownerSlot);
  if (kind === "support"
      && slot !== null
      && slot >= 0
      && (ownerKind === "active" || ownerKind === "passive")
      && ownerSlot !== null
      && ownerSlot >= 0) {
    return { kind, slot, ownerKind, ownerSlot };
  }
  return null;
}

function portableSkills(value: JsonObject, diagnostics: ImportDiagnostic[]): NormalizedSkill[] {
  const items = arrayValue(objectValue(objectValue(value.proBuild).loadout.skills).items);
  const mains: NormalizedSkill[] = [];
  const pendingSupports: Array<{
    placement: PortablePlacement | null;
    support: NormalizedSupport;
  }> = [];
  items.forEach((itemValue, index) => {
    const item = objectValue(itemValue);
    const normalizedIdentity = itemIdentity(item.identity, `portable:skill:${index}`);
    if (!normalizedIdentity) {
      diagnostic(
        diagnostics,
        "portable_skill_identity_missing",
        `portable.proBuild.loadout.skills.items[${index}].identity`,
        "Skill item has no catalog or native identity and was not classified.",
      );
      return;
    }
    const selected = objectValue(item.identity?.special ?? item.identity?.base);
    const metadata = objectValue(selected.metadata);
    const placement = portableSkillPlacement(item);
    const nominal = nonEmptyString(metadata.skillType);
    const kind: NormalizedSkill["kind"] =
      placement?.kind === "active" || placement?.kind === "passive"
      ? placement.kind
      : nominal && nominal !== "active" && nominal !== "passive"
          ? "support"
          : "unknown";
    const source = objectValue(item.source);
    const level = finiteInteger(
      item.itemLevel
        ?? objectValue(item.data).SkillLevel
        ?? objectValue(item.data).Level,
    );
    if (kind === "support") {
      const overlay = objectValue(objectValue(item.data).compendium);
      const exact = objectValue(overlay.supportGuid ? overlay : overlay.support);
      const values = arrayValue(exact.rollValues)
        .map(scalarText)
        .filter((entry): entry is string => entry !== null)
        .map((entry) => Number.isFinite(Number(entry)) ? Number(entry) : entry);
      const supportLevel = nominal === "support" ? level : finiteInteger(exact.level);
      const semantic = {
        slot: placement?.slot ?? index,
        identity: normalizedIdentity.key,
        type: nominal ?? "support",
        level: supportLevel,
        tier: finiteInteger(exact.tier),
        rank: finiteInteger(exact.rank),
        rolls: values,
      };
      pendingSupports.push({
        placement,
        support: {
          slot: String(semantic.slot),
          identity: normalizedIdentity,
          type: semantic.type,
          level: supportLevel,
          tier: semantic.tier,
          rank: semantic.rank,
          rolls: values,
          fingerprint: structuralFingerprint(semantic),
        },
      });
      return;
    }
    const slot = placement && placement.kind !== "support"
      ? `${kind}:${placement.slot}`
      : `unplaced:${source.key ?? index}`;
    if (kind === "unknown") {
      diagnostic(
        diagnostics,
        "portable_skill_unplaced",
        `portable.proBuild.loadout.skills.items[${index}]`,
        `${normalizedIdentity.label ?? normalizedIdentity.key} has no proven active/passive bar position.`,
      );
    }
    const overlay = objectValue(objectValue(item.data).compendium);
    const moduleSlots = arrayValue(overlay.modifiers)
      .map((moduleId) => nonEmptyString(moduleId));
    const modules = moduleSlots
      .map((moduleId, moduleIndex) => {
        return moduleId
          ? identity(moduleId, null, null, "skill", `${slot}:module:${moduleIndex}`)
          : null;
      })
      .filter((entry): entry is NormalizedIdentity => Boolean(entry));
    const semantic = {
      slot,
      kind,
      identity: normalizedIdentity.key,
      level,
      enabled: kind !== "unknown",
      supports: [] as string[],
      moduleSlots,
    };
    mains.push({
      ...semantic,
      identity: normalizedIdentity,
      supports: [],
      modules,
      moduleSlots,
      fingerprint: structuralFingerprint(semantic),
    });
  });
  for (const { placement, support } of pendingSupports) {
    const owner = placement?.kind === "support"
      ? mains.find((skill) =>
          skill.slot === `${placement.ownerKind}:${placement.ownerSlot}`)
      : undefined;
    if (owner) {
      owner.supports.push(support);
      owner.supports.sort((left, right) => Number(left.slot) - Number(right.slot));
      owner.fingerprint = structuralFingerprint({
        slot: owner.slot,
        kind: owner.kind,
        identity: owner.identity.key,
        level: owner.level,
        enabled: owner.enabled,
        supports: owner.supports.map((entry) => entry.fingerprint),
        moduleSlots: owner.moduleSlots,
      });
    } else {
      diagnostic(
        diagnostics,
        "portable_support_unattached",
        `portable.proBuild.loadout.skills.items`,
        `${support.identity.label ?? support.identity.key} has no proven main-skill owner.`,
      );
      const semantic = {
        slot: `support:${support.slot}:${support.identity.key}`,
        kind: "support" as const,
        identity: support.identity.key,
        level: support.level,
        enabled: true,
      };
      mains.push({
        ...semantic,
        identity: support.identity,
        supports: [],
        modules: [],
        moduleSlots: [],
        fingerprint: structuralFingerprint(semantic),
      });
    }
  }
  return mains;
}

function portableTrees(value: JsonObject): NormalizedTree[] {
  const records = arrayValue(objectValue(objectValue(value.proBuild).loadout.skillTree).records);
  const exact = records
    .map((record) => objectValue(objectValue(objectValue(record).data).compendium))
    .find((candidate) => Array.isArray(candidate.slots));
  if (exact) {
    return arrayValue(exact.slots).flatMap((slotValue, index) => {
      if (!isObject(slotValue)) return [];
      const treeId = nonEmptyString(slotValue.treeId) ?? `unknown-tree-${index + 1}`;
      const nodePoints = normalizeNodePoints(slotValue.nodePoints);
      const prismId = nonEmptyString(
        slotValue.prismId ?? objectValue(slotValue.equippedPrism).prismId,
      );
      const prismEvidence = {
        prismId,
        equippedPrism: slotValue.equippedPrism ?? null,
        prismCoreTalentOverride: slotValue.prismCoreTalentOverride ?? null,
        inverseImageState: slotValue.inverseImageState ?? null,
      };
      const semantic = {
        slot: String(index),
        treeId,
        nodePoints,
        selectedNotable12: nonEmptyString(slotValue.selectedNotable12),
        selectedNotable24: nonEmptyString(slotValue.selectedNotable24),
        prism: prismEvidence,
      };
      return [{
        slot: semantic.slot,
        treeId,
        identity: identity(treeId, null, treeId, "talent-tree", `portable:tree:${index}`),
        nodePoints,
        selectedNotable12: semantic.selectedNotable12,
        selectedNotable24: semantic.selectedNotable24,
        prismId,
        prismFingerprint: prismId || Object.values(prismEvidence).some(Boolean)
          ? structuralFingerprint(prismEvidence)
          : null,
        fingerprint: structuralFingerprint(semantic),
      }];
    });
  }
  const heroCareerIds = arrayValue(
    objectValue(objectValue(objectValue(value.proBuild).loadout).hero).sourceData?.GeniusCareerId,
  )
    .map(finiteInteger);
  if (records.length === 0
      && heroCareerIds.length === 4
      && heroCareerIds.every((careerId) =>
        careerId === 0 || (careerId !== null && TALENT_TREE_BY_CAREER_ID.has(careerId)))) {
    return heroCareerIds.flatMap((careerId, index) => {
      if (careerId === 0 || careerId === null) return [];
      const treeId = TALENT_TREE_BY_CAREER_ID.get(careerId)!;
      const semantic = {
        slot: String(index),
        treeId,
        nodePoints: {},
        selectedNotable12: null,
        selectedNotable24: null,
      };
      return [{
        slot: semantic.slot,
        treeId,
        identity: identity(null, careerId, treeId, "talent-tree", `portable:tree:${index}`),
        nodePoints: {},
        selectedNotable12: null,
        selectedNotable24: null,
        prismId: null,
        prismFingerprint: null,
        fingerprint: structuralFingerprint(semantic),
      }];
    });
  }
  return records.map((recordValue, index) => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const talent = objectValue(data.compendiumTalent);
    const normalizedIdentity = portableIdentity(record.identity, `portable:tree:${index}`);
    const careerId = finiteInteger(data.CareerId ?? data.GeniusCareerId);
    const treeId = nonEmptyString(talent.treeId)
      ?? nonEmptyString(objectValue(record.identity).metadata?.treeId)
      ?? (careerId === null ? null : TALENT_TREE_BY_CAREER_ID.get(careerId))
      ?? normalizedIdentity?.catalogId
      ?? `unknown-tree-${index + 1}`;
    const nodePoints = normalizeNodePoints(talent.nodePoints ?? data.nodePoints);
    const sourceIndex = finiteInteger(data.Index);
    const slot = sourceIndex !== null && sourceIndex >= 1 && sourceIndex <= 4
      ? sourceIndex - 1
      : index;
    const semantic = {
      slot: String(slot),
      treeId,
      nodePoints,
      selectedNotable12: nonEmptyString(
        talent.selectedNotable12 ?? data.selectedNotable12,
      ),
      selectedNotable24: nonEmptyString(
        talent.selectedNotable24 ?? data.selectedNotable24,
      ),
    };
    return {
      slot: semantic.slot,
      treeId,
      identity: normalizedIdentity,
      nodePoints,
      selectedNotable12: semantic.selectedNotable12,
      selectedNotable24: semantic.selectedNotable24,
      prismId: null,
      prismFingerprint: null,
      fingerprint: structuralFingerprint(semantic),
    };
  });
}

function portableMemories(value: JsonObject): NormalizedMemory[] {
  const items = arrayValue(objectValue(objectValue(value.proBuild).loadout.heroMemories).items);
  return items.map((itemValue, index) => {
    const item = objectValue(itemValue);
    const data = objectValue(item.data);
    const overlay = objectValue(data.compendium);
    const normalizedIdentity = itemIdentity(item.identity, `portable:memory:${index}`);
    const slot = nonEmptyString(data.compendiumSlot)
      ?? scalarText(objectValue(item.location).equipSlot)
      ?? `unplaced:${index}`;
    const selected = objectValue(item.identity?.special ?? item.identity?.base);
    const metadata = objectValue(selected.metadata);
    const name = nonEmptyString(
      overlay.customName
        ?? metadata.memoryName
        ?? normalizedIdentity?.label,
    ) ?? `Hero memory ${index + 1}`;
    const modifiers = Object.keys(overlay).length > 0
      ? memoryModifiers(overlay)
      : portableModifiers(item);
    const semantic = {
      slot,
      identity: normalizedIdentity?.key ?? null,
      type: nonEmptyString(overlay.memoryType ?? metadata.memoryType),
      rarity: scalarText(overlay.rarity ?? item.rarity),
      modifiers: modifiers.map((entry) => entry.fingerprint),
    };
    return {
      slot,
      instanceId: nonEmptyString(item.instanceId),
      identity: normalizedIdentity,
      name,
      type: semantic.type,
      rarity: semantic.rarity,
      modifiers,
      fingerprint: structuralFingerprint(semantic),
    };
  });
}

function portableSlates(value: JsonObject): NormalizedSlate[] {
  const records = arrayValue(objectValue(objectValue(value.proBuild).loadout.divinity).records);
  const exact = records
    .map((record) => objectValue(objectValue(objectValue(record).data).compendium))
    .find((candidate) => Array.isArray(candidate.inventory) && Array.isArray(candidate.placements));
  if (exact) {
    return compendiumSlates(
      { divinity: exact },
      "portable.proBuild.loadout",
      [],
    );
  }
  return records.map((recordValue, index) => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const normalizedIdentity = portableIdentity(record.identity, `portable:slate:${index}`);
    const metadata = objectValue(objectValue(record.identity).metadata);
    const affixes = arrayValue(data.affixes).map((entry, affixIndex) =>
      modifier("divinity", entry, affixIndex));
    const name = nonEmptyString(
      metadata.divinityTemplateName
        ?? metadata.divinityDescription
        ?? normalizedIdentity?.label,
    ) ?? `Divinity slate ${index + 1}`;
    const semantic = {
      key: nonEmptyString(record.sourceKey) ?? String(index),
      identity: normalizedIdentity?.key ?? null,
      data,
      affixes: affixes.map((entry) => entry.fingerprint),
    };
    return {
      key: semantic.key,
      position: nonEmptyString(data.position) ?? String(index),
      identity: normalizedIdentity,
      name,
      type: nonEmptyString(metadata.divinityEntityType),
      god: metadata.divinityGod ?? null,
      affixes,
      fingerprint: structuralFingerprint(semantic),
    };
  });
}

function portablePacts(
  value: JsonObject,
  diagnostics: ImportDiagnostic[],
): NormalizedPact[] {
  const loadout = objectValue(objectValue(value.proBuild).loadout);
  const pactRecords = arrayValue(objectValue(loadout.pactspirits).records);
  const kismets: NormalizedKismet[] = arrayValue(objectValue(loadout.kismets).records)
    .map((recordValue, index) => {
      const record = objectValue(recordValue);
      const data = objectValue(record.data);
      const exact = objectValue(data.compendium);
      const normalizedIdentity = portableIdentity(record.identity, `portable:kismet:${index}`)
        ?? (nonEmptyString(exact.kismetGuid)
          ? identity(
              exact.kismetGuid,
              null,
              null,
              "kismet",
              `portable:kismet:${index}`,
            )
          : null);
      const pactIndex = finiteInteger(exact.pactspritIndex ?? data.pactspritIndex);
      const nodeId = nonEmptyString(exact.nodeId ?? data.nodeId);
      const values = arrayValue(exact.rollValues ?? data.rollValues)
        .map(scalarText)
        .filter((entry): entry is string => entry !== null)
        .map((entry) => Number.isFinite(Number(entry)) ? Number(entry) : entry);
      const semantic = {
        identity: normalizedIdentity?.key ?? null,
        pactIndex,
        nodeId,
        rolls: values,
      };
      return {
        key: nonEmptyString(record.sourceKey) ?? `${pactIndex ?? "unknown"}:${nodeId ?? index}`,
        identity: normalizedIdentity,
        pactIndex,
        nodeId,
        rolls: values,
        fingerprint: structuralFingerprint(semantic),
      };
    });
  return pactRecords.flatMap((recordValue, index): NormalizedPact[] => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const exact = objectValue(data.compendium);
    const nativeIds = [data.PetConfigId, data.ConfigId, data.Id]
      .map(finiteInteger)
      .filter((entry): entry is number => entry !== null);
    const installType = finiteInteger(data.InstallServantType);
    const emptySentinel = Object.keys(exact).length === 0
      && nativeIds.length > 0
      && nativeIds.every((entry) => entry <= 0)
      && !nonEmptyString(data.Name)
      && !nonEmptyString(data.Icon)
      && installType === -1;
    if (emptySentinel) return [];
    if (Object.keys(exact).length === 0 && installType !== null && installType !== 1) {
      diagnostic(
        diagnostics,
        "portable_noncombat_pact_ignored",
        `portable.proBuild.loadout.pactspirits.records[${index}]`,
        "Auxiliary or uninstalled pet evidence was not treated as a combat pactspirit.",
      );
      return [];
    }
    const slot = finiteInteger(data.compendiumSlot ?? exact.slotIndex) ?? index;
    const normalizedIdentity = portableIdentity(record.identity, `portable:pact:${index}`)
      ?? identity(
        exact.guid,
        data.PetConfigId ?? data.ConfigId ?? data.Id,
        data.Name,
        "pactspirit",
        `portable:pact:${index}`,
      );
    const metadata = objectValue(objectValue(record.identity).metadata);
    const allocatedNodes = arrayValue(
      exact.allocatedNodes ?? data.allocatedNodes ?? metadata.nodeIds,
    )
      .map(scalarText)
      .filter((entry): entry is string => entry !== null);
    const ownedKismets = kismets.filter((entry) => entry.pactIndex === slot);
    const level = finiteInteger(exact.level ?? data.StarRank ?? data.level);
    const expansions = exact.expansions ?? data.expansions ?? {};
    const semantic = {
      slot,
      identity: normalizedIdentity.key,
      level,
      allocatedNodes,
      expansions,
      kismets: [...ownedKismets].map((entry) => entry.fingerprint).sort(),
    };
    return [{
      slot: String(slot),
      identity: normalizedIdentity,
      level,
      allocatedNodes,
      expansionFingerprint: Object.keys(objectValue(expansions)).length
        ? structuralFingerprint(expansions)
        : null,
      kismets: ownedKismets,
      fingerprint: structuralFingerprint(semantic),
    }];
  });
}

function portablePrisms(value: JsonObject): NormalizedComponent[] {
  const items = arrayValue(objectValue(objectValue(value.proBuild).loadout.etherealPrisms).items);
  return items.map((itemValue, index) => {
    const item = objectValue(itemValue);
    const data = objectValue(item.data);
    const overlay = objectValue(data.compendium);
    const normalizedIdentity = itemIdentity(item.identity, `portable:prism:${index}`);
    const placement = objectValue(data.compendiumPlacement);
    const slot = scalarText(placement.sourceSlot ?? objectValue(item.location).equipSlot)
      ?? `unplaced:${index}`;
    return {
      key: nonEmptyString(item.instanceId) ?? `portable-prism-${index}`,
      slot,
      identity: normalizedIdentity,
      name: nonEmptyString(
        overlay.prismType
          ?? objectValue(item.identity?.special ?? item.identity?.base).label,
      ) ?? "Ethereal prism",
      fingerprint: structuralFingerprint({
        identity: normalizedIdentity?.key ?? null,
        overlay,
        placement,
        affixes: item.affixes,
      }),
    };
  });
}

function portableHero(value: JsonObject): NormalizedHero {
  const hero = objectValue(objectValue(objectValue(value.proBuild).loadout).hero);
  const normalizedIdentity = portableIdentity(hero.identity, "portable:hero");
  const sourceData = objectValue(hero.sourceData);
  const traits = objectValue(sourceData.compendiumTraits);
  const selections: Record<string, string | null> = {};
  for (const [key, trait] of Object.entries(traits)) selections[key] = nonEmptyString(trait);
  const name = normalizedIdentity?.label
    ?? nonEmptyString(hero.sourceName)
    ?? "Unknown hero";
  const semantic = {
    identity: normalizedIdentity?.key ?? null,
    level: finiteInteger(hero.level),
    selections,
  };
  return {
    identity: normalizedIdentity,
    name,
    level: semantic.level,
    selections,
    fingerprint: structuralFingerprint(semantic),
  };
}

function normalizePortable(value: JsonObject): NormalizedBuild {
  validatePortableV3(value);
  const diagnostics: ImportDiagnostic[] = arrayValue(value.mappingIssues).map((issueValue) => {
    const issue = objectValue(issueValue);
    return {
      severity: "warning",
      code: nonEmptyString(issue.kind) ?? "mapping_issue",
      path: nonEmptyString(issue.path) ?? "portable",
      message: nonEmptyString(issue.message) ?? "Unresolved portable mapping issue.",
    };
  });
  const localDiagnostics: ImportDiagnostic[] = [];
  const hero = portableHero(value);
  const gear = portableGear(value);
  const skills = portableSkills(value, localDiagnostics);
  const trees = portableTrees(value);
  const memories = portableMemories(value);
  const slates = portableSlates(value);
  const pactspirits = portablePacts(value, localDiagnostics);
  const prisms = portablePrisms(value);
  const scentRecords = arrayValue(
    objectValue(objectValue(objectValue(value.proBuild).loadout).scentBottle).records,
  );
  const scentBottleFingerprint = scentRecords.length
    ? structuralFingerprint(scentRecords)
    : null;
  diagnostics.push(...localDiagnostics);
  const semantic = {
    hero: hero.fingerprint,
    gear: keyedFingerprints(gear, (entry) => entry.slot, (entry) => entry.fingerprint),
    skills: keyedFingerprints(skills, (entry) => entry.slot, (entry) => entry.fingerprint),
    trees: keyedFingerprints(trees, (entry) => entry.slot, (entry) => entry.fingerprint),
    memories: keyedFingerprints(memories, (entry) => entry.slot, (entry) => entry.fingerprint),
    slates: keyedFingerprints(slates, (entry) => entry.position, (entry) => entry.fingerprint),
    pactspirits: keyedFingerprints(
      pactspirits,
      (entry) => entry.slot,
      (entry) => entry.fingerprint,
    ),
    prisms: keyedFingerprints(prisms, (entry) => entry.slot, (entry) => entry.fingerprint),
    scentBottleFingerprint,
  };
  const proBuild = objectValue(value.proBuild);
  const source = objectValue(value.source);
  const name = nonEmptyString(proBuild.name)
    ?? nonEmptyString(objectValue(proBuild.loadout).hero?.sourceName)
    ?? "Live tli_dump snapshot";
  const loadoutId = nonEmptyString(proBuild.id)
    ?? `portable-loadout-${structuralFingerprint(semantic)}`;
  const loadout: NormalizedLoadout = {
    id: loadoutId,
    index: 0,
    name,
    isCurrent: true,
    hero,
    gear,
    skills,
    trees,
    memories,
    slates,
    pactspirits,
    prisms,
    scentBottleFingerprint,
    diagnostics,
    fingerprint: structuralFingerprint(semantic),
  };
  const id = nonEmptyString(proBuild.id)
    ?? `portable-${structuralFingerprint({
      capturedAt: value.capturedAt,
      loadout: loadout.fingerprint,
    })}`;
  const buildSemantic = {
    sourceKind: "portable-v3",
    id,
    patch: source.catalogPatch,
    capturedAt: value.capturedAt,
    loadout: loadout.fingerprint,
  };
  return {
    sourceKind: "portable-v3",
    sourceSchemaVersion: 3,
    id,
    name,
    patch: source.catalogPatch,
    capturedAt: value.capturedAt,
    loadouts: [loadout],
    diagnostics,
    fingerprint: structuralFingerprint(buildSemantic),
  };
}

function looksLikeCompendium(value: unknown): value is JsonObject {
  return isObject(value)
    && isObject(value.loadouts)
    && Array.isArray(value.loadouts.loadouts);
}

function looksLikePortable(value: unknown): value is JsonObject {
  return isObject(value)
    && (
      Object.hasOwn(value, "proBuild")
      || Object.hasOwn(value, "compendiumImportable")
      || objectValue(value.source).kind === "liveMemory"
    );
}

function hasPortableConverterMarkers(value: JsonObject): boolean {
  return [
    "json",
    "status",
    "importedCount",
    "included",
    "omitted",
  ].some((field) => Object.hasOwn(value, field));
}

function validConverterIncluded(value: unknown): boolean {
  if (!isObject(value)) return false;
  const importedCount = finiteInteger(value.importedCount);
  const observedCount = finiteInteger(value.observedCount);
  return typeof value.section === "string"
    && importedCount !== null
    && importedCount >= 0
    && observedCount !== null
    && observedCount >= 0
    && typeof value.detail === "string";
}

function validConverterOmission(value: unknown): boolean {
  if (!isObject(value)) return false;
  const observedCount = finiteInteger(value.observedCount);
  return typeof value.section === "string"
    && observedCount !== null
    && observedCount >= 0
    && typeof value.reason === "string";
}

function looksLikePortableConverter(
  value: JsonObject,
): value is JsonObject & { payload: JsonObject } {
  const importedCount = finiteInteger(value.importedCount);
  return looksLikeCompendium(value.payload)
    && typeof value.json === "string"
    && (value.status === "ready" || value.status === "partial")
    && importedCount !== null
    && importedCount >= 0
    && Array.isArray(value.included)
    && value.included.every(validConverterIncluded)
    && Array.isArray(value.omitted)
    && value.omitted.every(validConverterOmission);
}

function normalizePortableConverter(value: JsonObject & { payload: JsonObject }): NormalizedBuild {
  const normalized = normalizeCompendium(value.payload);
  diagnostic(
    normalized.diagnostics,
    "portable_converter_structural_only",
    "document.payload",
    "A complete tli_dump converter result is structural/report-only; its embedded catalog metadata is not an independently attested formula source.",
  );
  return {
    ...normalized,
    sourceKind: "portable-converter",
    fingerprint: structuralFingerprint({
      sourceKind: "portable-converter",
      payload: normalized.fingerprint,
      status: value.status,
      importedCount: value.importedCount,
      included: value.included,
      omitted: value.omitted,
    }),
  };
}

/**
 * Normalize a Compendium build, a portable-v3 document, a GUI snapshot
 * containing `.portable`, or a tli_dump converter result containing `.payload`.
 */
export function normalizeBuildSnapshot(value: unknown): NormalizedBuild {
  assertImportShapeBudget(value);
  const root = requiredObject(value, "document", "invalid_document");
  let document: JsonObject = root;
  if (Object.hasOwn(root, "portable")) {
    document = requiredObject(root.portable, "document.portable", "invalid_portable_v3");
  } else if (isObject(root.payload)
      && (looksLikeCompendium(root.payload) || Object.hasOwn(root.payload, "loadouts"))) {
    if (hasPortableConverterMarkers(root)) {
      if (!looksLikePortableConverter(root)) {
        fail(
          "invalid_portable_converter",
          "document",
          "contains converter-result markers but not a complete valid tli_dump conversion report.",
        );
      }
      return normalizePortableConverter(root);
    }
    document = root.payload;
  }
  if (looksLikePortable(document)) {
    const version = finiteInteger(document.schemaVersion);
    if (version !== 3) {
      fail(
        "unsupported_portable_version",
        "portable.schemaVersion",
        `version ${String(document.schemaVersion)} is not supported; expected version 3.`,
      );
    }
    return normalizePortable(document);
  }
  if (looksLikeCompendium(document)) return normalizeCompendium(document);
  if (Object.hasOwn(document, "loadouts")) {
    fail(
      "invalid_compendium",
      "build.loadouts",
      "does not contain a loadouts array.",
    );
  }
  fail(
    "unsupported_document",
    "document",
    "is not a TLI Compendium build or tli_dump portable-v3 snapshot.",
  );
}

export function formatModifierEvidence(value: NormalizedModifier): string {
  const family = value.family
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
  const label = value.text
    ?? `${family}${value.id ? ` · ${value.id.slice(0, 8)}` : " modifier"}`;
  if (value.rolls.length === 0) return label;
  let consumed = 0;
  const rendered = label.replace(/#(?:\.#+)?/g, (placeholder) => {
    const entry = value.rolls[consumed];
    if (!entry || entry.value === null) return placeholder;
    consumed += 1;
    return String(entry.value);
  });
  if (consumed > 0) {
    const ranges = value.rolls.slice(0, consumed).flatMap((entry) => {
      if (entry.min === null && entry.max === null) return [];
      if (entry.min === entry.max && entry.value === entry.min) return [];
      return [
        `${entry.sign ?? ""}${entry.min ?? "?"}–${entry.max ?? "?"}${entry.unit ?? ""}`,
      ];
    });
    return ranges.length
      ? `${rendered} · roll range${ranges.length === 1 ? "" : "s"} ${ranges.join(", ")}`
      : rendered;
  }
  const fixedValuesAlreadyVisible = value.rolls.every((entry) =>
    entry.value !== null
    && entry.min === entry.value
    && entry.max === entry.value
    && label.includes(String(entry.value)));
  if (fixedValuesAlreadyVisible) return label;
  const rollText = value.rolls.map((entry) => {
    const observed = entry.value === null
      ? "?"
      : `${entry.sign ?? ""}${String(entry.value)}${entry.unit ?? ""}`;
    const range = entry.min !== null || entry.max !== null
      ? ` [${entry.min ?? "?"}–${entry.max ?? "?"}]`
      : "";
    return `${observed}${range}`;
  }).join(", ");
  return `${label} · ${rollText}`;
}
