import { escapeHtml } from "./dom.js";

const WEBSITE_PATCHES = new Set(["SS13", "SS12.5", "SS12", "SS11"]);
const EXPORT_CATALOG_PATCHES = new Set(["SS13"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ROLL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const BING_CREATIVE_GENIUS_GUID = "ce537370-2f76-5f96-bd1c-f7de0c43c805";
/** When true, export notes include a ko-fi donate line. Off for now. */
const NOTES_DONATION_ENABLED = false;
const NOTES_DONATION_URL = "https://ko-fi.com/deafwave";
const INFORMATIONAL_MAPPING_ISSUE_KINDS = new Set([
  "targetUnsupported",
]);

const GEAR_SLOTS = new Map([
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

const SINGLE_CATEGORY_GEAR_SLOTS = new Map([
  ["helmet", "helmet"],
  ["chest_armor", "chest"],
  ["gloves", "gloves"],
  ["boots", "boots"],
  ["two_handed", "mainHand"],
  ["shield", "offHand"],
]);

const ITEM_SECTIONS = [
  "heroMemories",
  "etherealPrisms",
  "gear",
  "vorax",
  "skills",
];

// GeniusCareerId uses the same numeric family prefixes as SS13 talent nodes.
// Keep this bridge deliberately finite: an unknown career remains omitted
// instead of being guessed from a nearby numeric range.
const TALENT_TREE_BY_CAREER_ID = new Map([
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

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function firstDefined(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== null && object?.[key] !== undefined) return object[key];
  }
  return undefined;
}

function hasOwnField(object, ...keys) {
  return keys.some(key => Object.hasOwn(object ?? {}, key));
}

function assertExactFields(value, fields, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const allowed = new Set(fields);
  const unexpected = Object.keys(value).find(key => !allowed.has(key));
  if (unexpected) {
    throw new TypeError(`${path}.${unexpected} is not part of the current portable schema`);
  }
}

function validateCatalogIdentity(value, path) {
  if (value === null) return;
  assertExactFields(
    value,
    ["gameId", "domain", "compendiumId", "label", "metadata"],
    path,
  );
}

function validatePortableItem(value, path) {
  assertExactFields(value, [
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
  ], path);
  assertExactFields(value.source, ["collection", "key"], `${path}.source`);
  assertExactFields(value.identity, ["base", "special"], `${path}.identity`);
  validateCatalogIdentity(value.identity.base, `${path}.identity.base`);
  validateCatalogIdentity(value.identity.special, `${path}.identity.special`);
  assertExactFields(
    value.location,
    ["bag", "equipSlot", "page", "slot"],
    `${path}.location`,
  );
  assertExactFields(value.affixes, [
    "bAffixInfoList",
    "baseAttrInfoList",
    "fixedBaseAffix",
    "prefixInfoList",
    "suffixInfoList",
    "enchantAffixList",
    "chipAffixList",
  ], `${path}.affixes`);
}

function validateItemSection(value, path) {
  assertExactFields(value, ["sourceCollection", "items"], path);
  if (!Array.isArray(value.items)) throw new TypeError(`${path}.items must be an array`);
  value.items.forEach((item, index) => validatePortableItem(item, `${path}.items[${index}]`));
}

function validateRecordSection(value, path) {
  assertExactFields(value, ["sourceCollection", "records"], path);
  if (!Array.isArray(value.records)) throw new TypeError(`${path}.records must be an array`);
  value.records.forEach((record, index) => {
    const recordPath = `${path}.records[${index}]`;
    assertExactFields(record, ["sourceKey", "identity", "data"], recordPath);
    validateCatalogIdentity(record.identity, `${recordPath}.identity`);
  });
}

function validatePortableEnvelope(portable) {
  assertExactFields(portable, [
    "schemaVersion",
    "capturedAt",
    "source",
    "compendiumImportable",
    "player",
    "proBuild",
    "mappingIssues",
  ], "portable");
  assertExactFields(portable.source, [
    "kind",
    "executable",
    "profile",
    "catalogPatch",
    "layoutCompatible",
    "processState",
  ], "portable.source");
  assertExactFields(portable.player, ["playerId", "teamPlayerIds", "items"], "portable.player");
  if (!Array.isArray(portable.player.items)) {
    throw new TypeError("portable.player.items must be an array");
  }
  portable.player.items.forEach((item, index) => (
    validatePortableItem(item, `portable.player.items[${index}]`)
  ));
  assertExactFields(
    portable.proBuild,
    ["id", "name", "sourcePage", "loadout"],
    "portable.proBuild",
  );
  if (
    portable.proBuild.name !== undefined
    && portable.proBuild.name !== null
    && typeof portable.proBuild.name !== "string"
  ) {
    throw new TypeError("portable.proBuild.name must be a string or null");
  }
  if (
    portable.proBuild.sourcePage !== undefined
    && portable.proBuild.sourcePage !== null
    && typeof portable.proBuild.sourcePage !== "string"
  ) {
    throw new TypeError("portable.proBuild.sourcePage must be a string or null");
  }
  const loadout = portable.proBuild.loadout;
  assertExactFields(loadout, [
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
  ], "portable.proBuild.loadout");
  assertExactFields(
    loadout.hero,
    ["identity", "sourceName", "level", "sourceData"],
    "portable.proBuild.loadout.hero",
  );
  validateCatalogIdentity(loadout.hero.identity, "portable.proBuild.loadout.hero.identity");
  for (const name of ["heroMemories", "etherealPrisms", "gear", "vorax", "skills"]) {
    validateItemSection(loadout[name], `portable.proBuild.loadout.${name}`);
  }
  for (const name of ["skillTree", "divinity", "pactspirits", "kismets", "scentBottle"]) {
    validateRecordSection(loadout[name], `portable.proBuild.loadout.${name}`);
  }
  const unmapped = loadout.unmappedSourceCollections;
  assertExactFields(unmapped, [
    "unclassifiedWearItems",
    "otherWearItems",
    "jewelItems",
    "heroCharacterItems",
  ], "portable.proBuild.loadout.unmappedSourceCollections");
  for (const name of [
    "unclassifiedWearItems",
    "otherWearItems",
    "jewelItems",
    "heroCharacterItems",
  ]) {
    validateItemSection(
      unmapped[name],
      `portable.proBuild.loadout.unmappedSourceCollections.${name}`,
    );
  }
  if (!Array.isArray(portable.mappingIssues)) {
    throw new TypeError("portable.mappingIssues must be an array");
  }
  portable.mappingIssues.forEach((issue, index) => {
    assertExactFields(
      issue,
      ["kind", "path", "sourcePath", "message"],
      `portable.mappingIssues[${index}]`,
    );
  });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function generatedCatalogUuid(value) {
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35].map(seed => {
    let hash = seed;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  });
  const digits = words.join("").split("");
  // Mark Poorchlight-owned catalog IDs as UUID-v5-shaped values. They are
  // deterministic local identities, not aliases for a different official row.
  digits[12] = "5";
  digits[16] = "89ab"[Number.parseInt(digits[16], 16) & 3];
  const hex = digits.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function snapshotTimestamp(capturedAt) {
  const value = Date.parse(String(capturedAt ?? ""));
  return Number.isFinite(value) ? value : 0;
}

function emptySkillSlot() {
  return {
    skillGuid: null,
    enabled: false,
    level: 20,
    supports: [null, null, null, null, null],
  };
}

function emptyLoadout(id, name = "Live snapshot") {
  return {
    id,
    name,
    order: 0,
    hiddenInGuide: false,
    hero: null,
    heroMemories: {
      equipped: {
        slot45: null,
        slot60: null,
        slot75: null,
        slotLevel1Special: null,
      },
      inventory: [],
    },
    etherealPrisms: {
      equipped: { slot1: null, slot2: null, slot3: null },
      inventory: [],
    },
    gear: {
      equipped: {
        helmet: null,
        chest: null,
        gloves: null,
        boots: null,
        belt: null,
        ring1: null,
        ring2: null,
        necklace: null,
        mainHand: null,
        offHand: null,
      },
      inventory: [],
    },
    vorax: {
      equipped: {
        chest: null,
        head: null,
        hands: null,
        legs: null,
        neck: null,
        digits: null,
        waist: null,
      },
      inventory: [],
    },
    skills: {
      activeSkills: Array.from({ length: 5 }, emptySkillSlot),
      passiveSkills: Array.from({ length: 4 }, emptySkillSlot),
    },
    skillTree: null,
    divinity: { inventory: [], placements: [] },
    pactspirits: [null, null, null],
    kismets: [],
    scentBottle: null,
  };
}

function portableLoadout(portable) {
  return objectValue(objectValue(portable.proBuild).loadout);
}

/**
 * Viewed-character PlayerId from PlayeBaseInfo. Used for both Hunter File and
 * Pro Build pages so one Compendium build can hold multiple page loadouts.
 */
function viewedPlayerId(proBuild) {
  const hero = objectValue(objectValue(objectValue(proBuild).loadout).hero);
  const value = objectValue(hero.sourceData).PlayerId;
  if (typeof value === "string") return nonEmptyString(value);
  return Number.isSafeInteger(value) ? String(value) : null;
}

/** @deprecated Prefer viewedPlayerId; Hunter File identity is no longer special. */
function hunterFilePlayerId(proBuild) {
  return viewedPlayerId(proBuild);
}

function sectionValue(loadout, name) {
  return objectValue(loadout[name]);
}

function sectionItems(loadout, name) {
  return arrayValue(sectionValue(loadout, name).items);
}

function sectionRecords(loadout, name) {
  return arrayValue(sectionValue(loadout, name).records);
}

function allPortableItems(loadout) {
  const entries = [];
  const seen = new Set();
  const add = (items, sourceSection) => {
    for (const [index, itemValue] of items.entries()) {
      const item = objectValue(itemValue);
      const source = objectValue(item.source);
      const key = [
        nonEmptyString(source.collection) ?? sourceSection,
        nonEmptyString(source.key) ?? index,
        nonEmptyString(item.instanceId) ?? "",
      ].join("\u001f");
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ item, sourceSection, index, key });
    }
  };

  for (const section of ITEM_SECTIONS) add(sectionItems(loadout, section), section);
  const unmapped = sectionValue(loadout, "unmappedSourceCollections");
  for (const section of [
    "unclassifiedWearItems",
    "otherWearItems",
    "jewelItems",
    "heroCharacterItems",
  ]) {
    add(sectionItems(unmapped, section), `unmapped.${section}`);
  }
  return entries;
}

function identityValue(item, name) {
  return objectValue(objectValue(item.identity)[name]);
}

function hasNativeIdentity(identity) {
  const value = nonEmptyString(String(identity.gameId ?? ""));
  return Boolean(value && value !== "0");
}

function resolvedIdentity(item, domains, preference = ["base", "special"]) {
  for (const name of preference) {
    const identity = identityValue(item, name);
    if (!domains.includes(nonEmptyString(identity.domain))) continue;
    const id = nonEmptyString(identity.compendiumId);
    if (id && UUID_PATTERN.test(id)) return { ...identity, compendiumId: id };
  }
  return null;
}

function itemSeed(entry, target) {
  const item = entry.item;
  return [
    target,
    entry.key,
    item.instanceId ?? "",
    identityValue(item, "special").compendiumId ?? "",
    identityValue(item, "base").compendiumId ?? "",
  ].join("\u001f");
}

function generatedItemId(prefix, entry) {
  return `tli_dump_${prefix}_${stableHash(itemSeed(entry, prefix))}`;
}

function catalogGearSlotOptions(converted) {
  const category = nonEmptyString(converted.value.gearCategory);
  const subtype = nonEmptyString(converted.value.gearSubType);
  const singleSlot = SINGLE_CATEGORY_GEAR_SLOTS.get(category);
  if (singleSlot) return [singleSlot];

  if (category === "trinket") {
    if (subtype === "belt") return ["belt"];
    if (subtype === "necklace") return ["necklace"];
    if (subtype === "ring" || subtype === "spirit_ring") return ["ring1", "ring2"];
    return [];
  }

  if (category === "one_handed") return ["mainHand", "offHand"];

  return [];
}

function wearItemsFallbackSlot(entry, converted) {
  if (nonEmptyString(objectValue(entry.item.source).collection) !== "WearItems") return null;
  const location = objectValue(entry.item.location);
  if (finiteInteger(location.bag) !== 1 || finiteInteger(location.page) !== -1) return null;
  const sourceSlot = finiteInteger(location.slot);
  const targetSlot = GEAR_SLOTS.get(sourceSlot);
  if (!targetSlot || !catalogGearSlotOptions(converted).includes(targetSlot)) return null;
  return targetSlot;
}

function voraxGearSlotOptions(converted) {
  const limbType = nonEmptyString(converted.value.limbType);
  switch (limbType) {
    case "chest": return ["chest"];
    case "head": return ["helmet"];
    case "hands": return ["gloves"];
    case "legs":
    case "aberrant legs": return ["boots"];
    case "neck": return ["necklace"];
    case "digits":
    case "aberrant digits": return ["ring1", "ring2"];
    case "waist":
    case "aberrant waist": return ["belt"];
    default: return [];
  }
}

function wearItemsVoraxFallbackSlot(entry, converted) {
  if (nonEmptyString(objectValue(entry.item.source).collection) !== "WearItems") return null;
  const location = objectValue(entry.item.location);
  if (finiteInteger(location.bag) !== 1 || finiteInteger(location.page) !== -1) return null;
  const targetSlot = GEAR_SLOTS.get(finiteInteger(location.slot));
  return targetSlot && voraxGearSlotOptions(converted).includes(targetSlot)
    ? targetSlot
    : null;
}

function compendiumOverlay(item) {
  const data = objectValue(item.data);
  return objectValue(data.compendium);
}

function isInversePrismCandidate(item) {
  const overlay = compendiumOverlay(item);
  return overlay.baseId === "inverse_image"
    || overlay.prismType === "inverse"
    || Object.hasOwn(overlay, "inverseModValues");
}

function indexedPosition(key) {
  const match = String(key).match(/^\[?(\d+)\]?$/);
  return match ? Number(match[1]) : null;
}

function keyedNativeAffixId(key) {
  const match = String(key).match(/^\[?([1-9]\d*)\]?$/);
  return match ? match[1] : null;
}

function affixRollValues(value) {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (typeof value === "string") {
    const text = value.trim();
    if (text && NUMERIC_ROLL_PATTERN.test(text)) {
      const number = Number(text);
      if (Number.isFinite(number)) return [number];
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(child => affixRollValues(child));
  }
  if (!value || typeof value !== "object") return [];

  const indexed = Object.entries(value)
    .map(([key, child]) => ({ position: indexedPosition(key), child }))
    .filter(entry => entry.position !== null)
    .sort((left, right) => left.position - right.position);
  if (indexed.length > 0) {
    return indexed.flatMap(entry => affixRollValues(entry.child));
  }

  const parameters = Object.entries(value)
    .map(([key, child]) => {
      const match = key.match(/^P(\d+)$/i);
      return { position: match ? Number(match[1]) : null, child };
    })
    .filter(entry => entry.position !== null)
    .sort((left, right) => left.position - right.position);
  if (parameters.length > 0) {
    return parameters.flatMap(entry => affixRollValues(entry.child));
  }

  const scalar = firstDefined(value, "Value", "value");
  return typeof scalar === "number" && Number.isFinite(scalar) ? [scalar] : [];
}

function nativeAffixObservations(
  item,
  recognizedIds = null,
  root = undefined,
) {
  const observations = [];
  const seenObjects = new Set();
  const idKeys = [
    "AffixId", "affixId",
    "ModifierId", "modifierId",
    "ConfigId", "configId",
    "Id", "id",
  ];
  const rollKeys = [
    "DynArgs", "dynArgs",
    "RollValues", "rollValues",
    "Values", "Value", "value",
  ];
  const slotKeys = [
    "SlotIndex", "slotIndex",
    "AffixSlotIndex", "affixSlotIndex",
  ];
  const tierKeys = ["TLv", "tlv", "TierLevel", "tierLevel"];
  const familyKeys = ["Node", "node", "FamilyId", "familyId"];
  const simpleKeys = ["Simple", "simple"];
  const complexKeys = ["Complex", "complex"];

  const pushScalar = value => {
    const id = nonEmptyString(String(value ?? ""));
    if (id && /^[1-9]\d*$/.test(id) && (!recognizedIds || recognizedIds.has(id))) {
      observations.push({
        id,
        values: [],
        slotIndex: null,
        tierHint: null,
        familyHint: null,
        simple: null,
        complex: null,
        candidateIds: [id],
      });
    }
  };

  const pushRecord = (id, value, candidateIds = [id]) => {
    if (!id || (recognizedIds && !recognizedIds.has(id))) return;
    const rolls = rollKeys
      .map(key => firstDefined(value, key))
      .find(candidate => candidate !== undefined);
    const slotIndex = slotKeys
      .map(key => firstDefined(value, key))
      .map(finiteInteger)
      .find(candidate => candidate !== null) ?? null;
    const tierHint = tierKeys
      .map(key => firstDefined(value, key))
      .map(finiteInteger)
      .find(candidate => candidate !== null) ?? null;
    const familyHint = familyKeys
      .map(key => nonEmptyString(String(firstDefined(value, key) ?? "")))
      .find(candidate => candidate && /^[1-9]\d*$/.test(candidate)) ?? null;
    const simple = simpleKeys
      .map(key => nonEmptyString(firstDefined(value, key)))
      .find(Boolean) ?? null;
    const complex = complexKeys
      .map(key => nonEmptyString(firstDefined(value, key)))
      .find(Boolean) ?? null;
    observations.push({
      id,
      values: affixRollValues(rolls),
      slotIndex,
      tierHint,
      familyHint,
      simple,
      complex,
      candidateIds: candidateIds.filter(Boolean),
    });
  };

  const observeRecord = (value, allowScalar = false) => {
    if (typeof value === "number" || typeof value === "string") {
      if (allowScalar) pushScalar(value);
      return true;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const hasExplicitId = idKeys.some(key => Object.hasOwn(value, key));
    if (!hasExplicitId) return false;
    if (seenObjects.has(value)) return true;
    seenObjects.add(value);
    const ids = idKeys
      .map(key => firstDefined(value, key))
      .map(candidate => nonEmptyString(String(candidate ?? "")))
      .filter(candidate => candidate && /^[1-9]\d*$/.test(candidate));
    if (ids.length > 0) {
      const id = recognizedIds
        ? ids.find(candidate => recognizedIds.has(candidate))
        : ids[0];
      pushRecord(id, value, ids);
      // An explicit affix ID makes this object one record. Its other numeric
      // payload is roll/runtime data, not additional affix records.
      return true;
    }
    // Invalid/sentinel explicit IDs still make this a single non-affix record;
    // never reinterpret its nested numbers as IDs.
    return true;
  };

  const observeKeyedRecord = (key, value) => {
    const id = keyedNativeAffixId(key);
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) return false;
    if (seenObjects.has(value)) return true;
    seenObjects.add(value);
    pushRecord(id, value, [id]);
    return true;
  };

  const roots = root === undefined ? Object.values(objectValue(item.affixes)) : [root];
  for (const familyRoot of roots) {
    if (Array.isArray(familyRoot)) {
      for (const entry of familyRoot) observeRecord(entry, true);
      continue;
    }
    if (observeRecord(familyRoot)) continue;
    if (!familyRoot || typeof familyRoot !== "object") continue;
    for (const [key, entry] of Object.entries(familyRoot)) {
      if (Array.isArray(entry)) {
        for (const child of entry) observeRecord(child);
      } else if (!observeRecord(entry)) {
        observeKeyedRecord(key, entry);
      }
    }
  }
  return observations;
}

function observedRollValue(value, bounds) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minimum = Number(bounds.minValue);
  const maximum = Number(bounds.maxValue);
  if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
    if (value >= minimum && value <= maximum) return value;
    if (bounds.sign === "-"
        && minimum >= 0
        && maximum >= 0
        && value < 0
        && -value >= minimum
        && -value <= maximum) return -value;
  }
  return null;
}

function plannerRoll(value, bounds) {
  return {
    value,
    minValue: bounds.minValue,
    maxValue: bounds.maxValue,
    ...(typeof bounds.sign === "string" ? { sign: bounds.sign } : {}),
    ...(typeof bounds.unit === "string" ? { unit: bounds.unit } : {}),
  };
}

function equivalentRollBounds(leftValue, rightValue) {
  const left = objectValue(leftValue);
  const right = objectValue(rightValue);
  return Number(left.minValue) === Number(right.minValue)
    && Number(left.maxValue) === Number(right.maxValue)
    && (left.sign ?? null) === (right.sign ?? null)
    && (left.unit ?? null) === (right.unit ?? null);
}

function plannerRolls(values, boundsValues) {
  const bounds = arrayValue(boundsValues);
  const positional = values.length < bounds.length ? null : bounds.map((boundsValue, index) => {
    const bounds = objectValue(boundsValue);
    const value = observedRollValue(values[index], bounds);
    if (value === null) return null;
    return plannerRoll(value, bounds);
  });
  if (positional && positional.every(value => value !== null)) return positional;

  const usedBySource = Array.from({ length: values.length }, () => []);
  const reconciled = bounds.map(boundsValue => {
    const targetBounds = objectValue(boundsValue);
    const matches = values.flatMap((sourceValue, sourceIndex) => {
      const value = observedRollValue(sourceValue, targetBounds);
      return value === null ? [] : [{ sourceIndex, value }];
    });
    if (matches.length === 1) {
      usedBySource[matches[0].sourceIndex].push(targetBounds);
      return plannerRoll(matches[0].value, targetBounds);
    }
    const minimum = Number(targetBounds.minValue);
    const maximum = Number(targetBounds.maxValue);
    return matches.length === 0
        && Number.isFinite(minimum)
        && minimum === maximum
      ? plannerRoll(minimum, targetBounds)
      : null;
  });
  if (reconciled.some(value => value === null)
      || usedBySource.some(targets => targets.length === 0)
      || usedBySource.some(targets => (
        targets.length > 1
        && targets.some(target => !equivalentRollBounds(targets[0], target))
      ))) return null;
  return reconciled;
}

function formatModifierDescription(templateValue, rolls) {
  const template = nonEmptyString(templateValue) ?? "";
  let index = 0;
  return template.replace(/#(?:\.#)?/g, (placeholder, offset) => {
    const roll = rolls[index];
    index += 1;
    if (!roll) return placeholder;
    const literalSign = template[offset - 1] === "+" || template[offset - 1] === "-";
    return String(literalSign ? Math.abs(roll.value) : roll.value);
  });
}

function legendaryModifierFamily(modifierId) {
  const id = nonEmptyString(String(modifierId ?? ""));
  return id && /^[1-9]\d+$/.test(id) ? id.slice(0, -1) : null;
}

function legendaryTierBounds(observation, prototypeValues) {
  const modifierId = nonEmptyString(observation?.id);
  const family = legendaryModifierFamily(modifierId);
  const tier = finiteInteger(observation?.tierHint);
  const complex = nonEmptyString(observation?.complex);
  const values = arrayValue(observation?.values);
  const prototypes = arrayValue(prototypeValues).map(objectValue);
  if (!modifierId
      || !family
      || observation?.familyHint !== family
      || tier === null
      || tier < 1
      || tier > 9
      || Number(modifierId.at(-1)) !== tier
      || !complex
      || values.length === 0
      || values.length !== prototypes.length) {
    return null;
  }
  const ranges = [...complex.matchAll(
    /\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[-–—]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/g,
  )].map(match => ({
    minValue: Number(match[1]),
    maxValue: Number(match[2]),
  }));
  const variablePrototypeCount = prototypes.filter(prototype => (
    Number(prototype.minValue) !== Number(prototype.maxValue)
  )).length;
  if (ranges.length !== variablePrototypeCount || ranges.some(range => (
    !Number.isFinite(range.minValue)
    || !Number.isFinite(range.maxValue)
    || range.minValue > range.maxValue
  ))) {
    return null;
  }
  let rangeIndex = 0;
  const bounds = prototypes.map(prototype => {
    const fixed = Number(prototype.minValue) === Number(prototype.maxValue);
    const range = fixed
      ? {
        minValue: Number(prototype.minValue),
        maxValue: Number(prototype.maxValue),
      }
      : ranges[rangeIndex++];
    return {
      ...range,
      ...(typeof prototype.sign === "string" ? { sign: prototype.sign } : {}),
      ...(typeof prototype.unit === "string" ? { unit: prototype.unit } : {}),
    };
  });
  return plannerRolls(values, bounds) === null ? null : bounds;
}

function legendaryDefinitionVariant(definition, observation) {
  if (!observation) return null;
  const exactNormal = observation.id === String(definition.normalModifierId);
  const corroded = observation.id === String(definition.corrodedModifierId);
  const bounds = corroded
    ? arrayValue(definition.corrodedValues)
    : exactNormal
      ? arrayValue(definition.normalValues)
      : legendaryTierBounds(observation, definition.normalValues);
  if (!bounds) return null;
  const rolls = plannerRolls(observation.values, bounds);
  if (rolls === null) return null;
  const template = corroded
    ? definition.corrodedDescriptionTemplate
    : definition.normalDescriptionTemplate;
  return {
    modId: definition.id,
    description: formatModifierDescription(template, rolls),
    variant: corroded ? "corroded" : "normal",
    rolledValues: rolls,
  };
}

function validPlannerRoll(value) {
  const roll = objectValue(value);
  return typeof roll.value === "number"
    && Number.isFinite(roll.value)
    && typeof roll.minValue === "number"
    && Number.isFinite(roll.minValue)
    && typeof roll.maxValue === "number"
    && Number.isFinite(roll.maxValue)
    && roll.value >= roll.minValue
    && roll.value <= roll.maxValue;
}

function validLegendaryModifier(value, randomAffixSlotCount, random = false) {
  const modifier = objectValue(value);
  const slotIndex = finiteInteger(modifier.slotIndex);
  return Boolean(
    nonEmptyString(modifier.modId)
    && UUID_PATTERN.test(modifier.modId)
    && typeof modifier.description === "string"
    && (modifier.variant === "normal" || modifier.variant === "corroded")
    && Array.isArray(modifier.rolledValues)
    && modifier.rolledValues.every(validPlannerRoll)
    && (!random || (
      slotIndex !== null
      && slotIndex >= 0
      && slotIndex < randomAffixSlotCount
    )),
  );
}

function materializeLegendaryAffixes(item, metadata, overlay) {
  const fixedDefinitions = arrayValue(metadata.legendaryMods);
  const randomDefinitions = arrayValue(metadata.randomAffixMods);
  const randomAffixSlotCount = finiteInteger(metadata.randomAffixSlotCount)
    ?? randomDefinitions.length;
  const fixedDefinitionIds = new Set(
    fixedDefinitions.map(value => nonEmptyString(objectValue(value).id)).filter(Boolean),
  );
  const randomDefinitionIds = new Set(
    randomDefinitions.map(value => nonEmptyString(objectValue(value).id)).filter(Boolean),
  );
  const definitionsByNativeId = new Map();
  const definitionsByFamilyId = new Map();
  const addUniqueDefinition = (definitions, key, match) => {
    if (!definitions.has(key)) {
      definitions.set(key, match);
      return;
    }
    const existing = definitions.get(key);
    if (existing === null
        || existing.kind !== match.kind
        || existing.definition.id !== match.definition.id) {
      definitions.set(key, null);
    }
  };
  for (const [kind, definitions] of [["fixed", fixedDefinitions], ["random", randomDefinitions]]) {
    for (const definitionValue of definitions) {
      const definition = objectValue(definitionValue);
      for (const key of ["normalModifierId", "corrodedModifierId"]) {
        const nativeId = nonEmptyString(String(definition[key] ?? ""));
        if (!nativeId) continue;
        const match = { kind, definition };
        addUniqueDefinition(definitionsByNativeId, nativeId, match);
        const family = legendaryModifierFamily(nativeId);
        if (!family) continue;
        addUniqueDefinition(definitionsByFamilyId, family, match);
      }
    }
  }
  const allObservations = nativeAffixObservations(item);
  const matchObservation = observation => {
    const candidateIds = [...new Set([
      observation.id,
      ...arrayValue(observation.candidateIds),
    ].filter(Boolean))];
    if (candidateIds.some(id => (
      definitionsByNativeId.has(id) && definitionsByNativeId.get(id) === null
    ))) {
      return null;
    }
    const exactMatches = candidateIds.flatMap(id => {
      const match = definitionsByNativeId.get(id);
      return match ? [{ match, observation: { ...observation, id }, source: observation }] : [];
    });
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return null;

    if (candidateIds.some(id => {
      const family = legendaryModifierFamily(id);
      return family
        && definitionsByFamilyId.has(family)
        && definitionsByFamilyId.get(family) === null;
    })) {
      return null;
    }
    const familyMatches = candidateIds.flatMap(id => {
      const family = legendaryModifierFamily(id);
      const match = family ? definitionsByFamilyId.get(family) : null;
      const normalized = { ...observation, id };
      return match
          && observation.familyHint === family
          && legendaryTierBounds(normalized, match.definition.normalValues)
        ? [{ match, observation: normalized, source: observation }]
        : [];
    });
    return familyMatches.length === 1 ? familyMatches[0] : null;
  };
  const matchedObservations = allObservations
    .map(matchObservation)
    .filter(Boolean);
  const matchedSourceObservations = new Set(
    matchedObservations.map(({ source }) => source),
  );
  const unknownObservations = allObservations.filter(observation => (
    !matchedSourceObservations.has(observation)
  ));
  const unknownObservationCount = unknownObservations.length;
  const exactFixed = arrayValue(overlay.legendaryMods);
  const exactRandom = arrayValue(overlay.randomAffixSlots);
  if (Object.hasOwn(overlay, "legendaryMods")
      && Object.hasOwn(overlay, "randomAffixSlots")
      && Array.isArray(overlay.legendaryMods)
      && Array.isArray(overlay.randomAffixSlots)
      && exactFixed.length === fixedDefinitions.length
      && exactFixed.every(value => validLegendaryModifier(value, randomAffixSlotCount))
      && exactFixed.every(value => fixedDefinitionIds.has(value.modId))
      && new Set(exactFixed.map(value => value.modId)).size === exactFixed.length
      && exactRandom.every(value => validLegendaryModifier(
        value,
        randomAffixSlotCount,
        true,
      ))
      && exactRandom.every(value => randomDefinitionIds.has(value.modId))
      && new Set(exactRandom.map(value => value.slotIndex)).size === exactRandom.length) {
    return {
      legendaryMods: deepClone(exactFixed),
      randomAffixSlots: deepClone(exactRandom),
      observedCount: allObservations.length,
      unmappedCount: unknownObservationCount,
    };
  }
  const fixedByDefinition = new Map();
  const randomObservations = [];
  let incompleteCount = 0;
  for (const { observation, match } of matchedObservations) {
    if (match.kind === "fixed") {
      const values = fixedByDefinition.get(match.definition.id) ?? [];
      values.push(observation);
      fixedByDefinition.set(match.definition.id, values);
    } else {
      randomObservations.push({ observation, definition: match.definition });
    }
  }

  const legendaryMods = fixedDefinitions.flatMap(definitionValue => {
    const definition = objectValue(definitionValue);
    const observationsForDefinition = fixedByDefinition.get(definition.id) ?? [];
    if (observationsForDefinition.length !== 1) {
      incompleteCount += Math.max(1, observationsForDefinition.length);
      return [];
    }
    const [observation] = observationsForDefinition;
    const converted = legendaryDefinitionVariant(
      definition,
      observation,
    );
    if (!converted) {
      incompleteCount += 1;
      return [];
    }
    return [converted];
  });
  const occupiedRandomSlots = new Set();
  const randomAffixSlots = [];
  for (const { observation, definition } of randomObservations) {
    let randomSlotIndex = observation.slotIndex;
    if (randomSlotIndex === null || randomSlotIndex === undefined) {
      randomSlotIndex = randomAffixSlotCount === 1 && !occupiedRandomSlots.has(0)
        ? 0
        : undefined;
    }
    if (randomSlotIndex === undefined
        || randomSlotIndex < 0
        || randomSlotIndex >= randomAffixSlotCount
        || occupiedRandomSlots.has(randomSlotIndex)) {
      incompleteCount += 1;
      continue;
    }
    const variant = legendaryDefinitionVariant(definition, observation);
    if (!variant) {
      incompleteCount += 1;
      continue;
    }
    const result = {
      slotIndex: randomSlotIndex,
      ...variant,
    };
    occupiedRandomSlots.add(randomSlotIndex);
    randomAffixSlots.push(result);
  }
  randomAffixSlots.sort((left, right) => left.slotIndex - right.slotIndex);
  const failedFixedDefinitionIds = new Set(
    fixedDefinitions
      .map(value => nonEmptyString(objectValue(value).id))
      .filter(id => id && !legendaryMods.some(modifier => modifier.modId === id)),
  );
  const pairedFailedDefinitions = new Set();
  for (const observation of unknownObservations) {
    const candidateDefinitionIds = new Set([
      observation.id,
      ...arrayValue(observation.candidateIds),
    ].flatMap(id => {
      const family = legendaryModifierFamily(id);
      const match = family ? definitionsByFamilyId.get(family) : null;
      const definitionId = nonEmptyString(match?.definition?.id);
      return match?.kind === "fixed"
          && definitionId
          && failedFixedDefinitionIds.has(definitionId)
        ? [definitionId]
        : [];
    }));
    if (candidateDefinitionIds.size === 1) {
      pairedFailedDefinitions.add([...candidateDefinitionIds][0]);
    }
  }
  return {
    legendaryMods,
    randomAffixSlots,
    observedCount: allObservations.length,
    unmappedCount: incompleteCount
      + unknownObservationCount
      - pairedFailedDefinitions.size,
  };
}

function validRareAffix(value) {
  const affix = objectValue(value);
  return Boolean(
    nonEmptyString(affix.affixId)
    && UUID_PATTERN.test(affix.affixId)
    && nonEmptyString(affix.tierId)
    && UUID_PATTERN.test(affix.tierId)
    && typeof affix.modifierDescription === "string"
    && typeof affix.tier === "string"
    && Array.isArray(affix.rolledValues)
    && affix.rolledValues.every(validPlannerRoll),
  );
}

function nativeCampaignTier(observation) {
  const tier = finiteInteger(observation?.tierHint);
  const modifierId = nonEmptyString(observation?.id);
  if ((tier !== 8 && tier !== 9) || !modifierId || !/^[1-9]\d{2,}$/.test(modifierId)) {
    return null;
  }
  const encodedTier = Number(modifierId.slice(-2));
  return encodedTier === tier ? tier : null;
}

function nativeModifierFamily(modifierId) {
  const id = nonEmptyString(String(modifierId ?? ""));
  return id && /^[1-9]\d{2,}$/.test(id) ? id.slice(0, -2) : null;
}

function sourceRangeBounds(observation, prototypeValues) {
  const values = arrayValue(observation?.values);
  if (values.length === 0) return null;
  const ranges = [];
  const complex = nonEmptyString(observation?.complex) ?? "";
  const pattern =
    /\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[-–—]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/g;
  for (const match of complex.matchAll(pattern)) {
    const minimum = Number(match[1]);
    const maximum = Number(match[2]);
    if (Number.isFinite(minimum) && Number.isFinite(maximum) && minimum <= maximum) {
      ranges.push({ minValue: minimum, maxValue: maximum });
    }
  }
  const exactRanges = ranges.length === values.length
    ? ranges
    : values.map(value => ({ minValue: value, maxValue: value }));
  const bounds = exactRanges.map((range, index) => {
    const prototype = objectValue(arrayValue(prototypeValues)[index]);
    return {
      ...range,
      ...(typeof prototype.sign === "string" ? { sign: prototype.sign } : {}),
      ...(typeof prototype.unit === "string" ? { unit: prototype.unit } : {}),
    };
  });
  return plannerRolls(values, bounds) === null
    ? values.map((value, index) => {
      const prototype = objectValue(arrayValue(prototypeValues)[index]);
      return {
        minValue: value,
        maxValue: value,
        ...(typeof prototype.sign === "string" ? { sign: prototype.sign } : {}),
        ...(typeof prototype.unit === "string" ? { unit: prototype.unit } : {}),
      };
    })
    : bounds;
}

function formatModifierBounds(templateValue, boundsValues) {
  const template = nonEmptyString(templateValue) ?? "";
  const bounds = arrayValue(boundsValues);
  let index = 0;
  return template.replace(/#(?:\.#)?/g, placeholder => {
    const boundsValue = objectValue(bounds[index]);
    index += 1;
    const minimum = Number(boundsValue.minValue);
    const maximum = Number(boundsValue.maxValue);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return placeholder;
    return minimum === maximum ? String(minimum) : `(${minimum}–${maximum})`;
  });
}

