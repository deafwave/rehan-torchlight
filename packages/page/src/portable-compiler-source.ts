import {
  createCompendiumExport,
  type CompendiumExportIncluded,
  type CompendiumExportOmission,
} from "./vendor/tli_dump/compendium-export.mjs";
import type { NormalizedBuild } from "./snapshot-adapter";

type JsonObject = Record<string, unknown>;

export interface PortableCompilerConversion {
  status: "ready" | "partial" | "failed";
  importedCount: number;
  included: CompendiumExportIncluded[];
  omitted: CompendiumExportOmission[];
  error: string | null;
  compilerAccess: PortableGuardedCompilerAccess;
}

export interface PortableGuardedCompilerAccess {
  status: "blocked";
  reason:
    | "conversion-failed"
    | "incompatible-source-state"
    | "catalog-attestation-required";
  message: string;
}

export interface CompilerSourceResolution {
  source: JsonObject | null;
  portableConversion: PortableCompilerConversion | null;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compendiumLoadouts(value: unknown): unknown[] | null {
  if (!isObject(value) || !isObject(value.loadouts)) return null;
  return Array.isArray(value.loadouts.loadouts)
    ? value.loadouts.loadouts
    : null;
}

function compendiumSource(value: unknown): JsonObject | null {
  return compendiumLoadouts(value) ? value as JsonObject : null;
}

function portableDocument(value: unknown): JsonObject | null {
  if (!isObject(value)) return null;
  return isObject(value.portable) ? value.portable : value;
}

function failedConversion(error: unknown): CompilerSourceResolution {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: null,
    portableConversion: {
      status: "failed",
      importedCount: 0,
      included: [],
      omitted: [],
      error: message,
      compilerAccess: {
        status: "blocked",
        reason: "conversion-failed",
        message: `The portable converter could not validate and report this document: ${message}`,
      },
    },
  };
}

function portableCompilerAccess(portable: JsonObject): PortableGuardedCompilerAccess {
  const profile = isObject(portable.source) ? portable.source : {};
  if (profile.layoutCompatible !== true || profile.processState !== "connected") {
    return {
      status: "blocked",
      reason: "incompatible-source-state",
      message:
        "Guarded formulas require a connected capture with a compatible memory layout "
        + `(layoutCompatible=${String(profile.layoutCompatible)}, `
        + `processState=${String(profile.processState)}).`,
    };
  }
  return {
    status: "blocked",
    reason: "catalog-attestation-required",
    message:
      "Portable-v3 embeds catalog identities and materialization metadata supplied by "
      + "the uploaded document. Guarded formulas remain blocked until those records "
      + "can be independently attested against a pinned SS13 catalog.",
  };
}

function converterWrapperCompilerAccess(): PortableGuardedCompilerAccess {
  return {
    status: "blocked",
    reason: "catalog-attestation-required",
    message:
      "This is a pre-converted tli_dump result. Its payload remains structural-only "
      + "because the wrapper does not independently attest the portable catalog "
      + "identities and materialization metadata used to create it.",
  };
}

function isIncludedEntry(value: unknown): value is CompendiumExportIncluded {
  if (!isObject(value)) return false;
  const importedCount = value.importedCount;
  const observedCount = value.observedCount;
  return typeof value.section === "string"
    && typeof importedCount === "number"
    && Number.isSafeInteger(importedCount)
    && importedCount >= 0
    && typeof observedCount === "number"
    && Number.isSafeInteger(observedCount)
    && observedCount >= 0
    && typeof value.detail === "string";
}

function isOmissionEntry(value: unknown): value is CompendiumExportOmission {
  if (!isObject(value)) return false;
  const observedCount = value.observedCount;
  return typeof value.section === "string"
    && typeof observedCount === "number"
    && Number.isSafeInteger(observedCount)
    && observedCount >= 0
    && typeof value.reason === "string";
}

