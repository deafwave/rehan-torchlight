export interface CompendiumExportIncluded {
  section: string;
  importedCount: number;
  observedCount: number;
  detail: string;
}

export interface CompendiumExportOmission {
  section: string;
  observedCount: number;
  reason: string;
}

export interface CompendiumExportResult {
  payload: Record<string, unknown>;
  json: string;
  status: "ready" | "partial";
  importedCount: number;
  omitted: CompendiumExportOmission[];
  included: CompendiumExportIncluded[];
}

/**
 * Authoritative poorchlight portable-v3 → TLI Compendium conversion.
 *
 * The converter preserves exact planner overlays, materializes only
 * independently proven native relationships, and reports every omitted area.
 */
export function createCompendiumExport(
  portable: unknown,
): CompendiumExportResult;

export const supportedCompendiumPatches: readonly string[];