function campaignRareAffix(observation, definitions, metadata, family) {
  const tier = nativeCampaignTier(observation);
  const observedFamily = nativeModifierFamily(observation?.id);
  if (tier === null || !observedFamily) return null;
  if (observation.familyHint && observation.familyHint !== observedFamily) return null;

  const candidates = definitions
    .map(objectValue)
    .filter(definition => nativeModifierFamily(definition.modifierId) === observedFamily);
  const affixIds = new Set(candidates.map(definition => nonEmptyString(definition.affixId)));
  if (candidates.length === 0 || affixIds.size !== 1 || affixIds.has(null)) return null;
  const descriptions = new Set(
    candidates.map(definition => nonEmptyString(definition.descriptionTemplate)),
  );
  if (descriptions.size !== 1 || descriptions.has(null)) return null;
  const prototype = candidates.find(definition => String(definition.tier) === "7")
    ?? candidates.at(-1);
  const bounds = sourceRangeBounds(observation, prototype?.values);
  const affixId = [...affixIds][0];
  const modifierDescription = [...descriptions][0];
  const category = nonEmptyString(metadata.category);
  const subtype = nonEmptyString(metadata.subtype);
  if (!bounds || !category || !subtype || !affixId || !modifierDescription) return null;
  const rolls = plannerRolls(observation.values, bounds);
  if (rolls === null) return null;
  const tierId = generatedCatalogUuid([
    "poorchlight",
    "SS13",
    category,
    subtype,
    family,
    observation.id,
  ].join("\u001f"));
  const rawText = formatModifierBounds(modifierDescription, bounds);
  return {
    value: {
      affixId,
      tierId,
      modifierDescription,
      rolledValues: rolls,
      tier: String(tier),
    },
    extension: {
      category,
      subtype,
      family,
      affixId,
      tierId,
      tier: String(tier),
      nativeModifierId: observation.id,
      modifierDescription,
      rawText,
      values: deepClone(bounds),
    },
  };
}