function resolveConverterWrapper(
  value: unknown,
  normalized: NormalizedBuild,
): CompilerSourceResolution {
  if (!isObject(value)
      || !isObject(value.payload)
      || typeof value.json !== "string"
      || (value.status !== "ready" && value.status !== "partial")
      || typeof value.importedCount !== "number"
      || !Number.isSafeInteger(value.importedCount)
      || value.importedCount < 0
      || !Array.isArray(value.included)
      || !value.included.every(isIncludedEntry)
      || !Array.isArray(value.omitted)
      || !value.omitted.every(isOmissionEntry)) {
    return failedConversion(
      "The tli_dump converter wrapper is incomplete or malformed.",
    );
  }
  const payload = compendiumSource(value.payload);
  const loadouts = compendiumLoadouts(payload);
  if (!payload || loadouts?.length !== normalized.loadouts.length) {
    return failedConversion(
      "The converter wrapper payload does not match the normalized loadout count.",
    );
  }
  for (const [index, normalizedLoadout] of normalized.loadouts.entries()) {
    const convertedLoadout = loadouts[index];
    if (!isObject(convertedLoadout)
        || convertedLoadout.name !== normalizedLoadout.name) {
      return failedConversion(
        `Converter wrapper loadout ${index} does not match the normalized loadout order/name.`,
      );
    }
    const expectedHeroId = normalizedLoadout.hero.identity?.catalogId;
    const convertedHero = isObject(convertedLoadout.hero)
      ? convertedLoadout.hero
      : null;
    if (expectedHeroId && convertedHero?.heroGuid !== expectedHeroId) {
      return failedConversion(
        `Converter wrapper loadout ${index} does not match the normalized hero identity.`,
      );
    }
  }
  if (payload.patch !== normalized.patch) {
    return failedConversion(
      "The converter wrapper patch does not match the normalized payload.",
    );
  }
  return {
    source: null,
    portableConversion: {
      status: value.status,
      importedCount: value.importedCount,
      included: value.included.map((entry) => ({ ...entry })),
      omitted: value.omitted.map((entry) => ({ ...entry })),
      error: null,
      compilerAccess: converterWrapperCompilerAccess(),
    },
  };
}

/**
 * Resolves the exact document guarded compilers are allowed to consume.
 *
 * Compendium imports use their already-normalized payload. Portable-v3 imports
 * run through poorchlight's authoritative converter for schema validation and
 * an explicit inclusion/omission report, but the converted payload is never
 * exposed to formula compilers. Complete serialized converter-result wrappers
 * retain that same report-only provenance instead of being treated as raw
 * Compendium. Portable catalog metadata is asserted by the uploaded document
 * itself and is not an independent attestation.
 */
export function resolveCompilerSource(
  value: unknown,
  normalized: NormalizedBuild,
): CompilerSourceResolution {
  if (normalized.sourceKind === "compendium") {
    if (!isObject(value)) return { source: null, portableConversion: null };
    return {
      source: compendiumSource(value.payload) ?? compendiumSource(value),
      portableConversion: null,
    };
  }
  if (normalized.sourceKind === "portable-converter") {
    return resolveConverterWrapper(value, normalized);
  }

  const portable = portableDocument(value);
  if (!portable) return failedConversion("The portable-v3 document is missing.");

  try {
    const converted = createCompendiumExport(portable);
    const convertedSource = compendiumSource(converted.payload);
    if (!convertedSource) {
      return failedConversion(
        "The tli_dump converter did not return a Compendium-shaped payload.",
      );
    }
    const convertedLoadouts = compendiumLoadouts(convertedSource);
    if (convertedLoadouts?.length !== normalized.loadouts.length) {
      return failedConversion(
        "The converted loadout count does not match the validated portable snapshot.",
      );
    }
    for (const [index, normalizedLoadout] of normalized.loadouts.entries()) {
      const convertedLoadout = convertedLoadouts[index];
      if (!isObject(convertedLoadout)
          || convertedLoadout.name !== normalizedLoadout.name) {
        return failedConversion(
          `Converted loadout ${index} does not match the validated portable loadout order/name.`,
        );
      }
      const expectedHeroId = normalizedLoadout.hero.identity?.catalogId;
      const convertedHero = isObject(convertedLoadout.hero)
        ? convertedLoadout.hero
        : null;
      if (expectedHeroId
          && convertedHero?.heroGuid !== expectedHeroId) {
        return failedConversion(
          `Converted loadout ${index} does not match the validated portable hero identity.`,
        );
      }
    }
    if (convertedSource.patch !== normalized.patch) {
      return failedConversion(
        "The converted patch does not match the validated portable snapshot.",
      );
    }
    return {
      // Report-only boundary: converted portable data is structurally useful,
      // but it is not an independently authenticated formula source.
      source: null,
      portableConversion: {
        status: converted.status,
        importedCount: converted.importedCount,
        included: converted.included.map((entry) => ({ ...entry })),
        omitted: converted.omitted.map((entry) => ({ ...entry })),
        error: null,
        compilerAccess: portableCompilerAccess(portable),
      },
    };
  } catch (error) {
    return failedConversion(error);
  }
}