function materializeRareAffixFamily(item, metadata, overlay, options) {
  const affixes = objectValue(item.affixes);
  const sourceValue = firstDefined(affixes, ...options.sourceKeys) ?? null;
  const observations = nativeAffixObservations(item, null, sourceValue);
  const definitions = arrayValue(firstDefined(metadata, ...options.metadataKeys));
  const definitionPairs = new Set(definitions.map(value => {
    const definition = objectValue(value);
    return `${definition.affixId}\u001f${definition.tierId}`;
  }));
  const byModifierId = new Map(definitions.map(value => {
    const definition = objectValue(value);
    return [String(definition.modifierId), definition];
  }));
  const recognized = nativeAffixObservations(
    item,
    new Set(byModifierId.keys()),
    sourceValue,
  );
  const sourcePairs = recognized.map(observation => {
    const definition = byModifierId.get(observation.id);
    return `${definition.affixId}\u001f${definition.tierId}`;
  }).sort();
  const exactValue = firstDefined(overlay, ...options.overlayKeys);
  const exactPairs = arrayValue(exactValue)
    .map(value => `${value.affixId}\u001f${value.tierId}`)
    .sort();
  const exactMatchesSource = observations.length === 0 || (
    recognized.length === observations.length
    && recognized.length > 0
    && sourcePairs.length === exactPairs.length
    && sourcePairs.every((value, index) => value === exactPairs[index])
  );
  if (hasOwnField(overlay, ...options.overlayKeys)
      && Array.isArray(exactValue)
      && exactValue.every(validRareAffix)
      && exactValue.every(value => definitionPairs.has(
        `${value.affixId}\u001f${value.tierId}`,
      ))
      && exactMatchesSource) {
    return {
      values: deepClone(exactValue),
      observedCount: observations.length,
      mappedCount: recognized.length,
      extensions: [],
    };
  }

  let mappedCount = 0;
  const extensions = [];
  const values = observations.flatMap(observation => {
    const exactModifierId = arrayValue(observation.candidateIds)
      .find(modifierId => byModifierId.has(modifierId));
    const definition = byModifierId.get(exactModifierId ?? observation.id);
    if (definition) {
      const rolls = plannerRolls(observation.values, definition.values);
      if (rolls === null) return [];
      mappedCount += 1;
      return [{
        affixId: definition.affixId,
        tierId: definition.tierId,
        modifierDescription: definition.descriptionTemplate,
        rolledValues: rolls,
        tier: definition.tier,
      }];
    }
    const campaign = campaignRareAffix(
      observation,
      definitions,
      metadata,
      options.plannerFamily,
    );
    if (!campaign) return [];
    mappedCount += 1;
    extensions.push(campaign.extension);
    return [campaign.value];
  });
  return {
    values,
    observedCount: observations.length,
    mappedCount,
    extensions,
  };
}

function affixFamilyObservations(item, sourceKeys) {
  const affixes = objectValue(item.affixes);
  const sourceValue = firstDefined(affixes, ...sourceKeys) ?? null;
  return nativeAffixObservations(item, null, sourceValue);
}

function uniqueDefinitionsByModifierId(definitions) {
  const result = new Map();
  for (const definitionValue of definitions) {
    const definition = objectValue(definitionValue);
    const modifierId = nonEmptyString(String(definition.modifierId ?? ""));
    if (!modifierId) continue;
    if (result.has(modifierId)) {
      // An ambiguous season catalog must never be resolved by order.
      result.set(modifierId, null);
    } else {
      result.set(modifierId, definition);
    }
  }
  return result;
}

function ambiguousModifierIds(metadata, metadataKeyGroups) {
  const owners = new Map();
  for (const metadataKeys of metadataKeyGroups) {
    for (const definitionValue of arrayValue(firstDefined(metadata, ...metadataKeys))) {
      const modifierId = nonEmptyString(String(objectValue(definitionValue).modifierId ?? ""));
      if (!modifierId) continue;
      owners.set(modifierId, (owners.get(modifierId) ?? 0) + 1);
    }
  }
  return new Set(
    [...owners.entries()].filter(([, count]) => count > 1).map(([modifierId]) => modifierId),
  );
}

function exactPlannerRolls(observation, bounds) {
  const values = arrayValue(observation?.values);
  const definitions = arrayValue(bounds);
  if (values.length !== definitions.length) return null;
  return plannerRolls(values, definitions);
}

function materializeBaseImplicits(item, baseMetadata) {
  const definitions = arrayValue(baseMetadata.implicits);
  const byModifierId = uniqueDefinitionsByModifierId(definitions);
  const observations = [
    ...affixFamilyObservations(item, ["baseAttrInfoList"]),
    ...affixFamilyObservations(item, ["fixedBaseAffix"]),
  ];
  const consumedDefinitions = new Set();
  let consumedCount = 0;
  for (const observation of observations) {
    const definition = byModifierId.get(observation.id);
    if (!definition || consumedDefinitions.has(observation.id)) continue;
    const rolls = exactPlannerRolls(observation, definition.values);
    if (rolls === null) continue;
    consumedDefinitions.add(observation.id);
    consumedCount += 1;
  }

  const plannerImplicits = definitions.map(value => {
    const { modifierId: _modifierId, ...implicit } = objectValue(value);
    return deepClone(implicit);
  });
  return { consumedCount, plannerImplicits };
}

function materializeScopedGearModifiers(item, metadata, options) {
  const observations = affixFamilyObservations(item, options.sourceKeys);
  const definitions = arrayValue(firstDefined(metadata, ...options.metadataKeys));
  const byModifierId = uniqueDefinitionsByModifierId(definitions);
  const usedDefinitions = new Set();
  const values = [];
  let mappedCount = 0;
  for (const observation of observations) {
    if (values.length >= options.limit) continue;
    if (options.excludedIds?.has(observation.id)) continue;
    const definition = byModifierId.get(observation.id);
    const id = nonEmptyString(definition?.id);
    const template = nonEmptyString(definition?.descriptionTemplate);
    const tier = nonEmptyString(String(definition?.tier ?? ""));
    if (!definition || !id || !UUID_PATTERN.test(id) || !template || !tier
        || usedDefinitions.has(id)) continue;
    const rolls = exactPlannerRolls(observation, definition.values);
    if (rolls === null) continue;
    usedDefinitions.add(id);
    mappedCount += 1;
    values.push({
      [options.idKey]: id,
      description: formatModifierDescription(template, rolls),
      rolledValues: rolls,
      tier,
    });
  }
  return { values, observedCount: observations.length, mappedCount };
}

function materializeBeltBlend(item, metadata, overlay) {
  const observations = affixFamilyObservations(
    item,
    ["enchantAffixList"],
  );
  const definitions = arrayValue(metadata.beltBlends);
  const byModifierId = uniqueDefinitionsByModifierId(definitions);
  if (observations.length === 1) {
    const observation = observations[0];
    const definition = byModifierId.get(observation.id);
    const id = nonEmptyString(definition?.id);
    const rawText = nonEmptyString(definition?.rawText);
    if (definition && id && UUID_PATTERN.test(id) && rawText
        && typeof definition.type === "string"
        && observation.values.length === 0) {
      return {
        value: {
          blendId: id,
          description: rawText,
          rolledValues: [],
          type: definition.type,
          modifierId: observation.id,
        },
        observedCount: 1,
        mappedCount: 1,
      };
    }
  }
  return {
    value: observations.length === 0
      ? (overlay.beltBlend ?? null)
      : null,
    observedCount: observations.length,
    mappedCount: 0,
  };
}

function materializeTowerSequence(item, metadata, overlay) {
  const observations = affixFamilyObservations(item, ["chipAffixList"]);
  const definitions = arrayValue(metadata.towerSequences);
  const byModifierId = uniqueDefinitionsByModifierId(definitions);
  if (observations.length === 1) {
    const observation = observations[0];
    const definition = byModifierId.get(observation.id);
    const id = nonEmptyString(definition?.id);
    const description = nonEmptyString(definition?.description);
    const sequenceType = nonEmptyString(definition?.sequenceType);
    const chips = arrayValue(definition?.chips);
    const rolls = definition ? exactPlannerRolls(observation, definition.values) : null;
    if (definition && id && UUID_PATTERN.test(id) && description && sequenceType
        && chips.length > 0
        && chips.every(chip => Number.isSafeInteger(chip) && chip > 0)
        && rolls !== null) {
      return {
        value: {
          sequenceId: id,
          description,
          sequenceType,
          // The planner schema reserves this for a user-authored override;
          // the official sequence identity is sequenceId.
          modifierId: "",
          chips: deepClone(chips),
        },
        observedCount: 1,
        mappedCount: 1,
      };
    }
  }
  return {
    value: observations.length === 0
      ? (overlay.towerSequence ?? null)
      : null,
    observedCount: observations.length,
    mappedCount: 0,
  };
}

function nativeInfluenceObservationCount(item) {
  const data = objectValue(item.data);
  return [
    firstDefined(data, "InfluenceId", "influenceId"),
    firstDefined(data, "OriginBaseAffixId", "originBaseAffixId"),
  ].filter(value => {
    const text = String(value ?? "").trim();
    return /^[1-9]\d*$/.test(text);
  }).length;
}

function materializeGear(entry) {
  const item = entry.item;
  const specialIdentity = identityValue(item, "special");
  const legendary = resolvedIdentity(item, ["legendaries"], ["special", "base"]);
  const base = resolvedIdentity(item, ["gear"]);
  if (hasNativeIdentity(specialIdentity) && !legendary) {
    return { error: "the nonzero special item ID has no unique legendary UUID" };
  }
  const identity = legendary ?? base;
  if (!identity) return { error: "no resolved gear or legendary UUID" };

  const metadata = objectValue(identity.metadata);
  const baseMetadata = objectValue(base?.metadata);
  const category = nonEmptyString(metadata.category);
  const subtype = nonEmptyString(metadata.subtype);
  const name = nonEmptyString(identity.label);
  const icon = nonEmptyString(metadata.icon);
  const requiredLevel = finiteInteger(metadata.requiredLevel);
  if (!category || !subtype || !name || !icon || requiredLevel === null) {
    return { error: "the resolved catalog entry lacks planner materialization metadata" };
  }

  const id = generatedItemId("gear", entry);
  const overlay = compendiumOverlay(item);
  const baseImplicits = materializeBaseImplicits(item, baseMetadata);
  const ambiguousBAffixIds = ambiguousModifierIds(baseMetadata, [
    ["baseAffixes"],
    ["sweetDreamAffixes"],
    ["corrosionImplicits"],
  ]);
  const corrosion = materializeScopedGearModifiers(item, baseMetadata, {
    sourceKeys: ["bAffixInfoList"],
    metadataKeys: ["corrosionImplicits"],
    idKey: "implicitId",
    limit: 1,
    excludedIds: ambiguousBAffixIds,
  });
  const beltBlend = materializeBeltBlend(item, baseMetadata, overlay);
  const corrosionValue = corrosion.values[0] ?? (
    corrosion.observedCount === 0
      ? (overlay.corrosionImplicit ?? null)
      : null
  );
  const common = {
    id,
    gearCategory: category,
    gearSubType: subtype,
    corrosionImplicit: corrosionValue,
    beltBlend: beltBlend.value,
    displayName: name,
    displayIcon: icon,
  };

  if (legendary) {
    const affixes = materializeLegendaryAffixes(item, metadata, overlay);
    const result = {
      ...common,
      rarity: "Legendary",
      legendaryItem: {
        legendaryId: identity.compendiumId,
        name,
        icon,
        requiredLevel,
      },
      legendaryMods: affixes.legendaryMods,
      randomAffixSlots: affixes.randomAffixSlots,
    };
    return {
      value: result,
      id,
      twoHanded: category === "two_handed",
      observedAffixes: affixes.observedCount + nativeInfluenceObservationCount(item),
      unmappedAffixes: Math.max(
        0,
        affixes.unmappedCount
          - baseImplicits.consumedCount
          - corrosion.mappedCount
          - beltBlend.mappedCount,
      ) + nativeInfluenceObservationCount(item),
    };
  }

  const data = objectValue(item.data);
  const itemLevel = finiteInteger(item.itemLevel);
  if (itemLevel === null || itemLevel < 0) {
    return { error: "the Rare item has no valid item level" };
  }
  const prefixes = materializeRareAffixFamily(item, metadata, overlay, {
    sourceKeys: ["prefixInfoList"],
    overlayKeys: ["prefixes"],
    metadataKeys: ["prefixAffixes"],
    plannerFamily: "craftPrefix",
  });
  const suffixes = materializeRareAffixFamily(item, metadata, overlay, {
    sourceKeys: ["suffixInfoList"],
    overlayKeys: ["suffixes"],
    metadataKeys: ["suffixAffixes"],
    plannerFamily: "craftSuffix",
  });
  const baseAffixes = materializeScopedGearModifiers(item, baseMetadata, {
    sourceKeys: ["bAffixInfoList"],
    metadataKeys: ["baseAffixes"],
    idKey: "affixId",
    limit: 2,
    excludedIds: ambiguousBAffixIds,
  });
  const sweetDream = materializeScopedGearModifiers(item, baseMetadata, {
    sourceKeys: ["bAffixInfoList"],
    metadataKeys: ["sweetDreamAffixes"],
    idKey: "affixId",
    limit: 1,
    excludedIds: ambiguousBAffixIds,
  });
  const towerSequence = materializeTowerSequence(item, baseMetadata, overlay);
  const result = {
    ...common,
    rarity: "Rare",
    baseItem: {
      baseItemId: identity.compendiumId,
      name,
      icon,
      requiredLevel,
      implicits: baseImplicits.plannerImplicits,
    },
    towerSequence: towerSequence.value,
    sweetDreamAffix: sweetDream.values[0] ?? (
      sweetDream.observedCount === 0
        ? (overlay.sweetDreamAffix ?? null)
        : null
    ),
    baseAffix: baseAffixes.values[0] ?? (
      baseAffixes.observedCount === 0
        ? (overlay.baseAffix ?? null)
        : null
    ),
    baseAffix2: baseAffixes.values[1] ?? (
      baseAffixes.observedCount === 0
        ? (overlay.baseAffix2 ?? null)
        : null
    ),
    prefixes: prefixes.values,
    suffixes: suffixes.values,
    customName: nonEmptyString(overlay.customName ?? data.CustomName),
    itemLevel,
  };
  const influenceCount = nativeInfluenceObservationCount(item);
  const observedAffixes = nativeAffixObservations(item).length + influenceCount;
  const mappedAffixes = prefixes.mappedCount
    + suffixes.mappedCount
    + baseImplicits.consumedCount
    + baseAffixes.mappedCount
    + sweetDream.mappedCount
    + corrosion.mappedCount
    + beltBlend.mappedCount
    + towerSequence.mappedCount;
  return {
    value: result,
    id,
    twoHanded: category === "two_handed",
    observedAffixes,
    unmappedAffixes: Math.max(0, observedAffixes - mappedAffixes),
    catalogExtensions: [...prefixes.extensions, ...suffixes.extensions],
  };
}

function materializePrism(entry) {
  const overlay = compendiumOverlay(entry.item);
  const declaredNativeAffixCount = finiteInteger(overlay.nativeAffixCount);
  const observedAffixes = declaredNativeAffixCount !== null
      && declaredNativeAffixCount >= 0
    ? declaredNativeAffixCount
    : nativeAffixObservations(entry.item).length;
  if (isInversePrismCandidate(entry.item)) {
    const id = nonEmptyString(overlay.id);
    const baseId = nonEmptyString(overlay.baseId);
    const prismType = nonEmptyString(overlay.prismType);
    const randomAffixes = overlay.randomAffixes;
    const inverseModValues = overlay.inverseModValues;
    const selectedBaseAffixId = overlay.selectedBaseAffixId;
    const normalizedValues = Array.isArray(inverseModValues)
      ? inverseModValues.map(value => {
        const modifier = objectValue(value);
        return {
          name: nonEmptyString(modifier.name),
          value: modifier.value,
        };
      })
      : [];
    const modifierNames = normalizedValues.map(value => value.name);
    if (!id
        || baseId !== "inverse_image"
        || prismType !== "inverse"
        || !Array.isArray(randomAffixes)
        || randomAffixes.length !== 0
        || (selectedBaseAffixId !== null && selectedBaseAffixId !== undefined)
        || !Array.isArray(inverseModValues)
        || normalizedValues.length === 0
        || normalizedValues.some(value => (
          !value.name
          || typeof value.value !== "number"
          || !Number.isFinite(value.value)
        ))
        || new Set(modifierNames).size !== modifierNames.length) {
      return { error: "the inverse-image prism overlay is incomplete or invalid" };
    }
    return {
      id,
      unmappedAffixes: observedAffixes,
      value: {
        id,
        baseId: "inverse_image",
        prismType: "inverse",
        randomAffixes: [],
        inverseModValues: deepClone(normalizedValues),
      },
    };
  }

  const identity = resolvedIdentity(entry.item, ["ethereal-prism"]);
  if (!identity) return { error: "no resolved ethereal-prism UUID" };
  const selectedBaseAffixId = nonEmptyString(overlay.selectedBaseAffixId);
  const randomAffixes = arrayValue(overlay.randomAffixes);
  if ((selectedBaseAffixId && !UUID_PATTERN.test(selectedBaseAffixId))
      || randomAffixes.some(value => !nonEmptyString(value) || !UUID_PATTERN.test(value))) {
    return { error: "the prism overlay contains invalid affix UUIDs" };
  }
  const id = nonEmptyString(overlay.id) ?? generatedItemId("prism", entry);
  const exactAffixCount = (selectedBaseAffixId ? 1 : 0) + randomAffixes.length;
  if (declaredNativeAffixCount !== null
      && (declaredNativeAffixCount < 0 || declaredNativeAffixCount !== exactAffixCount)) {
    return { error: "the prism overlay's native affix accounting is inconsistent" };
  }
  const placementValue = overlay.placement;
  const placement = objectValue(placementValue);
  const sourceSlot = finiteInteger(placement.sourceSlot);
  const treeId = nonEmptyString(placement.treeId);
  const centerNodeId = nonEmptyString(placement.centerNodeId);
  const affectedNodeIds = placement.affectedNodeIds;
  const pointLimits = objectValue(placement.pointLimits);
  const pointLimitEntries = Object.entries(pointLimits);
  const hasPlacement = placementValue !== undefined && placementValue !== null;
  const exactPlacement = hasPlacement
      && sourceSlot !== null
      && sourceSlot >= 1
      && sourceSlot <= 3
      && treeId
      && [...TALENT_TREE_BY_CAREER_ID.values()].includes(treeId)
      && centerNodeId
      && UUID_PATTERN.test(centerNodeId)
      && Array.isArray(affectedNodeIds)
      && affectedNodeIds.length > 0
      && affectedNodeIds.every(nodeId => (
        typeof nodeId === "string" && UUID_PATTERN.test(nodeId)
      ))
      && new Set(affectedNodeIds).size === affectedNodeIds.length
      && affectedNodeIds.filter(nodeId => nodeId === centerNodeId).length === 1
      && pointLimitEntries.every(([nodeId, limit]) => (
        UUID_PATTERN.test(nodeId)
        && affectedNodeIds.includes(nodeId)
        && finiteInteger(limit) !== null
        && limit >= 2
        && limit <= 6
      ))
      && placement.replacesCoreTalent === false
      && placement.prismCoreTalentOverride === null
    ? {
        sourceSlot,
        treeId,
        centerNodeId,
        affectedNodeIds: deepClone(affectedNodeIds),
        pointLimits: deepClone(pointLimits),
      }
    : null;
  return {
    id,
    unmappedAffixes: Math.max(0, observedAffixes - exactAffixCount),
    placement: exactPlacement,
    placementError: hasPlacement && !exactPlacement,
    value: {
      id,
      baseId: identity.compendiumId,
      prismType: "ethereal",
      selectedBaseAffixId,
      randomAffixes: deepClone(randomAffixes),
    },
  };
}

function materializeVorax(entry) {
  const overlay = compendiumOverlay(entry.item);
  const limbType = nonEmptyString(overlay.limbType);
  const displayName = nonEmptyString(overlay.displayName);
  const displayIcon = nonEmptyString(overlay.displayIcon);
  const itemLevel = finiteInteger(overlay.itemLevel);
  const affixes = firstDefined(overlay, "affixes");
  const baseAffix = objectValue(overlay.baseAffix);
  const baseAffixId = nonEmptyString(baseAffix.affixId);
  const validVoraxAffix = value => {
    if (value === null) return true;
    const affix = objectValue(value);
    const affixId = nonEmptyString(affix.affixId);
    return Boolean(
      affixId
      && UUID_PATTERN.test(affixId)
      && typeof affix.modifierDescription === "string"
      && typeof affix.tier === "string"
      && Array.isArray(affix.rolledValues)
      && affix.rolledValues.every(validPlannerRoll),
    );
  };
  if (!limbType
      || !displayName
      || !displayIcon
      || itemLevel === null
      || !Array.isArray(affixes)
      || affixes.length !== 6
      || !affixes.every(validVoraxAffix)
      || !baseAffixId
      || !UUID_PATTERN.test(baseAffixId)
      || typeof baseAffix.description !== "string"
      || !Array.isArray(baseAffix.rolledValues)
      || !baseAffix.rolledValues.every(validPlannerRoll)) {
    return { error: "no complete planner-shaped Vorax record" };
  }
  const id = nonEmptyString(overlay.id) ?? generatedItemId("vorax", entry);
  return {
    id,
    value: {
      ...deepClone(overlay),
      id,
      limbType,
      affixes: deepClone(affixes),
      displayName,
      displayIcon,
      itemLevel,
    },
  };
}

function exactHero(heroValue) {
  const hero = objectValue(heroValue);
  const identity = objectValue(hero.identity);
  const heroGuid = nonEmptyString(identity.compendiumId);
  if (!heroGuid || !UUID_PATTERN.test(heroGuid)) return null;

  const source = objectValue(hero.sourceData);
  const compactTraitValue = source.compendiumTraits;
  if (Object.hasOwn(source, "compendiumTraits")
      && (!compactTraitValue
        || typeof compactTraitValue !== "object"
        || Array.isArray(compactTraitValue))) {
    return null;
  }
  const sourceTraits = objectValue(compactTraitValue);
  const traits = {
    level1: nonEmptyString(sourceTraits.level1),
    level45: nonEmptyString(sourceTraits.level45),
    level60: nonEmptyString(sourceTraits.level60),
    level75: nonEmptyString(sourceTraits.level75),
  };
  const validTrait = (value, level) => {
    if (!value) return true;
    if (heroGuid !== BING_CREATIVE_GENIUS_GUID || level === "level1") {
      return UUID_PATTERN.test(value);
    }
    const slots = value.split("||");
    return slots.length === 2
      && slots.some(Boolean)
      && slots.every(slot => !slot || UUID_PATTERN.test(slot))
      && (!slots[0] || !slots[1] || slots[0] !== slots[1]);
  };
  if (Object.entries(traits).some(([level, value]) => !validTrait(value, level))) {
    return null;
  }

  return {
    heroGuid,
    heroId: nonEmptyString(identity.label)
      ?? nonEmptyString(hero.sourceName)
      ?? "Live hero",
    traits,
  };
}

function exactMemory(entry) {
  const overlay = compendiumOverlay(entry.item);
  const memoryType = nonEmptyString(overlay.memoryType);
  const rarity = nonEmptyString(overlay.rarity);
  const baseStat = objectValue(overlay.baseStat);
  const baseGuid = nonEmptyString(baseStat.guid);
  const fixedAffixes = overlay.fixedAffixes;
  const randomAffixes = overlay.randomAffixes;
  const validAffix = value => {
    const affix = objectValue(value);
    const guid = nonEmptyString(affix.guid);
    const validValue = affix.value === null
      || (typeof affix.value === "number" && Number.isFinite(affix.value));
    const validRolls = affix.values === undefined
      || (Array.isArray(affix.values) && affix.values.every(validPlannerRoll));
    return Boolean(
      guid
      && UUID_PATTERN.test(guid)
      && validValue
      && finiteInteger(affix.tier) !== null
      && (affix.sign === null || typeof affix.sign === "string")
      && (affix.unit === null || typeof affix.unit === "string")
      && validRolls,
    );
  };
  const lunarPhaseAffix = overlay.lunarPhaseAffix;
  const revivedAffixLunarPhase = overlay.revivedAffixLunarPhase;
  const validRevivedLunarPhase = revivedAffixLunarPhase === undefined
    || revivedAffixLunarPhase === null
    || Boolean(
      UUID_PATTERN.test(nonEmptyString(objectValue(revivedAffixLunarPhase).guid) ?? "")
      && nonEmptyString(objectValue(revivedAffixLunarPhase).name),
    );
  if (!["Origin", "Discipline", "Progress"].includes(memoryType)
      || !rarity
      || !baseGuid
      || !UUID_PATTERN.test(baseGuid)
      || typeof baseStat.value !== "number"
      || !Number.isFinite(baseStat.value)
      || finiteInteger(baseStat.tier) === null
      || (baseStat.sign !== null && typeof baseStat.sign !== "string")
      || (baseStat.unit !== null && typeof baseStat.unit !== "string")
      || !Array.isArray(fixedAffixes)
      || fixedAffixes.length > 2
      || !Array.isArray(randomAffixes)
      || randomAffixes.length > 2
      || !fixedAffixes.every(validAffix)
      || !randomAffixes.every(validAffix)
      || typeof overlay.waxAndWane !== "boolean"
      || (overlay.customName !== undefined && typeof overlay.customName !== "string")
      || (lunarPhaseAffix !== undefined
        && lunarPhaseAffix !== null
        && !validAffix(lunarPhaseAffix))
      || !validRevivedLunarPhase
      || (lunarPhaseAffix !== undefined
        && lunarPhaseAffix !== null
        && revivedAffixLunarPhase !== undefined
        && revivedAffixLunarPhase !== null)) {
    return null;
  }
  return {
    ...deepClone(overlay),
    id: generatedItemId("memory", entry),
    fixedAffixes: deepClone(fixedAffixes),
    randomAffixes: deepClone(randomAffixes),
    waxAndWane: overlay.waxAndWane,
  };
}

const HERO_MEMORY_SLOT_BY_TYPE = new Map([
  ["Origin", "slot45"],
  ["Discipline", "slot60"],
  ["Progress", "slot75"],
]);
const HERO_MEMORY_RARITY_ORDER = [
  "Normal", "Magic", "Rare", "Epic", "Legendary", "Ultimate",
];

function exactMemoryEquipSlot(entry, memory) {
  const data = objectValue(entry.item.data);
  const claim = data.compendiumSlot;
  if (claim === undefined || claim === null) return null;
  const slot = nonEmptyString(claim);
  if (slot === "slotLevel1Special") return slot;
  return slot && HERO_MEMORY_SLOT_BY_TYPE.get(memory.memoryType) === slot
    ? slot
    : false;
}

function exactMemorySpecialSlotSource(entry, memory) {
  const data = objectValue(entry.item.data);
  const source = objectValue(data.compendiumSpecialSlotSource);
  const sourceSlot = finiteInteger(source.sourceSlot);
  const memoryType = nonEmptyString(source.memoryType);
  const maxRarity = source.maxRarity === null
    ? null
    : nonEmptyString(source.maxRarity);
  const modifierPercent = source.modifierPercent;
  const ordinarySlot = sourceSlot === null ? null : `slot${sourceSlot}`;
  if (![45, 60, 75].includes(sourceSlot)
      || HERO_MEMORY_SLOT_BY_TYPE.get(memory.memoryType) !== ordinarySlot
      || !["Origin", "Discipline", "Progress"].includes(memoryType)
      || (maxRarity !== null && !HERO_MEMORY_RARITY_ORDER.includes(maxRarity))
      || typeof modifierPercent !== "number"
      || !Number.isFinite(modifierPercent)) {
    return null;
  }
  return {
    sourceMemoryId: memory.id,
    sourceSlot,
    memoryType,
    maxRarity,
    modifierPercent,
  };
}

function exactMemorySpecialSlotMatch(entry, memory) {
  const data = objectValue(entry.item.data);
  const claim = objectValue(data.compendiumSpecialSlotMatch);
  const memoryType = nonEmptyString(claim.memoryType);
  const maxRarity = nonEmptyString(claim.maxRarity);
  const modifierPercent = claim.modifierPercent;
  const rarity = nonEmptyString(memory.rarity) ?? "Legendary";
  const rarityIndex = HERO_MEMORY_RARITY_ORDER.indexOf(rarity);
  const maximumIndex = HERO_MEMORY_RARITY_ORDER.indexOf(maxRarity);
  if (!["Origin", "Discipline", "Progress"].includes(memoryType)
      || memory.memoryType !== memoryType
      || rarityIndex < 0
      || maximumIndex < 0
      || rarityIndex > maximumIndex
      || typeof modifierPercent !== "number"
      || !Number.isFinite(modifierPercent)) {
    return null;
  }
  return { memoryType, maxRarity, modifierPercent };
}

function specialMemoryMatchesSource(memory, source) {
  if (memory.memoryType !== source.memoryType) return false;
  if (source.maxRarity === null) return true;
  const rarity = nonEmptyString(memory.rarity) ?? "Legendary";
  const rarityIndex = HERO_MEMORY_RARITY_ORDER.indexOf(rarity);
  const maximumIndex = HERO_MEMORY_RARITY_ORDER.indexOf(source.maxRarity);
  return rarityIndex >= 0 && maximumIndex >= 0 && rarityIndex <= maximumIndex;
}

function skillSourceKey(entry) {
  const source = objectValue(entry.item.source);
  return nonEmptyString(source.key) ?? `${entry.sourceSection}.${entry.index}`;
}

function compactSkillPlacement(entry) {
  const data = objectValue(entry.item.data);
  const placementValue = data.compendiumPlacement;
  if (!placementValue || typeof placementValue !== "object" || Array.isArray(placementValue)) {
    return null;
  }
  const placement = objectValue(placementValue);
  const kind = nonEmptyString(placement.kind);
  const groupSize = finiteInteger(placement.groupSize);
  if (groupSize === null || groupSize < 1 || groupSize > 6) return null;

  if (kind === "active" || kind === "passive") {
    const slot = finiteInteger(placement.slot);
    const capacity = kind === "passive" ? 4 : 5;
    return slot !== null && slot >= 0 && slot < capacity
      ? { kind, slot, groupSize }
      : null;
  }
  if (kind !== "support") return null;

  const ownerKind = nonEmptyString(placement.ownerKind);
  const ownerSlot = finiteInteger(placement.ownerSlot);
  const slot = finiteInteger(placement.slot);
  const ownerCapacity = ownerKind === "passive" ? 4 : ownerKind === "active" ? 5 : 0;
  return ownerCapacity > 0
    && ownerSlot !== null
    && ownerSlot >= 0
    && ownerSlot < ownerCapacity
    && slot !== null
    && slot >= 0
    && slot < 5
    && slot < groupSize - 1
    ? { kind, ownerKind, ownerSlot, slot, groupSize }
    : null;
}

function compactSkillOwnerKey(kind, slot, groupSize) {
  return `compendiumPlacement:${kind}:${slot}:${groupSize}`;
}

function skillParentPath(entry) {
  const key = skillSourceKey(entry);
  const supportArray = key.match(/^(.*)\.supports?(?:\.\[\d+\]|\[\d+\]|\.\d+)$/i);
  if (supportArray) return nonEmptyString(supportArray[1]);
  const dot = key.lastIndexOf(".");
  if (dot > 0) return key.slice(0, dot);

  const placement = compactSkillPlacement(entry);
  if (!placement) return null;
  return placement.kind === "support"
    ? compactSkillOwnerKey(
      placement.ownerKind,
      placement.ownerSlot,
      placement.groupSize,
    )
    : compactSkillOwnerKey(placement.kind, placement.slot, placement.groupSize);
}

function explicitSkillSlot(entry, skillType) {
  const key = skillSourceKey(entry);
  const word = skillType === "passive" ? "passive" : "active";
  const capacity = skillType === "passive" ? 4 : 5;
  const luaOneBased = key.match(new RegExp(
    `(?:^|\\.)${word}Skills?\\.\\[([1-${capacity}])\\](?:\\.|$)`,
    "i",
  ));
  if (luaOneBased) return Number(luaOneBased[1]) - 1;
  const oneBased = key.match(new RegExp(
    `(?:^|\\.)${word}Skills?\\.([1-${capacity}])(?:\\.|$)`,
    "i",
  ));
  if (oneBased) return Number(oneBased[1]) - 1;
  const zeroBased = key.match(new RegExp(
    `(?:^|\\.)${word}Skills?\\[([0-${capacity - 1}])\\](?:\\.|$)`,
    "i",
  ));
  if (zeroBased) return Number(zeroBased[1]);

  const placement = compactSkillPlacement(entry);
  return placement?.kind === skillType ? placement.slot : null;
}

function explicitSupportSlot(entry) {
  const key = skillSourceKey(entry);
  const oneBased = key.match(/(?:^|\.)support([1-5])$/i);
  if (oneBased) return Number(oneBased[1]) - 1;
  const luaOneBased = key.match(/(?:^|\.)supports?\.\[([1-5])\]$/i);
  if (luaOneBased) return Number(luaOneBased[1]) - 1;
  const zeroBased = key.match(/(?:^|\.)supports(?:\[|\.)([0-4])\]?$/i);
  if (zeroBased) return Number(zeroBased[1]);
  const placement = compactSkillPlacement(entry);
  return placement?.kind === "support" ? placement.slot : null;
}

function skillLevel(item) {
  const data = objectValue(item.data);
  const special = objectValue(data.SpecialInfo);
  return finiteInteger(
    item.itemLevel
      ?? firstDefined(data, "SkillLevel", "Level")
      ?? firstDefined(special, "SkillLevel", "Level"),
  );
}

function materializeSupport(entry, identity) {
  const metadata = objectValue(identity.metadata);
  const type = nonEmptyString(metadata.skillType);
  const icon = nonEmptyString(metadata.icon);
  if (!type || !icon) return null;
  const support = { supportGuid: identity.compendiumId, type, icon };
  if (type === "support") {
    const level = skillLevel(entry.item);
    if (level === null) return null;
    support.level = level;
    return support;
  }
  const overlay = compendiumOverlay(entry.item);
  const exact = objectValue(overlay.support);
  const candidate = nonEmptyString(exact.supportGuid) ? exact : overlay;
  if (nonEmptyString(candidate.supportGuid) !== identity.compendiumId
      || nonEmptyString(candidate.type) !== type
      || !nonEmptyString(candidate.icon)
      || finiteInteger(candidate.tier) === null
      || !Array.isArray(candidate.rollValues)
      || candidate.rollValues.some(value => typeof value !== "number" || !Number.isFinite(value))) {
    return null;
  }
  if ((type === "noble_support" || type === "magnificent_support")
      && finiteInteger(candidate.rank) === null) {
    return null;
  }
  return deepClone(candidate);
}

function validSpecialSupportPlacement(type, owner, _slot, _identity) {
  // Live SkillSlotAssignments / compendiumPlacement is authoritative. Official
  // skillSlotRestriction is only a planner default; live bars routinely place
  // Noble/Magnificent outside that column (e.g. noble on support 5). Rejecting
  // on restriction blanked proven supports from Character-tab exports.
  if (type === "activation_medium" && owner.main.type !== "active") {
    return false;
  }
  return true;
}

function materializeSkills(skillEntries) {
  const mains = [];
  const supports = [];
  const unsupported = [];
  for (const entry of skillEntries) {
    const identity = resolvedIdentity(entry.item, ["skill"]);
    const metadata = objectValue(identity?.metadata);
    const nominalType = nonEmptyString(metadata.skillType);
    if (!identity || !nominalType) {
      unsupported.push(entry);
    } else if (nominalType === "active" || nominalType === "passive") {
      // Compendium catalogs Spirit Magus gems as Passive, while Iris can
      // install one on the active bar. A compact placement has already passed
      // the Rust-side SkillGroups/SlotKey reconciliation, so its main kind is
      // the authoritative installed bucket; catalog type still gates the item
      // as a main rather than a support.
      const placement = compactSkillPlacement(entry);
      const type = placement?.kind === "active" || placement?.kind === "passive"
        ? placement.kind
        : nominalType;
      mains.push({ entry, identity, type });
    } else {
      supports.push({ entry, identity, type: nominalType });
    }
  }

  const activeSkills = Array.from({ length: 5 }, emptySkillSlot);
  const passiveSkills = Array.from({ length: 4 }, emptySkillSlot);
  const mainByParent = new Map();
  let importedMains = 0;
  let unpositionedMains = 0;
  let invalidMains = 0;
  let overflowMains = 0;
  const mainGroups = new Map();
  for (const main of mains) {
    const slot = explicitSkillSlot(main.entry, main.type);
    if (slot === null) {
      unpositionedMains += 1;
      continue;
    }
    const level = skillLevel(main.entry.item);
    if (level === null) {
      invalidMains += 1;
      continue;
    }
    const groupKey = `${main.type}\u001f${slot}`;
    const group = mainGroups.get(groupKey) ?? [];
    group.push({ ...main, slot, level });
    mainGroups.set(groupKey, group);
  }

  for (const group of mainGroups.values()) {
    if (group.length !== 1) {
      overflowMains += group.length;
      continue;
    }
    const [main] = group;
    const target = main.type === "passive" ? passiveSkills : activeSkills;
    const slot = main.slot;
    const skill = {
      skillGuid: main.identity.compendiumId,
      enabled: true,
      level: main.level,
      supports: [null, null, null, null, null],
    };
    // Modularization Module gems store three ordered program/protocol/source
    // code selections under the portable Compendium overlay.
    const overlay = compendiumOverlay(main.entry.item);
    const modifiers = arrayValue(overlay.modifiers);
    if (modifiers.length === 3
        && modifiers.every(value => value === null
          || (typeof value === "string" && UUID_PATTERN.test(value)))) {
      skill.modifiers = deepClone(modifiers);
    }
    target[slot] = skill;
    importedMains += 1;
    const parent = skillParentPath(main.entry);
    if (parent) {
      const values = mainByParent.get(parent) ?? [];
      values.push({ target: target[slot], main });
      mainByParent.set(parent, values);
    }
  }

  let importedSupports = 0;
  let unattachedSupports = 0;
  const supportGroups = new Map();
  for (const support of supports) {
    const parent = skillParentPath(support.entry);
    const owners = parent ? mainByParent.get(parent) ?? [] : [];
    const slot = explicitSupportSlot(support.entry);
    const value = materializeSupport(support.entry, support.identity);
    if (owners.length !== 1
        || slot === null
        || !value
        || !validSpecialSupportPlacement(
          support.type,
          owners[0],
          slot,
          support.identity,
        )) {
      unattachedSupports += 1;
      continue;
    }
    const groupKey = `${parent}\u001f${slot}`;
    const group = supportGroups.get(groupKey) ?? [];
    group.push({ owner: owners[0], slot, value });
    supportGroups.set(groupKey, group);
  }
  for (const group of supportGroups.values()) {
    if (group.length !== 1) {
      unattachedSupports += group.length;
      continue;
    }
    const [{ owner, slot, value }] = group;
    owner.target.supports[slot] = value;
    importedSupports += 1;
  }

  return {
    value: { activeSkills, passiveSkills },
    importedMains,
    importedSupports,
    unpositionedMains,
    invalidMains,
    unsupported: unsupported.length,
    overflowMains,
    unattachedSupports,
  };
}

function exactRecordData(record) {
  const data = objectValue(record?.data);
  return objectValue(data.compendium);
}

function observedDivinityCount(loadout) {
  return sectionRecords(loadout, "divinity").reduce((total, record) => {
    const data = objectValue(record?.data);
    const capture = objectValue(data.capture);
    const observedCount = finiteInteger(capture.observedCount);
    return total + (observedCount !== null && observedCount >= 0
      ? observedCount
      : arrayValue(exactRecordData(record).inventory).length);
  }, 0);
}

function validInverseImageState(slot, equippedPrism) {
  const state = objectValue(slot.inverseImageState);
  const centerNodeId = nonEmptyString(state.centerNodeId);
  const radiusNodeIds = state.radiusNodeIds;
  if (!centerNodeId
      || !UUID_PATTERN.test(centerNodeId)
      || !Array.isArray(radiusNodeIds)
      || radiusNodeIds.length === 0
      || radiusNodeIds.some(nodeId => (
        typeof nodeId !== "string" || !UUID_PATTERN.test(nodeId)
      ))
      || new Set(radiusNodeIds).size !== radiusNodeIds.length
      || !radiusNodeIds.includes(centerNodeId)
      || nonEmptyString(equippedPrism.nodeId) !== centerNodeId
      || !Array.isArray(equippedPrism.affectedNodeIds)
      || equippedPrism.affectedNodeIds.length !== radiusNodeIds.length
      || !equippedPrism.affectedNodeIds.every((nodeId, index) => (
        nodeId === radiusNodeIds[index]
      ))
      || equippedPrism.replacesCoreTalent !== false
      || slot.prismCoreTalentOverride !== null
      || !Array.isArray(state.mirroredNodes)
      || state.mirroredNodes.length === 0
      || state.mirroredNodes.length !== radiusNodeIds.length
      || !state.mirroredNodePoints
      || typeof state.mirroredNodePoints !== "object"
      || Array.isArray(state.mirroredNodePoints)) {
    return false;
  }

  const originalNodeIds = new Set();
  const mirroredNodeIds = new Set();
  const mirrorNumbers = new Set();
  for (const nodeValue of state.mirroredNodes) {
    const node = objectValue(nodeValue);
    const originalNodeId = nonEmptyString(node.originalNodeId);
    const mirroredNodeId = nonEmptyString(node.mirroredNodeId);
    const tier = finiteInteger(node.tier);
    const position = finiteInteger(node.position);
    const mNumber = finiteInteger(node.mNumber);
    const svgPosition = objectValue(node.svgPosition);
    if (!originalNodeId
        || !UUID_PATTERN.test(originalNodeId)
        || !radiusNodeIds.includes(originalNodeId)
        || originalNodeIds.has(originalNodeId)
        || !mirroredNodeId
        || mirroredNodeIds.has(mirroredNodeId)
        || tier === null
        || tier < 0
        || position === null
        || position < 0
        || mNumber === null
        || mNumber < 1
        || mirrorNumbers.has(mNumber)
        || typeof svgPosition.cx !== "number"
        || !Number.isFinite(svgPosition.cx)
        || typeof svgPosition.cy !== "number"
        || !Number.isFinite(svgPosition.cy)) {
      return false;
    }
    originalNodeIds.add(originalNodeId);
    mirroredNodeIds.add(mirroredNodeId);
    mirrorNumbers.add(mNumber);
  }

  return radiusNodeIds.every(nodeId => originalNodeIds.has(nodeId))
    && Object.entries(state.mirroredNodePoints).every(([nodeId, points]) => (
      mirroredNodeIds.has(nodeId)
      && finiteInteger(points) !== null
      && points >= 1
      && points <= 3
    ));
}

function validSkillTree(value, prismIds, inversePrismIds, prismPointLimits = new Map()) {
  if (!Array.isArray(value.slots)
      || value.slots.length !== 4
      || !Array.isArray(value.allocationOrder)
      || typeof value.recordOrder !== "boolean") {
    return false;
  }
  const nodeIdsBySlot = [];
  const nodePointsBySlot = [];
  const slotsValid = value.slots.every((slotValue, slotIndex) => {
    const slot = objectValue(slotValue);
    const treeId = nonEmptyString(slot.treeId);
    if (!slot.nodePoints
        || typeof slot.nodePoints !== "object"
        || Array.isArray(slot.nodePoints)) {
      return false;
    }
    const nodeEntries = Object.entries(slot.nodePoints);
    if (nodeEntries.some(([nodeId, points]) => (
      !UUID_PATTERN.test(nodeId)
      || finiteInteger(points) === null
      || points < 1
      || points > 6
    ))) return false;
    const validOptionalUuid = candidate => candidate === null
      || candidate === undefined
      || (typeof candidate === "string" && UUID_PATTERN.test(candidate));
    if (!validOptionalUuid(slot.selectedNotable12)
        || !validOptionalUuid(slot.selectedNotable24)) return false;
    nodeIdsBySlot.push(new Set(nodeEntries.map(([nodeId]) => nodeId)));
    nodePointsBySlot.push(new Map(nodeEntries));
    const prismId = nonEmptyString(slot.prismId);
    const effectivePointLimits = prismId
      ? prismPointLimits.get(prismId) ?? new Map()
      : new Map();
    if (nodeEntries.some(([nodeId, points]) => (
      points > 3 && (effectivePointLimits.get(nodeId) ?? 3) < points
    ))) return false;
    if (!treeId) {
      return nodeEntries.length === 0
        && !prismId
        && (slot.selectedNotable12 === null || slot.selectedNotable12 === undefined)
        && (slot.selectedNotable24 === null || slot.selectedNotable24 === undefined)
        && (slot.prismCoreTalentOverride === null
          || slot.prismCoreTalentOverride === undefined)
        && (slot.inverseImageState === null || slot.inverseImageState === undefined)
        && (slot.equippedPrism === null || slot.equippedPrism === undefined);
    }
    if (!prismId) {
      return (slot.equippedPrism === null || slot.equippedPrism === undefined)
        && (slot.inverseImageState === null || slot.inverseImageState === undefined);
    }
    if (slotIndex === 0) return false;
    const equippedPrism = objectValue(slot.equippedPrism);
    const baseValid = prismIds.has(prismId)
      && nonEmptyString(equippedPrism.prismId) === prismId
      && UUID_PATTERN.test(nonEmptyString(equippedPrism.nodeId) ?? "")
      && Array.isArray(equippedPrism.affectedNodeIds)
      && equippedPrism.affectedNodeIds.every(nodeId => (
        typeof nodeId === "string" && UUID_PATTERN.test(nodeId)
      ))
      && typeof equippedPrism.replacesCoreTalent === "boolean";
    if (!baseValid) return false;
    return inversePrismIds.has(prismId)
      ? validInverseImageState(slot, equippedPrism)
      : slot.inverseImageState === null || slot.inverseImageState === undefined;
  });
  if (!slotsValid) return false;
  const allocationCounts = Array.from({ length: 4 }, () => new Map());
  const orderValid = value.allocationOrder.every(entryValue => {
    const entry = objectValue(entryValue);
    const slot = finiteInteger(entry.slot);
    const nodeId = nonEmptyString(entry.nodeId);
    const valid = slot !== null
      && slot >= 0
      && slot < 4
      && Boolean(nodeId && nodeIdsBySlot[slot].has(nodeId));
    if (!valid) return false;
    const count = (allocationCounts[slot].get(nodeId) ?? 0) + 1;
    allocationCounts[slot].set(nodeId, count);
    return count <= nodePointsBySlot[slot].get(nodeId);
  });
  return orderValid;
}

function validCareerIds(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const ids = value.map(finiteInteger);
  const equipped = ids.filter(id => id !== null && id > 0);
  return ids.some(id => id === null || id < 0)
      || equipped.length === 0
      || new Set(equipped).size !== equipped.length
      || equipped.some(id => !TALENT_TREE_BY_CAREER_ID.has(id))
    ? null
    : ids;
}

function heroCareerIds(loadoutValue) {
  const hero = objectValue(objectValue(loadoutValue).hero);
  const source = objectValue(hero.sourceData);
  return Object.hasOwn(source, "GeniusCareerId")
    ? { observed: true, value: validCareerIds(source.GeniusCareerId) }
    : { observed: false, value: null };
}

function recordCareerIds(loadoutValue) {
  const records = sectionRecords(objectValue(loadoutValue), "skillTree");
  if (records.length === 0) return { observed: false, value: null };
  if (records.length > 4) return { observed: true, value: null };

  const indexed = records.map(recordValue => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const index = finiteInteger(data.Index);
    const sourcePosition = indexedPosition(record.sourceKey);
    const sourceId = Number.isSafeInteger(sourcePosition) && sourcePosition > 0
      ? sourcePosition
      : null;
    const explicitIds = [
      data.CareerId,
      data.GeniusCareerId,
    ]
      .filter(value => value !== null && value !== undefined)
      .map(finiteInteger);
    if (index === null
        || index < 1
        || index > 4
        || explicitIds.some(id => id === null)
        || new Set(explicitIds).size > 1) return null;
    const explicitId = explicitIds[0] ?? null;
    if (sourceId !== null && explicitId !== null && sourceId !== explicitId) return null;
    return { index, id: explicitId ?? sourceId };
  });
  if (indexed.some(value => value === null || value.id === null)
      || new Set(indexed.map(value => value.index)).size !== indexed.length) {
    return { observed: true, value: null };
  }
  const ids = [0, 0, 0, 0];
  for (const value of indexed) ids[value.index - 1] = value.id;
  return { observed: true, value: validCareerIds(ids) };
}

function emptyTalentSlot() {
  return {
    treeId: null,
    nodePoints: {},
    selectedNotable12: null,
    selectedNotable24: null,
    prismId: null,
    equippedPrism: null,
    prismCoreTalentOverride: null,
    inverseImageState: null,
  };
}

function recordTalentTree(loadoutValue, prismPlacements = []) {
  const records = sectionRecords(objectValue(loadoutValue), "skillTree");
  const observed = records.some(record => (
    Object.hasOwn(objectValue(objectValue(record).data), "compendiumTalent")
  ));
  if (!observed) return { observed: false, value: null };
  if (records.length === 0 || records.length > 4) return { observed: true, value: null };

  const careerSelection = recordCareerIds(loadoutValue);
  if (!careerSelection.value) return { observed: true, value: null };
  const indexed = records.map(recordValue => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const index = finiteInteger(data.Index);
    const talentValue = data.compendiumTalent;
    const talent = objectValue(talentValue);
    const hasTalent = Object.hasOwn(data, "compendiumTalent");
    return { index, talent, hasTalent };
  });
  if (indexed.some(value => (
    value.index === null
    || value.index < 1
    || value.index > 4
    || !value.hasTalent
  ))
      || new Set(indexed.map(value => value.index)).size !== indexed.length) {
    return { observed: true, value: null };
  }
  const talentsByIndex = new Map(indexed.map(value => [value.index, value.talent]));

  const allNodeIds = new Set();
  const allNotableIds = new Set();
  const allocationOrder = [];
  const slots = Array.from({ length: 4 }, (_, slot) => {
    const talent = talentsByIndex.get(slot + 1);
    if (!talent) {
      return careerSelection.value[slot] === 0 ? emptyTalentSlot() : null;
    }
    const expectedTree = TALENT_TREE_BY_CAREER_ID.get(careerSelection.value[slot]);
    const treeId = nonEmptyString(talent.treeId);
    const nodePoints = talent.nodePoints;
    const notable12 = Object.hasOwn(talent, "selectedNotable12")
      ? talent.selectedNotable12
      : talent.selected_notable_12;
    const notable24 = Object.hasOwn(talent, "selectedNotable24")
      ? talent.selectedNotable24
      : talent.selected_notable_24;
    const validNotable = value => value === null
      || (typeof value === "string" && UUID_PATTERN.test(value));
    if (treeId !== expectedTree
        || !nodePoints
        || typeof nodePoints !== "object"
        || Array.isArray(nodePoints)
        || !Object.hasOwn(talent, "selectedNotable12")
        || !Object.hasOwn(talent, "selectedNotable24")
        || !validNotable(notable12)
        || !validNotable(notable24)
        || (notable12 !== null && notable12 === notable24)
        || [notable12, notable24].some(notable => notable !== null && (
          allNotableIds.has(notable) || allNodeIds.has(notable)
        ))) {
      return null;
    }
    if (notable12 !== null) allNotableIds.add(notable12);
    if (notable24 !== null) allNotableIds.add(notable24);
    const entries = Object.entries(nodePoints).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    ));
    const placementLimits = prismPlacements
      .filter(candidate => (
        candidate.placement.sourceSlot === slot
        && candidate.placement.treeId === treeId
      ))
      .map(candidate => objectValue(candidate.placement.pointLimits));
    const exactPlacementLimits = placementLimits.length === 1
      ? placementLimits[0]
      : {};
    if (entries.some(([nodeId, points]) => (
      !UUID_PATTERN.test(nodeId)
      || finiteInteger(points) === null
      || points < 1
      || points > (finiteInteger(exactPlacementLimits[nodeId]) ?? 3)
      || allNodeIds.has(nodeId)
      || allNotableIds.has(nodeId)
    ))) return null;
    for (const [nodeId, points] of entries) {
      allNodeIds.add(nodeId);
      for (let count = 0; count < points; count += 1) {
        allocationOrder.push({ slot, nodeId });
      }
    }
    return {
      treeId,
      nodePoints: deepClone(nodePoints),
      selectedNotable12: notable12,
      selectedNotable24: notable24,
      prismId: null,
      equippedPrism: null,
      prismCoreTalentOverride: null,
      inverseImageState: null,
    };
  });
  return slots.some(slot => slot === null)
    ? { observed: true, value: null }
    : {
      observed: true,
      value: { slots, allocationOrder, recordOrder: false },
    };
}

function careerTalentTree(loadoutValue, prismPlacements = []) {
  const heroSelection = heroCareerIds(loadoutValue);
  const recordSelection = recordCareerIds(loadoutValue);
  const talentSelection = recordTalentTree(loadoutValue, prismPlacements);
  const observed = heroSelection.observed || recordSelection.observed || talentSelection.observed;
  let ids = heroSelection.observed ? heroSelection.value : recordSelection.value;
  if (heroSelection.observed && recordSelection.observed) {
    ids = heroSelection.value
      && recordSelection.value
      && heroSelection.value.every((id, index) => id === recordSelection.value[index])
      ? heroSelection.value
      : null;
  }
  if (!ids) return { observed, value: null };
  if (talentSelection.observed) {
    return {
      observed,
      value: talentSelection.value,
      full: talentSelection.value !== null,
    };
  }

  return {
    observed,
    full: false,
    value: {
      slots: ids.map(id => (
        id === 0
          ? emptyTalentSlot()
          : {
            ...emptyTalentSlot(),
            treeId: TALENT_TREE_BY_CAREER_ID.get(id),
          }
      )),
      allocationOrder: [],
      recordOrder: false,
    },
  };
}

const DIVINITY_GODS = new Set([
  "Deception", "Hunting", "Knowledge", "Machines", "Might", "War",
]);
const NETHERKING_TYPES = new Set(["Judgment", "Contamination", "Banishment"]);

function validDivinityAffix(value, slateType) {
  const affix = objectValue(value);
  const modGuid = nonEmptyString(affix.modGuid);
  const nodeType = nonEmptyString(affix.nodeType);
  const slateName = nonEmptyString(affix.slateType);
  const slotIndex = finiteInteger(affix.slotIndex);
  const fixedMatch = modGuid?.match(/^fixed-(\d+)$/);
  if (!modGuid
      || !nodeType
      || !slateName
      || typeof affix.description !== "string"
      || typeof affix.icon !== "string") {
    return false;
  }
  if (fixedMatch) {
    return slateType === "legendary"
      && nodeType === "Fixed"
      && !Object.hasOwn(affix, "slotIndex");
  }
  return UUID_PATTERN.test(modGuid)
    && slotIndex !== null
    && slotIndex >= 0
    && slotIndex < 5;
}

function validDivinitySlate(value) {
  const slate = objectValue(value);
  const id = nonEmptyString(slate.id);
  const type = nonEmptyString(slate.type);
  const shapeId = nonEmptyString(slate.shapeId);
  const orientation = objectValue(slate.orientation);
  const affixes = slate.affixes;
  const customNameValid = slate.customName === undefined
    || typeof slate.customName === "string";
  if (!id
      || !["rare", "legendary", "netherking"].includes(type)
      || !shapeId
      || ![0, 90, 180, 270].includes(finiteInteger(orientation.rotation))
      || typeof orientation.flipH !== "boolean"
      || typeof orientation.flipV !== "boolean"
      || !customNameValid
      || !Array.isArray(affixes)
      || affixes.length > 6
      || !affixes.every(affix => validDivinityAffix(affix, type))) {
    return false;
  }
  const ordinarySlots = affixes
    .map(affix => finiteInteger(objectValue(affix).slotIndex))
    .filter(slot => slot !== null);
  if (new Set(ordinarySlots).size !== ordinarySlots.length
      || affixes.filter(affix => /^fixed-\d+$/.test(nonEmptyString(objectValue(affix).modGuid) ?? "")).length > 1) {
    return false;
  }

  if (type === "rare") {
    return slate.god === undefined
      || slate.god === null
      || DIVINITY_GODS.has(slate.god);
  }
  if (shapeId !== "O1") return false;
  if (type === "netherking") {
    return Boolean(
      NETHERKING_TYPES.has(slate.netherType)
      && (slate.netherItemId === undefined || nonEmptyString(slate.netherItemId))
      && (slate.authorityEffectId === undefined || nonEmptyString(slate.authorityEffectId)),
    );
  }

  const templateId = nonEmptyString(slate.legendaryTemplateId);
  const copyDirections = slate.copyDirections;
  const selectedCopyModIndex = slate.selectedCopyModIndex;
  return Boolean(
    nonEmptyString(slate.legendaryTemplate)
    && templateId
    && UUID_PATTERN.test(templateId)
    && typeof slate.legendaryIcon === "string"
    && (copyDirections === undefined
      || (Array.isArray(copyDirections)
        && copyDirections.length > 0
        && copyDirections.every(direction => Boolean(nonEmptyString(direction)))
        && new Set(copyDirections).size === copyDirections.length))
    && (selectedCopyModIndex === undefined
      || (finiteInteger(selectedCopyModIndex) !== null && selectedCopyModIndex >= 0)),
  );
}

function validDivinity(value) {
  if (!Array.isArray(value.inventory)
      || !value.inventory.every(validDivinitySlate)
      || !Array.isArray(value.placements)) return false;
  const inventoryIds = value.inventory.map(item => nonEmptyString(objectValue(item).id));
  if (inventoryIds.some(id => !id) || new Set(inventoryIds).size !== inventoryIds.length) {
    return false;
  }
  const knownIds = new Set(inventoryIds);
  const placedIds = new Set();
  const occupiedAnchors = new Set();
  return value.placements.every(placementValue => {
    const placement = objectValue(placementValue);
    const slateId = nonEmptyString(placement.slateId);
    const row = finiteInteger(placement.row);
    const col = finiteInteger(placement.col);
    const anchor = `${row}\u001f${col}`;
    if (!slateId || !knownIds.has(slateId) || placedIds.has(slateId)
        || row === null || col === null
        || occupiedAnchors.has(anchor)) return false;
    placedIds.add(slateId);
    occupiedAnchors.add(anchor);
    return true;
  });
}

const PACTSPIRIT_EXPANSION_NODE_TYPES = new Map([
  ["1_Micro", ["Micro"]],
  ["2_Micro", ["Micro", "Micro"]],
  ["3_Micro", ["Micro", "Micro", "Micro"]],
  ["4_Micro", ["Micro", "Micro", "Micro", "Micro"]],
  ["5_Micro", ["Micro", "Micro", "Micro", "Micro", "Micro"]],
  ["1_Medium", ["Medium"]],
  ["2_Medium", ["Medium", "Medium"]],
  ["3_Medium", ["Medium", "Medium", "Medium"]],
  ["1_Medium_1_Micro", ["Medium", "Micro"]],
  ["2_Medium_1_Micro", ["Medium", "Medium", "Micro"]],
  ["1_Medium_2_Micro", ["Medium", "Micro", "Micro"]],
]);

const PACTSPIRIT_BASE_NODE_TYPES = new Map([
  ["1", "Micro"],
  ["2", "Micro"],
  ["3", "Medium"],
  ["4", "Micro"],
  ["5", "Micro"],
  ["6", "Medium"],
  ["7", "Micro"],
  ["8", "Micro"],
  ["9", "Medium"],
]);

function validPactspirit(value, slot) {
  const level = finiteInteger(value.level);
  const allocatedNodes = value.allocatedNodes;
  const expansions = value.expansions;
  if (!nonEmptyString(value.guid)
      || !UUID_PATTERN.test(value.guid)
      || level === null
      || level < 1
      || level > 6
      || slot < 0
      || slot > 2
      || !Array.isArray(allocatedNodes)
      || allocatedNodes.length === 0
      || allocatedNodes.some(node => (
        typeof node !== "string" || !/^(?:[1-9]|1[01])$/.test(node)
      ))
      || new Set(allocatedNodes).size !== allocatedNodes.length
      || !expansions
      || typeof expansions !== "object"
      || Array.isArray(expansions)) {
    return false;
  }

  return Object.entries(expansions).every(([nodeId, expansionValue]) => {
    const expansion = objectValue(expansionValue);
    const expectedTypes = PACTSPIRIT_EXPANSION_NODE_TYPES.get(expansion.type);
    if (!allocatedNodes.includes(nodeId)
        || !expectedTypes
        || !Array.isArray(expansion.virtualNodes)
        || expansion.virtualNodes.length !== expectedTypes.length) {
      return false;
    }
    return expansion.virtualNodes.every((virtualValue, index) => {
      const virtual = objectValue(virtualValue);
      return virtual.nodeId === `virt_${slot}_${nodeId}_${index}`
        && virtual.type === expectedTypes[index];
    });
  });
}

function exactPactspiritSlot(record, overlay) {
  const data = objectValue(record?.data);
  const slot = finiteInteger(data.compendiumSlot ?? overlay.slotIndex);
  return slot !== null && slot >= 0 && slot < 3 ? slot : null;
}

function expansionTypeFromVirtualNodes(virtualNodes) {
  let medium = 0;
  let micro = 0;
  for (const node of virtualNodes) {
    if (node.type === "Medium") medium += 1;
    else if (node.type === "Micro") micro += 1;
    else return null;
  }
  const parts = [];
  if (medium > 0) parts.push(`${medium}_Medium`);
  if (micro > 0) parts.push(`${micro}_Micro`);
  if (parts.length === 0) return null;
  const type = parts.join("_");
  return PACTSPIRIT_EXPANSION_NODE_TYPES.has(type) ? type : null;
}

/// Merge Undetermined Fate virtual sockets claimed by portable Kismet records
/// into staged pactspirits so export ownership checks can pass.
function applyVirtualKismetExpansions(pactspirits, kismetRecords) {
  const claimsByPet = new Map();
  for (const record of kismetRecords) {
    const value = exactRecordData(record);
    const nodeId = nonEmptyString(value.nodeId);
    const match = nodeId?.match(/^slot_([0-2])_virt_([0-2])_([1-9]\d*)_(\d+)$/);
    if (!match) continue;
    const petIndex = Number(match[1]);
    const virtSlot = Number(match[2]);
    const baseNodeId = match[3];
    const virtIndex = Number(match[4]);
    if (petIndex !== virtSlot) continue;
    const identity = objectValue(record?.identity);
    const kismetType = nonEmptyString(objectValue(identity.metadata).kismetType)
      ?? nonEmptyString(value.kismetType);
    if (kismetType !== "Micro" && kismetType !== "Medium") continue;
    const petClaims = claimsByPet.get(petIndex) ?? new Map();
    const nodeClaims = petClaims.get(baseNodeId) ?? [];
    nodeClaims.push({ virtIndex, type: kismetType, nodeId: `virt_${petIndex}_${baseNodeId}_${virtIndex}` });
    petClaims.set(baseNodeId, nodeClaims);
    claimsByPet.set(petIndex, petClaims);
  }

  for (const [petIndex, petClaims] of claimsByPet) {
    const pet = pactspirits[petIndex];
    if (!pet) continue;
    if (!Array.isArray(pet.allocatedNodes)) pet.allocatedNodes = [];
    if (!pet.expansions || typeof pet.expansions !== "object" || Array.isArray(pet.expansions)) {
      pet.expansions = {};
    }
    for (const [baseNodeId, nodeClaims] of petClaims) {
      if (!pet.allocatedNodes.includes(baseNodeId)) {
        pet.allocatedNodes = [...pet.allocatedNodes, baseNodeId];
      }
      if (Object.hasOwn(pet.expansions, baseNodeId)) continue;
      const ordered = [...nodeClaims].sort((a, b) => a.virtIndex - b.virtIndex);
      // Contiguous virtual indices starting at 0 only — no fabricated gaps.
      if (ordered.some((claim, index) => claim.virtIndex !== index)) continue;
      const virtualNodes = ordered.map(claim => ({
        nodeId: claim.nodeId,
        type: claim.type,
      }));
      const type = expansionTypeFromVirtualNodes(virtualNodes);
      if (!type) continue;
      // Prefer Medium-before-Micro sequences that match the catalog type map.
      const expected = PACTSPIRIT_EXPANSION_NODE_TYPES.get(type);
      if (!expected || expected.length !== virtualNodes.length) continue;
      if (!expected.every((nodeType, index) => virtualNodes[index].type === nodeType)) {
        continue;
      }
      pet.expansions[baseNodeId] = { type, virtualNodes };
    }
  }
}

function nativePactspiritFallback(section) {
  const sourceCollection = nonEmptyString(section.sourceCollection);
  if (sourceCollection !== "PetDatas") return null;

  const records = arrayValue(section.records).map(objectValue);
  const sourceKeyCounts = new Map();
  for (const record of records) {
    const sourceKey = nonEmptyString(record.sourceKey);
    if (!sourceKey) continue;
    sourceKeyCounts.set(sourceKey, (sourceKeyCounts.get(sourceKey) ?? 0) + 1);
  }

  const combatRecords = records.filter(record => (
    finiteInteger(objectValue(record.data).InstallServantType) === 1
  ));
  const claimsBySlot = new Map();
  const gameIdCounts = new Map();
  const guidCounts = new Map();
  for (const record of combatRecords) {
    const sourceKey = nonEmptyString(record.sourceKey);
    const slotMatch = sourceKey?.match(/^\[([1-3])\]$/);
    if (slotMatch) {
      const slot = Number(slotMatch[1]) - 1;
      const claims = claimsBySlot.get(slot) ?? [];
      claims.push(record);
      claimsBySlot.set(slot, claims);
    }

    const identity = objectValue(record.identity);
    if (nonEmptyString(identity.domain) !== "pactspirit") continue;
    const gameId = nonEmptyString(String(identity.gameId ?? ""));
    const guid = nonEmptyString(identity.compendiumId);
    if (gameId) gameIdCounts.set(gameId, (gameIdCounts.get(gameId) ?? 0) + 1);
    if (guid && UUID_PATTERN.test(guid)) {
      guidCounts.set(guid, (guidCounts.get(guid) ?? 0) + 1);
    }
  }

  const candidates = [];
  for (const [slot, claims] of claimsBySlot) {
    if (claims.length !== 1) continue;
    const [record] = claims;
    const data = objectValue(record.data);
    const sourceKey = nonEmptyString(record.sourceKey);
    const level = finiteInteger(data.StarRank);
    const identity = objectValue(record.identity);
    const gameId = nonEmptyString(String(identity.gameId ?? ""));
    const nativeId = firstDefined(data, "PetConfigId", "ConfigId", "Id");
    const nativeIdText = typeof nativeId === "number" || typeof nativeId === "string"
      ? nonEmptyString(String(nativeId))
      : null;
    const guid = nonEmptyString(identity.compendiumId);
    const metadata = objectValue(identity.metadata);
    const nodeIds = metadata.nodeIds;
    if (sourceKeyCounts.get(sourceKey) !== 1
        || data.bEquip !== true
        || level === null
        || level < 1
        || level > 6
        || nonEmptyString(identity.domain) !== "pactspirit"
        || !gameId
        || nativeIdText !== gameId
        || !guid
        || !UUID_PATTERN.test(guid)
        || !Array.isArray(nodeIds)
        || nodeIds.length === 0
        || nodeIds.some(nodeId => !nonEmptyString(nodeId))
        || new Set(nodeIds).size !== nodeIds.length) {
      continue;
    }
    candidates.push({
      slot,
      gameId,
      guid,
      value: {
        guid,
        level,
        allocatedNodes: [...nodeIds],
        expansions: {},
      },
    });
  }

  const result = [null, null, null];
  for (const candidate of candidates) {
    if (gameIdCounts.get(candidate.gameId) !== 1
        || guidCounts.get(candidate.guid) !== 1) continue;
    result[candidate.slot] = candidate.value;
  }
  return result;
}

function observedPactspiritCount(source) {
  const records = sectionRecords(source, "pactspirits").filter(recordValue => {
    const record = objectValue(recordValue);
    const data = objectValue(record.data);
    const nativeIds = ["PetConfigId", "ConfigId", "Id"]
      .map(key => finiteInteger(data[key]))
      .filter(value => value !== null);
    const emptySentinel = Object.keys(exactRecordData(record)).length === 0
      && nativeIds.length > 0
      && nativeIds.every(value => value <= 0)
      && !nonEmptyString(data.Name)
      && !nonEmptyString(data.Icon)
      && finiteInteger(data.InstallServantType) === -1;
    return !emptySentinel;
  });
  const types = records.map(record => (
    finiteInteger(objectValue(objectValue(record).data).InstallServantType)
  ));
  return types.some(type => type === 1 || type === 2)
    ? types.filter(type => type === 1).length
    : records.length;
}

function validKismet(record, value, pactspirits) {
  const index = finiteInteger(value.pactspritIndex);
  const nodeId = nonEmptyString(value.nodeId);
  const nodeMatch = nodeId?.match(
    /^slot_([0-2])_(?:([1-9]\d*)|virt_([0-2])_([1-9]\d*)_(\d+))$/,
  );
  const pactspirit = index !== null && index >= 0 && index < 3
    ? pactspirits[index]
    : null;
  const baseNodeId = nodeMatch?.[2] ?? nodeMatch?.[4] ?? null;
  const baseNodeOwned = Boolean(
    pactspirit
    && baseNodeId
    && pactspirit.allocatedNodes.includes(baseNodeId),
  );
  const nodeOwned = nodeMatch?.[2]
    ? baseNodeOwned && !Object.hasOwn(pactspirit.expansions, baseNodeId)
    : baseNodeOwned && arrayValue(
      objectValue(pactspirit.expansions[baseNodeId]).virtualNodes,
    ).some(node => objectValue(node).nodeId === nodeId.replace(/^slot_[0-2]_/, ""));
  const identity = objectValue(record?.identity);
  const catalogTyped = nonEmptyString(identity.domain) === "kismet";
  const kismetType = nonEmptyString(objectValue(identity.metadata).kismetType);
  const targetNodeType = nodeMatch?.[2]
    ? PACTSPIRIT_BASE_NODE_TYPES.get(baseNodeId)
    : objectValue(arrayValue(
      objectValue(pactspirit?.expansions?.[baseNodeId]).virtualNodes,
    ).find(node => (
      objectValue(node).nodeId === nodeId?.replace(/^slot_[0-2]_/, "")
    ))).type;
  return Boolean(
    index !== null
    && index >= 0
    && index < 3
    && pactspirit
    && nodeMatch
    && Number(nodeMatch[1]) === index
    && (!nodeMatch[3] || Number(nodeMatch[3]) === index)
    && nodeOwned
    && (!catalogTyped || (
      (kismetType === "Micro" || kismetType === "Medium")
      && targetNodeType === kismetType
    ))
    && nonEmptyString(value.kismetGuid)
    && UUID_PATTERN.test(value.kismetGuid)
    && (value.rollValues === undefined
      || (Array.isArray(value.rollValues)
        && value.rollValues.every(roll => typeof roll === "number" && Number.isFinite(roll)))),
  );
}

function validScentBottle(value) {
  if (value.activeScent !== "basic" && value.activeScent !== "special") return false;
  const validSelection = selection => selection === null
    || (typeof selection === "string" && UUID_PATTERN.test(selection));
  return [value.basic, value.special].every(sectionValue => {
    const section = objectValue(sectionValue);
    const selectedSpecialIngredients = arrayValue(section.specialIngredients)
      .filter(selection => selection !== null);
    return Object.hasOwn(section, "skillGuid")
      && Object.hasOwn(section, "damageIngredient")
      && Object.hasOwn(section, "defenseIngredient")
      && Object.hasOwn(section, "functionalIngredient")
      && Array.isArray(section.specialIngredients)
      && section.specialIngredients.length === 2
      && validSelection(section.skillGuid)
      && validSelection(section.damageIngredient)
      && validSelection(section.defenseIngredient)
      && validSelection(section.functionalIngredient)
      && section.specialIngredients.every(validSelection)
      && new Set(selectedSpecialIngredients).size === selectedSpecialIngredients.length;
  });
}

function materializeExactModules(
  source,
  target,
  prismIds,
  inversePrismIds,
  prismPointLimits,
) {
  const skillTree = sectionRecords(source, "skillTree")
    .map(exactRecordData)
    .find(value => validSkillTree(
      value,
      prismIds,
      inversePrismIds,
      prismPointLimits,
    ));
  if (skillTree) target.skillTree = deepClone(skillTree);

  const divinity = sectionRecords(source, "divinity")
    .map(exactRecordData)
    .find(validDivinity);
  if (divinity) target.divinity = deepClone(divinity);

  const pactspiritSection = sectionValue(source, "pactspirits");
  const pactspiritRecords = arrayValue(pactspiritSection.records);
  const petGroups = new Map();
  const overlayClaimedSlots = new Set();
  for (const record of pactspiritRecords) {
    const value = exactRecordData(record);
    if (Object.keys(value).length === 0) continue;
    const slot = exactPactspiritSlot(record, value);
    if (slot !== null) overlayClaimedSlots.add(slot);
    if (slot === null || !validPactspirit(value, slot)) continue;
    const group = petGroups.get(slot) ?? [];
    group.push(value);
    petGroups.set(slot, group);
  }
  const stagedPets = [null, null, null];
  for (const [slot, pets] of petGroups) {
    if (pets.length !== 1) continue;
    const value = deepClone(pets[0]);
    delete value.slotIndex;
    delete value.slot_index;
    stagedPets[slot] = value;
  }
  const nativePactspirits = nativePactspiritFallback(pactspiritSection);
  for (let slot = 0; slot < stagedPets.length; slot += 1) {
    if (!stagedPets[slot] && !overlayClaimedSlots.has(slot)) {
      stagedPets[slot] = nativePactspirits?.[slot] ?? null;
    }
  }
  const stagedGuidCounts = new Map();
  for (const pet of stagedPets.filter(Boolean)) {
    stagedGuidCounts.set(pet.guid, (stagedGuidCounts.get(pet.guid) ?? 0) + 1);
  }
  target.pactspirits = stagedPets.map(pet => (
    pet && stagedGuidCounts.get(pet.guid) === 1 ? pet : null
  ));
  // Virtual Kismet nodeIds (Undetermined Fate expansions) arrive from the
  // portable projection before pactspirit overlays know about them. Derive the
  // matching expansions so validKismet can own those sockets.
  applyVirtualKismetExpansions(target.pactspirits, sectionRecords(source, "kismets"));
  const importedPets = target.pactspirits.filter(Boolean).length;

  const kismetGroups = new Map();
  for (const record of sectionRecords(source, "kismets")) {
    const value = exactRecordData(record);
    if (!validKismet(record, value, target.pactspirits)) continue;
    const nodeId = nonEmptyString(value.nodeId);
    const group = kismetGroups.get(nodeId) ?? [];
    group.push(value);
    kismetGroups.set(nodeId, group);
  }
  const kismets = [...kismetGroups.values()]
    .filter(group => group.length === 1)
    .map(([value]) => value);
  target.kismets = deepClone(kismets);

  const scent = sectionRecords(source, "scentBottle")
    .map(exactRecordData)
    .find(validScentBottle);
  if (scent) target.scentBottle = deepClone(scent);

  return {
    skillTree: skillTree ? 1 : 0,
    divinity: divinity ? arrayValue(divinity.inventory).length : 0,
    pactspirits: importedPets,
    kismets: kismets.length,
    scentBottle: scent ? 1 : 0,
  };
}

function installCapturedPrismPlacements(
  target,
  placements,
  prismIds,
  inversePrismIds,
  prismPointLimits,
) {
  if (placements.length === 0) return { installed: 0, failed: 0 };
  if (!target.skillTree) return { installed: 0, failed: placements.length };

  const staged = deepClone(target.skillTree);
  const claimCounts = new Map();
  for (const candidate of placements) {
    const key = `${candidate.placement.sourceSlot}\u001f${candidate.placement.treeId}`;
    claimCounts.set(key, (claimCounts.get(key) ?? 0) + 1);
  }
  let installed = 0;
  let failed = 0;
  for (const candidate of placements) {
    const { id, placement } = candidate;
    const claimKey = `${placement.sourceSlot}\u001f${placement.treeId}`;
    if (claimCounts.get(claimKey) !== 1
        || !prismIds.has(id)
        || inversePrismIds.has(id)) {
      failed += 1;
      continue;
    }
    const slot = objectValue(staged.slots?.[placement.sourceSlot]);
    if (nonEmptyString(slot.treeId) !== placement.treeId
        || Object.hasOwn(objectValue(slot.nodePoints), placement.centerNodeId)) {
      failed += 1;
      continue;
    }
    const otherSlotOwnsPrism = staged.slots.some((slotValue, index) => (
      index !== placement.sourceSlot
      && nonEmptyString(objectValue(slotValue).prismId) === id
    ));
    if (otherSlotOwnsPrism) {
      failed += 1;
      continue;
    }

    const expectedEquipped = {
      prismId: id,
      nodeId: placement.centerNodeId,
      affectedNodeIds: placement.affectedNodeIds,
      replacesCoreTalent: false,
    };
    const alreadyInstalled = nonEmptyString(slot.prismId) === id
      && JSON.stringify(objectValue(slot.equippedPrism)) === JSON.stringify(expectedEquipped)
      && slot.prismCoreTalentOverride === null
      && slot.inverseImageState === null;
    if (alreadyInstalled) {
      installed += 1;
      continue;
    }
    if (nonEmptyString(slot.prismId)
        || (slot.equippedPrism !== null && slot.equippedPrism !== undefined)
        || (slot.prismCoreTalentOverride !== null
          && slot.prismCoreTalentOverride !== undefined)
        || (slot.inverseImageState !== null && slot.inverseImageState !== undefined)) {
      failed += 1;
      continue;
    }
    slot.prismId = id;
    slot.equippedPrism = expectedEquipped;
    slot.prismCoreTalentOverride = null;
    slot.inverseImageState = null;
    installed += 1;
  }

  if (failed > 0 || !validSkillTree(
    staged,
    prismIds,
    inversePrismIds,
    prismPointLimits,
  )) {
    return { installed: 0, failed: placements.length };
  }
  target.skillTree = staged;
  return { installed, failed };
}

function addIncluded(included, section, importedCount, observedCount, detail) {
  if (importedCount <= 0) return;
  included.push({ section, importedCount, observedCount, detail });
}

function addOmission(omitted, section, observedCount, reason) {
  if (observedCount <= 0) return;
  omitted.push({ section, observedCount, reason });
}

function noteCoverage(included, omitted, section, omissionSections = [section]) {
  const includedEntries = included.filter(entry => entry.section === section);
  if (includedEntries.length) {
    return {
      imported: includedEntries.reduce(
        (total, entry) => total + entry.importedCount,
        0,
      ),
      observed: includedEntries.reduce(
        (total, entry) => total + entry.observedCount,
        0,
      ),
    };
  }

  const omittedSections = new Set(omissionSections);
  return {
    imported: 0,
    observed: omitted
      .filter(entry => omittedSections.has(entry.section))
      .reduce((total, entry) => total + entry.observedCount, 0),
  };
}

function humanizeNoteIdentifier(value) {
  const words = String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Unknown";
}

function omissionSectionLabel(section) {
  const labels = new Map([
    ["gearModifiers", "Gear modifiers"],
    ["skillsUnresolved", "Unresolved skills"],
    ["skillsOverflow", "Extra skills"],
    ["skillBarPositions", "Skill bar positions"],
    ["skillLevels", "Skill levels"],
    ["skillSupports", "Skill supports"],
    ["heroMemoryPlacement", "Hero-memory placement"],
    ["heroMemoryEquipmentConflicts", "Hero-memory equipment conflicts"],
    ["gearPlacement", "Gear placement"],
    ["gearEquipmentConflicts", "Gear equipment conflicts"],
    ["voraxPlacement", "Vorax placement"],
    ["etherealPrismAffixes", "Ethereal-prism affixes"],
    ["etherealPrismPlacement", "Ethereal-prism placement"],
    ["unsupportedResolvedItems", "Unsupported resolved items"],
    ["unresolvedItems", "Unresolved items"],
  ]);
  return labels.get(section) ?? humanizeNoteIdentifier(section);
}

function noteHeading(level, text) {
  return `<h${level}>${escapeHtml(text)}</h${level}>`;
}

function noteParagraph(text) {
  return `<p>${escapeHtml(text)}</p>`;
}

function noteHtmlList(items) {
  // TipTap serializes list items as <li><p>…</p></li>. Match that shape so
  // Edit/view round-trips stay stable and the planner's li>p CSS applies.
  return `<ul>${items.map(item => `<li><p>${item}</p></li>`).join("")}</ul>`;
}

function missingCoverageNoteHtml(label, counts) {
  const missing = Math.max(0, counts.observed - counts.imported);
  const noun = missing === 1 ? "record" : "records";
  return [
    `<strong>${escapeHtml(label)}:</strong>`,
    `${escapeHtml(missing)} ${noun} missing`,
    `(${escapeHtml(counts.imported)} of ${escapeHtml(counts.observed)} imported).`,
  ].join(" ");
}

function omissionNoteHtml(entry) {
  const section = nonEmptyString(entry.section) ?? "unknown";
  const count = finiteInteger(entry.observedCount) ?? 0;
  const reason = nonEmptyString(entry.reason) ?? "No explanation was provided.";
  return [
    `<strong>${escapeHtml(omissionSectionLabel(section))}:</strong>`,
    `${escapeHtml(count)} missing.`,
    escapeHtml(reason),
  ].join(" ");
}

function mappingIssueArea(issue) {
  const path = nonEmptyString(issue.path);
  const areas = [
    ["proBuild.loadout.heroMemories", "Hero memories"],
    ["proBuild.loadout.etherealPrisms", "Ethereal prisms"],
    ["proBuild.loadout.skillTree", "Talent tree"],
    ["proBuild.loadout.pactspirits", "Pactspirits"],
    ["proBuild.loadout.scentBottle", "Scent bottle"],
    ["proBuild.loadout.divinity", "Divinity slates"],
    ["proBuild.loadout.kismets", "Kismets"],
    ["proBuild.loadout.skills", "Skills"],
    ["proBuild.loadout.gear", "Gear"],
    ["proBuild.loadout.vorax", "Vorax"],
    ["proBuild.loadout.hero", "Hero"],
    ["proBuild.loadout", "Build loadout"],
    ["proBuild", "Build"],
  ];
  for (const [prefix, label] of areas) {
    if (path === prefix || path?.startsWith(`${prefix}.`) || path?.startsWith(`${prefix}[`)) {
      return label;
    }
  }
  return "Build";
}

const OPTIONAL_ABSENCE_PATHS = new Set([
  "proBuild.loadout.heroMemories",
  "proBuild.loadout.etherealPrisms",
  "proBuild.loadout.divinity",
  "proBuild.loadout.scentBottle",
  "proBuild.loadout.kismets",
  "proBuild.loadout.vorax",
]);

function exportMappingIssues(portable) {
  return arrayValue(portable.mappingIssues)
    .filter(issueValue => {
      const issue = objectValue(issueValue);
      const path = nonEmptyString(issue.path);
      const kind = nonEmptyString(issue.kind);
      if (path !== "proBuild" && !path?.startsWith("proBuild.")) return false;
      if (path === "proBuild.id") return false;
      return kind !== "sourceMissing" || !OPTIONAL_ABSENCE_PATHS.has(path);
    });
}

function mappingIssueListHtml(issueValues, { showKind = false } = {}) {
  const groups = [];
  const groupIndexes = new Map();
  for (const issueValue of issueValues) {
    const issue = objectValue(issueValue);
    const kind = nonEmptyString(issue.kind) ?? "unknown";
    const message = nonEmptyString(issue.message) ?? "No explanation was provided.";
    const key = `${kind}\u0000${message}`;
    let group = groups[groupIndexes.get(key)];
    if (!group) {
      group = { kind, message, issues: [], areas: new Set() };
      groupIndexes.set(key, groups.length);
      groups.push(group);
    }
    group.issues.push(issue);
    group.areas.add(mappingIssueArea(issue));
  }

  return noteHtmlList(groups.map(group => {
    const kindPrefix = showKind
      ? `<strong>${escapeHtml(humanizeNoteIdentifier(group.kind))}:</strong> `
      : "";
    const count = group.issues.length > 1 ? ` (${group.issues.length})` : "";
    const areas = [...group.areas].join(", ");
    return `${kindPrefix}<strong>${escapeHtml(areas)}${count}:</strong> ${
      escapeHtml(group.message)
    }`;
  }));
}

function appendMappingIssueSection(html, issues, title) {
  if (!issues.length) return;
  html.push(
    noteHeading(4, `${title} (${issues.length})`),
    mappingIssueListHtml(issues),
  );
}

function exportNotes(portable, included, omitted) {
  const issues = exportMappingIssues(portable);
  const issuesByKind = new Map();
  for (const issueValue of issues) {
    const kind = nonEmptyString(objectValue(issueValue).kind) ?? "unknown";
    const values = issuesByKind.get(kind) ?? [];
    values.push(issueValue);
    issuesByKind.set(kind, values);
  }

  const missingCoverage = [
    ["Hero", noteCoverage(included, omitted, "hero")],
    ["Gear", noteCoverage(included, omitted, "gear")],
    ["Skills", noteCoverage(included, omitted, "skills", [
      "skillsUnresolved",
      "skillsOverflow",
      "skillBarPositions",
      "skillLevels",
      "skillSupports",
    ])],
    ["Talent Tree", noteCoverage(included, omitted, "skillTree")],
    ["Divinity Slates", noteCoverage(included, omitted, "divinity")],
    ["Pactspirits", noteCoverage(included, omitted, "pactspirits")],
  ].filter(([, counts]) => counts.observed > counts.imported);

  const warningIssueKinds = new Set([
    "sourceMissing",
    "sourcePartial",
    "ambiguous",
    "catalogUnresolved",
  ]);
  const unknownWarnings = issues.filter(issueValue => {
    const kind = nonEmptyString(objectValue(issueValue).kind) ?? "unknown";
    return !warningIssueKinds.has(kind) && !INFORMATIONAL_MAPPING_ISSUE_KINDS.has(kind);
  });
  const hasWarnings = omitted.length > 0
    || [...warningIssueKinds].some(kind => (issuesByKind.get(kind) ?? []).length > 0)
    || unknownWarnings.length > 0;
  const hasMissing = missingCoverage.length > 0 || hasWarnings;
  const html = [];
  if (NOTES_DONATION_ENABLED) {
    html.push(noteParagraph(`DONATE ${NOTES_DONATION_URL}`));
  }
  if (hasMissing) {
    html.push(noteHeading(3, "Missing from import"));
    if (missingCoverage.length > 0) {
      html.push(
        noteHeading(4, "Summary"),
        noteHtmlList(missingCoverage.map(([label, counts]) => (
          missingCoverageNoteHtml(label, counts)
        ))),
      );
    }
    if (omitted.length > 0) {
      html.push(
        noteHeading(4, "Details"),
        noteHtmlList(omitted.map(omissionNoteHtml)),
      );
    }
    appendMappingIssueSection(
      html,
      issuesByKind.get("sourceMissing") ?? [],
      "Missing source data",
    );
    appendMappingIssueSection(
      html,
      issuesByKind.get("sourcePartial") ?? [],
      "Incomplete source data",
    );
    appendMappingIssueSection(
      html,
      issuesByKind.get("ambiguous") ?? [],
      "Uncertain source data",
    );
    appendMappingIssueSection(
      html,
      issuesByKind.get("catalogUnresolved") ?? [],
      "Unmatched game data",
    );
    if (unknownWarnings.length > 0) {
      html.push(
        noteHeading(4, `Other conversion warnings (${unknownWarnings.length})`),
        mappingIssueListHtml(unknownWarnings, { showKind: true }),
      );
    }
  }

  // Compendium stores TipTap HTML, but Notes *view* mode renders via
  // MentionRenderer (not TipTap). That path drops the host `notes-content`
  // class fallthrough, so wrap the body ourselves: the planner's scoped CSS
  // is `.notes-tab .notes-content h3|ul|…` and needs that ancestor in the
  // sanitized HTML for headings/lists to stay readable before Edit.
  return `<div class="notes-content">${html.join("")}</div>`;
}

/**
 * Convert every portable record whose catalog identity and target relationship
 * are supported into the current TLI Compendium planner contract. Unsupported
 * records remain explicit in `omitted`; one gap never blanks another section.
 */
export function createCompendiumExport(portable) {
  if (!portable || typeof portable !== "object" || Array.isArray(portable)) {
    throw new TypeError("a portable snapshot object is required");
  }
  if (finiteInteger(portable.schemaVersion) !== 3) {
    throw new RangeError("portable snapshot schemaVersion 3 is required");
  }
  if (portable.compendiumImportable !== false) {
    throw new TypeError("the portable evidence marker compendiumImportable=false is required");
  }
  validatePortableEnvelope(portable);

  const source = objectValue(portable.source);
  if (nonEmptyString(source.kind) !== "liveMemory") {
    throw new TypeError("portable source.kind must be liveMemory");
  }
  const requestedPatch = nonEmptyString(source.catalogPatch);
  if (!requestedPatch) throw new TypeError("portable source.catalogPatch is required");
  if (!WEBSITE_PATCHES.has(requestedPatch)) {
    throw new RangeError(`the Compendium planner does not support patch ${requestedPatch}`);
  }
  if (!EXPORT_CATALOG_PATCHES.has(requestedPatch)) {
    throw new RangeError(`tli_dump has no materialization catalog for patch ${requestedPatch}`);
  }

  const proBuild = objectValue(portable.proBuild);
  const capturedAt = portable.capturedAt;
  if (!nonEmptyString(capturedAt) || !Number.isFinite(Date.parse(capturedAt))) {
    throw new TypeError("portable capturedAt must be an ISO date-time string");
  }
  if (!Object.hasOwn(proBuild, "loadout")) {
    throw new TypeError("portable proBuild.loadout is required");
  }
  // One Compendium build per viewed character; loadouts are individual pages.
  const playerId = viewedPlayerId(proBuild);
  const identitySeed = playerId
    ? `player:${playerId}`
    : (proBuild.id ?? capturedAt);
  const token = stableHash(identitySeed);
  const buildId = `tli_dump_build_${token}`;
  const timestamp = snapshotTimestamp(capturedAt);
  const sourceLoadout = portableLoadout(portable);
  const heroSource = objectValue(sourceLoadout.hero);
  // Page loadout key: Pro Build title (BDName), then character name, then fallback.
  const loadoutName = nonEmptyString(proBuild.name)
    ?? nonEmptyString(heroSource.sourceName)
    ?? "Live snapshot";
  // Include BDID when present so renames do not orphan an existing page slot.
  const loadoutSeed = proBuild.id
    ? `bd:${proBuild.id}`
    : `name:${loadoutName}`;
  const loadoutId = `tli_dump_loadout_${stableHash(`${identitySeed}\0${loadoutSeed}`)}`;
  const targetLoadout = emptyLoadout(loadoutId, loadoutName);
  const included = [];
  const omitted = [];

  const heroObserved = Object.keys(heroSource).some(key => heroSource[key] !== null) ? 1 : 0;
  targetLoadout.hero = exactHero(heroSource);
  addIncluded(included, "hero", targetLoadout.hero ? 1 : 0, heroObserved,
    "Resolved hero identity and available trait selections were copied.");
  if (heroObserved && !targetLoadout.hero) {
    addOmission(omitted, "hero", 1,
      "The live hero/variant ID has no verified Compendium UUID bridge.");
  }

  const entries = allPortableItems(sourceLoadout);
  const accountedItemKeys = new Set();
  const gearEntries = entries.filter(entry => (
    resolvedIdentity(entry.item, ["gear", "legendaries"], ["special", "base"])
  ));
  let gearFailures = 0;
  let gearAffixGaps = 0;
  let gearPlacementGaps = 0;
  let equippedConflicts = 0;
  const gearCatalogExtensions = new Map();
  const conflictedGearCatalogExtensionIds = new Set();
  const equipmentCandidates = new Map();
  const addEquipmentCandidate = (targetSlot, candidate) => {
    const candidates = equipmentCandidates.get(targetSlot) ?? [];
    candidates.push(candidate);
    equipmentCandidates.set(targetSlot, candidates);
  };
  for (const entry of gearEntries) {
    accountedItemKeys.add(entry.key);
    const converted = materializeGear(entry);
    if (!converted.value) {
      gearFailures += 1;
      continue;
    }
    targetLoadout.gear.inventory.push(converted.value);
    gearAffixGaps += converted.unmappedAffixes ?? 0;
    for (const extension of arrayValue(converted.catalogExtensions)) {
      const tierId = nonEmptyString(extension.tierId);
      if (!tierId || conflictedGearCatalogExtensionIds.has(tierId)) continue;
      const existing = gearCatalogExtensions.get(tierId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(extension)) {
        gearCatalogExtensions.delete(tierId);
        conflictedGearCatalogExtensionIds.add(tierId);
        gearAffixGaps += 1;
      } else if (!existing) {
        gearCatalogExtensions.set(tierId, deepClone(extension));
      }
    }
    const location = objectValue(entry.item.location);
    const rawEquipSlot = location.equipSlot;
    const equipSlot = finiteInteger(rawEquipSlot);
    const targetSlot = GEAR_SLOTS.get(equipSlot);
    if (targetSlot && catalogGearSlotOptions(converted).includes(targetSlot)) {
      addEquipmentCandidate(targetSlot, {
        id: converted.id,
        twoHanded: converted.twoHanded,
      });
    } else if (rawEquipSlot === null || rawEquipSlot === undefined || rawEquipSlot === 0) {
      const fallbackSlot = wearItemsFallbackSlot(entry, converted);
      if (fallbackSlot) {
        addEquipmentCandidate(fallbackSlot, {
          id: converted.id,
          twoHanded: converted.twoHanded,
        });
      } else if (nonEmptyString(objectValue(entry.item.source).collection) === "WearItems") {
        gearPlacementGaps += 1;
      }
    } else if ((equipSlot !== null && equipSlot !== 0)
        || nonEmptyString(objectValue(entry.item.source).collection) === "WearItems") {
      gearPlacementGaps += 1;
    }
  }

  const voraxEntries = entries.filter(entry => (
    !accountedItemKeys.has(entry.key)
    && (entry.sourceSection === "vorax" || resolvedIdentity(entry.item, ["vorax"]))
  ));
  let voraxFailures = 0;
  let voraxPlacementGaps = 0;
  const voraxIds = new Set();
  for (const entry of voraxEntries) {
    accountedItemKeys.add(entry.key);
    const converted = materializeVorax(entry);
    if (!converted.value || voraxIds.has(converted.id)) {
      voraxFailures += 1;
      continue;
    }
    voraxIds.add(converted.id);
    targetLoadout.vorax.inventory.push(converted.value);
    const equipSlot = finiteInteger(objectValue(entry.item.location).equipSlot);
    const targetSlot = GEAR_SLOTS.get(equipSlot);
    if (targetSlot && voraxGearSlotOptions(converted).includes(targetSlot)) {
      addEquipmentCandidate(targetSlot, { id: converted.id, twoHanded: false });
    } else if (equipSlot === null || equipSlot === 0) {
      const fallbackSlot = wearItemsVoraxFallbackSlot(entry, converted);
      if (fallbackSlot) {
        addEquipmentCandidate(fallbackSlot, { id: converted.id, twoHanded: false });
      } else if (nonEmptyString(objectValue(entry.item.source).collection) === "WearItems") {
        voraxPlacementGaps += 1;
      }
    } else if ((equipSlot !== null && equipSlot !== 0)
        || nonEmptyString(objectValue(entry.item.source).collection) === "WearItems") {
      voraxPlacementGaps += 1;
    }
  }
  for (const [targetSlot, candidates] of equipmentCandidates) {
    if (candidates.length === 1) {
      targetLoadout.gear.equipped[targetSlot] = candidates[0].id;
    } else {
      equippedConflicts += candidates.length;
    }
  }
  const mainHand = equipmentCandidates.get("mainHand") ?? [];
  if (mainHand.length === 1
      && mainHand[0].twoHanded
      && targetLoadout.gear.equipped.offHand !== null) {
    targetLoadout.gear.equipped.offHand = null;
    equippedConflicts += 1;
  }
  addIncluded(included, "gear", targetLoadout.gear.inventory.length, gearEntries.length,
    "Catalog-backed Rare/Legendary objects and verified or WearItems-derived equipment slots were materialized.");
  addOmission(omitted, "gear", gearFailures,
    "Resolved items lacked required category/subtype/icon metadata.");
  addOmission(omitted, "gearModifiers", gearAffixGaps,
    "The items were imported, but those modifiers could not be matched to Compendium.");
  addOmission(omitted, "gearPlacement", gearPlacementGaps,
    "The item was kept in inventory because neither EquipID nor its WearItems category/source semantics proved an available slot.");
  addOmission(omitted, "gearEquipmentConflicts", equippedConflicts,
    "No item was equipped for a conflicted slot; every candidate remained inventory-only.");
  addIncluded(included, "vorax", targetLoadout.vorax.inventory.length, voraxEntries.length,
    "Planner-shaped Vorax records were copied and their verified EquipID references target gear.equipped.");
  addOmission(omitted, "vorax", voraxFailures,
    "The native Vorax record does not expose the complete six-affix planner shape.");
  addOmission(omitted, "voraxPlacement", voraxPlacementGaps,
    "The Vorax item was kept in inventory because its gear EquipID was not proven.");

  const prismEntries = entries.filter(entry => (
    !accountedItemKeys.has(entry.key)
    && (resolvedIdentity(entry.item, ["ethereal-prism"])
      || isInversePrismCandidate(entry.item))
  ));
  let prismFailures = 0;
  let prismAffixGaps = 0;
  let prismPlacementErrors = 0;
  const prismIds = new Set();
  const inversePrismIds = new Set();
  const prismPointLimits = new Map();
  const prismPlacements = [];
  const prismGroups = new Map();
  for (const entry of prismEntries) {
    accountedItemKeys.add(entry.key);
    const converted = materializePrism(entry);
    const claimedId = converted.id ?? nonEmptyString(compendiumOverlay(entry.item).id);
    if (!claimedId) {
      prismFailures += 1;
      continue;
    }
    const group = prismGroups.get(claimedId) ?? [];
    group.push(converted);
    prismGroups.set(claimedId, group);
  }
  for (const group of prismGroups.values()) {
    if (group.length !== 1) {
      prismFailures += group.length;
      continue;
    }
    const [converted] = group;
    if (!converted.value) {
      prismFailures += 1;
      continue;
    }
    prismIds.add(converted.id);
    if (converted.value.prismType === "inverse") inversePrismIds.add(converted.id);
    prismAffixGaps += converted.unmappedAffixes ?? 0;
    if (converted.placement) {
      prismPlacements.push({ id: converted.id, placement: converted.placement });
      prismPointLimits.set(
        converted.id,
        new Map(Object.entries(converted.placement.pointLimits)),
      );
    } else if (converted.placementError) {
      prismPlacementErrors += 1;
    }
    targetLoadout.etherealPrisms.inventory.push(converted.value);
  }
  addIncluded(included, "etherealPrisms", targetLoadout.etherealPrisms.inventory.length,
    prismEntries.length, "Resolved ethereal bases and exact inverse-image overlays were copied; verified affix UUIDs are retained when present.");
  addOmission(omitted, "etherealPrisms", prismFailures,
    "The ethereal base or inverse-image overlay could not be materialized.");
  addOmission(omitted, "etherealPrismAffixes", prismAffixGaps,
    "The prism base was imported, but native affix IDs lack a verified Compendium UUID bridge.");

  const memoryEntries = entries.filter(entry => (
    !accountedItemKeys.has(entry.key)
    && (entry.sourceSection === "heroMemories"
      || nonEmptyString(compendiumOverlay(entry.item).memoryType))
  ));
  let memoryPlacementGaps = 0;
  let memoryEquipmentConflicts = 0;
  const memoryEquipmentCandidates = new Map();
  const specialMemoryCandidates = [];
  const specialSlotSources = [];
  for (const entry of memoryEntries) {
    accountedItemKeys.add(entry.key);
    const converted = exactMemory(entry);
    if (converted) {
      targetLoadout.heroMemories.inventory.push(converted);
      const slot = exactMemoryEquipSlot(entry, converted);
      if (slot === "slotLevel1Special") {
        const match = exactMemorySpecialSlotMatch(entry, converted);
        if (match) {
          specialMemoryCandidates.push({ memory: converted, match });
        } else {
          memoryPlacementGaps += 1;
        }
      } else if (slot) {
        const candidates = memoryEquipmentCandidates.get(slot) ?? [];
        candidates.push(converted.id);
        memoryEquipmentCandidates.set(slot, candidates);
      } else {
        // A planner memory remains useful in inventory, but neither its type nor
        // collection order proves that it occupied the corresponding hero slot.
        memoryPlacementGaps += 1;
      }
      const source = exactMemorySpecialSlotSource(entry, converted);
      if (source) specialSlotSources.push(source);
    }
  }
  for (const [slot, candidates] of memoryEquipmentCandidates) {
    if (candidates.length === 1) {
      targetLoadout.heroMemories.equipped[slot] = candidates[0];
    } else {
      memoryEquipmentConflicts += candidates.length;
    }
  }
  if (specialMemoryCandidates.length === 1) {
    const [{ memory: specialMemory, match }] = specialMemoryCandidates;
    const matchingSources = specialSlotSources.filter(source => (
      targetLoadout.heroMemories.equipped[`slot${source.sourceSlot}`]
        === source.sourceMemoryId
      && specialMemoryMatchesSource(specialMemory, source)
      && match.memoryType === source.memoryType
      && match.modifierPercent === source.modifierPercent
      && (source.maxRarity === null || match.maxRarity === source.maxRarity)
    ));
    if (matchingSources.length === 1) {
      const [source] = matchingSources;
      targetLoadout.heroMemories.equipped.slotLevel1Special = {
        memoryId: specialMemory.id,
        sourceSlot: source.sourceSlot,
        modifierPercent: source.modifierPercent,
      };
    } else {
      memoryPlacementGaps += 1;
    }
  } else if (specialMemoryCandidates.length > 1) {
    memoryEquipmentConflicts += specialMemoryCandidates.length;
  }
  addIncluded(included, "heroMemories", targetLoadout.heroMemories.inventory.length,
    memoryEntries.length, "Planner-shaped memory rolls were copied.");
  addOmission(omitted, "heroMemories",
    memoryEntries.length - targetLoadout.heroMemories.inventory.length,
    "Native memory affix/tier IDs are not yet bridged to Compendium GUIDs.");
  addOmission(omitted, "heroMemoryPlacement", memoryPlacementGaps,
    "The memory remained inventory-only because no explicit type-compatible Compendium slot claim was present.");
  addOmission(omitted, "heroMemoryEquipmentConflicts", memoryEquipmentConflicts,
    "No memory was equipped for a slot claimed by multiple items; every candidate remained inventory-only.");

  const skillEntries = entries.filter(entry => (
    !accountedItemKeys.has(entry.key)
    && (entry.sourceSection === "skills" || resolvedIdentity(entry.item, ["skill"]))
  ));
  for (const entry of skillEntries) accountedItemKeys.add(entry.key);
  const convertedSkills = materializeSkills(skillEntries);
  targetLoadout.skills = convertedSkills.value;
  const importedSkillCount = convertedSkills.importedMains + convertedSkills.importedSupports;
  addIncluded(included, "skills", importedSkillCount, skillEntries.length,
    "Active/passive skills were classified by catalog type; supports attach only within a proven source group.");
  addOmission(omitted, "skillsUnresolved", convertedSkills.unsupported,
    "The source ID did not resolve to an installable Compendium skill.");
  addOmission(omitted, "skillsOverflow", convertedSkills.overflowMains,
    "Multiple main skills claimed the same explicit planner slot, so none of those candidates was installed.");
  addOmission(omitted, "skillBarPositions", convertedSkills.unpositionedMains,
    "The main skill was omitted because its exact active/passive bar index was absent from the source path and no validated SkillGroups placement was present.");
  addOmission(omitted, "skillLevels", convertedSkills.invalidMains,
    "The main skill was omitted because the source did not provide a finite level.");
  addOmission(omitted, "skillSupports", convertedSkills.unattachedSupports,
    "The support was omitted because its owner, slot index, level, or special-support roll shape was not proven.");

  const exactCounts = materializeExactModules(
    sourceLoadout,
    targetLoadout,
    prismIds,
    inversePrismIds,
    prismPointLimits,
  );
  const careerTree = careerTalentTree(sourceLoadout, prismPlacements);
  const usedCareerTreeFallback = exactCounts.skillTree === 0
    && careerTree.value !== null;
  if (usedCareerTreeFallback) {
    targetLoadout.skillTree = deepClone(careerTree.value);
    exactCounts.skillTree = 1;
  }
  const installedPrisms = prismPlacementErrors > 0
    ? { installed: 0, failed: prismPlacements.length }
    : installCapturedPrismPlacements(
        targetLoadout,
        prismPlacements,
        prismIds,
        inversePrismIds,
        prismPointLimits,
      );
  addIncluded(
    included,
    "etherealPrismPlacement",
    installedPrisms.installed,
    prismPlacements.length + prismPlacementErrors,
    "The exact TalentPreview tree slot, center, and affected-node relationship installed the captured prism.",
  );
  addOmission(
    omitted,
    "etherealPrismPlacement",
    installedPrisms.failed + prismPlacementErrors,
    "The prism remained in inventory because its tree slot, center/area UUIDs, or replacement semantics conflicted with the selected skill tree.",
  );
  for (const [section, count] of Object.entries(exactCounts)) {
    const nativeObserved = section === "pactspirits"
      ? observedPactspiritCount(sourceLoadout)
      : section === "divinity"
        ? observedDivinityCount(sourceLoadout)
        : sectionRecords(sourceLoadout, section).length;
    if (section === "skillTree" && usedCareerTreeFallback) {
      addIncluded(included, section, 4, 4, careerTree.full
        ? "The four ordered talent trees, exact node points, and level-12/24 notable selections were imported from fully resolved GeniusInfos evidence."
        : "Only the four ordered talent-tree selections were imported from verified hero/GeniusInfos career IDs.");
      if (!careerTree.full) {
        addOmission(omitted, section, 4,
          "Node allocations and level-12/24 notable selections remain omitted because CareerId/GeniusCareerId does not encode them.");
      }
      continue;
    }
    const observed = section === "skillTree" && careerTree.observed && count === 0
      ? Math.max(1, nativeObserved)
      : nativeObserved;
    addIncluded(included, section, count, observed,
      section === "pactspirits"
        ? "Pactspirit slots came from exact overlays or independently validated native combat-slot records."
        : section === "divinity"
          ? "Equipped Divinity slates, affixes, transforms, and board placements were preserved exactly."
        : "A source-provided planner-shaped record was preserved exactly.");
    addOmission(omitted, section, Math.max(0, observed - count),
      section === "skillTree" && careerTree.observed && count === 0
        ? "The source lacked a valid planner-shaped tree; career IDs were invalid/incomplete, allocation evidence was invalid/incomplete, or the hero and ordered GeniusInfos sources disagreed."
        : "The native record does not yet expose the full planner relationship shape.");
  }

  const remainingItems = entries.filter(entry => !accountedItemKeys.has(entry.key));
  const unresolvedItems = remainingItems.filter(entry => {
    const base = identityValue(entry.item, "base");
    const special = identityValue(entry.item, "special");
    return ![base, special].some(identity => {
      const id = nonEmptyString(identity.compendiumId);
      return id && UUID_PATTERN.test(id);
    });
  }).length;
  addOmission(omitted, "unresolvedItems", unresolvedItems,
    "No unique native-ID-to-Compendium-UUID mapping exists in the pinned SS13 catalog.");
  addOmission(omitted, "unsupportedResolvedItems", remainingItems.length - unresolvedItems,
    "The item resolved to a catalog domain that this planner exporter cannot materialize yet.");

  const importedCount = included.reduce((total, entry) => total + entry.importedCount, 0);
  const mappingIssues = exportMappingIssues(portable);
  const blockingMappingIssueCount = mappingIssues.filter(issue => (
    !INFORMATIONAL_MAPPING_ISSUE_KINDS.has(
      nonEmptyString(objectValue(issue).kind) ?? "unknown",
    )
  )).length;
  const status = omitted.length || blockingMappingIssueCount || importedCount === 0
    ? "partial"
    : "ready";
  const characterName = nonEmptyString(heroSource.sourceName);
  const payload = {
    id: buildId,
    name: characterName
      ?? (importedCount
        ? `tli_dump live build (${importedCount} records)`
        : "tli_dump live build (no resolved records)"),
    notes: exportNotes(portable, included, omitted),
    patch: requestedPatch,
    createdAt: timestamp,
    updatedAt: timestamp,
    loadouts: {
      loadouts: [targetLoadout],
      currentLoadoutId: loadoutId,
    },
    ...(gearCatalogExtensions.size > 0 ? {
      poorchlightCatalogExtensions: {
        schemaVersion: 1,
        patch: requestedPatch,
        gearAffixTiers: [...gearCatalogExtensions.values()],
      },
    } : {}),
  };

  return {
    payload,
    json: JSON.stringify(payload, null, 2),
    status,
    importedCount,
    omitted,
    included,
  };
}

export const supportedCompendiumPatches = Object.freeze([...EXPORT_CATALOG_PATCHES]);
